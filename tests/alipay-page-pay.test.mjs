import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,randomUUID,sign,verify} from 'node:crypto';
import {officialAlipayUrl,paymentReturnId} from '../src/payment-navigation.js';

test('cashier navigation rejects arbitrary redirects and never treats return parameters as payment evidence',()=>{
  const good='https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay';
  assert.equal(officialAlipayUrl(good),good);
  for(const url of ['javascript:alert(1)','https://evil.test/gateway.do?method=alipay.trade.page.pay','https://openapi.alipay.com.evil.test/gateway.do?method=alipay.trade.page.pay','http://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay',good+'#bad','https://x@openapi.alipay.com/gateway.do?method=alipay.trade.page.pay',good.replace('page.pay','precreate')])assert.equal(officialAlipayUrl(url),null);
  assert.equal(paymentReturnId('?paymentReturn=42&trade_status=TRADE_SUCCESS'),42);
  for(const query of ['','?paymentReturn=-1','?paymentReturn=0','?paymentReturn=1e3','?paymentReturn=1/2','?paymentReturn=9999999999999999999'])assert.equal(paymentReturnId(query),null);
  const ui=readFileSync(new URL('../src/CourseCheckout.jsx',import.meta.url),'utf8');
  assert.match(ui,/前往支付宝收银台/);assert.match(ui,/officialAlipayUrl\(result.paymentUrl\)/);
  assert.match(ui,/\/commerce\/orders\/\$\{initialOrderId\}\/sync/);
  assert.doesNotMatch(ui,/searchParams.*trade_status|dangerouslySetInnerHTML|window.open/);
});

