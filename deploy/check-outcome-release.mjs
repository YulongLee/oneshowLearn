// Production GETs and read-only database checks. No app import/migration/write.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
const backup=process.argv[2],app='/var/www/oneshowlearn';
assert.match(backup,/^\/var\/backups\/oneshowlearn\/(?:outcome-library|settings-refinement|performance)-[a-zA-Z0-9]+$/);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),quote=s=>'"'+s.replaceAll('"','""')+'"';
const db=new DatabaseSync(app+'/data/oneshowlearn.db',{readOnly:true}),before=new DatabaseSync(backup+'/before.db',{readOnly:true});
const secret=parseEnv(readFileSync('/etc/oneshowlearn/oneshowlearn.env','utf8')).JWT_SECRET;
const jwt=createRequire(app+'/package.json')('jsonwebtoken'),base='https://oneshowlearn.com/api';
const get=(route,user)=>fetch(base+route,{signal:AbortSignal.timeout(20000),headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'2m'})}:{}});
try{
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
 const schema=c=>c.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
 assert.equal(hash(schema(db)),hash(schema(before)),'No schema changes');
 const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 // Real traffic may advance these states while a frontend-only release runs.
 const mutable=new Set(['users','account_profiles','orders','entitlements','progress','learning_progress','learning_notes','workspace_state','tutor_conversations','tutor_turns','project_runs','project_run_tasks','payment_checkouts','payment_events','payment_checkout_locks','payment_checkout_requests','auth_rate_limits','account_audit','login_challenges','service_requests']);
 for(const {name} of tables){
  const old=before.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
  if(!mutable.has(name))assert.equal(hash(db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()),hash(old),'Protected table '+name+'; values suppressed');
  else{
   const keys=before.prepare(`PRAGMA table_info(${quote(name)})`).all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!keys.length||['payment_checkout_locks','auth_rate_limits','login_challenges'].includes(name))continue;
   const exists=db.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${keys.map(k=>quote(k)+'=?').join(' AND ')}`);
   for(const r of old)assert.ok(exists.get(...keys.map(k=>r[k])),'Existing record preserved: '+name);
  }
 }
 for(const old of before.prepare('SELECT id,order_no,user_id,amount_cents FROM orders').all())assert.equal(hash(db.prepare('SELECT id,order_no,user_id,amount_cents FROM orders WHERE id=?').get(old.id)),hash(old),'Historical order identities and amounts preserved');
 for(const route of ['/me/workspace','/me/opc/product','/me/favorites/contents','/learning/me/projects','/learning/notes','/auth/profile','/auth/identities','/commerce/orders','/learning/ai/conversations','/community'])assert.equal((await get(route)).status,401,route);
 const users=db.prepare("SELECT u.id,u.token_version FROM users u WHERE status='active' AND (email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all();
 assert.ok(users.length,'Current account available for read-only ownership check');
 for(const user of users){
  const response=await get('/me/workspace',user);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const {state,version}=await response.json(),raw=db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id);
  const saved=JSON.parse(raw?.state_json||'{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}');
  assert.equal(hash(state),hash(saved),'Owner-only workspace; values suppressed');assert.equal(typeof version,'string');
  const projects=await get('/learning/me/projects',user);assert.equal(projects.status,200);
  for(const project of (await projects.json()).items)assert.ok(db.prepare('SELECT 1 FROM project_runs WHERE user_id=? AND project_id=?').get(user.id,project.id),'Source projects belong to current account');
 }
 for(const [name,route] of [['offer','/commerce/offer'],['status','/auth/status'],['resources','/resources'],['entry','/learning/entry'],['projects','/learning/projects']]){
  const res=await get(route);assert.equal(res.status,200);assert.equal(hash(await res.json()),hash(JSON.parse(readFileSync(backup+'/'+name+'.before.json'))),'Unchanged '+name);
 }
 console.log(`PASS ${tables.length} protected tables/schema, preserved accounts/outcomes/private records/order identities and amounts, unchanged prices/providers/catalogues, authenticated owner-only GETs and anonymous privacy; no gateway/write requests`);
}finally{db.close();before.close();}
