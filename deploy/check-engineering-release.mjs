// Existing systemd installation only. Never send payments/models/messages.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,stage,backup]=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['dependencies','rehearse','live','https'].includes(mode));
assert.match(stage,/^\/tmp\/oneshowlearn-engineering-[a-zA-Z0-9]+$/);
assert.match(backup,/^\/var\/backups\/oneshowlearn\/engineering-[a-zA-Z0-9]+$/);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
if(mode==='dependencies') {
 const old=JSON.parse(readFileSync(app+'/package-lock.json')),next=JSON.parse(readFileSync(stage+'/package-lock.json'));
 assert.equal(hash(old.packages[''].dependencies),hash(next.packages[''].dependencies),'Runtime dependency declarations unchanged');
 for(const [name,pkg] of Object.entries(next.packages))if(name&&(!pkg.dev||old.packages[name])) {
  const prior=old.packages[name];assert.ok(prior,'No new runtime dependency '+name);
  assert.equal(pkg.version,prior.version,name);assert.equal(pkg.integrity,prior.integrity,name);
 }
 console.log('PASS unchanged runtime package versions/integrities; existing installed dependencies retained');
 process.exit(0);
}
const env=parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8'));
let secret=env.JWT_SECRET,server,applicationDb;const originalFetch=globalThis.fetch;
if(mode==='rehearse') {
 Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:stage+'/rehearsal/copy.db',UPLOAD_DIR:stage+'/rehearsal/uploads',API_HOST:'127.0.0.1',JWT_SECRET:'engineering-isolated-rehearsal',AI_ENABLED:'false',ASSET_STORAGE:'local'});
 secret=process.env.JWT_SECRET;
 globalThis.fetch=(url,...args)=>{assert.equal(new URL(url).hostname,'127.0.0.1','External provider forbidden');return originalFetch(url,...args);};
 const {paymentTransport}=await import(pathToFileURL(stage+'/rehearsal/server/payment-providers.mjs'));
 for(const name of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[name]=()=>{throw Error('Payment provider forbidden');};
 const {courseAIService}=await import(pathToFileURL(stage+'/rehearsal/server/course-ai-service.mjs'));
 courseAIService.configure({async generate(){throw Error('Model provider forbidden');}});
 const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));
 ({db:applicationDb}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs')));
 server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
}
const db=new DatabaseSync(mode==='rehearse'?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db',{readOnly:true});
const before=new DatabaseSync(backup+(mode==='rehearse'?'/before.db':'/release.db'),{readOnly:true});
const jwt=createRequire(app+'/package.json')('jsonwebtoken');
const base=mode==='https'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server?.address().port||8791}/api`;
const get=(route,user)=>fetch(base+route,{signal:AbortSignal.timeout(20000),headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'3m'})}:{}});
try {
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 const schema=d=>d.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
 assert.equal(hash(schema(db)),hash(schema(before)),'Schema unchanged');
 const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const transient=new Set(['auth_rate_limits','login_challenges','payment_checkout_locks']);let protectedTables=0;
 for(const {name} of tables)if(mode==='rehearse'||!transient.has(name)) {
  const records=d=>d.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
  assert.equal(hash(records(db)),hash(records(before)),'Complete business values unchanged: '+name);protectedTables++;
 }
 for(const route of ['/me/workspace','/me/export','/me/capacity','/me/favorites/contents','/learning/me/projects','/learning/notes','/auth/profile','/auth/identities','/commerce/orders','/learning/ai/conversations','/community','/admin/readiness','/admin/uploads'])assert.equal((await get(route)).status,401,route);
 const users=db.prepare("SELECT u.id,u.role,u.token_version FROM users u WHERE status='active' AND (email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all();assert.ok(users.length);
 for(const user of users) {
  const ws=await get('/me/workspace',user);assert.equal(ws.status,200);assert.match(ws.headers.get('cache-control'),/no-store/);
  const saved=JSON.parse(db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id)?.state_json||'{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}');
  assert.equal(hash((await ws.json()).state),hash(saved),'Private workspace belongs to owner');
  const profileRes=await get('/auth/profile',user);assert.equal(profileRes.status,200);assert.match(profileRes.headers.get('cache-control'),/no-store/);
  const profile=await profileRes.json(),u=db.prepare('SELECT name,email,email_verified,password_hash,created_at FROM users WHERE id=?').get(user.id),p=db.prepare('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?').get(user.id);
  assert.equal(hash(profile),hash({hasPassword:Boolean(u.password_hash),name:u.name,email:u.email,emailVerified:Boolean(u.email_verified),createdAt:u.created_at,bio:p?.bio||'',avatar:p?.avatar||'',version:hash([u.name,p?.revision||0])}));
  const bindings=await get('/auth/identities',user);assert.equal(bindings.status,200);const identities=db.prepare('SELECT provider,subject FROM login_identities WHERE user_id=?').all(user.id);
  assert.equal(hash(await bindings.json()),hash({hasPassword:Boolean(u.password_hash),phone:identities.find(i=>i.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'',wechat:identities.some(i=>i.provider==='wechat')}));
  const orders=await get('/commerce/orders',user);assert.equal(orders.status,200);assert.match(orders.headers.get('cache-control'),/no-store/);const items=(await orders.json()).items;assert.ok(items.length<=20);
  for(const o of items){const row=db.prepare('SELECT user_id,order_no,amount_cents FROM orders WHERE id=?').get(o.id);assert.equal(row.user_id,user.id);assert.equal(row.order_no,o.orderNo);assert.equal(row.amount_cents,o.amountCents);}
  const projects=await get('/learning/me/projects',user);assert.equal(projects.status,200);for(const p of (await projects.json()).items)assert.ok(db.prepare('SELECT 1 FROM project_runs WHERE user_id=? AND project_id=?').get(user.id,p.id));
  if(user.role==='learner')assert.equal((await get('/admin/readiness',user)).status,403);
 }
 for(const [name,route] of [['offer','/commerce/offer'],['status','/auth/status'],['resources','/resources'],['entry','/learning/entry'],['projects','/learning/projects'],['service','/service/public']]) {
  const res=await get(route);assert.equal(res.status,200);assert.equal(hash(await res.json()),hash(JSON.parse(readFileSync(backup+'/'+name+'.before.json'))),'Published configuration unchanged: '+name);
 }
 const ready=await get('/ready');assert.equal(ready.status,200);assert.match(ready.headers.get('cache-control'),/no-store/);assert.equal((await ready.json()).ok,true);
 // Verify GET checks and initialization also left all protected values intact.
 for(const {name} of tables)if(mode==='rehearse'||!transient.has(name))assert.equal(hash(db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),hash(before.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),'Read-only checks retained '+name);
 console.log(`PASS ${mode}: ${tables.length} tables/schema, ${protectedTables} full-value protections, owner-only profile/identity/order/workspace/project GETs, anonymous privacy, unchanged offer/catalogue/login/service; no provider calls.`);
}finally {db.close();before.close();if(server)await new Promise(r=>server.close(r));applicationDb?.close();globalThis.fetch=originalFetch;}
