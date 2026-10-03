// Release checks: no gateway calls, valid merchant saves, new orders or fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual,parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [mode,backup,rehearsal,releaseMode='initial']=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['rehearse','live'].includes(mode));
assert.ok(['initial','compatibility','website'].includes(releaseMode));
assert.match(backup,/^\/var\/backups\/oneshowlearn\/payment-lifecycle-[a-zA-Z0-9]+$/);
const env=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8'));
let server,applicationDb;
const originalFetch=globalThis.fetch;
if(mode==='rehearse'){
  assert.match(rehearsal,/^\/tmp\/oneshowlearn-paytest-deploy-[a-zA-Z0-9]+\/rehearsal$/);
  Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:rehearsal+'/rehearsal.db',UPLOAD_DIR:rehearsal+'/uploads'});
  globalThis.fetch=(...args)=>{assert.equal(new URL(args[0]).hostname,'127.0.0.1','External request forbidden in rehearsal');return originalFetch(...args);};
  const {paymentTransport}=await import(pathToFileURL(rehearsal+'/server/payment-providers.mjs'));
  for(const key of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[key]=()=>{throw new Error('Gateway forbidden during release rehearsal');};
  const {createApp}=await import(pathToFileURL(rehearsal+'/server/index.mjs'));
  ({db:applicationDb}=await import(pathToFileURL(rehearsal+'/server/db.mjs')));
  server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
}
const db=new DatabaseSync(mode==='live'?app+'/data/oneshowlearn.db':rehearsal+'/rehearsal.db',{readOnly:true});
const old=new DatabaseSync(backup+(mode==='live'?'/release.db':'/before.db'),{readOnly:true});
const base=mode==='live'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server.address().port}/api`;
try{
  const jwt=createRequire(app+'/package.json')('jsonwebtoken');
  const token=u=>jwt.sign({sub:u.id,ver:u.token_version},env.JWT_SECRET,{expiresIn:'2m'});
  const request=(route,user,method='GET',body,version)=>fetch(base+route,{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(user?{Authorization:`Bearer ${token(user)}`} :{}),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const admin=db.prepare("SELECT id,token_version FROM users WHERE role='admin' AND status='active' AND email_verified=1 LIMIT 1").get();assert.ok(admin);
  const buyer=db.prepare("SELECT u.id,u.token_version,c.order_id FROM users u JOIN payment_checkouts c ON c.user_id=u.id WHERE u.role='learner' AND u.status='active' AND (u.email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) LIMIT 1").get();
  assert.equal((await request('/admin/payments/operations')).status,401);
  if(buyer)assert.equal((await request('/admin/payments/operations',buyer)).status,403);
  const operationResponse=await request('/admin/payments/operations',admin);assert.equal(operationResponse.status,200);
  const operations=await operationResponse.json();assert.ok(operations.items.length<=30);assert.equal(operations.channels.length,2);
  assert.ok(!/PRIVATE KEY|PUBLIC KEY|wechatApiV3Key|alipayPrivateKey/.test(JSON.stringify(operations)));
  assert.ok(operations.items.every(o=>!o.qrUrl&&typeof o.configVersion==='number'&&typeof o.manualReview==='boolean'));
  for(const route of ['/commerce/checkout','/commerce/orders/2147483647/renew','/commerce/orders/2147483647/switch','/commerce/orders/2147483647/close'])assert.equal((await request(route,null,'POST',{})).status,401);
  assert.equal((await request('/commerce/orders/2147483647/renew',admin,'POST',{})).status,404);
  if(releaseMode==='website'){
    assert.equal((await request('/commerce/orders/2147483647/pay',null,'POST',{})).status,401);
    assert.equal((await request('/commerce/orders/2147483647/pay',admin,'POST',{})).status,404);
    if(buyer)assert.equal((await request(`/commerce/orders/${buyer.order_id}/pay`,admin,'POST',{})).status,404);
  }
  if(buyer){
    assert.equal((await request(`/commerce/orders/${buyer.order_id}/renew`,admin,'POST',{})).status,404);
    assert.equal((await request(`/commerce/orders/${buyer.order_id}/renew`,buyer,'POST',{provider:'invalid-channel'})).status,400);
    const list=await request('/commerce/orders',buyer);assert.equal(list.status,200);assert.ok((await list.json()).items.every(o=>typeof o.failureMessage==='string'&&!o.paymentUrl));
  }
  const configResponse=await request('/admin/payments',admin);assert.equal(configResponse.status,200);const c=await configResponse.json();
  for(const section of ['wechat','alipay','pricing']){
    const settings=section==='pricing'?Object.fromEntries(['productId','priceCents','originalPriceCents','publicOrigin'].map(k=>[k,c.settings[k]])):c.settings[section];
    const body={settings,...(section==='pricing'?{}:{secrets:{}})};
    assert.equal((await request(`/admin/payments/${section}`,null,'PUT',body)).status,401);
    if(buyer)assert.equal((await request(`/admin/payments/${section}`,buyer,'PUT',body)).status,403);
    assert.equal((await request(`/admin/payments/${section}`,admin,'PUT',body)).status,428);
    assert.equal((await request(`/admin/payments/${section}`,admin,'PUT',body,c.version+1)).status,409);
    const crossed=section==='pricing'?{settings,secrets:{alipayPrivateKey:'invalid-crossed-field'}}:{settings:{...settings,priceCents:1},secrets:{}};
    assert.equal((await request(`/admin/payments/${section}`,admin,'PUT',crossed,c.version)).status,400);
  }
  for(const provider of ['wechat','alipay']){
    assert.equal((await request(`/admin/payments/${provider}/test`,admin,'POST',{})).status,428);
    assert.equal((await request(`/admin/payments/${provider}/test`,admin,'POST',{},c.version+1)).status,409);
  }
  const offer=await request('/commerce/offer');assert.equal(offer.status,200);assert.deepEqual(await offer.json(),JSON.parse(readFileSync(backup+'/offer.before.json')));
  const quote=n=>'"'+n.replaceAll('"','""')+'"';
  const tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  for(const {name} of tables){
    const columns=old.prepare(`PRAGMA table_info(${quote(name)})`).all().map(c=>quote(c.name)).join(',');
    assert.ok(isDeepStrictEqual(db.prepare(`SELECT ${columns} FROM ${quote(name)} ORDER BY rowid`).all(),old.prepare(`SELECT ${columns} FROM ${quote(name)} ORDER BY rowid`).all()),`Protected records changed: ${name}; values suppressed`);
  }
  if(releaseMode==='initial'){
    for(const name of ['payment_checkout_locks','payment_checkout_requests','payment_events'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payment_checkouts WHERE next_sync_at<>0 OR attempt_state<>'legacy'").get().n,0);
  }
  if(releaseMode==='website'){
    const columns=db.prepare('PRAGMA table_info(payment_checkouts)').all().map(c=>c.name);
    assert.ok(columns.includes('payment_flow')&&columns.includes('page_issued_at'));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payment_checkouts WHERE payment_flow<>'qr' OR page_issued_at<>0").get().n,0,'Historical QR attempts unchanged');
    // Read production source only: importing its configuration would initialize
    // a DB in this verifier without the running service's environment.
    const source=readFileSync((mode==='live'?app:rehearsal)+'/server/payment-providers.mjs','utf8');
    assert.match(source,/checkoutFlow:provider=>provider==='alipay'\?'page':'qr'/);
  }
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  console.log(`PASS ${mode}: additive migration, ${tables.length} protected tables, independent owner/version guards, order privacy, saved offer and secrets preserved; no gateway or valid saves`);
}finally{db.close();old.close();if(server)await new Promise(r=>server.close(r));applicationDb?.close();globalThis.fetch=originalFetch;}
