import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';

test('owner payment connection diagnostics are versioned, read-only and secret safe',async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'oneshowlearn-payment-diagnostics-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'diagnostics-test-only',PAYMENT_CONFIG_ENCRYPTION_KEY:'12'.repeat(32),ASSET_STORAGE:'local'});
  const {createApp}=await import('../server/index.mjs');const {db,row,run}=await import('../server/db.mjs');const {signUser}=await import('../server/auth.mjs');
  const {paymentTransport,alipayClient,verifyWechat,probePaymentConnection}=await import('../server/payment-providers.mjs');
  const {diagnosePaymentConnection}=await import('../server/payment-diagnostics.mjs');
  const {paymentConfiguration,validatePaymentConfig,normalizeAlipayKey}=await import('../server/payment-configuration.mjs');
  const keys=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const merchant=keys(),platform=keys();
  const user=role=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[role+'@test.local','x',role,role]).lastInsertRowid);return signUser(row('SELECT * FROM users WHERE id=?',[id]));};
  const admin=user('admin'),editor=user('editor'),learner=user('learner');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api/admin/payments`;
  const request=async(suffix='',{token=admin,method='GET',version,body}={})=>{const r=await fetch(base+suffix,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...(version!==undefined?{'If-Match':String(version)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  let state=(await request()).body,calls=0,behavior='good';
  const probe=(provider='wechat',options={})=>request('/'+provider+'/test',{method:'POST',version:state.version,body:{},...options});
  const save=async(settings,secrets={})=>{const r=await request('',{method:'PUT',version:state.version,body:{settings,secrets}});assert.equal(r.status,200);state=r.body;};
  const unchanged=()=>Object.fromEntries(['orders','order_items','payments','payment_checkouts','entitlements','payment_configuration'].map(name=>[name,JSON.stringify(db.prepare(`SELECT * FROM ${name}`).all())]));
  paymentTransport.fetch=async(url,options)=>{
    calls++;assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.match(url,/^https:\/\/api.mch.weixin.qq.com\/v3\/pay\/transactions\/out-trade-no\/OSLCHECK[a-f0-9]{24}\?mchid=1234567890$/);
    const auth=Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)].map(m=>[m[1],m[2]]));const route=url.replace('https://api.mch.weixin.qq.com','');
    assert.ok(verify('RSA-SHA256',Buffer.from(`GET\n${route}\n${auth.timestamp}\n${auth.nonce_str}\n\n`),merchant.publicKey,Buffer.from(auth.signature,'base64')));
    if(behavior==='timeout')throw Object.assign(new Error('SECRET_DATA'),{name:'TimeoutError'});
    if(behavior==='unsigned-auth')return new Response(JSON.stringify({code:'SIGN_ERROR',message:'SECRET_DATA'}),{status:401});
    if(behavior==='unsigned-not-found')return new Response(JSON.stringify({code:'ORDER_NOT_EXIST',message:'SECRET_DATA'}),{status:404});
    const raw=JSON.stringify({code:behavior==='auth'?'SIGN_ERROR':'ORDER_NOT_EXIST',message:'SECRET_DATA'}),timestamp=String(Math.floor(Date.now()/1000)),nonce='diagnostic';
    return new Response(raw,{status:404,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Serial':'PUB_KEY_ID_TEST','Wechatpay-Signature':behavior==='bad-sign'?'invalid':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),platform.privateKey).toString('base64')}});
  };
  paymentTransport.alipay=async(s,k,route,body)=>{calls++;assert.equal(route,'/v3/alipay/user/deloauth/detail/query');assert.deepEqual(body,{date:'20230102',offset:20,limit:1});if(behavior==='bad-sign')throw Object.assign(new Error('SECRET_DATA'),{code:'response-signature-verify-error'});return {};};
  await t.test('owner only, known providers, saved version only; no secret input accepted',async()=>{
    for(const token of ['',editor,learner])assert.equal((await probe('wechat',{token})).status,token?403:401);
    assert.equal((await probe('unknown')).status,404);
    assert.equal((await probe('wechat',{version:undefined})).status,428);
    assert.equal((await probe('wechat',{version:99})).status,409);
    assert.equal((await probe('wechat',{body:{secrets:{a:'SECRET'}}})).status,400);
    const r=await probe();assert.equal(r.body.status,'incomplete');assert.match(r.body.message,/APIv3/);assert.equal(calls,0);assert.equal(r.status,200);
  });
  await save({...state.settings,wechat:{enabled:false,appId:'wx-test',mchId:'1234567890',serialNo:'ABCD',publicKeyId:'PUB_KEY_ID_TEST',publicKey:platform.publicKey},alipay:{enabled:false,appId:'ali-test',sellerId:'2088123456',publicKey:platform.publicKey}},{wechatPrivateKey:merchant.privateKey,wechatApiV3Key:'a'.repeat(32),alipayPrivateKey:merchant.privateKey});
  await t.test('disabled channels test without enabling payments or creating business records',async()=>{
    run('DELETE FROM auth_rate_limits');const before=unchanged();
    for(const provider of ['wechat','alipay']){const r=await probe(provider);assert.equal(r.status,200);assert.equal(r.body.status,'passed');assert.equal(r.body.channelEnabled,false);assert.equal(r.body.version,state.version);assert.ok(r.body.limitations.length);assert.equal(r.body.checks.length,2);assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);}
    assert.deepEqual(unchanged(),before);
  });
  await t.test('format validation stops before network and platforms are independent',async()=>{
    const c=paymentConfiguration(),count=calls;
    const r=await diagnosePaymentConnection('wechat',{...c,secrets:{...c.secrets,wechatPrivateKey:'bad'}});assert.equal(r.status,'incomplete');assert.equal(calls,count);
    const good=await diagnosePaymentConnection('wechat',{...c,settings:{...c.settings,alipay:{enabled:true}}});assert.equal(good.status,'passed');
  });
  await t.test('merchant public key confusion is caught before gateway and never persisted',async()=>{
    const c=paymentConfiguration(),settings={...c.settings,wechat:{...c.settings.wechat,enabled:true,publicKey:merchant.publicKey}},count=calls,before=unchanged();
    assert.throws(()=>validatePaymentConfig({...settings,productId:1},c.secrets),{code:'PAYMENT_WECHAT_KEY_CONFLICT'});
    const result=await diagnosePaymentConnection('wechat',{...c,settings});assert.equal(result.status,'incomplete');assert.match(result.message,/填成了商户公钥/);assert.equal(calls,count);
    const saved=await request('',{method:'PUT',version:state.version,body:{settings:{...settings,productId:1},secrets:{}}});assert.equal(saved.status,400);assert.match(saved.body.error,/填成了商户公钥/);assert.deepEqual(unchanged(),before);
  });
  await t.test('unsigned authentication rejection is distinct, unsigned not-found never passes',async()=>{
    const before=unchanged();
    for(const [b,expected] of [['unsigned-auth',/HTTP 401/],['unsigned-not-found',/缺少签名/]]){run('DELETE FROM auth_rate_limits');behavior=b;const r=await probe();assert.equal(r.body.status,'failed');assert.match(r.body.message,expected);assert.equal(JSON.stringify(r).includes('SECRET_DATA'),false);}
    behavior='good';assert.deepEqual(unchanged(),before);
  });
  await t.test('response timestamp, key identity, platform mode and probe signatures are diagnosed separately',()=>{
    const raw='{}',timestamp=String(Math.floor(Date.now()/1000)),nonce='diagnostic',settings=paymentConfiguration().settings.wechat;
    const headers={'wechatpay-timestamp':timestamp,'wechatpay-nonce':nonce,'wechatpay-serial':settings.publicKeyId,'wechatpay-signature':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),platform.privateKey).toString('base64')};
    assert.doesNotThrow(()=>verifyWechat(raw,headers,settings));
    for(const [change,code] of [[{'wechatpay-timestamp':String(Number(timestamp)-600)},'PAYMENT_RESPONSE_TIMESTAMP_INVALID'],[{'wechatpay-serial':'PUB_KEY_ID_OTHER'},'PAYMENT_RESPONSE_KEY_ID_MISMATCH'],[{'wechatpay-serial':'ABCDEF'},'PAYMENT_RESPONSE_CERTIFICATE_MODE'],[{'wechatpay-signature':'WECHATPAY/SIGNTEST/test'},'PAYMENT_RESPONSE_SIGNATURE_PROBE'],[{'wechatpay-nonce':''},'PAYMENT_RESPONSE_SIGNATURE_MISSING']])assert.throws(()=>verifyWechat(raw,{...headers,...change},settings),{code});
  });
  await t.test('signature failures, rejected auth and timeout are actionable, never leak raw provider output',async()=>{
    for(const b of ['bad-sign','auth','timeout']){run('DELETE FROM auth_rate_limits');behavior=b;const r=await probe();assert.equal(r.body.status,'failed');assert.equal(JSON.stringify(r).includes('SECRET_DATA'),false);assert.match(r.body.message,b==='timeout'?/超时/:/签名|验签/);}
    run('DELETE FROM auth_rate_limits');behavior='bad-sign';assert.equal((await probe('alipay')).body.status,'failed');behavior='good';
  });
  await t.test('bounded rate limit is enforced per platform',async()=>{
    run('DELETE FROM auth_rate_limits');for(let i=0;i<3;i++)assert.equal((await probe()).status,200);assert.equal((await probe()).status,429);assert.equal((await probe('alipay')).status,200);
  });
  await t.test('Alipay parameter failures and network failures are distinct, sanitized and do not certify connectivity',async()=>{
    const original=paymentTransport.alipay,before=unchanged();
    try{
      for(const [code,expected] of [['INVALID_PARAMETER',/测试请求参数无效.*INVALID_PARAMETER/],['ENOTFOUND',/域名解析失败/],['ECONNRESET',/网络连接失败/],['UNKNOWN_SECRET_DATA',/暂未通过/]]){
        paymentTransport.alipay=async()=>{throw Object.assign(new Error('SECRET_DATA merchant secret and raw response'),{code,responseHttpStatus:400});};
        const result=await diagnosePaymentConnection('alipay',paymentConfiguration());
        assert.equal(result.status,'failed');assert.match(result.message,expected);
        assert.equal(result.checks[0].status,'passed');assert.equal(result.checks[1].status,'failed');
        assert.ok(!JSON.stringify(result).includes('SECRET_DATA'));assert.ok(!JSON.stringify(result).includes('merchant secret'));
        if(code==='INVALID_PARAMETER')assert.match(result.message,/不代表密钥格式错误/);
      }
      assert.deepEqual(unchanged(),before);
    }finally{paymentTransport.alipay=original;}
  });
  await t.test('configuration changed during testing invalidates the result',async()=>{
    run('DELETE FROM auth_rate_limits');let release,started;const ready=new Promise(r=>started=r),blocked=new Promise(r=>release=r),original=paymentTransport.alipay;
    paymentTransport.alipay=async(...args)=>{started();await blocked;return original(...args);};
    try{const pending=probe('alipay');await ready;assert.equal((await probe('alipay')).status,409);await save({...state.settings,originalPriceCents:100000});release();assert.equal((await pending).status,409);}finally{release?.();paymentTransport.alipay=original;}
  });
  await t.test('official Alipay diagnostic endpoint success requires a valid SDK response signature',async()=>{
    const {MockAgent}=await import('undici'),agent=new MockAgent();agent.disableNetConnect();
    const route='/v3/alipay/user/deloauth/detail/query',raw='{}',timestamp=String(Date.now()),nonce='sdk-probe';
    const signature=sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),platform.privateKey).toString('base64');
    const client=alipayClient({appId:'ali-test',publicKey:platform.publicKey},{alipayPrivateKey:merchant.privateKey});const pool=agent.get('https://openapi.alipay.com');
    const original=paymentTransport.alipay,before=unchanged();
    try{
      // Exercise the actual probe's body through the SDK, not merely a permissive transport stub.
      paymentTransport.alipay=async(s,k,path,body)=>{
        assert.equal(path,route);assert.deepEqual(body,{date:'20230102',offset:20,limit:1});
        return (await client.curl('POST',path,{body,agent})).data;
      };
      for(const valid of [true,false]){
        pool.intercept({path:route,method:'POST',body:JSON.stringify({date:'20230102',offset:20,limit:1})}).reply(200,raw,{headers:{'content-type':'application/json','alipay-timestamp':timestamp,'alipay-nonce':nonce,'alipay-signature':valid?signature:'bad'}});
        const work=probePaymentConnection('alipay',paymentConfiguration());
        if(valid)await work;else await assert.rejects(work,{code:'response-signature-verify-error'});
      }
      assert.deepEqual(unchanged(),before);
    }finally{paymentTransport.alipay=original;}
    await agent.close();
  });
  await t.test('Alipay raw PKCS1/PKCS8 keys and PEM share signing, response and callback verification',async()=>{
    const platformPublic=createPublicKey(platform.publicKey),merchantPrivate=createPrivateKey(merchant.privateKey);
    const {decodeAlipayNotification}=await import('../server/payment-providers.mjs');
    for(const type of ['pkcs1','pkcs8'])for(const publicType of ['spki','pkcs1']){
      const rawPrivate=merchantPrivate.export({type,format:'der'}).toString('base64').match(/.{1,64}/g).join('\r\n');
      const rawPublic=platformPublic.export({type:publicType,format:'der'}).toString('base64');
      const c={settings:{alipay:{appId:'ali-test',sellerId:'2088123456',publicKey:rawPublic}},secrets:{alipayPrivateKey:rawPrivate}};
      const client=alipayClient(c.settings.alipay,c.secrets),bytes=Buffer.from('raw-key regression');
      assert.ok(verify('RSA-SHA256',bytes,merchant.publicKey,sign('RSA-SHA256',bytes,client.config.privateKey)));
      assert.equal(normalizeAlipayKey(rawPublic),platform.publicKey);
      assert.equal(normalizeAlipayKey(rawPrivate,true),merchant.privateKey);
      const data={app_id:'ali-test',seller_id:'2088123456',out_trade_no:'isolated-order',total_amount:'499.00',trade_status:'TRADE_SUCCESS',trade_no:'isolated-trade'};
      const canonical=Object.keys(data).sort().map(k=>`${k}=${data[k]}`).join('&');
      data.sign=sign('RSA-SHA256',Buffer.from(canonical),platform.privateKey).toString('base64');data.sign_type='RSA2';
      assert.equal(decodeAlipayNotification(new URLSearchParams(data).toString(),c).paid,true);
      const {MockAgent}=await import('undici'),agent=new MockAgent();agent.disableNetConnect();
      const route='/v3/alipay/user/deloauth/detail/query',raw='{}',timestamp=String(Date.now()),nonce='raw-key-test';
      const headers={'content-type':'application/json','alipay-timestamp':timestamp,'alipay-nonce':nonce,'alipay-signature':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),platform.privateKey).toString('base64')};
      const pool=agent.get('https://openapi.alipay.com');
      pool.intercept({path:route,method:'POST'}).reply(200,raw,{headers});
      assert.equal((await client.curl('POST',route,{body:{date:'20230102',offset:20,limit:1},agent})).responseHttpStatus,200);
      pool.intercept({path:route,method:'POST'}).reply(200,raw,{headers:{...headers,'alipay-signature':'bad'}});
      await assert.rejects(client.curl('POST',route,{body:{},agent}),{code:'response-signature-verify-error'});
      await agent.close();
    }
    for(const value of ['bad secret text','!!!','-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----',merchant.privateKey])assert.throws(()=>normalizeAlipayKey(value));
    const weak=generateKeyPairSync('rsa',{modulusLength:1024});
    assert.throws(()=>normalizeAlipayKey(weak.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),true));
    assert.equal(normalizeAlipayKey(merchant.privateKey,true),merchant.privateKey);
  });
  await t.test('scoped saves require owner/version and reject cross-platform or price writes',async()=>{
    const body={settings:state.settings.alipay,secrets:{}};
    const before=unchanged();
    for(const token of ['',editor,learner])assert.equal((await request('/alipay',{token,method:'PUT',version:state.version,body})).status,token?403:401);
    assert.equal((await request('/alipay',{method:'PUT',body})).status,428);
    assert.equal((await request('/alipay',{method:'PUT',version:state.version-1,body})).status,409);
    for(const bad of [{...body,secrets:{wechatPrivateKey:merchant.privateKey}},{...body,settings:{...body.settings,priceCents:1}}])assert.equal((await request('/alipay',{method:'PUT',version:state.version,body:bad})).status,400);
    assert.equal((await request('/unknown',{method:'PUT',version:state.version,body})).status,404);
    assert.deepEqual(unchanged(),before);
  });
  await t.test('saving raw Alipay preserves enabled WeChat, prices, product timestamps and private records',async()=>{
    const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('scope-path','Scoped fixture','published')").lastInsertRowid);
    const packId=Number(run("INSERT INTO project_packs(path_id,slug,title,status,price_cents) VALUES(?,'scope-course','Scoped fixture','published',49900)",[pathId]).lastInsertRowid);
    const productId=Number(run("INSERT INTO products(pack_id,sku,title,price_cents) VALUES(?,'scope-sku','Scoped fixture',49900)",[packId]).lastInsertRowid);
    await save({...state.settings,productId,priceCents:49900,wechat:{...state.settings.wechat,enabled:true}});
    const before=paymentConfiguration(),product=row('SELECT * FROM products WHERE id=?',[productId]),pack=row('SELECT * FROM project_packs WHERE id=?',[packId]);
    const historic=paymentConfiguration(before.version);
    const rawPublic=createPublicKey(platform.publicKey).export({type:'spki',format:'der'}).toString('base64');
    const rawPrivate=createPrivateKey(merchant.privateKey).export({type:'pkcs1',format:'der'}).toString('base64');
    const r=await request('/alipay',{method:'PUT',version:state.version,body:{settings:{...state.settings.alipay,publicKey:rawPublic},secrets:{alipayPrivateKey:rawPrivate}}});
    assert.equal(r.status,200,JSON.stringify(r.body));state=r.body;
    const after=paymentConfiguration();
    assert.deepEqual(after.settings.wechat,before.settings.wechat);assert.equal(after.secrets.wechatPrivateKey,before.secrets.wechatPrivateKey);assert.equal(after.secrets.wechatApiV3Key,before.secrets.wechatApiV3Key);
    for(const key of ['priceCents','originalPriceCents','productId','publicOrigin'])assert.equal(after.settings[key],before.settings[key]);
    assert.deepEqual(row('SELECT * FROM products WHERE id=?',[productId]),product);assert.deepEqual(row('SELECT * FROM project_packs WHERE id=?',[packId]),pack);
    assert.deepEqual(paymentConfiguration(before.version),historic);
    assert.equal(after.settings.alipay.enabled,false);assert.equal(after.settings.alipay.publicKey,platform.publicKey);assert.equal(after.secrets.alipayPrivateKey,merchant.privateKey);
    assert.ok(!JSON.stringify(r).includes(rawPrivate));assert.equal(row('SELECT COUNT(*) n FROM orders').n,0);
    const preserved=await request('/alipay',{method:'PUT',version:state.version,body:{settings:state.settings.alipay,secrets:{alipayPrivateKey:''}}});
    assert.equal(preserved.status,200);state=preserved.body;assert.equal(paymentConfiguration().secrets.alipayPrivateKey,merchant.privateKey);
  });
  await t.test('Alipay field errors never mention WeChat or persist broken keys',async()=>{
    const before=unchanged(),count=calls;
    for(const [settings,secrets,expected] of [[{...state.settings.alipay,publicKey:'bad'},{},/支付宝.*公钥/],[state.settings.alipay,{alipayPrivateKey:'bad'},/支付宝.*私钥/],[{...state.settings.alipay,sellerId:'bad'},{},/支付宝卖家 UID/],[{...state.settings.alipay,publicKey:merchant.publicKey},{},/应用公钥/]]){
      const r=await request('/alipay',{method:'PUT',version:state.version,body:{settings,secrets}});
      assert.equal(r.status,400);assert.match(r.body.error,expected);assert.doesNotMatch(r.body.error,/微信|APIv3/);
    }
    assert.deepEqual(unchanged(),before);assert.equal(calls,count);
  });
  await t.test('Alipay saves independently of legacy WeChat validation; pricing does not write keys',async()=>{
    const c=paymentConfiguration(),broken={...c.settings,wechat:{...c.settings.wechat,serialNo:'legacy-invalid'}};
    run('UPDATE payment_configuration SET settings=? WHERE version=?',[JSON.stringify(broken),state.version]);
    const r=await request('/alipay',{method:'PUT',version:state.version,body:{settings:state.settings.alipay,secrets:{}}});
    assert.equal(r.status,200);state=r.body;assert.equal(state.settings.wechat.serialNo,'legacy-invalid');
    const before=paymentConfiguration();
    const pricing=Object.fromEntries(['productId','priceCents','originalPriceCents','publicOrigin'].map(key=>[key,state.settings[key]]));
    const saved=await request('/pricing',{method:'PUT',version:state.version,body:{settings:pricing}});assert.equal(saved.status,200);state=saved.body;
    const after=paymentConfiguration();assert.deepEqual(after.secrets,before.secrets);assert.deepEqual(after.settings.wechat,before.settings.wechat);assert.deepEqual(after.settings.alipay,before.settings.alipay);
  });
});
