// Existing systemd installation: consistent copy rehearsal, live GET-only acceptance.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,stage,backup]=process.argv.slice(2),app='/var/www/oneshowlearn';
assert.ok(['dependencies','rehearse','live','https'].includes(mode));
assert.match(stage,/^\/tmp\/oneshowlearn-commercial-[a-zA-Z0-9]+$/);assert.match(backup,/^\/var\/backups\/oneshowlearn\/commercial-[a-zA-Z0-9]+$/);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),quote=s=>'"'+s.replaceAll('"','""')+'"';
if(mode==='dependencies'){
 const old=JSON.parse(readFileSync(app+'/package-lock.json')),next=JSON.parse(readFileSync(stage+'/package-lock.json'));
 assert.equal(hash(old.packages[''].dependencies),hash(next.packages[''].dependencies));
 for(const [name,pkg] of Object.entries(next.packages))if(name&&(!pkg.dev||old.packages[name])){const prior=old.packages[name];assert.ok(prior,'No new runtime dependency');assert.equal(pkg.version,prior.version,name);assert.equal(pkg.integrity,prior.integrity,name);}
 console.log('PASS unchanged runtime dependencies; no package install');process.exit(0);
}
const env=parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8')),originalFetch=globalThis.fetch;let secret=env.JWT_SECRET,server,applicationDb;
if(mode==='rehearse'){
 Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:stage+'/rehearsal/copy.db',UPLOAD_DIR:stage+'/rehearsal/uploads',JWT_SECRET:'commercial-provider-blocked-copy',ASSET_STORAGE:'local',AI_ENABLED:'false',MINERU_API_KEY:'',DATABASE_AUTO_MIGRATE:'true'});secret=process.env.JWT_SECRET;
 globalThis.fetch=(url,...args)=>{assert.equal(new URL(url).hostname,'127.0.0.1','External provider forbidden');return originalFetch(url,...args);};
 const {paymentTransport}=await import(pathToFileURL(stage+'/rehearsal/server/payment-providers.mjs'));for(const k of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[k]=()=>{throw Error('Payment provider forbidden');};
 const {courseAIService}=await import(pathToFileURL(stage+'/rehearsal/server/course-ai-service.mjs'));courseAIService.configure({async generate(){throw Error('Model provider forbidden');}});
 const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));({db:applicationDb}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs')));server=createApp({mineruProvider:null,assetStorage:null}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
}
const db=new DatabaseSync(mode==='rehearse'?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db',{readOnly:true}),before=new DatabaseSync(backup+(mode==='rehearse'?'/before.db':'/release.db'),{readOnly:true});
const jwt=createRequire(app+'/package.json')('jsonwebtoken'),base=mode==='https'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server?.address().port||8791}/api`;
const get=(route,user)=>fetch(base+route,{signal:AbortSignal.timeout(20000),headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'3m'})}:{}});
try{
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 const schema=d=>d.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),oldSchema=schema(before),newTables=new Set(['commercial_settings','telemetry_events','certificate_policies','completion_receipts','course_certificates','document_parse_jobs']),newIndexes=new Set(['telemetry_time','telemetry_performance_session','parse_jobs_state','parse_jobs_active_asset']);
 for(const s of oldSchema)assert.equal(hash(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type=? AND name=?').get(s.type,s.name)),hash(s),'Original schema retained: '+s.name);
 for(const s of schema(db))if(!oldSchema.some(o=>o.type===s.type&&o.name===s.name))assert.ok(s.type==='table'?newTables.has(s.name):s.type==='index'&&newIndexes.has(s.name),'Only declared additive schema');
 const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),transient=new Set(['auth_rate_limits','login_challenges','payment_checkout_locks']);let protectedTables=0;
 const values=(d,name)=>d.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
 const protect=()=>{for(const {name} of tables)if(mode==='rehearse'||!transient.has(name))assert.equal(hash(values(db,name)),hash(values(before,name)),'Complete business values preserved: '+name);};
 protect();for(const {name} of tables)if(mode==='rehearse'||!transient.has(name))protectedTables++;
 for(const name of newTables)if(name!=='commercial_settings')assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,0,'No production fixtures or automatic initial grants');
 const settings=db.prepare('SELECT * FROM commercial_settings WHERE id=1').get();assert.equal(settings.telemetry_enabled,0);assert.equal(settings.parser_enabled,0);assert.equal(settings.version,0);
 for(const route of ['/me/workspace','/me/export','/me/capacity','/me/favorites/contents','/learning/me/projects','/learning/notes','/auth/profile','/auth/identities','/commerce/orders','/learning/ai/conversations','/admin/readiness','/admin/uploads','/me/certificates','/admin/certificates','/admin/parsing','/admin/analytics','/admin/commercial/settings'])assert.equal((await get(route)).status,401,route);
 const users=db.prepare("SELECT u.id,u.role,u.token_version FROM users u WHERE status='active' AND (email_verified=1 OR EXISTS(SELECT 1 FROM login_identities i WHERE i.user_id=u.id)) ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all(),owner=db.prepare("SELECT id,role,token_version FROM users WHERE role='admin' AND status='active' AND email_verified=1 ORDER BY id LIMIT 1").get();assert.ok(users.length&&owner);
 for(const user of users){
  const ws=await get('/me/workspace',user);assert.equal(ws.status,200);assert.match(ws.headers.get('cache-control'),/no-store/);const saved=JSON.parse(db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id)?.state_json||'{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}');assert.equal(hash((await ws.json()).state),hash(saved));
  const profileRes=await get('/auth/profile',user);assert.equal(profileRes.status,200);assert.match(profileRes.headers.get('cache-control'),/no-store/);const u=db.prepare('SELECT name,email,email_verified,password_hash,created_at FROM users WHERE id=?').get(user.id),p=db.prepare('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?').get(user.id);assert.equal(hash(await profileRes.json()),hash({hasPassword:Boolean(u.password_hash),name:u.name,email:u.email,emailVerified:Boolean(u.email_verified),createdAt:u.created_at,bio:p?.bio||'',avatar:p?.avatar||'',version:hash([u.name,p?.revision||0])}));
  const identities=db.prepare('SELECT provider,subject FROM login_identities WHERE user_id=?').all(user.id),bindings=await get('/auth/identities',user);assert.equal(bindings.status,200);assert.equal(hash(await bindings.json()),hash({hasPassword:Boolean(u.password_hash),phone:identities.find(i=>i.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'',wechat:identities.some(i=>i.provider==='wechat')}));
  const orders=await get('/commerce/orders',user);assert.equal(orders.status,200);assert.match(orders.headers.get('cache-control'),/no-store/);const items=(await orders.json()).items;assert.ok(items.length<=20);for(const o of items){const r=db.prepare('SELECT user_id,order_no,amount_cents FROM orders WHERE id=?').get(o.id);assert.equal(r.user_id,user.id);assert.equal(r.order_no,o.orderNo);assert.equal(r.amount_cents,o.amountCents);}
  const certificates=await get('/me/certificates',user);assert.equal(certificates.status,200);assert.match(certificates.headers.get('cache-control'),/no-store/);assert.equal((await certificates.json()).items.length,0);
  if(user.role==='learner')for(const route of ['/admin/readiness','/admin/analytics','/admin/parsing','/admin/certificates','/admin/commercial/settings'])assert.equal((await get(route,user)).status,403,route);
 }
 for(const route of ['/admin/analytics?days=7','/admin/parsing','/admin/certificates','/admin/commercial/settings']){const r=await get(route,owner);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const data=await r.json();assert.ok(!/Bearer |BEGIN PRIVATE KEY|accessKey|secrets_cipher|sk-[A-Za-z0-9]{16}/.test(JSON.stringify(data)),'No credential disclosed');if(route==='/admin/parsing'){assert.equal(data.items.length,0);assert.equal(data.enabled,false);assert.equal(data.configured,mode!=='rehearse');}}
 const configRes=await get('/telemetry/config');assert.equal(configRes.status,200);assert.equal((await configRes.json()).enabled,false);
 // Public catalogue is unchanged except declared bundle metadata/default scope text.
 const offer=JSON.parse(readFileSync(backup+'/offer.before.json')),bundlePack=db.prepare("SELECT pack_id FROM products WHERE id=? AND status='active'").get(offer.productId)?.pack_id;
 for(const [name,route] of [['offer','/commerce/offer'],['status','/auth/status'],['resources','/resources'],['entry','/learning/entry'],['projects','/learning/projects'],['service','/service/public']]){
  const res=await get(route);assert.equal(res.status,200);const data=await res.json(),expected=JSON.parse(readFileSync(backup+'/'+name+'.before.json'));
  if(name==='projects')for(const project of data.items){assert.equal(project.bundleIncluded,Boolean(bundlePack));delete project.bundleIncluded;}
  if(name==='service'){const authored=JSON.parse(db.prepare('SELECT published_json FROM service_settings WHERE id=1').get()?.published_json||'{}');if(!Object.hasOwn(authored,'projectScope')){const {SERVICE_DEFAULTS}=await import(pathToFileURL(stage+'/server/service-definition.mjs'));expected.settings.projectScope=SERVICE_DEFAULTS.projectScope;}}
  assert.equal(hash(data),hash(expected),'Published values preserved except declared additions: '+name);
 }
 // Paid bundle access is computed without creating or rewriting project grants.
 if(bundlePack)for(const user of users){const r=await get('/learning/projects',user);assert.equal(r.status,200);const paid=Boolean(db.prepare("SELECT 1 FROM entitlements WHERE user_id=? AND pack_id=? AND status='active' AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))").get(user.id,bundlePack));if(paid||user.role!=='learner')for(const p of (await r.json()).items)assert.equal(p.entitled,true,'Existing course account gets bundled project access');}
 const ready=await get('/ready');assert.equal(ready.status,200);assert.equal((await ready.json()).ok,true);protect();
 console.log(`PASS ${mode}: ${tables.length} original schema/table protections, ${protectedTables} full business-value hashes, six additive tables with switches off; private owner/learner GETs, bundle access, preserved prices/catalogue/configuration; zero provider or write requests.`);
}finally{db.close();before.close();if(server)await new Promise(r=>server.close(r));applicationDb?.close();globalThis.fetch=originalFetch;}