test('Alipay website payments: local signing, private recovery, safe switching and verified settlement',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'oneshowlearn-page-pay-test-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(directory,'test.db'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'page-test-only',PAYMENT_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)});
  const {createApp}=await import('../server/index.mjs');
  const {db,run,row,rows}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {paymentTransport,alipayClient}=await import('../server/payment-providers.mjs');
  const {adminPaymentConfig,savePaymentConfig,paymentConfiguration}=await import('../server/payment-configuration.mjs');
  const {checkout,runPaymentReconciliation}=await import('../server/payment-lifecycle.mjs');
  const {migratePayments}=await import('../server/payment-schema.mjs');
  const keys=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const merchant=keys(),platform=keys(),wx=keys();
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const user=(role='learner')=>{const email=`${randomUUID()}@test.local`,id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[email,'x',role,role]).lastInsertRowid);return {id,role,token:signUser({id,role,email})};};
  const owner=user('admin'),other=user();
  const req=async(route,account,method='GET',body)=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:`Bearer ${account.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),headers:response.headers};};
  const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('page-pay-path','Isolated course','published')").lastInsertRowid);
  const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,status,price_cents) VALUES(?,'page-pay-course','Course','published',49900)",[pathId]).lastInsertRowid);
  const productId=Number(run("INSERT INTO products(pack_id,sku,title,price_cents) VALUES(?,'page-test','Course',49900)",[packId]).lastInsertRowid);
  savePaymentConfig(owner,0,{settings:{...adminPaymentConfig().settings,productId,priceCents:49900,alipay:{enabled:true,appId:'page-test-app',sellerId:'208800001234',publicKey:platform.publicKey},wechat:{enabled:true,appId:'wx-test',mchId:'1234567890',serialNo:'ABCDEF',publicKeyId:'PUB_KEY_ID_TEST',publicKey:wx.publicKey}},secrets:{alipayPrivateKey:merchant.privateKey,wechatPrivateKey:merchant.privateKey,wechatApiV3Key:'a'.repeat(32)}});
  let gatewayCalls=0,missingVerified=true;
  const remote=new Map();
  paymentTransport.alipay=async(_s,_k,route,body)=>{
    gatewayCalls++;assert.ok(!route.endsWith('/precreate'),'New page attempts must never call face-to-face precreate');
    const data=remote.get(body.out_trade_no);
    if(!data)throw Object.assign(new Error('fixture missing'),{code:'ACQ.TRADE_NOT_EXIST',responseHttpStatus:400});
    if(route.endsWith('/close'))data.trade_status='TRADE_CLOSED';
    return {...data};
  };
  paymentTransport.alipayConfirmMissing=async()=>{gatewayCalls++;if(!missingVerified)throw new Error('unverified absence');return {code:'40004',subCode:'ACQ.TRADE_NOT_EXIST'};};
  paymentTransport.fetch=async(url,options)=>{
    gatewayCalls++;const route=String(url).replace('https://api.mch.weixin.qq.com','');let data;
    if(route.endsWith('/native')){const b=JSON.parse(options.body);data={code_url:'weixin://wxpay/bizpayurl?pr=PAGE_TEST'};remote.set(b.out_trade_no,{appid:'wx-test',mchid:'1234567890',out_trade_no:b.out_trade_no,trade_state:'NOTPAY'});}
    else{const no=route.split('/out-trade-no/')[1].split(/[/?]/)[0];data=remote.get(no);if(route.endsWith('/close')){data.trade_state='CLOSED';data=null;}}
    const raw=data?JSON.stringify(data):'',timestamp=String(Math.floor(Date.now()/1000)),nonce='page-test';
    return new Response(data?raw:null,{status:data?200:204,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Serial':'PUB_KEY_ID_TEST','Wechatpay-Signature':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),wx.privateKey).toString('base64')}});
  };
  const create=(buyer,provider='alipay',requestKey=randomUUID())=>req('/commerce/checkout',buyer,'POST',{provider,requestKey,expectedAmountCents:49900});
  const launch=(buyer,order,body={})=>req(`/commerce/orders/${order.id}/pay`,buyer,'POST',body);
  const switchTo=(buyer,order,provider='wechat',requestKey=randomUUID())=>req(`/commerce/orders/${order.id}/switch`,buyer,'POST',{provider,requestKey,expectedAmountCents:49900});
  const notify=async(order,changes={},forged=false)=>{
    const data={app_id:'page-test-app',seller_id:'208800001234',out_trade_no:order.orderNo,total_amount:'499.00',trade_status:'TRADE_SUCCESS',trade_no:`page-${order.id}`,...changes};
    const canonical=Object.keys(data).sort().map(k=>`${k}=${data[k]}`).join('&');
    data.sign=forged?'bad':sign('RSA-SHA256',Buffer.from(canonical),platform.privateKey).toString('base64');data.sign_type='RSA2';
    const version=checkout(order.id).config_version;
    return fetch(`${base}/payments/notify/alipay/${version}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()});
  };
  await t.test('default Alipay order is prepared, owner-only and idempotent without any gateway calls',async()=>{
    const buyer=user(),key=randomUUID(),before=gatewayCalls,first=await create(buyer,'alipay',key);
    assert.equal(first.status,201);assert.equal(first.body.paymentFlow,'page');assert.equal(first.body.attemptState,'prepared');assert.equal(first.body.qrUrl,'');assert.equal(first.body.needsQuery,false);
    assert.equal(first.body.paymentUrl,undefined);assert.equal(gatewayCalls,before);
    assert.equal((await create(buyer,'alipay',key)).body.id,first.body.id);
    assert.equal((await create(buyer)).body.id,first.body.id);assert.equal(gatewayCalls,before);
    assert.equal((await req(`/commerce/orders/${first.body.id}`,other)).status,404);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('official SDK locally signs page.pay, authoritative amount, seller, callbacks and absolute Beijing expiry',async()=>{
    const buyer=user(),o=(await create(buyer)).body,before=gatewayCalls,issued=await launch(buyer,o);
    assert.equal(issued.status,200);assert.equal(gatewayCalls,before);assert.equal(issued.body.attemptState,'issued');
    const url=new URL(issued.body.paymentUrl),params=Object.fromEntries(url.searchParams),biz=JSON.parse(params.biz_content);
    assert.equal(url.origin,'https://openapi.alipay.com');assert.equal(params.method,'alipay.trade.page.pay');assert.equal(params.app_id,'page-test-app');assert.equal(params.sign_type,'RSA2');
    assert.equal(biz.product_code,'FAST_INSTANT_TRADE_PAY');assert.equal(biz.out_trade_no,o.orderNo);assert.equal(biz.total_amount,'499.00');assert.equal(biz.seller_id,'208800001234');
    assert.equal(biz.time_expire,new Date(Date.parse(o.expiresAt)+8*3600000).toISOString().slice(0,19).replace('T',' '));
    assert.equal(params.notify_url,`https://oneshowlearn.com/api/payments/notify/alipay/1`);assert.equal(params.return_url,`https://oneshowlearn.com/membership?paymentReturn=${o.id}`);
    const canonical=Object.keys(params).filter(k=>k!=='sign').sort().map(k=>`${k}=${params[k]}`).join('&');
    assert.ok(verify('RSA-SHA256',Buffer.from(canonical),merchant.publicKey,Buffer.from(params.sign,'base64')));
    assert.ok(!JSON.stringify(issued).includes('PRIVATE KEY'));assert.equal((await req(`/commerce/orders/${o.id}`,buyer)).body.paymentUrl,undefined);
    assert.equal(row("SELECT verified FROM payment_events WHERE order_id=? AND stage='launch'",[o.id]).verified,0,'Local signing is not verified gateway acceptance');
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    const repeat=await launch(buyer,o);assert.equal(repeat.body.id,o.id);assert.equal(row('SELECT COUNT(*) n FROM orders WHERE user_id=?',[buyer.id]).n,1);
  });
  await t.test('launch ownership/input/expiry/official-host guards cannot issue arbitrary payment links',async()=>{
    const buyer=user(),o=(await create(buyer)).body;
    assert.equal((await launch(null,o)).status,401);assert.equal((await launch(other,o)).status,404);
    for(const body of [{amountCents:1},{returnUrl:'https://evil.test'},{notifyUrl:'https://evil.test'},{paid:true}])assert.equal((await launch(buyer,o,body)).status,400);
    const factory=paymentTransport.client;paymentTransport.client=()=>({pageExecute:()=> 'https://evil.test/pay?secret=DO_NOT_ECHO'});
    try{const result=await launch(buyer,o);assert.equal(result.status,502);assert.ok(!JSON.stringify(result).includes('DO_NOT_ECHO'));assert.equal(checkout(o.id).page_issued_at,0);}finally{paymentTransport.client=factory;}
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),o.id]);assert.equal((await launch(buyer,o)).status,409);
  });
  await t.test('unissued page orders switch or close immediately without querying an imaginary trade',async()=>{
    const buyer=user(),o=(await create(buyer)).body,before=gatewayCalls,key=randomUUID(),switched=await switchTo(buyer,o,'wechat',key);
    assert.equal(switched.status,201);assert.equal(switched.body.paymentFlow,'qr');assert.match(switched.body.qrUrl,/weixin:/);assert.equal(gatewayCalls,before+1);
    assert.equal(checkout(o.id).status,'cancelled');assert.equal((await switchTo(buyer,o,'wechat',key)).body.id,switched.body.id);
    const b=user(),unused=(await create(b)).body,calls=gatewayCalls;assert.equal((await req(`/commerce/orders/${unused.id}/close`,b,'POST')).body.status,'cancelled');assert.equal(gatewayCalls,calls);
  });
  await t.test('issued but not yet visible page requests remain pending until signed absence after absolute expiry and safety margin',async()=>{
    const buyer=user(),o=(await create(buyer)).body;await launch(buyer,o);
    assert.equal((await switchTo(buyer,o)).status,409);assert.equal(checkout(o.id).status,'pending');
    run('DELETE FROM auth_rate_limits');run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),o.id]);
    assert.equal((await switchTo(buyer,o)).status,409);assert.equal((await req(`/commerce/orders/${o.id}/close`,buyer,'POST')).status,409);
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-6*60000).toISOString(),o.id]);missingVerified=false;
    assert.equal((await switchTo(buyer,o)).status,502);assert.equal(checkout(o.id).status,'pending');missingVerified=true;run('DELETE FROM auth_rate_limits');
    const result=await switchTo(buyer,o);assert.equal(result.status,201);assert.equal(checkout(o.id).status,'cancelled');
  });
  await t.test('confirmed existing page trades query/close/requery before opening WeChat',async()=>{
    const buyer=user(),o=(await create(buyer)).body;await launch(buyer,o);
    remote.set(o.orderNo,{out_trade_no:o.orderNo,total_amount:'499.00',seller_id:'208800001234',trade_status:'WAIT_BUYER_PAY'});
    const result=await switchTo(buyer,o);assert.equal(result.status,201);assert.equal(remote.get(o.orderNo).trade_status,'TRADE_CLOSED');assert.equal(checkout(o.id).status,'cancelled');
  });
  await t.test('return page parameters cannot fulfill; forged, wrong merchant or wrong amount callbacks are rejected',async()=>{
    const buyer=user(),o=(await create(buyer)).body;await launch(buyer,o);
    assert.equal((await req(`/commerce/orders/${o.id}?trade_status=TRADE_SUCCESS&total_amount=499`,buyer)).body.status,'pending');
    assert.equal((await notify(o,{},true)).status,400);
    for(const change of [{seller_id:'wrong'},{app_id:'wrong'},{total_amount:'0.01'},{out_trade_no:'wrong'}])assert.equal((await notify(o,change)).status,400);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    assert.equal((await notify(o)).status,200);assert.equal((await notify(o)).status,200);
    const relaunch=await launch(buyer,o);assert.equal(relaunch.body.status,'paid');assert.equal(relaunch.body.paymentUrl,undefined);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,1);
  });
  await t.test('configuration rotation keeps historical signatures and amounts; new launches reject changed merchant or disabled provider',async()=>{
    const buyer=user(),o=(await create(buyer)).body;await launch(buyer,o);
    const before=paymentConfiguration();savePaymentConfig(owner,before.version,{settings:{...before.settings,alipay:{...before.settings.alipay,enabled:false}},secrets:{}});
    assert.equal((await launch(buyer,o)).status,409);assert.equal((await notify(o)).status,200);
    const disabled=paymentConfiguration();savePaymentConfig(owner,disabled.version,{settings:{...disabled.settings,alipay:{...disabled.settings.alipay,enabled:true}},secrets:{}});
    assert.equal(checkout(o.id).amount_cents,49900);assert.equal(checkout(o.id).config_version,1);
    assert.deepEqual(paymentConfiguration().settings.wechat,before.settings.wechat);assert.deepEqual(paymentConfiguration().secrets,before.secrets);
  });
  await t.test('historical QR migration leaves all columns and amounts intact; unissued reconciliation never requests a gateway',async()=>{
    const buyer=user(),o=(await create(buyer)).body;run("UPDATE payment_checkouts SET payment_flow='qr',code_url='https://qr.alipay.com/legacy123',attempt_state='legacy' WHERE order_id=?",[o.id]);
    const before=rows('SELECT * FROM payment_checkouts'),configs=rows('SELECT * FROM payment_configuration');migratePayments(db);assert.deepEqual(rows('SELECT * FROM payment_checkouts'),before);assert.deepEqual(rows('SELECT * FROM payment_configuration'),configs);
    assert.equal((await req(`/commerce/orders/${o.id}`,buyer)).body.qrUrl,'https://qr.alipay.com/legacy123');assert.equal((await launch(buyer,o)).status,409);
    const unused=(await create(user())).body;run('UPDATE payment_checkouts SET expires_at=?,next_sync_at=1 WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),unused.id]);
    const calls=gatewayCalls;await runPaymentReconciliation();assert.equal(checkout(unused.id).status,'cancelled');assert.equal(gatewayCalls,calls);
  });
});
