import {Router} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,requireOwner} from './auth.mjs';
import {rateLimit} from './account-security.mjs';
import {SERVICE_DEFAULTS,SUPPORT_CATEGORIES,SUPPORT_STATES} from './service-definition.mjs';

const text=n=>z.string().trim().max(n);
const settingsSchema=z.object(Object.fromEntries(Object.keys(SERVICE_DEFAULTS).map(key=>[key,key==='contactEmail'?text(200).refine(v=>!v||z.string().email().safeParse(v).success):text(key.endsWith('Body')?30000:key==='refundPolicy'?4000:1000)]))).strict();
const requestSchema=z.object({orderId:z.number().int().positive().nullable(),category:z.enum(SUPPORT_CATEGORIES.map(x=>x[0])),title:text(120).min(3),message:text(4000).min(10),requestKey:z.string().uuid()}).strict();
const replySchema=z.object({message:text(4000).min(1),requestKey:z.string().uuid(),status:z.enum(SUPPORT_STATES.map(x=>x[0])).optional()}).strict();
const fail=(res,status,error)=>res.status(status).json({error});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
const settings=()=>row('SELECT * FROM service_settings WHERE id=1');
export function publicService(){const s=settings();return {settings:s?.published_json?{...SERVICE_DEFAULTS,...JSON.parse(s.published_json)}:SERVICE_DEFAULTS,version:s?.published_json?digest(s.published_json):'baseline-1',published:Boolean(s?.published_json),updatedAt:s?.published_json?s.updated_at:null};}
function view(id){const s=row('SELECT * FROM support_requests WHERE id=?',[id]);if(!s)return null;const order=s.order_id?row('SELECT order_no,status,amount_cents FROM orders WHERE id=? AND user_id=?',[s.order_id,s.user_id]):null;return {id:s.id,title:s.title,category:s.category,status:s.status,version:String(s.version),createdAt:s.created_at,updatedAt:s.updated_at,orderId:s.order_id,order:order?{orderNo:order.order_no,status:order.status,amountCents:order.amount_cents}:null,messages:rows('SELECT id,author_type,message,created_at FROM support_messages WHERE request_id=? ORDER BY id',[id]).map(m=>({id:m.id,authorType:m.author_type,message:m.message,createdAt:m.created_at}))};}
function audit(user,entity,id,action,status){run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,action,status) VALUES(?,?,?,?,?,?)',[user.id,entity,id,entity==='support'?'售后申请状态':'服务说明配置',action,status]);}
export function serviceRouter(){
  const router=Router();router.use(['/service','/support','/admin/service','/admin/support'],(_q,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/service/public',(_q,res)=>res.json(publicService()));
  router.get('/admin/service',requireOwner,(_q,res)=>{const s=settings();res.json({draft:s?JSON.parse(s.draft_json):SERVICE_DEFAULTS,version:String(s?.version||0),public:publicService(),history:rows('SELECT id,created_at FROM service_history ORDER BY id DESC LIMIT 20')});});
  router.put('/admin/service',requireOwner,(req,res)=>{
    if(!/^\d+$/.test(req.headers['if-match']||''))return fail(res,428,'请重新读取服务配置');
    const parsed=settingsSchema.safeParse(req.body);if(!parsed.success)return fail(res,400,'服务说明格式不正确，请检查邮箱和文字长度');
    const result=transaction(()=>{const s=settings();if(Number(req.headers['if-match'])!==Number(s?.version||0))return null;run("INSERT INTO service_settings(id,draft_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,version=version+1,updated_at=CURRENT_TIMESTAMP",[JSON.stringify(parsed.data)]);audit(req.user,'service',1,'save-draft','draft');return settings();});
    if(!result)return fail(res,409,'服务说明已更新；未覆盖你的草稿，请重新载入后核对');res.json({version:String(result.version)});
  });
  router.post('/admin/service/publish',requireOwner,(req,res)=>{
    if(!/^\d+$/.test(req.headers['if-match']||''))return fail(res,428,'请先重新读取并保存草稿');
    const result=transaction(()=>{const s=settings();if(!s||Number(req.headers['if-match'])!==s.version)return null;run('UPDATE service_settings SET published_json=draft_json,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1');run('INSERT INTO service_history(payload,actor_id) VALUES(?,?)',[s.draft_json,req.user.id]);audit(req.user,'service',1,'publish','published');return settings();});
    if(!result)return fail(res,409,'草稿不存在或版本已更新，请重新载入');res.json({version:String(result.version),public:publicService()});
  });
  router.get('/admin/service/history/:id',requireOwner,(req,res)=>{const h=row('SELECT payload FROM service_history WHERE id=?',[Number(req.params.id)]);if(!h)return fail(res,404,'历史说明不存在');res.json({draft:JSON.parse(h.payload)});});
  router.get('/support/orders',requireAuth,(req,res)=>res.json({items:rows("SELECT o.id,o.order_no AS orderNo,o.status,o.amount_cents AS amountCents,GROUP_CONCAT(oi.title,'、') AS title FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? GROUP BY o.id ORDER BY o.id DESC LIMIT 100",[req.user.id])}));
  router.get('/support/requests',requireAuth,(req,res)=>res.json({items:rows('SELECT id FROM support_requests WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.user.id]).map(x=>view(x.id))}));
  router.get('/support/requests/:id',requireAuth,(req,res)=>{const s=row('SELECT id FROM support_requests WHERE id=? AND user_id=?',[Number(req.params.id),req.user.id]);if(!s)return fail(res,404,'申请不存在');res.json({item:view(s.id)});});
  router.post('/support/requests',requireAuth,(req,res)=>{
    const parsed=requestSchema.safeParse(req.body);if(!parsed.success)return fail(res,400,'请填写类别、标题及至少 10 个字的问题说明');
    const d=parsed.data,hash=digest(d),prior=row('SELECT id,payload_hash FROM support_requests WHERE user_id=? AND request_key=?',[req.user.id,d.requestKey]);
    if(prior){if(prior.payload_hash!==hash)return fail(res,409,'同一提交标识不能用于不同申请');return res.json({item:view(prior.id)});}
    const order=d.orderId?row('SELECT id,status FROM orders WHERE id=? AND user_id=?',[d.orderId,req.user.id]):null;
    if(d.orderId&&!order)return fail(res,404,'所选订单不存在');
    if(d.category==='refund'&&(!order||order.status!=='paid'))return fail(res,400,'退款申请需关联当前账号已付款订单；待付款问题请选择支付问题');
    if(row("SELECT COUNT(*) n FROM support_requests WHERE user_id=? AND status!='resolved'",[req.user.id]).n>=20)return fail(res,429,'已有较多待处理申请，请在现有申请中补充说明');
    rateLimit('support-create',String(req.user.id),10,3600);
    const id=transaction(()=>{const id=Number(run('INSERT INTO support_requests(user_id,order_id,category,title,request_key,payload_hash) VALUES(?,?,?,?,?,?)',[req.user.id,d.orderId,d.category,d.title,d.requestKey,hash]).lastInsertRowid);run("INSERT INTO support_messages(request_id,author_id,author_type,message,request_key,payload_hash) VALUES(?,?,'user',?,?,?)",[id,req.user.id,d.message,d.requestKey,hash]);return id;});
    res.status(201).json({item:view(id)});
  });
  router.get('/admin/support',requireOwner,(req,res)=>{const state=SUPPORT_STATES.some(x=>x[0]===req.query.status)?req.query.status:'';res.json({items:rows('SELECT id,user_id FROM support_requests WHERE (?=\'\' OR status=?) ORDER BY id DESC LIMIT 100',[state,state]).map(s=>({...view(s.id),accountId:s.user_id}))});});
  const reply=(admin)=>(req,res)=>{
    const parsed=replySchema.safeParse(req.body);if(!parsed.success||!admin&&parsed.data.status!==undefined)return fail(res,400,'回复内容或状态格式不正确');
    if(!/^\d+$/.test(req.headers['if-match']||''))return fail(res,428,'请重新读取申请后回复');
    const id=Number(req.params.id),s=row('SELECT * FROM support_requests WHERE id=?'+(admin?'':' AND user_id=?'),admin?[id]:[id,req.user.id]);if(!s)return fail(res,404,'申请不存在');
    const d=parsed.data,hash=digest(d),prior=row('SELECT payload_hash FROM support_messages WHERE request_id=? AND author_id=? AND request_key=?',[id,req.user.id,d.requestKey]);
    if(prior){if(prior.payload_hash!==hash)return fail(res,409,'提交标识已用于其他回复');return res.json({item:view(id)});}
    rateLimit('support-reply',String(req.user.id),30,3600);
    if(row('SELECT COUNT(*) n FROM support_messages WHERE request_id=?',[id]).n>=100)return fail(res,429,'此申请回复已达上限，请新建申请并注明原申请编号');
    const result=transaction(()=>{const result=run("UPDATE support_requests SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",[admin?(d.status||'in_progress'):'open',id,Number(req.headers['if-match'])]);if(!result.changes)return null;run('INSERT INTO support_messages(request_id,author_id,author_type,message,request_key,payload_hash) VALUES(?,?,?,?,?,?)',[id,req.user.id,admin?'admin':'user',d.message,d.requestKey,hash]);if(admin)audit(req.user,'support',id,'reply',d.status||'in_progress');return view(id);});
    if(!result)return fail(res,409,'申请已有新回复，请重新载入后核对；未覆盖你的输入');res.json({item:result});
  };
  router.post('/support/requests/:id/replies',requireAuth,reply(false));
  router.post('/admin/support/:id/replies',requireOwner,reply(true));
  return router;
}
