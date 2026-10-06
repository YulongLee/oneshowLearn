import express,{Router} from 'express';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {db,row,rows,run} from './db.mjs';
import {requireAuth,requireOwner} from './auth.mjs';
import {rateLimit} from './account-security.mjs';
import {canReadPack} from './opc-routes.mjs';
import {publishedProduct} from './learning-commerce.mjs';
import {adminPaymentConfig,paymentConfiguration,paymentError,paymentSaveSchema,paymentSectionSchema,publicPaymentOffer,savePaymentConfig,savePaymentSection} from './payment-configuration.mjs';
import {createProviderPayment,queryProviderPayment,closeProviderPayment,decodeAlipayNotification,decodeWechatNotification,alipayPagePayment,paymentTransport} from './payment-providers.mjs';
import {diagnosePaymentConnection} from './payment-diagnostics.mjs';
import {checkoutFailureMessage} from './payment-checkout-errors.mjs';
import {listPage} from './list-page.mjs';
import {checkout,publicOrder,settleOnlinePayment,withCheckoutOperation,retireAttempt,confirmAndCloseAttempt,reconcileOrder,recordFailure,scheduleCheck,event,paymentOperations,providerSnapshotChanged,unissuedPage,absenceCanRetire} from './payment-lifecycle.mjs';
export {settleOnlinePayment} from './payment-lifecycle.mjs';

