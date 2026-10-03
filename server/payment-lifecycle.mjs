import {randomUUID} from 'node:crypto';
import {db,row,rows,run} from './db.mjs';
import {paymentConfiguration,paymentError} from './payment-configuration.mjs';
import {queryProviderPayment,closeProviderPayment} from './payment-providers.mjs';
import {grantOrderEntitlements} from './learning-commerce.mjs';
import {checkoutFailureCode,checkoutFailureMessage} from './payment-checkout-errors.mjs';

const now=()=>Math.floor(Date.now()/1000);
const allowedCodes=new Set(['ACQ.ACCESS_FORBIDDEN','isv.insufficient-isv-permissions','ACQ.INVALID_PARAMETER','ACQ.PARTNER_ERROR','isv.invalid-app-id','isv.invalid-signature','ACQ.TRADE_NOT_EXIST','INVALID_PARAMETER','NO_AUTH','MCH_NOT_EXISTS','PARAM_ERROR','SIGN_ERROR','PAYMENT_RESPONSE_SIGNATURE_INVALID','PAYMENT_RESPONSE_SIGNATURE_MISSING','PAYMENT_RESPONSE_TIMESTAMP_INVALID','PAYMENT_RESPONSE_KEY_ID_MISMATCH','PAYMENT_REQUEST_AUTH_REJECTED','WECHAT_TRANSACTION_IDENTITY_MISMATCH','WECHAT_TRANSACTION_STATE_INVALID','WECHAT_TRANSACTION_AMOUNT_INVALID','response-signature-verify-error','response-alipay-sn-verify-error','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT']);
export function checkout(id){return row(`SELECT o.*,c.provider,c.config_version,c.code_url,c.expires_at,c.provider_reference,c.failure_code,c.last_sync_at,c.product_id,c.payment_flow,c.page_issued_at,c.attempt_state,c.provider_code,c.provider_trace,c.failure_at,c.next_sync_at,c.sync_attempts,oi.title FROM payment_checkouts c JOIN orders o ON o.id=c.order_id JOIN order_items oi ON oi.order_id=o.id WHERE o.id=?`,[id]);}
export const unissuedPage=order=>order.provider==='alipay'&&order.payment_flow==='page'&&!order.page_issued_at;
// Signed cashier links can reach Alipay after the browser request returns. Do
// not trust absence until absolute expiry plus clock/in-flight safety margin.
export const absenceCanRetire=order=>Date.parse(order.expires_at)+(order.payment_flow==='page'&&order.page_issued_at?5*60*1000:0)<=Date.now();
export function publicOrder(order){return {id:order.id,productId:order.product_id,orderNo:order.order_no,status:order.status,provider:order.provider,paymentFlow:order.payment_flow,amountCents:order.amount_cents,title:order.title,expiresAt:order.expires_at,expired:Date.parse(order.expires_at)<=Date.now(),qrUrl:order.status==='pending'&&Date.parse(order.expires_at)>Date.now()?order.code_url:'',needsQuery:order.payment_flow==='page'?Boolean(order.page_issued_at)||Boolean(order.failure_code):!order.code_url||Boolean(order.failure_code),failureMessage:order.failure_code==='query-unavailable'?'支付状态暂时无法核验，系统会继续补查；请勿重复付款。':order.failure_code?checkoutFailureMessage(order.failure_code):'',attemptState:order.attempt_state,lastCheckedAt:order.last_sync_at?new Date(order.last_sync_at*1000).toISOString():null,nextCheckAt:order.next_sync_at?new Date(order.next_sync_at*1000).toISOString():null};}
export function event(orderId,stage,code,verified=false,trace=''){run('INSERT INTO payment_events(order_id,stage,code,trace,verified) VALUES(?,?,?,?,?)',[orderId,stage,code,trace,verified?1:0]);}
export function recordFailure(order,error,stage){
  const category=stage==='query'?'query-unavailable':checkoutFailureCode(order.provider,error),rawCode=error.providerCode||error.code||error.cause?.code;
  const code=allowedCodes.has(rawCode)?rawCode:'UNCLASSIFIED';
  const trace=/^\d{10,64}$/.test(error.traceId||'')?error.traceId:'';
  const change=run("UPDATE payment_checkouts SET failure_code=?,provider_code=?,provider_trace=?,failure_at=? WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')",[category,code,trace,now(),order.id,order.id]);
  if(change.changes)event(order.id,stage,code,error.verifiedResponse===true,trace);
  return category;
}
// Durable leases survive process crashes and serialize workers with user mutations.
// A crash lease expires, but unresolved platform attempts remain pending until verified.
const interactiveWaiters=new Set();
export async function withCheckoutOperation(userId,work,{background=false,waitMs=15000}={}){
  const token=`${background?'background':'interactive'}:${randomUUID()}`,deadline=Date.now()+Math.max(0,Math.min(15000,waitMs));
  let acquired=false,waiting=false;
  try{
    while(!acquired){
      if(interactiveWaiters.has(userId)&&!waiting)throw paymentError(409,background?'用户支付操作优先处理':'已有支付操作正在处理，请勿重复提交');
      const result=run(`INSERT INTO payment_checkout_locks(user_id,token,lease_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE payment_checkout_locks.lease_until<=?`,[userId,token,now()+120,now()]);
      acquired=Boolean(result.changes);if(acquired)break;
      const lock=row('SELECT token FROM payment_checkout_locks WHERE user_id=?',[userId]);
      if(!lock)continue;
      if(background||!lock?.token.startsWith('background:'))throw paymentError(409,'已有支付操作正在处理，请勿重复提交');
      if(Date.now()>=deadline)throw paymentError(409,'支付平台核验较慢，请稍后重试；原订单已保留，不会重复创建付款码');
      if(!waiting){interactiveWaiters.add(userId);waiting=true;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return await work();
  }finally{
    if(acquired)run('DELETE FROM payment_checkout_locks WHERE user_id=? AND token=?',[userId,token]);
    if(waiting)interactiveWaiters.delete(userId);
  }
}
export function settleOnlinePayment(provider,version,transaction){
  const order=row('SELECT id FROM orders WHERE order_no=?',[transaction.orderNo]),c=order&&checkout(order.id);
  if(!c||c.provider!==provider||c.config_version!==version)throw paymentError(400,'订单或支付渠道不匹配');
  if((transaction.paid||transaction.amount!==undefined)&&(!Number.isSafeInteger(transaction.amount)||transaction.amount!==c.amount_cents))throw paymentError(400,'支付金额不匹配');
  if(!transaction.paid){if(transaction.closed&&c.status==='pending')retireAttempt(c,'verified-closed');return;}
  if(typeof transaction.reference!=='string'||!transaction.reference||transaction.reference.length>128)throw paymentError(400,'支付流水无效');
  db.exec('BEGIN IMMEDIATE');try{
    const fresh=checkout(c.id);
    if(fresh.status==='paid'){if(fresh.provider_reference!==transaction.reference)throw paymentError(409,'重复付款流水不一致，请人工核对');db.exec('COMMIT');return;}
    if(fresh.status!=='pending')throw paymentError(409,'订单已关闭或退款，请人工核对');
    run("UPDATE payment_checkouts SET provider_reference=?,failure_code='',attempt_state='paid',next_sync_at=0 WHERE order_id=?",[transaction.reference,c.id]);
    run("UPDATE payments SET status='succeeded',provider_reference=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND provider=?",[transaction.reference,c.id,provider]);
    run("UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",[c.id]);
    grantOrderEntitlements(fresh);
    event(c.id,'settlement','VERIFIED_PAID',true);
    run('INSERT INTO cms_audit(entity,entity_id,title,status,action) VALUES(?,?,?,?,?)',['orders',c.id,c.order_no,'paid',`${provider}-verified-payment`]);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function retireAttempt(order,reason){
  db.exec('BEGIN IMMEDIATE');try{
    const change=run("UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",[order.id]);
    if(change.changes){
      run("UPDATE payment_checkouts SET attempt_state=?,next_sync_at=0,failure_code=CASE WHEN failure_code='query-unavailable' THEN '' ELSE failure_code END,provider_code=CASE WHEN failure_code='query-unavailable' THEN '' ELSE provider_code END,provider_trace=CASE WHEN failure_code='query-unavailable' THEN '' ELSE provider_trace END WHERE order_id=?",[reason==='verified-rejected'?'rejected':'closed',order.id]);
      run("UPDATE payments SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='created'",[order.id]);
      event(order.id,'retire',reason,true);
    }
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export async function confirmAndCloseAttempt(order){
  if(order.status!=='pending')return checkout(order.id);
  if(unissuedPage(order)){retireAttempt(order,'unissued-page');return checkout(order.id);}
  const c=paymentConfiguration(order.config_version),t=await queryProviderPayment(order.provider,c,order.order_no,{strictMissing:true});
  if(t.notFound){
    if(!absenceCanRetire(order))throw paymentError(409,'旧订单结果仍在确认中，请稍后重试；不会重复创建付款码');
    retireAttempt(order,'verified-absent');return checkout(order.id);
  }
  settleOnlinePayment(order.provider,order.config_version,t);
  if(checkout(order.id).status!=='pending')return checkout(order.id);
  await closeProviderPayment(order.provider,c,order.order_no);
  const confirmed=await queryProviderPayment(order.provider,c,order.order_no,{strictMissing:true});
  if(confirmed.notFound)throw paymentError(502,'关闭结果尚未确认，请稍后查询');
  settleOnlinePayment(order.provider,order.config_version,confirmed);
  if(checkout(order.id).status==='pending')throw paymentError(502,'关闭结果尚未确认，请稍后查询');
  return checkout(order.id);
}
export function scheduleCheck(orderId,delay=15){run("UPDATE payment_checkouts SET next_sync_at=? WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')",[now()+delay,orderId,orderId]);}
export function providerSnapshotChanged(order,current){
  const previous=paymentConfiguration(order.config_version),provider=order.provider;
  const snapshot=c=>JSON.stringify({provider:c.settings[provider],origin:c.settings.publicOrigin,privateKey:c.secrets[provider+'PrivateKey'],apiV3Key:provider==='wechat'?c.secrets.wechatApiV3Key:undefined});
  return snapshot(previous)!==snapshot(current);
}
export async function reconcileOrder(order,{expire=false}={}){
  if(order.status!=='pending')return checkout(order.id);
  if(unissuedPage(order)){if(expire&&Date.parse(order.expires_at)<=Date.now())retireAttempt(order,'unissued-page');return checkout(order.id);}
  run('UPDATE payment_checkouts SET last_sync_at=?,sync_attempts=sync_attempts+1 WHERE order_id=?',[now(),order.id]);
  let providerMissing=false;
  try{
    if(expire&&Date.parse(order.expires_at)<=Date.now())await confirmAndCloseAttempt(order);
    else{
      const transaction=await queryProviderPayment(order.provider,paymentConfiguration(order.config_version),order.order_no,{strictMissing:true});
      providerMissing=Boolean(transaction.notFound);
      if(!transaction.notFound)settleOnlinePayment(order.provider,order.config_version,transaction);
    }
    run("UPDATE payment_checkouts SET failure_code='',provider_code='',provider_trace='' WHERE order_id=? AND failure_code='query-unavailable'",[order.id]);
    event(order.id,'query','VERIFIED_QUERY',true);
  }catch(error){recordFailure(order,error,'query');throw error;}
  finally{
    const fresh=checkout(order.id);
    if(fresh.status==='pending'){
      // After a week stop network retries and explicitly surface manual review.
      const tooOld=Date.now()-Date.parse(order.expires_at)>7*86400000;
      run('UPDATE payment_checkouts SET next_sync_at=? WHERE order_id=?',[tooOld?0:now()+Math.min(3600,15*2**Math.min(fresh.sync_attempts,8)),order.id]);
    }else run('UPDATE payment_checkouts SET next_sync_at=0 WHERE order_id=?',[order.id]);
  }
  return {...checkout(order.id),providerMissing};
}
let running=false;
export async function runPaymentReconciliation(){
  if(running)return;
  running=true;try{
    // Legacy attempts have next_sync_at=0; release never silently queries them.
    const due=rows(`SELECT c.order_id,c.user_id FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.status='pending' AND c.next_sync_at>0 AND c.next_sync_at<=? ORDER BY c.next_sync_at LIMIT 2`,[now()]);
    for(const item of due)try{await withCheckoutOperation(item.user_id,()=>reconcileOrder(checkout(item.order_id),{expire:true}),{background:true});}catch{/* Sanitized persisted diagnostics, never raw upstream errors. */}
  }finally{running=false;}
}
// Keep startup health/authorization verification gateway-free. Interactive
// requests remain available; persisted due work resumes after the short grace.
export function startPaymentReconciliation(){const readyAt=Date.now()+60000;const timer=setInterval(()=>{if(Date.now()>=readyAt)runPaymentReconciliation().catch(()=>{});},15000);timer.unref();return ()=>clearInterval(timer);}
export function paymentOperations(){
  const items=rows(`SELECT c.order_id FROM payment_checkouts c ORDER BY c.order_id DESC LIMIT 30`).map(({order_id})=>{
    const o=checkout(order_id);return {...publicOrder(o),qrUrl:undefined,providerCode:o.provider_code||null,traceId:o.provider_trace||null,configVersion:o.config_version,failureAt:o.failure_at?new Date(o.failure_at*1000).toISOString():null,syncAttempts:o.sync_attempts,manualReview:o.status==='pending'&&Date.parse(o.expires_at)<=Date.now()&&!o.next_sync_at};
  });
  return {checkedAt:new Date().toISOString(),items,channels:['wechat','alipay'].map(provider=>({provider,paid:row("SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE c.provider=? AND o.status='paid'",[provider]).n,pending:row("SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE c.provider=? AND o.status='pending'",[provider]).n,latestFailure:items.find(o=>o.provider===provider&&o.failureMessage)||null})),limitations:['连接测试不是下单权限或到账开课验收。','支付宝新订单采用电脑网站支付；准备签名链接不是平台已接受交易或付款成功。','历史未安排补查的订单不会在发布时自动请求支付平台；可由订单所属用户查询恢复。','H5/JSAPI、自动退款与账单对账尚未接入；不宣称已支持。']};
}
