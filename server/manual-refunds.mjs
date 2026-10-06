import {Router} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,requireOwner} from './auth.mjs';
import {paymentError} from './payment-configuration.mjs';
import {withCheckoutOperation} from './payment-lifecycle.mjs';
import {listPage} from './list-page.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const utc=value=>Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?value:value.replace(' ','T')+'Z');
const schema=z.object({requestKey:z.string().uuid(),amountCents:z.number().int().positive().max(100000000),providerReference:z.string().trim().min(6).max(128).regex(/^[A-Za-z0-9_.:-]+$/),returnedAt:z.string().datetime({offset:true}),verificationNote:z.string().trim().min(10).max(2000),rightsAction:z.enum(['keep','revoke-order']),confirmedExternal:z.literal(true)}).strict();
export function refundSummary(id){
 const records=rows('SELECT id,amount_cents,returned_at,rights_action,created_at FROM manual_refund_records WHERE order_id=? ORDER BY id',[id]);
 return {refundedCents:records.reduce((s,r)=>s+r.amount_cents,0),refunds:records.map(r=>({id:r.id,amountCents:r.amount_cents,returnedAt:r.returned_at,rightsAction:r.rights_action,createdAt:r.created_at})),refundVerification:'管理员核实外部退款后登记，非自动网关退款'};
}
function snapshot(id){
 const order=row('SELECT * FROM orders WHERE id=?',[id]);if(!order)throw paymentError(404,'订单不存在');
 const grants=rows('SELECT * FROM order_entitlement_grants WHERE order_id=?',[id]);
 const rights=rows('SELECT p.pack_id,p.project_id FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=?',[id]).map(i=>{const kind=i.project_id?'project':'course',target=i.project_id||i.pack_id,table=i.project_id?'project_entitlements':'entitlements',field=i.project_id?'project_id':'pack_id';return {kind,target,entitlement:row(`SELECT * FROM ${table} WHERE user_id=? AND ${field}=?`,[order.user_id,target])||null,tracked:grants.some(g=>g.kind===kind&&g.target_id===target)};});
 const records=rows('SELECT * FROM manual_refund_records WHERE order_id=? ORDER BY id',[id]);
 return {order,rights,records,version:digest({order,rights,records})};
}
function revokeTrackedOrder(s){
 for(const right of s.rights){
  if(!right.tracked)throw paymentError(409,'历史订单的权益来源未记录，不能自动收回；请保留并人工核对');
  const e=right.entitlement;if(!e||e.source!=='purchase'||e.purchase_order_id!==s.order.id)continue;
  const table=right.kind==='project'?'project_entitlements':'entitlements',field=right.kind==='project'?'project_id':'pack_id';
  const other=row(`SELECT g.order_id FROM order_entitlement_grants g JOIN orders o ON o.id=g.order_id WHERE g.user_id=? AND g.kind=? AND g.target_id=? AND g.order_id!=? AND o.status='paid' ORDER BY g.order_id DESC LIMIT 1`,[s.order.user_id,right.kind,right.target,s.order.id]);
  if(other){run(`UPDATE ${table} SET purchase_order_id=? WHERE id=?`,[other.order_id,e.id]);continue;}
  const historical=row(`SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id JOIN orders o ON o.id=i.order_id WHERE o.user_id=? AND o.status='paid' AND o.id!=? AND p.${field}=? LIMIT 1`,[s.order.user_id,s.order.id,right.target]);
  if(historical)throw paymentError(409,'存在其他有效历史订单，权益来源需人工核对；请保留权益');
  const prior=rows('SELECT previous_json FROM order_entitlement_grants WHERE user_id=? AND kind=? AND target_id=? ORDER BY order_id DESC',[s.order.user_id,right.kind,right.target]).map(g=>g.previous_json?JSON.parse(g.previous_json):null).find(p=>p&&p.source!=='purchase');
  if(prior)run(`UPDATE ${table} SET source=?,status=?,starts_at=?,expires_at=?,purchase_order_id=? WHERE id=?`,[prior.source,prior.status,prior.starts_at,prior.expires_at,prior.purchase_order_id||null,e.id]);
  else run(`UPDATE ${table} SET status='revoked' WHERE id=? AND purchase_order_id=?`,[e.id,s.order.id]);
 }
}
export function manualRefundRouter(){
 const router=Router();router.use(['/admin/refunds','/orders'],(_q,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 router.get('/me/orders',requireAuth,(req,res)=>{
  const page=listPage(req.query),status=['paid','pending','cancelled','refunded'].includes(req.query.status)?req.query.status:req.query.status==='closed'?'closed':'';
  const where="o.user_id=? AND instr(lower(o.order_no),lower(?))>0 AND (?='' OR o.status=? OR (?='closed' AND o.status IN ('cancelled','refunded')))",args=[req.user.id,page.q,status,status,status];
  const total=row(`SELECT COUNT(*) n FROM orders o WHERE ${where}`,args).n;
  const items=rows(`SELECT o.id,o.order_no orderNo,o.status,o.amount_cents amountCents,o.created_at createdAt,c.provider,c.expires_at expiresAt,GROUP_CONCAT(i.title,'、') title FROM orders o LEFT JOIN payment_checkouts c ON c.order_id=o.id LEFT JOIN order_items i ON i.order_id=o.id WHERE ${where} GROUP BY o.id ORDER BY o.id DESC LIMIT ? OFFSET ?`,[...args,page.limit,page.offset]).map(o=>({...o,expired:o.status==='pending'&&o.expiresAt!=null&&utc(o.expiresAt)<=Date.now(),provider:o.provider||'manual',...refundSummary(o.id)}));
  res.set('Cache-Control','private, no-store').json({items,total,...page});
 });
 router.get('/orders/:id/refunds',requireAuth,(req,res)=>{const order=row('SELECT id FROM orders WHERE id=? AND user_id=?',[Number(req.params.id),req.user.id]);if(!order)throw paymentError(404,'订单不存在');res.json(refundSummary(order.id));});
 router.get('/admin/refunds/:id',requireOwner,(req,res)=>{const s=snapshot(Number(req.params.id));res.json({order:s.order,records:s.records,rights:s.rights,version:s.version,...refundSummary(s.order.id)});});
 router.post('/admin/refunds/:id',requireOwner,async(req,res)=>{
  const parsed=schema.safeParse(req.body);if(!parsed.success)throw paymentError(400,'请填写实际退回金额、平台流水、退款时间与核验说明，并确认已在平台核实');
  if(!req.get('If-Match'))throw paymentError(428,'请重新读取订单退款记录');
  const id=Number(req.params.id),initial=snapshot(id),d=parsed.data,payload=digest({orderId:id,...d});
  return withCheckoutOperation(initial.order.user_id,()=>{
   db.exec('BEGIN IMMEDIATE');try{
    const actor=row('SELECT role,status,token_version FROM users WHERE id=?',[req.user.id]);
    if(!actor||actor.role!=='admin'||actor.status!=='active'||actor.token_version!==req.user.token_version)throw paymentError(403,'管理员权限已变化，请重新登录后核对');
    const prior=row('SELECT * FROM manual_refund_records WHERE request_key=?',[d.requestKey]);
    if(prior){if(prior.order_id!==id||prior.payload_hash!==payload)throw paymentError(409,'提交编号已用于其他退款记录');db.exec('COMMIT');return res.json({ok:true,...refundSummary(id)});}
    const s=snapshot(id);
    if(s.version!==req.get('If-Match'))throw paymentError(409,'订单、权益或退款记录已变化；输入未覆盖，请重新核对');
    if(s.order.status!=='paid'||s.order.currency!=='CNY')throw paymentError(409,'仅可登记已支付人民币订单的实际退款');
    if(Date.parse(d.returnedAt)>Date.now()+60000||Date.parse(d.returnedAt)<utc(s.order.created_at))throw paymentError(400,'退款时间不能早于订单或晚于当前时间');
    const total=s.records.reduce((sum,r)=>sum+r.amount_cents,0)+d.amountCents;
    if(total>s.order.amount_cents)throw paymentError(400,'累计退回金额不能超过原订单金额');
    if(d.rightsAction==='revoke-order'&&total!==s.order.amount_cents)throw paymentError(400,'部分退款不自动收回课程权益');
    if(d.rightsAction==='revoke-order')revokeTrackedOrder(s);
    const provider=row('SELECT provider FROM payment_checkouts WHERE order_id=?',[id])?.provider||'manual';
    if(row('SELECT 1 FROM manual_refund_records WHERE provider=? AND provider_reference=?',[provider,d.providerReference]))throw paymentError(409,'这笔平台退款流水已登记，请勿重复');
    run('INSERT INTO manual_refund_records(order_id,actor_id,amount_cents,provider,provider_reference,returned_at,verification_note,rights_action,request_key,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,req.user.id,d.amountCents,provider,d.providerReference,d.returnedAt,d.verificationNote,d.rightsAction,d.requestKey,payload]);
    if(total===s.order.amount_cents){run("UPDATE orders SET status='refunded',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);run("UPDATE payments SET status='refunded',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='succeeded'",[id]);run('UPDATE payment_checkouts SET next_sync_at=0 WHERE order_id=?',[id]);}
    run("INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,'orders',?,?,'refund-recorded','external-refund-verified-manually')",[req.user.id,id,s.order.order_no]);
    db.exec('COMMIT');res.status(201).json({ok:true,...refundSummary(id)});
   }catch(e){db.exec('ROLLBACK');throw e;}
  });
 });return router;
}