function ownedOrder(req){const order=checkout(Number(req.params.id));if(!order||order.user_id!==req.user.id)throw paymentError(404,'订单不存在');return order;}
// Must mount before express.json(), otherwise signed notification bytes are lost.
export function paymentNotificationRouter(){
  const router=Router();router.post('/api/payments/notify/:provider/:version',express.raw({type:()=>true,limit:'64kb'}),(req,res)=>{
    const provider=req.params.provider,version=Number(req.params.version);
    if(!['wechat','alipay'].includes(provider)||!Number.isSafeInteger(version)||version<1)return res.status(404).end();
    try{
      const c=paymentConfiguration(version);if(c.version!==version)throw paymentError(400,'未知支付配置');
      const raw=req.body.toString('utf8'),transaction=provider==='wechat'?decodeWechatNotification(raw,req.headers,c):decodeAlipayNotification(raw,c);
      settleOnlinePayment(provider,version,transaction);
      return provider==='wechat'?res.status(204).end():res.type('text').send('success');
    }catch{return provider==='wechat'?res.status(400).json({code:'FAIL',message:'通知校验未通过'}):res.status(400).type('text').send('failure');}
  });return router;
}
const inFlight=new Map();
async function ensureQRCode(order){
  if(order.code_url||order.status!=='pending'||Date.parse(order.expires_at)<=Date.now())return;
  if(order.payment_flow==='page'){
    run("UPDATE payment_checkouts SET attempt_state=CASE WHEN page_issued_at=0 THEN 'prepared' ELSE 'issued' END WHERE order_id=?",[order.id]);
    return;
  }
  if(inFlight.has(order.id))return inFlight.get(order.id);
  const work=(async()=>{try{
      run("UPDATE payment_checkouts SET attempt_state='creating' WHERE order_id=?",[order.id]);scheduleCheck(order.id,30);
      const code=await createProviderPayment(order.provider,paymentConfiguration(order.config_version),order);
      run("UPDATE payment_checkouts SET code_url=?,failure_code='',attempt_state='ready' WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')",[code,order.id,order.id]);
      scheduleCheck(order.id);event(order.id,'create','VERIFIED_QR',true);
    }
    catch(error){const code=recordFailure(order,error,'create');
      if(error.verifiedResponse===true&&error.noPaymentCreated===true)retireAttempt(order,'verified-rejected');
      else{run("UPDATE payment_checkouts SET attempt_state='unknown' WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')",[order.id,order.id]);scheduleCheck(order.id,30);}
      throw paymentError(502,checkoutFailureMessage(code));}
    finally{inFlight.delete(order.id);}})();inFlight.set(order.id,work);return work;
}
const checkoutSchema=z.object({provider:z.enum(['wechat','alipay']),requestKey:z.string().uuid(),expectedAmountCents:z.number().int().positive().optional()}).strict();
const diagnosticInFlight=new Set();
export function paymentRouter(){
  const router=Router();router.use(['/commerce','/admin/payments'],(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/commerce/offer',(_req,res)=>res.json(publicPaymentOffer()));
  router.get('/admin/payments',requireOwner,(_req,res)=>res.json(adminPaymentConfig()));
  router.get('/admin/payments/operations',requireOwner,(_req,res)=>res.json(paymentOperations()));
  router.get('/admin/payments/orders/:id/diagnostic',requireOwner,(req,res)=>{
    const order=checkout(Number(req.params.id));if(!order)throw paymentError(404,'订单不存在');
    res.json({orderId:order.id,provider:order.provider,configVersion:order.config_version,status:order.status,hasQRCode:Boolean(order.code_url),detail:order.failure_code?checkoutFailureMessage(order.failure_code):'尚无下单失败记录；这不代表支付已完成'});
  });
  router.put('/admin/payments/:section',requireOwner,(req,res)=>{
    const section=req.params.section;
    if(!['wechat','alipay','pricing'].includes(section))throw paymentError(404,'不支持的支付配置分区');
    if(!/^\d+$/.test(req.headers['if-match']||''))throw paymentError(428,'请先重新加载支付配置');
    const parsed=paymentSectionSchema(section).safeParse(req.body);
    if(!parsed.success){
      const labels={appId:'AppID',mchId:'商户号',sellerId:'卖家 UID',publicKey:'支付平台公钥',serialNo:'商户 API 证书序列号',publicKeyId:'支付公钥 ID',wechatPrivateKey:'商户私钥',wechatApiV3Key:'APIv3 密钥（32 字节）',alipayPrivateKey:'应用私钥',productId:'课程商品',priceCents:'售价',originalPriceCents:'原价',publicOrigin:'HTTPS 回调域名'};
      const issue=parsed.error.issues[0],field=labels[issue.path.at(-1)];
      throw paymentError(400,`${section==='wechat'?'微信':section==='alipay'?'支付宝':'定价与回调'}${field||'配置'}格式无效，请检查长度与类型`);
    }
    res.json(savePaymentSection(req.user,Number(req.headers['if-match']),section,parsed.data));
  });
  router.post('/admin/payments/:provider/test',requireOwner,async(req,res)=>{
    const provider=req.params.provider;
    if(!['wechat','alipay'].includes(provider))throw paymentError(404,'不支持的支付平台');
    if(!/^\d+$/.test(req.headers['if-match']||''))throw paymentError(428,'请重新加载并保存配置后测试');
    if(req.body&&Object.keys(req.body).length)throw paymentError(400,'仅测试已保存配置，请勿在测试请求中传入密钥');
    const c=paymentConfiguration();
    if(c.version!==Number(req.headers['if-match']))throw paymentError(409,'支付配置已更新，请重新加载后测试');
    if(diagnosticInFlight.has(provider))throw paymentError(409,'该平台正在测试，请稍后再试');
    rateLimit('payment-connection-test',`${req.user.id}:${provider}`,3,60);
    rateLimit('payment-connection-global',provider,10,60);
    diagnosticInFlight.add(provider);
    try{
      const result=await diagnosePaymentConnection(provider,c);
      if(paymentConfiguration().version!==c.version)throw paymentError(409,'测试期间配置已更新，结果已作废，请重新加载后测试');
      res.json(result);
    }finally{diagnosticInFlight.delete(provider);}
  });
  router.put('/admin/payments',requireOwner,(req,res)=>{
    if(!/^\d+$/.test(req.headers['if-match']||''))throw paymentError(428,'请先重新加载支付配置');
    const parsed=paymentSaveSchema.safeParse(req.body);if(!parsed.success)throw paymentError(400,'支付配置格式无效');
    res.json(savePaymentConfig(req.user,Number(req.headers['if-match']),parsed.data));
  });
  router.get('/commerce/orders',requireAuth,(req,res)=>{const page=listPage(req.query);res.set('Cache-Control','private, no-store').json({items:rows('SELECT order_id FROM payment_checkouts WHERE user_id=? ORDER BY order_id DESC LIMIT ? OFFSET ?',[req.user.id,page.limit,page.offset]).map(c=>publicOrder(checkout(c.order_id))),total:row('SELECT COUNT(*) n FROM payment_checkouts WHERE user_id=?',[req.user.id]).n,...page});});
  router.get('/commerce/orders/:id',requireAuth,(req,res)=>res.json(publicOrder(ownedOrder(req))));
  router.post('/commerce/orders/:id/pay',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,async()=>{
    const order=ownedOrder(req);
    if(req.body&&Object.keys(req.body).length)throw paymentError(400,'付款请求不得覆盖订单金额或回调地址');
    if(order.status==='paid')return res.json(publicOrder(order));
    if(order.provider!=='alipay'||order.payment_flow!=='page'||order.status!=='pending'||Date.parse(order.expires_at)<=Date.now())throw paymentError(409,'订单不可继续支付，请查询状态或更新订单');
    const current=paymentConfiguration(),offer=publicPaymentOffer();
    if(!offer.channels.find(ch=>ch.id==='alipay')?.available||offer.productId!==order.product_id||providerSnapshotChanged(order,current))throw paymentError(409,'支付宝配置或课程状态已变化，请查询原订单后重新发起付款');
    rateLimit('payment-page-launch',`${req.user.id}:${order.id}`,4,60);
    let url;try{url=alipayPagePayment(paymentConfiguration(order.config_version),order);}catch{throw paymentError(502,'支付宝收银台链接准备失败，请联系管理员检查配置；未确认付款成功');}
    const issued=run("UPDATE payment_checkouts SET page_issued_at=CASE WHEN page_issued_at=0 THEN ? ELSE page_issued_at END,attempt_state='issued' WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')",[Math.floor(Date.now()/1000),order.id,order.id]);
    if(!issued.changes)return res.json(publicOrder(checkout(order.id)));
    scheduleCheck(order.id,30);event(order.id,'launch','PAGE_LINK_ISSUED',false);
    res.json({...publicOrder(checkout(order.id)),paymentUrl:url});
  }));
  router.post('/commerce/orders/:id/sync',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,async()=>{
    const order=ownedOrder(req);if(order.status==='paid')return res.json(publicOrder(order));
    rateLimit('payment-query',`${req.user.id}:${order.id}`,4,60);
    try{const result=await reconcileOrder(order);if(result.providerMissing&&result.status==='pending')return res.json({...publicOrder(result),message:'支付平台未查到此订单，未开通课程；结果仍需确认，已安排自动补查'});}
    catch(e){if(e.status===400||e.status===409)throw e;throw paymentError(502,'支付状态暂时无法确认，请稍后查询或联系管理员核对订单');}
    res.json(publicOrder(checkout(order.id)));
  }));
  router.post('/commerce/orders/:id/close',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,async()=>{
    const order=ownedOrder(req);if(order.status!=='pending')return res.json(publicOrder(order));
    rateLimit('payment-close',`${req.user.id}:${order.id}`,3,60);
    if(unissuedPage(order)){retireAttempt(order,'unissued-page');return res.json(publicOrder(checkout(order.id)));}
    try{
      const c=paymentConfiguration(order.config_version),t=await queryProviderPayment(order.provider,c,order.order_no,{strictMissing:true});
      if(t.notFound){
        if(!absenceCanRetire(order)||inFlight.has(order.id))throw paymentError(409,'订单仍在有效期内或付款结果待确认，请稍后再关闭');
        retireAttempt(order,'verified-absent');return res.json(publicOrder(checkout(order.id)));
      }
      settleOnlinePayment(order.provider,order.config_version,t);
      if(!t.paid&&!t.closed&&checkout(order.id).status!=='paid'){
        await closeProviderPayment(order.provider,c,order.order_no);
        const confirmed=await queryProviderPayment(order.provider,c,order.order_no,{strictMissing:true});
        if(confirmed.notFound)throw paymentError(502,'关闭结果尚未确认');
        settleOnlinePayment(order.provider,order.config_version,confirmed);
        if(checkout(order.id).status==='pending')throw paymentError(502,'关闭结果尚未确认');
      }
    }catch(e){if(checkout(order.id).status==='paid')return res.json(publicOrder(checkout(order.id)));if(e.status===409)throw e;throw paymentError(502,'支付平台尚未确认关闭，请先查询订单，不要重复付款');}
    res.json(publicOrder(checkout(order.id)));
  }));
  const createCheckout=async(req,res)=>{
    rateLimit('payment-create',String(req.user.id),8,60);
    const p=checkoutSchema.safeParse(req.body);if(!p.success)throw paymentError(400,'支付请求无效');
    const {provider,requestKey,expectedAmountCents}=p.data,c=paymentConfiguration(),offer=publicPaymentOffer();
    if(!offer.channels.find(ch=>ch.id===provider)?.available)throw paymentError(503,'该支付渠道尚未配置或暂未开放');
    const product=publishedProduct(offer.productId);if(!product||product.currency!=='CNY')throw paymentError(409,'课程价格或状态已变化');
    if(canReadPack(req.user,product.pack_id))throw paymentError(409,'当前账号已拥有课程权限，无需重复购买');
    if(expectedAmountCents!==undefined&&expectedAmountCents!==product.price_cents)throw paymentError(409,'课程价格已变化，请刷新并确认新价格后再购买');
    const replayed=row('SELECT order_id,provider FROM payment_checkout_requests WHERE user_id=? AND request_key=?',[req.user.id,requestKey])||row('SELECT order_id,provider FROM payment_checkouts WHERE user_id=? AND request_key=?',[req.user.id,requestKey]);
    if(replayed){
      if(replayed.provider!==provider)throw paymentError(409,'该请求已用于其他支付渠道');
      const replay=checkout(replayed.order_id);
      try{await ensureQRCode(replay);}catch(e){return res.status(202).json({...publicOrder(checkout(replay.id)),message:e.message});}
      return res.json(publicOrder(checkout(replay.id)));
    }
    const active=row(`SELECT c.order_id FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE c.user_id=? AND c.product_id=? AND o.status='pending' ORDER BY c.order_id DESC LIMIT 1`,[req.user.id,product.id]);
    if(active){const previous=checkout(active.order_id);
      const stale=previous.config_version!==c.version&&!previous.code_url&&providerSnapshotChanged(previous,c);
      if(Date.parse(previous.expires_at)<=Date.now()||stale){
        try{const confirmed=await confirmAndCloseAttempt(previous);if(confirmed.status==='paid')return res.json(publicOrder(confirmed));}
        catch(e){scheduleCheck(previous.id,30);if(e.status===409)throw e;throw paymentError(502,'旧订单状态尚未确认，已保留并安排补查；不会重复创建付款码');}
      }
    }
    let orderId;
    db.exec('BEGIN IMMEDIATE');try{
      const replay=row('SELECT order_id,provider FROM payment_checkouts WHERE user_id=? AND request_key=?',[req.user.id,requestKey]);
      if(replay&&replay.provider!==provider)throw paymentError(409,'该请求已用于其他支付渠道');
      // Reopening checkout (including a refresh) reuses the same pending transaction.
      const pendingRecord=row(`SELECT c.order_id FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE c.user_id=? AND c.product_id=? AND o.status='pending' ORDER BY c.order_id DESC LIMIT 1`,[req.user.id,product.id]);
      const pending=pendingRecord&&checkout(pendingRecord.order_id);
      if(pending&&pending.provider!==provider){db.exec('COMMIT');return res.json({...publicOrder(pending),needsSwitch:true});}
      if(replay)orderId=replay.order_id;
      else if(pending)orderId=pending.id;
      else{
        const orderNo=`OSL${Date.now()}${randomBytes(5).toString('hex')}`;
        orderId=Number(run("INSERT INTO orders(order_no,user_id,status,amount_cents,currency) VALUES(?,?,'pending',?,'CNY')",[orderNo,req.user.id,product.price_cents]).lastInsertRowid);
        run('INSERT INTO order_items(order_id,product_id,title,price_cents) VALUES(?,?,?,?)',[orderId,product.id,product.title,product.price_cents]);
        run("INSERT INTO payments(order_id,provider,status,amount_cents) VALUES(?,?,'created',?)",[orderId,provider,product.price_cents]);
        const flow=paymentTransport.checkoutFlow(provider);
        run("INSERT INTO payment_checkouts(order_id,user_id,product_id,provider,config_version,request_key,expires_at,payment_flow,attempt_state,next_sync_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[orderId,req.user.id,product.id,provider,c.version,requestKey,new Date(Date.now()+15*60*1000).toISOString(),flow,flow==='page'?'prepared':'creating',flow==='page'?0:Math.floor(Date.now()/1000)+30]);
      }
      run('INSERT INTO payment_checkout_requests(user_id,request_key,order_id,provider) VALUES(?,?,?,?)',[req.user.id,requestKey,orderId,provider]);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    try{await ensureQRCode(checkout(orderId));}catch(e){return res.status(202).json({...publicOrder(checkout(orderId)),message:e.message});}
    res.status(201).json(publicOrder(checkout(orderId)));
  };
  router.post('/commerce/checkout',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,()=>createCheckout(req,res)));
  router.post('/commerce/orders/:id/renew',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,async()=>{
    const old=ownedOrder(req),parsed=checkoutSchema.safeParse(req.body);
    if(!parsed.success||parsed.data.provider!==old.provider)throw paymentError(400,'重新获取付款码请求无效');
    if(old.status==='paid')return res.json(publicOrder(old));
    const replay=row('SELECT order_id,provider FROM payment_checkout_requests WHERE user_id=? AND request_key=?',[req.user.id,parsed.data.requestKey]);
    if(!replay){
      const offer=publicPaymentOffer();if(offer.productId!==old.product_id||offer.priceCents!==old.amount_cents||!offer.channels.find(c=>c.id===old.provider)?.available)throw paymentError(409,'课程、价格或支付渠道已变化，请刷新并确认后再购买');
      if(old.status==='pending'){
        rateLimit('payment-renew',`${req.user.id}:${old.id}`,3,60);
        try{const result=await confirmAndCloseAttempt(old);if(result.status==='paid')return res.json(publicOrder(result));}
        catch(e){scheduleCheck(old.id,30);if(e.status===409)throw e;throw paymentError(502,'原付款结果仍待确认，已安排补查；暂不生成第二个付款码');}
      }
    }
    req.body=parsed.data;return createCheckout(req,res);
  }));
  router.post('/commerce/orders/:id/switch',requireAuth,async(req,res)=>withCheckoutOperation(req.user.id,async()=>{
    const old=ownedOrder(req),parsed=checkoutSchema.safeParse(req.body);
    if(!parsed.success)throw paymentError(400,'切换支付请求无效');
    rateLimit('payment-switch',`${req.user.id}:${old.id}`,3,60);
    const {provider,requestKey}=parsed.data;
    const replay=row('SELECT r.order_id,r.provider,c.product_id FROM payment_checkout_requests r JOIN payment_checkouts c ON c.order_id=r.order_id WHERE r.user_id=? AND r.request_key=?',[req.user.id,requestKey])||row('SELECT order_id,provider,product_id FROM payment_checkouts WHERE user_id=? AND request_key=?',[req.user.id,requestKey]);
    if(replay){
      if(replay.provider!==provider||replay.product_id!==old.product_id)throw paymentError(409,'该请求已用于其他支付操作');
      const next=checkout(replay.order_id);if(next.id===old.id&&provider!==old.provider)throw paymentError(409,'请重新选择支付方式');
      if(next.id!==old.id&&old.status==='pending')throw paymentError(409,'旧订单状态尚未确认，请稍后重试');
      try{await ensureQRCode(next);}catch(e){return res.status(202).json({...publicOrder(checkout(next.id)),message:e.message});}
      return res.json(publicOrder(checkout(next.id)));
    }
    if(old.status==='paid')return res.json(publicOrder(old));
    if(provider===old.provider){req.body=parsed.data;return createCheckout(req,res);}
    const offer=publicPaymentOffer(),product=publishedProduct(offer.productId);
    if(!offer.channels.find(ch=>ch.id===provider)?.available||!product||product.id!==old.product_id)throw paymentError(409,'该支付方式或课程暂不可用，请刷新后重试');
    if(product.price_cents!==old.amount_cents)throw paymentError(409,'课程价格已变化，请刷新并确认当前价格后重试；原订单金额未修改');
    const another=row("SELECT c.order_id FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE c.user_id=? AND c.product_id=? AND o.status='pending' AND o.id<>?",[req.user.id,old.product_id,old.id]);
    if(another)throw paymentError(409,'还有其他待付订单，请先核验其支付状态');
    if(old.status==='pending'){
      try{
        if(unissuedPage(old)){retireAttempt(old,'unissued-page');}
        else{
        const c=paymentConfiguration(old.config_version);
        let transaction=await queryProviderPayment(old.provider,c,old.order_no,{strictMissing:true});
        if(transaction.notFound){
          // A timed-out create may still be processing at the provider. Absence while
          // this attempt is valid is not permission to open another payable QR.
          if(!absenceCanRetire(old)||inFlight.has(old.id))throw paymentError(409,'旧订单仍在确认中，请稍后切换；暂时保留原支付方式，避免重复付款');
          retireAttempt(old,'verified-absent');
        }else{
          settleOnlinePayment(old.provider,old.config_version,transaction);
          if(checkout(old.id).status==='paid')return res.json(publicOrder(checkout(old.id)));
          if(!transaction.closed){
            await closeProviderPayment(old.provider,c,old.order_no);
            transaction=await queryProviderPayment(old.provider,c,old.order_no,{strictMissing:true});
            if(transaction.notFound)throw paymentError(502,'关闭结果尚未确认');
            settleOnlinePayment(old.provider,old.config_version,transaction);
          }
          if(checkout(old.id).status==='paid')return res.json(publicOrder(checkout(old.id)));
          if(checkout(old.id).status!=='cancelled')throw paymentError(502,'关闭结果尚未确认');
        }
        }
      }catch(e){
        if(checkout(old.id).status==='paid')return res.json(publicOrder(checkout(old.id)));
        if(e.status===409)throw e;
        throw paymentError(502,'暂时无法确认旧订单已关闭，请稍后重试切换；原订单已保留，勿重复付款');
      }
    }
    if(checkout(old.id).status==='paid')return res.json(publicOrder(checkout(old.id)));
    if(checkout(old.id).status!=='cancelled')throw paymentError(409,'订单状态不支持切换支付方式');
    req.body=parsed.data;return createCheckout(req,res);
  }));return router;
}
