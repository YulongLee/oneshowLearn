import {db,row,rows,run} from './db.mjs';
export function publishedProduct(id){return row(`SELECT p.* FROM products p LEFT JOIN project_packs pp ON pp.id=p.pack_id LEFT JOIN learning_paths lp ON lp.id=pp.path_id LEFT JOIN practice_projects pr ON pr.id=p.project_id LEFT JOIN practice_project_settings s ON s.project_id=pr.id WHERE p.id=? AND p.status='active' AND ((p.pack_id IS NOT NULL AND pp.status='published' AND lp.status='published') OR (p.project_id IS NOT NULL AND pr.status='published' AND s.access_type='paid'))`,[id]);}
export function grantOrderEntitlements(order){
  for(const item of rows('SELECT p.pack_id,p.project_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[order.id])){
    if(item.project_id)run(`INSERT INTO project_entitlements(user_id,project_id,source,status) VALUES(?,?,'purchase','active') ON CONFLICT(user_id,project_id) DO UPDATE SET status='active',source='purchase',starts_at=CURRENT_TIMESTAMP,expires_at=NULL`,[order.user_id,item.project_id]);
    else run(`INSERT INTO entitlements(user_id,pack_id,source,status) VALUES(?,?,'purchase','active') ON CONFLICT(user_id,pack_id) DO UPDATE SET status='active',source='purchase',starts_at=CURRENT_TIMESTAMP,expires_at=NULL`,[order.user_id,item.pack_id]);
  }
}
export function markOrderPaid(req,res){
  if(req.user.role!=='admin')return res.status(403).json({error:'仅管理员可确认实际收款'});
  const order=row('SELECT * FROM orders WHERE id=?',[Number(req.params.id)]);
  if(!order)return res.status(404).json({error:'订单不存在'});
  if(row('SELECT order_id FROM payment_checkouts WHERE order_id=?',[order.id]))return res.status(409).json({error:'在线支付订单必须通过支付平台验签回调或查单确认，不能手动开通'});
  if(order.status==='paid')return res.json({ok:true});
  if(order.status!=='pending')return res.status(409).json({error:'只有待付款订单可以确认收款'});
  db.exec('BEGIN IMMEDIATE');
  try{
    run("UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",[order.id]);
    run("UPDATE payments SET status='succeeded',updated_at=CURRENT_TIMESTAMP WHERE order_id=?",[order.id]);
    grantOrderEntitlements(order);
    run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)',[req.user.id,'orders',order.id,order.order_no,'paid','manual-payment-confirmed']);
    db.exec('COMMIT');res.json({ok:true});
  }catch(e){db.exec('ROLLBACK');throw e;}
}
