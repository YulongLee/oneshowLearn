// Production reads only. All successful writes are confined to the rehearsal DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,stage,backup]=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['rehearse','live'].includes(mode));
assert.match(stage,/^\/tmp\/oneshowlearn-favorite-source-[a-zA-Z0-9]+$/);
assert.match(backup,/^\/var\/backups\/oneshowlearn\/favorite-source-[a-zA-Z0-9]+$/);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
let server,applicationDb,secret;
const originalFetch=globalThis.fetch;
if(mode==='rehearse'){
 // Use the backed-up encryption environment only inside this server-side copy.
 // Provider transports remain blocked and no credentials leave the server.
 Object.assign(process.env,parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8')),{NODE_ENV:'test',DATABASE_PATH:stage+'/rehearsal/copy.db',UPLOAD_DIR:stage+'/rehearsal/uploads',JWT_SECRET:'isolated-favorite-release',ASSET_STORAGE:'local',AI_ENABLED:'false'});
 secret=process.env.JWT_SECRET;
 globalThis.fetch=(...args)=>{assert.equal(new URL(args[0]).hostname,'127.0.0.1','External provider request forbidden');return originalFetch(...args);};
 const {paymentTransport}=await import(pathToFileURL(stage+'/rehearsal/server/payment-providers.mjs'));
 for(const key of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[key]=()=>{throw Error('Gateway forbidden during release');};
 const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));
 ({db:applicationDb}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs')));
 server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
}else secret=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8')).JWT_SECRET;
const db=new DatabaseSync(mode==='live'?app+'/data/oneshowlearn.db':stage+'/rehearsal/copy.db',{readOnly:true});
const before=new DatabaseSync(backup+'/before.db',{readOnly:true});
const jwt=createRequire(app+'/package.json')('jsonwebtoken');
const base=mode==='live'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server.address().port}/api`;
const request=(route,user,method='GET',body,version)=>fetch(base+route,{method,signal:AbortSignal.timeout(20000),headers:{...(user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'2m'})}:{}),...(body?{'Content-Type':'application/json'}:{}),...(version?{'If-Match':version}:{})},...(body?{body:JSON.stringify(body)}:{})});
try{
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
 const schema=c=>c.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all();
 assert.equal(digest(schema(db)),digest(schema(before)),'No schema change');
 const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const mutable=new Set(['users','orders','entitlements','progress','learning_progress','learning_notes','workspace_state','tutor_conversations','tutor_turns','project_runs','project_run_tasks','payment_checkouts','payment_events','payment_checkout_locks','payment_checkout_requests','auth_rate_limits','account_audit','login_challenges','service_requests']);
 for(const {name} of tables){
  const old=before.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
  if(mode==='rehearse'||!mutable.has(name))assert.equal(digest(db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),digest(old),'Protected table '+name+'; values suppressed');
  else{
   const keys=before.prepare(`PRAGMA table_info(${quote(name)})`).all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!keys.length||['payment_checkout_locks','auth_rate_limits','login_challenges'].includes(name))continue;
   const exists=db.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${keys.map(k=>quote(k)+'=?').join(' AND ')}`);
   for(const r of old)assert.ok(exists.get(...keys.map(k=>r[k])),'Existing record preserved: '+name);
  }
 }
 for(const old of before.prepare('SELECT id,order_no,user_id,amount_cents FROM orders').all())assert.equal(digest(db.prepare('SELECT id,order_no,user_id,amount_cents FROM orders WHERE id=?').get(old.id)),digest(old),'Historical order identity/amount preserved');
 const users=db.prepare("SELECT u.id,u.token_version FROM users u WHERE status='active' AND (email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all();
 assert.ok(users.length);
 for(const route of ['/me/favorites/contents','/me/workspace','/learning/notes','/auth/profile','/commerce/orders','/learning/ai/conversations'])assert.equal((await request(route)).status,401,route);
 for(const user of users){
  const res=await request('/me/favorites/contents',user);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');
  const {items}=await res.json(),raw=db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id);
  const own=JSON.parse(raw?.state_json||'{}').contentFavorites||[];
  assert.equal(items.length,own.length);assert.equal(digest(items.map(i=>i.reference)),digest(own));
  for(const item of items){
   if(item.reference.kind==='learning-note'&&item.content)assert.ok(db.prepare('SELECT 1 FROM learning_notes WHERE id=? AND user_id=? AND deleted_at IS NULL').get(item.reference.id,user.id),'Owner-only note');
   if(item.reference.kind==='material'&&item.content)assert.ok(!('body' in item.content),'No private material body');
  }
  assert.ok(!/Bearer |BEGIN PRIVATE KEY|token=/.test(JSON.stringify(items)),'No secrets in metadata');
 }
 if(mode==='rehearse'){
  const user=users[0],r=await request('/me/workspace',user);assert.equal(r.status,200);const workspace=await r.json();
  assert.equal((await request('/me/workspace/state',user,'PUT',{...workspace.state,contentFavorites:[]},'stale')).status,409);
  assert.equal((await request('/me/workspace/state',user,'PUT',{...workspace.state,contentFavorites:[]})).status,428);
  assert.equal((await request('/me/workspace/state',user,'PUT',{...workspace.state,contentFavorites:[{kind:'project',id:2147483647,savedAt:new Date().toISOString()}]},workspace.version)).status,400);
  const project=db.prepare("SELECT id FROM practice_projects WHERE status='published' ORDER BY id LIMIT 1").get();assert.ok(project);
  const refs=workspace.state.contentFavorites||[],exists=refs.some(r=>r.kind==='project'&&r.id===project.id);
  const added=exists?refs:[...refs,{kind:'project',id:project.id,savedAt:new Date().toISOString()}];
  const saved=await request('/me/workspace/state',user,'PUT',{...workspace.state,contentFavorites:added},workspace.version);assert.equal(saved.status,200);const next=await saved.json();
  assert.equal((await request('/me/favorites/contents',user)).status,200);
  const legacy={...next.state};delete legacy.contentFavorites;
  const retained=await request('/me/workspace/state',user,'PUT',legacy,next.version);assert.equal(retained.status,200);assert.equal(digest((await retained.json()).state.contentFavorites),digest(added));
  for(const {name} of tables)if(name!=='workspace_state')assert.equal(digest(db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),digest(before.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),'Rehearsal writes scoped only to copied workspace');
 }
 for(const [name,route] of [['offer','/commerce/offer'],['status','/auth/status'],['resources','/resources'],['entry','/learning/entry'],['projects','/learning/projects']]){
  const res=await request(route);assert.equal(res.status,200);assert.equal(digest(await res.json()),digest(JSON.parse(readFileSync(backup+'/'+name+'.before.json'))),'Unchanged '+name);
 }
 console.log(`PASS ${mode}: ${tables.length} protected tables/schema, owner-only favorite resolution/privacy, preserved identities/order amounts/configuration/offer; ${mode==='live'?'GET-only checks':'copied-DB CAS/legacy saves only'}, no provider requests`);
}finally{db.close();before.close();if(server)await new Promise(r=>server.close(r));applicationDb?.close();globalThis.fetch=originalFetch;}
