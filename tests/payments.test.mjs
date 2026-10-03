import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCipheriv,generateKeyPairSync,randomUUID,sign,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';

test('online payments: private configuration, signed providers, callback settlement and order recovery',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'oneshowlearn-payments-test-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(directory,'test.db'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'payment-test-only',PAYMENT_CONFIG_ENCRYPTION_KEY:'ef'.repeat(32)});
  const {createApp}=await import('../server/index.mjs');
  const {db,run,row}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {paymentTransport,amountCents,alipayClient,createProviderPayment,wechatTransaction}=await import('../server/payment-providers.mjs');
  const nativeAlipay=paymentTransport.alipay;
  // Keep the historical QR contract covered independently of new page orders.
  const nativeFlow=paymentTransport.checkoutFlow;
  assert.equal(nativeFlow('alipay'),'page');assert.equal(nativeFlow('wechat'),'qr');
  paymentTransport.checkoutFlow=()=> 'qr';
  const {checkout,withCheckoutOperation,runPaymentReconciliation}=await import('../server/payment-lifecycle.mjs');
  const {migratePayments}=await import('../server/payment-schema.mjs');
  const keys=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const merchant=keys(),wx=keys(),ali=keys();
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{paymentTransport.checkoutFlow=nativeFlow;await new Promise(r=>server.close(r));db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const user=(role='learner')=>{const email=`${randomUUID()}@test.local`,id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[email,'x',role,role]).lastInsertRowid);return {id,token:signUser({id,role,email})};};
  const admin=user('admin'),editor=user('editor'),learner=user(),other=user();
  const req=async(route,account=admin,method='GET',body,version)=>{
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:`Bearer ${account.token}`} : {}),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),headers:r.headers};
  };
  const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('payment-path','Payment fixture','published')").lastInsertRowid);
  const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,status,price_cents) VALUES(?,'payment-course','Test course','published',100)",[pathId]).lastInsertRowid);
  const productId=Number(run("INSERT INTO products(pack_id,sku,title,price_cents) VALUES(?,'payment-sku','Test course',100)",[packId]).lastInsertRowid);
  let state,down=false,tamperResponse=false,wxCalls=0,aliCalls=0;
  const remote=new Map();
  const wxHeaders=(raw,time=String(Math.floor(Date.now()/1000)))=>{const nonce='test-notification-nonce';return {'Wechatpay-Timestamp':time,'Wechatpay-Nonce':nonce,'Wechatpay-Serial':'PUB_KEY_ID_TEST','Wechatpay-Signature':sign('RSA-SHA256',Buffer.from(`${time}\n${nonce}\n${raw}\n`),wx.privateKey).toString('base64')};};
  paymentTransport.fetch=async(url,options)=>{
    wxCalls++;if(down)throw new Error('private provider error');
    assert.equal(options.headers['Wechatpay-Serial'],'PUB_KEY_ID_TEST');
    const route=String(url).replace('https://api.mch.weixin.qq.com',''),auth=Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    assert.ok(verify('RSA-SHA256',Buffer.from(`${options.method}\n${route}\n${auth.timestamp}\n${auth.nonce_str}\n${options.body||''}\n`),merchant.publicKey,Buffer.from(auth.signature,'base64')));
    let data;
    if(route==='/v3/pay/transactions/native'){
      const b=JSON.parse(options.body);assert.equal(b.amount.total,39900);assert.equal(b.amount.currency,'CNY');assert.match(b.notify_url,/https:\/\/oneshowlearn.com\/api\/payments\/notify\/wechat\/\d+/);assert.ok(b.out_trade_no.length<=32);
      remote.set(b.out_trade_no,{appid:'wx-test-app',mchid:'1234567890',out_trade_no:b.out_trade_no,amount:b.amount,trade_state:'NOTPAY'});data={code_url:'weixin://wxpay/bizpayurl?pr=test'};
    }else{
      const no=route.split('/out-trade-no/')[1].split(/[/?]/)[0];data=remote.get(no);assert.ok(data);
      if(route.endsWith('/close')){data.trade_state='CLOSED';data=null;}
    }
    // Real WeChat unpaid/closed queries omit amount; preserve remote amount for
    // a later SUCCESS, but do not fabricate it in the signed response fixture.
    const responseData=data?{...data}:null;
    if(responseData&&['NOTPAY','CLOSED','REVOKED','USERPAYING','PAYERROR','ACCEPT'].includes(responseData.trade_state))delete responseData.amount;
    const raw=responseData?JSON.stringify(responseData):'';const headers=wxHeaders(raw);if(tamperResponse)headers['Wechatpay-Signature']='broken';
    return new Response(data?raw:null,{status:data?200:204,headers});
  };
  paymentTransport.alipay=async(s,k,route,b)=>{
    aliCalls++;assert.equal(s.appId,'ali-test-app');assert.ok(k.alipayPrivateKey);if(down)throw new Error('secret provider failure');
    if(route.endsWith('/precreate')){assert.equal(b.total_amount,'399.00');assert.equal(b.seller_id,'208800001234');assert.match(b.notify_url,/\/notify\/alipay\/\d+$/);remote.set(b.out_trade_no,{out_trade_no:b.out_trade_no,total_amount:b.total_amount,trade_status:'WAIT_BUYER_PAY'});return {out_trade_no:b.out_trade_no,qr_code:'https://qr.alipay.com/test123'};}
    const d=remote.get(b.out_trade_no);if(!d)throw Object.assign(new Error('missing'),{code:'ACQ.TRADE_NOT_EXIST',responseHttpStatus:400});if(route.endsWith('/close'))d.trade_status='TRADE_CLOSED';return d;
  };
  const create=(account,provider='wechat',key=randomUUID())=>req('/commerce/checkout',account,'POST',{provider,requestKey:key});
  const switchTo=(account,order,provider,key=randomUUID())=>req(`/commerce/orders/${order.id}/switch`,account,'POST',{provider,requestKey:key});
  paymentTransport.alipayConfirmMissing=async()=>({code:'40004',subCode:'ACQ.TRADE_NOT_EXIST'});
  const wxNotify=async(order,changes={},badSign=false,time)=>{
    const d={appid:'wx-test-app',mchid:'1234567890',out_trade_no:order.orderNo,amount:{currency:'CNY',total:order.amountCents},trade_state:'SUCCESS',transaction_id:`wx-${order.id}`,...changes};
    const nonce='abcdefghijkl',aad='transaction',cipher=createCipheriv('aes-256-gcm',Buffer.from('a'.repeat(32)),Buffer.from(nonce));cipher.setAAD(Buffer.from(aad));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(d)),cipher.final(),cipher.getAuthTag()]);
    const raw=JSON.stringify({event_type:'TRANSACTION.SUCCESS',resource:{algorithm:'AEAD_AES_256_GCM',nonce,associated_data:aad,ciphertext:encrypted.toString('base64')}}),headers=wxHeaders(raw,time);if(badSign)headers['Wechatpay-Signature']='invalid';
    const version=row('SELECT config_version FROM payment_checkouts WHERE order_id=?',[order.id]).config_version;
    return fetch(`${base}/payments/notify/wechat/${version}`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:raw});
  };
  const aliNotify=async(order,changes={},badSign=false)=>{
    const data={app_id:'ali-test-app',seller_id:'208800001234',out_trade_no:order.orderNo,total_amount:(order.amountCents/100).toFixed(2),trade_status:'TRADE_SUCCESS',trade_no:`ali-${order.id}`,...changes};
    const canonical=Object.keys(data).sort().map(k=>`${k}=${data[k]}`).join('&');data.sign=badSign?'invalid':sign('RSA-SHA256',Buffer.from(canonical),ali.privateKey).toString('base64');data.sign_type='RSA2';
    const version=row('SELECT config_version FROM payment_checkouts WHERE order_id=?',[order.id]).config_version;
    return fetch(`${base}/payments/notify/alipay/${version}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()});
  };
  await t.test('official Alipay v3 SDK validates real response signatures without reaching the network',async()=>{
    const {MockAgent}=await import('undici'),agent=new MockAgent();agent.disableNetConnect();
    const route='/v3/alipay/trade/query',raw=JSON.stringify({out_trade_no:'signature-fixture',total_amount:'399.00',trade_status:'TRADE_SUCCESS',trade_no:'sdk-test'}),timestamp=String(Date.now()),nonce='sdk-test-nonce';
    const headers={'content-type':'application/json','alipay-timestamp':timestamp,'alipay-nonce':nonce,'alipay-signature':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),ali.privateKey).toString('base64')};
    const pool=agent.get('https://openapi.alipay.com');pool.intercept({path:route,method:'POST'}).reply(200,raw,{headers});
    const client=alipayClient({appId:'ali-test-app',publicKey:ali.publicKey},{alipayPrivateKey:merchant.privateKey});
    const result=await client.curl('POST',route,{body:{out_trade_no:'signature-fixture'},agent});assert.equal(result.data.trade_status,'TRADE_SUCCESS');
    pool.intercept({path:route,method:'POST'}).reply(200,raw,{headers:{...headers,'alipay-signature':'invalid'}});
    await assert.rejects(()=>client.curl('POST',route,{body:{out_trade_no:'signature-fixture'},agent}),{code:'response-signature-verify-error'});
    await agent.close();
  });
  await t.test('official legacy query verifies signed business absence; bad or missing signatures cannot close an attempt',async()=>{
    const {MockAgent}=await import('undici'),{AlipaySdk}=await import('alipay-sdk');
    const agent=new MockAgent();agent.disableNetConnect();
    const client=new AlipaySdk({...alipayClient({appId:'ali-test-app',publicKey:ali.publicKey},{alipayPrivateKey:merchant.privateKey}).config,proxyAgent:agent});
    const data={code:'40004',msg:'Business Failed',sub_code:'ACQ.TRADE_NOT_EXIST',sub_msg:'Trade not found'},raw=JSON.stringify(data);
    const signature=sign('RSA-SHA256',Buffer.from(raw),ali.privateKey).toString('base64'),pool=agent.get('https://openapi.alipay.com');
    const invoke=()=>client.exec('alipay.trade.query',{bizContent:{outTradeNo:'missing-fixture'}},{validateSign:true});
    try{
      for(const responseSign of [signature,'invalid',undefined]){
        pool.intercept({path:p=>p.startsWith('/gateway.do'),method:'POST'}).reply(200,JSON.stringify({alipay_trade_query_response:data,...(responseSign?{sign:responseSign}:{})}),{headers:{'content-type':'application/json'}});
        if(responseSign===signature){const result=await invoke();assert.equal(result.code,'40004');assert.equal(result.subCode,'ACQ.TRADE_NOT_EXIST');}
        else await assert.rejects(invoke);
      }
    }finally{await agent.close();}
  });
  await t.test('no configuration: real owner prices, disabled channels, no phantom checkout',async()=>{
    const d=(await req('/commerce/offer',null)).body;assert.equal(d.priceCents,39900);assert.equal(d.originalPriceCents,99900);assert.equal(d.productId,null);assert.ok(d.channels.every(c=>!c.available));assert.equal((await create(learner)).status,503);assert.equal(row('SELECT COUNT(*) n FROM orders').n,0);
    for(const account of [null,editor,learner])assert.equal((await req('/admin/payments',account)).status,account?403:401);
    state=(await req('/admin/payments')).body;assert.equal(state.version,0);
  });
  await t.test('only admin can save valid versioned credentials and prices, secrets never echoed',async()=>{
    const settings={...state.settings,productId,wechat:{enabled:true,appId:'wx-test-app',mchId:'1234567890',serialNo:'ABCDE0123',publicKeyId:'PUB_KEY_ID_TEST',publicKey:wx.publicKey},alipay:{enabled:true,appId:'ali-test-app',sellerId:'208800001234',publicKey:ali.publicKey}};
    assert.equal((await req('/admin/payments',admin,'PUT',{settings},0)).status,400);
    const secrets={wechatPrivateKey:merchant.privateKey,wechatApiV3Key:'a'.repeat(32),alipayPrivateKey:merchant.privateKey};
    for(const account of [editor,learner])assert.equal((await req('/admin/payments',account,'PUT',{settings,secrets},0)).status,403);
    assert.equal((await req('/admin/payments',admin,'PUT',{settings,secrets})).status,428);
    assert.equal((await req('/admin/payments',admin,'PUT',{settings:{...settings,publicOrigin:'https://evil.test/path'},secrets},0)).status,400);
    const saved=await req('/admin/payments',admin,'PUT',{settings,secrets},0);assert.equal(saved.status,200,JSON.stringify(saved.body));state=saved.body;
    assert.ok(state.secretsConfigured.wechatPrivateKey);assert.ok(!JSON.stringify(state).includes(merchant.privateKey));assert.ok(!JSON.stringify(row('SELECT * FROM payment_configuration')).includes('PRIVATE KEY'));
    assert.equal(row('SELECT price_cents FROM products WHERE id=?',[productId]).price_cents,39900);assert.equal(row('SELECT price_cents FROM project_packs WHERE id=?',[packId]).price_cents,39900);
    assert.equal((await req('/admin/payments',admin,'PUT',{settings},0)).status,409);
    const offer=(await req('/commerce/offer',null)).body;assert.equal(offer.productId,productId);assert.ok(offer.channels.every(c=>c.available));
    const check=spawnSync(process.execPath,['--input-type=module','-e',"const {paymentConfiguration}=await import('./server/payment-configuration.mjs');console.log(paymentConfiguration().version)"],{env:process.env,encoding:'utf8'});assert.equal(check.status,0);assert.equal(check.stdout.trim(),'1');
    const wrong=spawnSync(process.execPath,['--input-type=module','-e',"const {paymentConfiguration}=await import('./server/payment-configuration.mjs');try{paymentConfiguration();process.exit(1)}catch{process.exit(0)}"],{env:{...process.env,PAYMENT_CONFIG_ENCRYPTION_KEY:'00'.repeat(32)},encoding:'utf8'});assert.equal(wrong.status,0);
    migratePayments(db);assert.equal(row('SELECT COUNT(*) n FROM payment_configuration').n,1);
  });
  let wxOrder;
  await t.test('signed native requests, server pricing, idempotent reopening and owner-only history',async()=>{
    const key=randomUUID(),first=await create(learner,'wechat',key);assert.equal(first.status,201,JSON.stringify(first.body));wxOrder=first.body;assert.equal(wxOrder.amountCents,39900);assert.match(wxOrder.qrUrl,/^weixin:/);assert.equal(wxOrder.status,'pending');
    const calls=wxCalls;assert.equal((await create(learner,'wechat',key)).body.id,wxOrder.id);assert.equal((await create(learner)).body.id,wxOrder.id);assert.equal(wxCalls,calls);
    const change=await create(learner,'alipay');assert.equal(change.status,200);assert.equal(change.body.needsSwitch,true);assert.equal(change.body.id,wxOrder.id);
    assert.equal((await req(`/commerce/orders/${wxOrder.id}`,other)).status,404);assert.equal((await req(`/commerce/orders/${wxOrder.id}/sync`,other,'POST')).status,404);
    assert.equal((await req('/commerce/orders',learner)).body.items[0].id,wxOrder.id);assert.equal((await req('/commerce/orders',other)).body.items.length,0);
    assert.equal((await req('/commerce/checkout',other,'POST',{provider:'wechat',requestKey:randomUUID(),amountCents:1,paid:true})).status,400);
    assert.equal((await req(`/admin/orders/${wxOrder.id}/mark-paid`,admin,'POST')).status,409);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[learner.id]).n,0);
  });
  await t.test('bad signature, old timestamp, wrong app/merchant/currency/amount cannot grant access',async()=>{
    assert.equal((await wxNotify(wxOrder,{},true)).status,400);
    assert.equal((await wxNotify(wxOrder,{},false,'1')).status,400);
    for(const change of [{appid:'wrong'},{mchid:'wrong'},{amount:{currency:'USD',total:39900}},{amount:{currency:'CNY',total:1}},{out_trade_no:'missing'}])assert.equal((await wxNotify(wxOrder,change)).status,400);
    assert.equal(row('SELECT status FROM orders WHERE id=?',[wxOrder.id]).status,'pending');assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[learner.id]).n,0);
  });
  await t.test('old configuration notifications settle after rotation, duplicate callback is idempotent',async()=>{
    state=(await req('/admin/payments',admin,'PUT',{settings:{...state.settings,wechat:{...state.settings.wechat,enabled:false}}},state.version)).body;
    assert.equal((await create(other)).status,503);
    assert.equal((await wxNotify(wxOrder)).status,204);assert.equal((await wxNotify(wxOrder)).status,204);
    assert.equal((await req(`/commerce/orders/${wxOrder.id}`,learner)).body.status,'paid');assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=? AND pack_id=? AND status=\'active\'',[learner.id,packId]).n,1);
    assert.equal(row("SELECT COUNT(*) n FROM cms_audit WHERE entity='orders' AND entity_id=?",[wxOrder.id]).n,1);
    assert.equal((await wxNotify(wxOrder,{transaction_id:'different-reference'})).status,400);
    state=(await req('/admin/payments',admin,'PUT',{settings:{...state.settings,wechat:{...state.settings.wechat,enabled:true}}},state.version)).body;
    run('DELETE FROM auth_rate_limits');assert.equal((await create(learner)).status,409);
  });
  await t.test('Alipay RSA2 form notification validates merchant and amount before atomic settlement',async()=>{
    const buyer=user(),r=await create(buyer,'alipay');assert.equal(r.status,201);const o=r.body;assert.match(o.qrUrl,/qr.alipay.com/);assert.ok(aliCalls);
    assert.equal((await aliNotify(o,{},true)).status,400);
    for(const change of [{app_id:'wrong'},{seller_id:'wrong'},{total_amount:'0.01'}])assert.equal((await aliNotify(o,change)).status,400);
    const success=await aliNotify(o);assert.equal(success.status,200);assert.equal(await success.text(),'success');assert.equal((await aliNotify(o)).status,200);
    assert.equal((await req(`/commerce/orders/${o.id}`,buyer)).body.status,'paid');assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,1);
  });
  await t.test('missing callbacks recover via verified query; close queries first and never closes paid orders',async()=>{
    for(const provider of ['wechat','alipay']){
      const buyer=user(),o=(await create(buyer,provider)).body,d=remote.get(o.orderNo);
      Object.assign(d,provider==='wechat'?{trade_state:'SUCCESS',transaction_id:`query-${o.id}`}:{trade_status:'TRADE_SUCCESS',trade_no:`query-${o.id}`});
      const r=await req(`/commerce/orders/${o.id}/${provider==='wechat'?'sync':'close'}`,buyer,'POST');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'paid');
      assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,1);
    }
    const buyer=user(),o=(await create(buyer)).body;run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),o.id]);
    const expired=(await req(`/commerce/orders/${o.id}`,buyer)).body;assert.equal(expired.expired,true);assert.equal(expired.qrUrl,'');
    const closed=await req(`/commerce/orders/${o.id}/close`,buyer,'POST');assert.equal(closed.status,200);assert.equal(closed.body.status,'cancelled');
    const next=await create(buyer,'alipay');assert.equal(next.status,201);assert.notEqual(next.body.id,o.id);assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('provider outages and invalid response signatures leave recoverable unpaid orders only',async()=>{
    const buyer=user();down=true;let r=await create(buyer);assert.equal(r.status,202);assert.equal(r.body.status,'pending');assert.equal(r.body.qrUrl,'');const id=r.body.id;
    assert.equal((await req(`/commerce/orders/${id}/sync`,buyer,'POST')).status,502);assert.equal((await req(`/commerce/orders/${id}/close`,buyer,'POST')).status,502);
    down=false;tamperResponse=true;r=await create(buyer);assert.equal(r.status,202);assert.equal(r.body.id,id);assert.equal(r.body.qrUrl,'');
    tamperResponse=false;r=await create(buyer);assert.equal(r.status,201);assert.equal(r.body.id,id);assert.match(r.body.qrUrl,/weixin:/);assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('duplicate transaction reference cannot unlock a second order; integer money is strict',async()=>{
    const buyer=user(),o=(await create(buyer)).body;assert.equal((await wxNotify(o,{transaction_id:`wx-${wxOrder.id}`})).status,400);assert.equal((await req(`/commerce/orders/${o.id}`,buyer)).body.status,'pending');assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    assert.equal(amountCents('399.00'),39900);assert.equal(amountCents('0.10'),10);for(const s of ['NaN','399.001','-1','1e2',399])assert.throws(()=>amountCents(s));
  });
  await t.test('provider-not-created expired attempts can close safely and no premature close grants access',async()=>{
    const buyer=user();down=true;const o=(await create(buyer,'alipay')).body;down=false;
    const status=await req(`/commerce/orders/${o.id}/sync`,buyer,'POST');assert.equal(status.status,200);assert.equal(status.body.status,'pending');assert.match(status.body.message,/未查到/);
    assert.equal((await req(`/commerce/orders/${o.id}/close`,buyer,'POST')).status,409);
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),o.id]);
    const r=await req(`/commerce/orders/${o.id}/close`,buyer,'POST');assert.equal(r.status,200);assert.equal(r.body.status,'cancelled');assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    assert.equal((await create(buyer,'wechat')).status,201);
  });
  await t.test('channel switching closes and rechecks old QR before creating one new attempt, with durable idempotency',async()=>{
    for(const provider of ['wechat','alipay']){
      const buyer=user(),old=(await create(buyer,provider)).body,target=provider==='wechat'?'alipay':'wechat',key=randomUUID();
      const first=await switchTo(buyer,old,target,key);assert.equal(first.status,201,JSON.stringify(first.body));
      assert.notEqual(first.body.id,old.id);assert.equal(first.body.provider,target);assert.ok(first.body.qrUrl);
      assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'cancelled');
      assert.equal(row('SELECT amount_cents FROM orders WHERE id=?',[old.id]).amount_cents,old.amountCents);
      const replay=await switchTo(buyer,old,target,key);assert.equal(replay.status,200);assert.equal(replay.body.id,first.body.id);
      assert.equal(row("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='pending'",[buyer.id]).n,1);
      assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    }
  });
  await t.test('switch owner, input and unavailable target guards do not touch another account or old order',async()=>{
    const buyer=user(),old=(await create(buyer)).body;
    assert.equal((await switchTo(null,old,'alipay')).status,401);
    assert.equal((await switchTo(other,old,'alipay')).status,404);
    assert.equal((await switchTo(buyer,old,'fake')).status,400);
    assert.equal((await req(`/commerce/orders/${old.id}/switch`,buyer,'POST',{provider:'alipay',requestKey:randomUUID(),amountCents:1})).status,400);
    assert.equal((await req(`/admin/payments/orders/${old.id}/diagnostic`,buyer)).status,403);
    assert.equal((await req(`/admin/payments/orders/${old.id}/diagnostic`,admin)).status,200);
    state=(await req('/admin/payments',admin,'PUT',{settings:{...state.settings,alipay:{...state.settings.alipay,enabled:false}}},state.version)).body;
    assert.equal((await switchTo(buyer,old,'alipay')).status,409);
    assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'pending');
    state=(await req('/admin/payments',admin,'PUT',{settings:{...state.settings,alipay:{...state.settings.alipay,enabled:true}}},state.version)).body;
  });
  await t.test('paid old attempt and payment racing close both return paid, never create a second payable order',async()=>{
    for(const race of [false,true]){
      const buyer=user(),old=(await create(buyer,'alipay')).body,original=paymentTransport.alipay;
      const markRemotePaid=()=>Object.assign(remote.get(old.orderNo),{trade_status:'TRADE_SUCCESS',trade_no:`switch-paid-${old.id}`});
      if(!race)markRemotePaid();
      else paymentTransport.alipay=async(...args)=>{
        if(args[2].endsWith('/close')){markRemotePaid();assert.equal((await aliNotify(old,{trade_no:`switch-paid-${old.id}`})).status,200);return {};}
        return original(...args);
      };
      try{const r=await switchTo(buyer,old,'wechat');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.id,old.id);assert.equal(r.body.status,'paid');
        assert.equal(row('SELECT COUNT(*) n FROM orders WHERE user_id=?',[buyer.id]).n,1);
        assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,1);
      }finally{paymentTransport.alipay=original;}
    }
  });
  await t.test('close rejection, unconfirmed close and invalid query signature never open another channel',async()=>{
    for(const failure of ['rejected','unconfirmed','signature']){
      const buyer=user(),old=(await create(buyer,'alipay')).body,original=paymentTransport.alipay;
      paymentTransport.alipay=async(...args)=>{
        if(failure==='signature')throw Object.assign(new Error('SECRET_ERROR'),{code:'response-signature-verify-error'});
        if(args[2].endsWith('/close')){if(failure==='rejected')throw new Error('SECRET_ERROR');return {};}
        return original(...args);
      };
      try{const r=await switchTo(buyer,old,'wechat');assert.equal(r.status,502);assert.match(r.body.error,/原订单已保留/);assert.ok(!JSON.stringify(r).includes('SECRET_ERROR'));
        assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'pending');
        assert.equal(row('SELECT COUNT(*) n FROM orders WHERE user_id=?',[buyer.id]).n,1);
        assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
      }finally{paymentTransport.alipay=original;}
    }
  });
  await t.test('switch serializes concurrent create and close while letting verified callbacks complete',async()=>{
    const buyer=user(),old=(await create(buyer,'alipay')).body,original=paymentTransport.alipay;
    let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    paymentTransport.alipay=async(...args)=>{if(args[2].endsWith('/query')){started();await gate;}return original(...args);};
    try{const pending=switchTo(buyer,old,'wechat');await ready;
      assert.equal((await create(buyer,'wechat')).status,409);
      assert.equal((await req(`/commerce/orders/${old.id}/close`,buyer,'POST')).status,409);
      release();assert.equal((await pending).status,201);
      assert.equal(row("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='pending'",[buyer.id]).n,1);
    }finally{release?.();paymentTransport.alipay=original;}
  });
  await t.test('missing-provider attempts require expiry and signed absence; ambiguous or unsigned errors cannot switch',async()=>{
    const buyer=user();down=true;const old=(await create(buyer,'alipay')).body;down=false;
    assert.equal((await switchTo(buyer,old,'wechat')).status,409);
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-1000).toISOString(),old.id]);
    const original=paymentTransport.alipayConfirmMissing;
    paymentTransport.alipayConfirmMissing=async()=>{throw new Error('SECRET_SIGN_ERROR');};
    assert.equal((await switchTo(buyer,old,'wechat')).status,502);
    assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'pending');
    paymentTransport.alipayConfirmMissing=original;
    assert.equal((await switchTo(buyer,old,'wechat')).status,201);
    assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'cancelled');
  });
  await t.test('failed QR reports bounded categorized diagnostics without persisting raw errors or losing the pending order',async()=>{
    const buyer=user(),original=paymentTransport.alipay;
    paymentTransport.alipay=async()=>{throw Object.assign(new Error('PRIVATE_KEY SECRET_ERROR'),{code:'ACQ.ACCESS_FORBIDDEN',responseHttpStatus:400});};
    try{const r=await create(buyer,'alipay');assert.equal(r.status,202);assert.match(r.body.failureMessage,/当面付/);assert.ok(!JSON.stringify(r).includes('PRIVATE_KEY'));
      const diag=await req(`/admin/payments/orders/${r.body.id}/diagnostic`,admin);assert.match(diag.body.detail,/签约/);
      assert.equal(row('SELECT failure_code FROM payment_checkouts WHERE order_id=?',[r.body.id]).failure_code,'alipay-permission');
      assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    }finally{paymentTransport.alipay=original;}
  });
  await t.test('checkout error categories are platform-specific static text, never upstream data',async()=>{
    const {checkoutFailureCode,checkoutFailureMessage}=await import('../server/payment-checkout-errors.mjs');
    for(const [provider,error,expected] of [
      ['alipay',{code:'INVALID_PARAMETER'},'alipay-parameters'],['alipay',{code:'response-signature-verify-error'},'alipay-signature'],
      ['wechat',{providerCode:'NO_AUTH'},'wechat-permission'],['wechat',{providerCode:'PARAM_ERROR'},'wechat-parameters'],
      ['wechat',{code:'PAYMENT_REQUEST_AUTH_REJECTED'},'wechat-signature'],['wechat',{code:'PAYMENT_RESPONSE_SIGNATURE_INVALID'},'wechat-signature'],
      ['alipay',{cause:{code:'ENOTFOUND'}},'provider-network'],['wechat',{name:'TimeoutError'},'provider-timeout'],
      ['wechat',{code:'ACQ.ACCESS_FORBIDDEN'},'provider-unavailable'],['alipay',{code:'SECRET_PRIVATE_ERROR'},'provider-unavailable'],
    ]){assert.equal(checkoutFailureCode(provider,error),expected);assert.doesNotMatch(checkoutFailureMessage(expected),/SECRET_PRIVATE_ERROR/);}
    assert.equal(checkoutFailureMessage('PRIVATE_KEY'),checkoutFailureMessage('provider-unavailable'));
  });
  await t.test('manual close cannot bypass confirmed closure; failed target QR retries the same new order',async()=>{
    const buyer=user(),old=(await create(buyer,'alipay')).body,original=paymentTransport.alipay;
    paymentTransport.alipay=async(...args)=>args[2].endsWith('/close')?{}:original(...args);
    try{assert.equal((await req(`/commerce/orders/${old.id}/close`,buyer,'POST')).status,502);assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'pending');}
    finally{paymentTransport.alipay=original;}
    const key=randomUUID();down=true;
    // Only the target fails: the old channel still queries and closes normally.
    const originalFetch=paymentTransport.fetch;paymentTransport.fetch=async()=>{throw Object.assign(new Error('SECRET_ERROR'),{name:'TimeoutError'});};down=false;
    let next;
    try{const r=await switchTo(buyer,old,'wechat',key);assert.equal(r.status,202);next=r.body;assert.match(next.failureMessage,/超时/);assert.equal(row('SELECT status FROM orders WHERE id=?',[old.id]).status,'cancelled');}
    finally{paymentTransport.fetch=originalFetch;down=false;}
    const replay=await switchTo(buyer,old,'wechat',key);assert.equal(replay.status,200);assert.equal(replay.body.id,next.id);assert.ok(replay.body.qrUrl);assert.equal(replay.body.failureMessage,'');
    assert.equal(row('SELECT COUNT(*) n FROM orders WHERE user_id=?',[buyer.id]).n,2);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('expired same-channel renewal confirms closure then creates current-config QR; replay creates nothing',async()=>{
    const buyer=user(),old=(await create(buyer,'alipay')).body,key=randomUUID();
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-60000).toISOString(),old.id]);
    const renewed=await req(`/commerce/orders/${old.id}/renew`,buyer,'POST',{provider:'alipay',requestKey:key,expectedAmountCents:old.amountCents});
    assert.equal(renewed.status,201,JSON.stringify(renewed.body));assert.notEqual(renewed.body.id,old.id);assert.ok(renewed.body.qrUrl);assert.equal(checkout(old.id).status,'cancelled');
    const before=aliCalls;assert.equal((await req(`/commerce/orders/${old.id}/renew`,buyer,'POST',{provider:'alipay',requestKey:key})).body.id,renewed.body.id);assert.equal(aliCalls,before);
  });
  await t.test('a new checkout intent safely renews expired attempts without relying on channel switching',async()=>{
    const buyer=user(),old=(await create(buyer,'alipay')).body;
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-60000).toISOString(),old.id]);
    const next=await create(buyer,'alipay');assert.equal(next.status,201);assert.notEqual(next.body.id,old.id);assert.ok(next.body.qrUrl);assert.equal(checkout(old.id).status,'cancelled');
  });
  await t.test('verified definite rejection retires only that unpaid attempt and allows immediate other-channel purchase',async()=>{
    const buyer=user(),original=paymentTransport.alipay;
    paymentTransport.alipay=async()=>{throw Object.assign(new Error('DO_NOT_LOG_SECRET'),{providerCode:'ACQ.ACCESS_FORBIDDEN',verifiedResponse:true,noPaymentCreated:true,traceId:'123456789012345'});};
    let rejected;try{rejected=(await create(buyer,'alipay')).body;}finally{paymentTransport.alipay=original;}
    assert.equal(rejected.status,'cancelled');assert.equal(rejected.attemptState,'rejected');assert.equal(checkout(rejected.id).provider_code,'ACQ.ACCESS_FORBIDDEN');assert.equal(row('SELECT status FROM payments WHERE order_id=?',[rejected.id]).status,'failed');
    const next=await switchTo(buyer,rejected,'wechat');assert.equal(next.status,201);assert.ok(next.body.qrUrl);assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('unverified rejection and timeout never qualify for safe immediate retirement',async()=>{
    const buyer=user(),original=paymentTransport.alipay;
    paymentTransport.alipay=async()=>{throw Object.assign(new Error('private'),{providerCode:'ACQ.ACCESS_FORBIDDEN',noPaymentCreated:true});};
    let uncertain;try{uncertain=(await create(buyer,'alipay')).body;}finally{paymentTransport.alipay=original;}
    assert.equal(uncertain.status,'pending');assert.equal(uncertain.attemptState,'unknown');assert.ok(uncertain.nextCheckAt);
    assert.equal((await switchTo(buyer,uncertain,'wechat')).status,409);
  });
  await t.test('configuration changes do not mutate old snapshots; expired failed retry uses new configuration',async()=>{
    const buyer=user();down=true;const failed=(await create(buyer,'alipay')).body;down=false;
    const version=checkout(failed.id).config_version;
    const updated=await req('/admin/payments',admin,'PUT',{settings:{...state.settings,alipay:{...state.settings.alipay,publicKey:keys().publicKey}}},state.version);assert.equal(updated.status,200);state=updated.body;
    assert.equal((await create(buyer,'alipay')).status,409);
    assert.equal(checkout(failed.id).config_version,version);
    run('UPDATE payment_checkouts SET expires_at=? WHERE order_id=?',[new Date(Date.now()-60000).toISOString(),failed.id]);
    const next=await create(buyer,'alipay');assert.equal(next.status,201);assert.equal(checkout(next.body.id).config_version,state.version);assert.equal(checkout(failed.id).config_version,version);
  });
  await t.test('persistent reconciliation settles missing callback after simulated restart and is idempotent',async()=>{
    const buyer=user(),o=(await create(buyer,'alipay')).body;
    remote.get(o.orderNo).trade_status='TRADE_SUCCESS';remote.get(o.orderNo).trade_no=`reconcile-${o.id}`;
    run('UPDATE payment_checkouts SET next_sync_at=? WHERE order_id=?',[Math.floor(Date.now()/1000)-1,o.id]);
    await runPaymentReconciliation();assert.equal(checkout(o.id).status,'paid');assert.ok(checkout(o.id).last_sync_at);assert.equal(checkout(o.id).next_sync_at,0);
    assert.equal(row("SELECT COUNT(*) n FROM entitlements WHERE user_id=? AND status='active'",[buyer.id]).n,1);
    await runPaymentReconciliation();assert.equal(row("SELECT COUNT(*) n FROM payment_events WHERE order_id=? AND code='VERIFIED_PAID'",[o.id]).n,1);
  });
  await t.test('reconciliation preserves uncertain unpaid attempts, backs off, and never trusts unsigned query absence',async()=>{
    const buyer=user();down=true;const o=(await create(buyer,'alipay')).body;down=false;
    run('UPDATE payment_checkouts SET next_sync_at=? WHERE order_id=?',[Math.floor(Date.now()/1000)-1,o.id]);
    const original=paymentTransport.alipayConfirmMissing;paymentTransport.alipayConfirmMissing=async()=>{throw new Error('unsigned missing');};
    try{await runPaymentReconciliation();}finally{paymentTransport.alipayConfirmMissing=original;}
    assert.equal(checkout(o.id).status,'pending');assert.ok(checkout(o.id).next_sync_at>Math.floor(Date.now()/1000));assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('database leases prevent another process entering account mutation and release after errors',async()=>{
    const buyer=user(),token=randomUUID();run('INSERT INTO payment_checkout_locks(user_id,token,lease_until) VALUES(?,?,?)',[buyer.id,token,Math.floor(Date.now()/1000)+100]);
    await assert.rejects(()=>withCheckoutOperation(buyer.id,async()=>assert.fail()),{status:409});
    run('UPDATE payment_checkout_locks SET lease_until=0 WHERE user_id=?',[buyer.id]);
    await assert.rejects(()=>withCheckoutOperation(buyer.id,async()=>{throw new Error('fixture');}));
    assert.equal(row('SELECT COUNT(*) n FROM payment_checkout_locks WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('real signed WeChat unpaid and closed responses omit amount but never grant access',async()=>{
    const buyer=user(),old=(await create(buyer)).body;
    assert.equal((await req(`/commerce/orders/${old.id}/sync`,buyer,'POST')).body.status,'pending');
    remote.get(old.orderNo).trade_state='CLOSED';
    run("UPDATE payment_checkouts SET failure_code='query-unavailable',provider_code='UNCLASSIFIED' WHERE order_id=?",[old.id]);
    const switched=await switchTo(buyer,old,'alipay');assert.equal(switched.status,201,JSON.stringify(switched.body));
    assert.equal(checkout(old.id).status,'cancelled');assert.equal(checkout(old.id).failure_code,'');assert.equal(checkout(old.id).next_sync_at,0);
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
    assert.equal(row("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='pending'",[buyer.id]).n,1);
  });
  await t.test('signed paid responses still require exact amount; omitted amount cannot fulfill',async()=>{
    const buyer=user(),old=(await create(buyer)).body;
    assert.equal((await wxNotify(old,{amount:undefined})).status,400);
    const remoteOrder=remote.get(old.orderNo);Object.assign(remoteOrder,{trade_state:'SUCCESS',transaction_id:`missing-${old.id}`});delete remoteOrder.amount;
    assert.equal((await req(`/commerce/orders/${old.id}/sync`,buyer,'POST')).status,400);
    assert.equal(checkout(old.id).status,'pending');assert.equal(checkout(old.id).provider_code,'WECHAT_TRANSACTION_AMOUNT_INVALID');
    assert.equal(row('SELECT COUNT(*) n FROM entitlements WHERE user_id=?',[buyer.id]).n,0);
  });
  await t.test('closed responses cannot bypass merchant identity, signature or contradictory supplied amount',async()=>{
    const c={settings:{wechat:{appId:'wx-test-app',mchId:'1234567890'}}},data={appid:'wx-test-app',mchid:'1234567890',out_trade_no:'test',trade_state:'CLOSED'};
    assert.equal(wechatTransaction(data,c).amount,undefined);
    assert.throws(()=>wechatTransaction({...data,appid:'foreign'},c),{code:'WECHAT_TRANSACTION_IDENTITY_MISMATCH'});
    assert.throws(()=>wechatTransaction({...data,amount:{total:39900,currency:'USD'}},c),{code:'WECHAT_TRANSACTION_AMOUNT_INVALID'});
    const buyer=user(),old=(await create(buyer)).body;remote.get(old.orderNo).trade_state='CLOSED';
    tamperResponse=true;try{assert.equal((await switchTo(buyer,old,'alipay')).status,502);}finally{tamperResponse=false;}
    assert.equal(checkout(old.id).status,'pending');
    const original=paymentTransport.fetch;
    paymentTransport.fetch=async(...args)=>{
      if(String(args[0]).includes(old.orderNo)){
        const raw=JSON.stringify({...remote.get(old.orderNo),amount:{total:1,currency:'CNY'}});
        return new Response(raw,{status:200,headers:wxHeaders(raw)});
      }
      return original(...args);
    };
    try{assert.equal((await switchTo(buyer,old,'alipay')).status,502);}finally{paymentTransport.fetch=original;}
    assert.equal(checkout(old.id).status,'pending');assert.equal(row('SELECT COUNT(*) n FROM orders WHERE user_id=?',[buyer.id]).n,1);
  });
  await t.test('user switch waits for background query and proceeds once, instead of returning a lock conflict',async()=>{
    const buyer=user(),old=(await create(buyer)).body,original=paymentTransport.fetch;
    run('UPDATE payment_checkouts SET next_sync_at=? WHERE next_sync_at>0',[Math.floor(Date.now()/1000)+1000]);
    run('UPDATE payment_checkouts SET next_sync_at=? WHERE order_id=?',[Math.floor(Date.now()/1000)-1,old.id]);
    let started,release,first=true;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    paymentTransport.fetch=async(...args)=>{if(first&&String(args[0]).includes(old.orderNo)&&args[1].method==='GET'){first=false;started();await gate;}return original(...args);};
    try{
      const worker=runPaymentReconciliation();await ready;let done=false;
      const queued=switchTo(buyer,old,'alipay').then(result=>{done=true;return result;});
      await new Promise(r=>setTimeout(r,150));assert.equal(done,false);
      await assert.rejects(()=>withCheckoutOperation(buyer.id,async()=>assert.fail(),{background:true}),{status:409});
      release();await worker;const result=await queued;assert.equal(result.status,201,JSON.stringify(result.body));
      assert.equal(checkout(old.id).status,'cancelled');assert.equal(row("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='pending'",[buyer.id]).n,1);
      assert.equal(row('SELECT COUNT(*) n FROM payment_checkout_locks WHERE user_id=?',[buyer.id]).n,0);
    }finally{release?.();paymentTransport.fetch=original;}
  });
  await t.test('background wait is bounded, cleans its queue, and cannot erase another process lease',async()=>{
    const buyer=user(),token='background:'+randomUUID();
    run('INSERT INTO payment_checkout_locks(user_id,token,lease_until) VALUES(?,?,?)',[buyer.id,token,Math.floor(Date.now()/1000)+120]);
    await assert.rejects(()=>withCheckoutOperation(buyer.id,async()=>assert.fail(),{waitMs:25}),error=>error.status===409&&/核验较慢/.test(error.message));
    assert.equal(row('SELECT token FROM payment_checkout_locks WHERE user_id=?',[buyer.id]).token,token);
    run('DELETE FROM payment_checkout_locks WHERE user_id=?',[buyer.id]);
    assert.equal(await withCheckoutOperation(buyer.id,async()=>true),true);
  });
  await t.test('legacy unscheduled attempts never cause release-time gateway calls',async()=>{
    const buyer=user(),o=(await create(buyer,'alipay')).body;
    run('UPDATE payment_checkouts SET next_sync_at=0,attempt_state=? WHERE order_id=?',['legacy',o.id]);
    const before=aliCalls;await runPaymentReconciliation();
    assert.equal(aliCalls,before);assert.equal(checkout(o.id).status,'pending');assert.equal(checkout(o.id).last_sync_at,0);
  });
  await t.test('another platform configuration save does not block a same-channel failed QR recovery',async()=>{
    const buyer=user();down=true;const failed=(await create(buyer,'alipay')).body;down=false;
    const updated=await req('/admin/payments/wechat',admin,'PUT',{settings:{...state.settings.wechat,serialNo:'F123ABC456'},secrets:{}},state.version);
    assert.equal(updated.status,200);state=updated.body;
    const recovered=await create(buyer,'alipay');assert.equal(recovered.status,201);assert.equal(recovered.body.id,failed.id);assert.ok(recovered.body.qrUrl);
  });
  await t.test('operations are owner-only, sanitized; renew and quoted amount checks cannot mutate strangers',async()=>{
    const buyer=user(),o=(await create(buyer,'alipay')).body;
    assert.equal((await req(`/commerce/orders/${o.id}/renew`,other,'POST',{provider:'alipay',requestKey:randomUUID()})).status,404);
    assert.equal((await req('/admin/payments/operations',buyer)).status,403);
    const operations=(await req('/admin/payments/operations')).body;assert.ok(operations.items.length);assert.ok(!JSON.stringify(operations).includes(merchant.privateKey));assert.ok(!JSON.stringify(operations).includes('DO_NOT_LOG_SECRET'));
    assert.equal((await req('/commerce/checkout',user(),'POST',{provider:'alipay',requestKey:randomUUID(),expectedAmountCents:1})).status,409);
    assert.equal(checkout(o.id).status,'pending');
  });
  await t.test('official SDK precreate verifies success and definite rejection; missing or forged signatures cannot retire',async()=>{
    const {MockAgent}=await import('undici'),{AlipaySdk}=await import('alipay-sdk'),agent=new MockAgent();agent.disableNetConnect();
    const factory=paymentTransport.client,transport=paymentTransport.alipay;
    paymentTransport.client=(s,k)=>new AlipaySdk({...alipayClient(s,k).config,proxyAgent:agent});paymentTransport.alipay=nativeAlipay;
    const c={version:1,settings:{publicOrigin:'https://oneshowlearn.com',alipay:{appId:'ali-test-app',sellerId:'208800001234',publicKey:ali.publicKey}},secrets:{alipayPrivateKey:merchant.privateKey}};
    const o={order_no:'sdk-precreate-fixture',title:'Course',amount_cents:39900},pool=agent.get('https://openapi.alipay.com');
    try{
      for(const mode of ['success','rejected','unsigned','forged']){
        const data=mode==='success'?{code:'10000',msg:'Success',out_trade_no:o.order_no,qr_code:'https://qr.alipay.com/test123'}:{code:'40004',msg:'Business Failed',sub_code:'ACQ.ACCESS_FORBIDDEN',sub_msg:'permission'};
        const signature=sign('RSA-SHA256',Buffer.from(JSON.stringify(data)),ali.privateKey).toString('base64');
        pool.intercept({path:p=>p.startsWith('/gateway.do'),method:'POST'}).reply(200,JSON.stringify({alipay_trade_precreate_response:data,...(mode==='unsigned'?{}:{sign:mode==='forged'?'bad':signature})}),{headers:{'content-type':'application/json'}});
        if(mode==='success')assert.equal(await createProviderPayment('alipay',c,o),'https://qr.alipay.com/test123');
        else if(mode==='rejected')await assert.rejects(()=>createProviderPayment('alipay',c,o),e=>e.verifiedResponse===true&&e.noPaymentCreated===true&&e.providerCode==='ACQ.ACCESS_FORBIDDEN');
        else await assert.rejects(()=>createProviderPayment('alipay',c,o),e=>!e.verifiedResponse&&!e.noPaymentCreated);
      }
    }finally{paymentTransport.client=factory;paymentTransport.alipay=transport;await agent.close();}
  });
  await t.test('price edits do not rewrite pending order amounts; draft courses cannot receive new orders',async()=>{
    const buyer=user(),o=(await create(buyer)).body;
    state=(await req('/admin/payments',admin,'PUT',{settings:{...state.settings,priceCents:49900}},state.version)).body;
    assert.equal((await req('/commerce/offer',null)).body.priceCents,49900);assert.equal((await req(`/commerce/orders/${o.id}`,buyer)).body.amountCents,39900);
    assert.equal((await switchTo(buyer,o,'alipay')).status,409);assert.equal(row('SELECT status FROM orders WHERE id=?',[o.id]).status,'pending');
    assert.equal((await wxNotify(o)).status,204);
    run("UPDATE project_packs SET status='draft' WHERE id=?",[packId]);assert.ok((await req('/commerce/offer',null)).body.channels.every(c=>!c.available));assert.equal((await create(user())).status,503);
  });
});
