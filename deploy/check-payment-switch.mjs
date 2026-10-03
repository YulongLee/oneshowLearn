// Deployment checks deliberately cannot create/query/close a real gateway order.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual,parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [mode,backup,rehearsal]=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['rehearse','live'].includes(mode));
assert.match(backup,/^\/var\/backups\/oneshowlearn\/payment-diagnostics-[a-zA-Z0-9]+$/);
const env=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8'));
let server,applicationDb;
const fetchOriginal=globalThis.fetch;
if(mode==='rehearse'){
  assert.match(rehearsal,/^\/tmp\/oneshowlearn-paytest-deploy-[a-zA-Z0-9]+\/rehearsal$/);
  Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:rehearsal+'/rehearsal.db',UPLOAD_DIR:rehearsal+'/uploads'});
  globalThis.fetch=(...args)=>{assert.equal(new URL(args[0]).hostname,'127.0.0.1','External request forbidden in rehearsal');return fetchOriginal(...args);};
  const {paymentTransport}=await import(pathToFileURL(rehearsal+'/server/payment-providers.mjs'));
  for(const key of ['fetch','alipay','alipayConfirmMissing'])paymentTransport[key]=async()=>{throw new Error('Gateway request forbidden during deployment rehearsal');};
  const {createApp}=await import(pathToFileURL(rehearsal+'/server/index.mjs'));
  ({db:applicationDb}=await import(pathToFileURL(rehearsal+'/server/db.mjs')));
  server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
}
const base=mode==='live'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server.address().port}/api`;
const db=new DatabaseSync(mode==='live'?app+'/data/oneshowlearn.db':rehearsal+'/rehearsal.db',{readOnly:true});
const old=new DatabaseSync(backup+'/before.db',{readOnly:true});
try{
  const jwt=createRequire(app+'/package.json')('jsonwebtoken');
  const token=user=>jwt.sign({sub:user.id,ver:user.token_version},env.JWT_SECRET,{expiresIn:'2m'});
  const request=(route,method='GET',user,body)=>fetch(base+route,{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(user?{Authorization:`Bearer ${token(user)}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const admin=db.prepare("SELECT id,token_version FROM users WHERE role='admin' AND status='active' AND email_verified=1 LIMIT 1").get();assert.ok(admin);
  const buyer=db.prepare("SELECT u.id,u.token_version,c.order_id FROM users u JOIN payment_checkouts c ON c.user_id=u.id WHERE u.role='learner' AND u.status='active' AND (u.email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) LIMIT 1").get();
  for(const route of ['/commerce/checkout','/commerce/orders/2147483647/switch','/commerce/orders/2147483647/close'])assert.equal((await request(route,'POST',undefined,{})).status,401);
  assert.equal((await request('/admin/payments/orders/2147483647/diagnostic')).status,401);
  assert.equal((await request('/admin/payments/orders/2147483647/diagnostic','GET',admin)).status,404);
  assert.equal((await request('/commerce/orders/2147483647/switch','POST',admin,{})).status,404);
  if(buyer){
    assert.equal((await request(`/admin/payments/orders/${buyer.order_id}/diagnostic`,'GET',buyer)).status,403);
    const diagnostic=await request(`/admin/payments/orders/${buyer.order_id}/diagnostic`,'GET',admin);assert.equal(diagnostic.status,200);
    const detail=await diagnostic.json();assert.deepEqual(Object.keys(detail).sort(),['orderId','provider','configVersion','status','hasQRCode','detail'].sort());
    assert.equal((await request(`/commerce/orders/${buyer.order_id}/switch`,'POST',admin,{})).status,404);
    assert.equal((await request(`/commerce/orders/${buyer.order_id}/switch`,'POST',buyer,{provider:'invalid-channel'})).status,400);
    const list=await request('/commerce/orders','GET',buyer);assert.equal(list.status,200);
    const items=(await list.json()).items;assert.ok(items.every(o=>typeof o.failureMessage==='string'&&typeof o.productId==='number'));
  }
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  const tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),tables);
  for(const {name} of tables){
    const quoted='"'+name.replaceAll('"','""')+'"';
    assert.ok(isDeepStrictEqual(db.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all(),old.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all()),`Records changed: ${name}; values suppressed`);
  }
  console.log(`PASS ${mode}: switch/diagnostic authorization and input guards; all ${tables.length} tables preserved; no gateway request, order creation or credential write`);
}finally{db.close();old.close();if(server)await new Promise(resolve=>server.close(resolve));applicationDb?.close();globalThis.fetch=fetchOriginal;}
