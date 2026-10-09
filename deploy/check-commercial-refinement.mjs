// Fresh schema-preserving release; exported guards also run in isolated engineering tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
export const reviewedModules=['account-security','course-ai-service','course-certificates','index','learning-routes','operational-readiness','payment-configuration','tutor-retrieval','tutor-intent'];
export const patchedVersions={'baseline-browser-mapping':'2.11.0',browserslist:'4.28.7','caniuse-lite':'1.0.30001815','electron-to-chromium':'1.5.452',multer:'2.4.0',nanoid:'3.3.18','node-releases':'2.0.58',nodemailer:'10.0.16',postcss:'8.5.23','proxy-addr':'2.0.8',qs:'6.16.0','shell-quote':'1.11.0','source-map-js':'1.2.2',vite:'6.4.4'};
const removed=new Set(['buffer-from','concat-stream','readable-stream','string_decoder','typedarray']);
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>digest(JSON.stringify(value)??'undefined');
export function checkDependencyDelta(old,next){
 const expected={...old.packages[''].dependencies,multer:'2.4.0',nodemailer:'10.0.16',vite:'6.4.4'};
 assert.equal(hash(next.packages[''].dependencies),hash(expected),'Only three reviewed direct security changes');
 assert.equal(hash(next.packages[''].devDependencies),hash(old.packages[''].devDependencies),'No new direct development dependency');
 for(const name of Object.keys({...old.packages,...next.packages}).filter(Boolean)){
  const a=old.packages[name],b=next.packages[name],short=name.replace(/^node_modules\//,'');
  if(hash(a)===hash(b))continue;
  if(!b){assert.ok(removed.has(short),'Only obsolete Multer stream dependencies removed');continue;}
  assert.ok(a&&Object.hasOwn(patchedVersions,short),'Unexpected package change: '+name);
  assert.equal(b.version,patchedVersions[short],name);assert.match(b.resolved,/^https:\/\/registry\.npmjs\.org\//);assert.match(b.integrity,/^sha512-/);
 }
 for(const [name,version] of Object.entries(patchedVersions))assert.equal(next.packages['node_modules/'+name]?.version,version,name);
}
export function prepareProxy(site,snippet,prefix){
 const old='limit_req_zone $binary_remote_addr zone=oneshowlearn_auth:10m rate=10r/m;';
 assert.equal(site.split(old).length,2,'Expected live HTTP zone');
 assert.equal(snippet.split('    limit_req zone=oneshowlearn_auth burst=10 nodelay;').length,2);
 assert.ok(!site.includes('oneshowlearn_auth_read'));
 // A distinct shared-memory zone avoids changing an existing zone's key on hot reload.
 const zones=prefix.replace('zone=oneshowlearn_auth:','zone=oneshowlearn_auth_write_v2:');
 return {site:site.replace(old,zones),snippet:snippet.replace('    limit_req zone=oneshowlearn_auth burst=10 nodelay;','    limit_req zone=oneshowlearn_auth_write_v2 burst=10 nodelay;\n    limit_req zone=oneshowlearn_auth_read burst=30 nodelay;')};
}
async function acceptance(mode,stage,backup){
 const app='/var/www/oneshowlearn';assert.ok(['rehearse','live','https'].includes(mode));
 assert.match(stage,/^\/tmp\/oneshowlearn-refinement-[a-zA-Z0-9]+$/);assert.match(backup,/^\/var\/backups\/oneshowlearn\/refinement-[a-zA-Z0-9]+$/);
 const env=parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8')),originalFetch=globalThis.fetch;let secret=env.JWT_SECRET,server,applicationDb;
 if(mode==='rehearse'){
  Object.assign(process.env,env,{NODE_ENV:'test',DATABASE_PATH:stage+'/rehearsal/copy.db',UPLOAD_DIR:stage+'/rehearsal/uploads',JWT_SECRET:'refinement-provider-blocked-copy',ASSET_STORAGE:'local',AI_ENABLED:'false',MINERU_API_KEY:'',DATABASE_AUTO_MIGRATE:'false'});secret=process.env.JWT_SECRET;
  globalThis.fetch=(url,...args)=>{assert.equal(new URL(url).hostname,'127.0.0.1','External providers forbidden');return originalFetch(url,...args);};
  const {paymentTransport}=await import(pathToFileURL(stage+'/rehearsal/server/payment-providers.mjs'));for(const k of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[k]=()=>{throw Error('Payment provider forbidden');};
  const {courseAIService}=await import(pathToFileURL(stage+'/rehearsal/server/course-ai-service.mjs'));courseAIService.configure({async generate(){throw Error('Model provider forbidden');}});
  const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));({db:applicationDb}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs')));server=createApp({mineruProvider:null,assetStorage:null}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 }
 const db=new DatabaseSync(mode==='rehearse'?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db',{readOnly:true}),before=new DatabaseSync(backup+(mode==='rehearse'?'/before.db':'/release.db'),{readOnly:true});
 const jwt=createRequire(stage+'/runtime/package.json')('jsonwebtoken'),base=mode==='https'?'https://oneshowlearn.com/api':`http://127.0.0.1:${server?.address().port||8791}/api`;
 const get=(route,user)=>fetch(base+route,{signal:AbortSignal.timeout(20000),headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'3m'})}:{}});
 try{
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const schema=d=>d.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();assert.equal(hash(schema(db)),hash(schema(before)),'Exact schema retained; no migration');
  const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),transient=new Set(['auth_rate_limits','login_challenges','payment_checkout_locks']);
  const values=(d,name)=>d.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all();
  const protect=()=>{for(const {name} of tables)if(mode==='rehearse'||!transient.has(name))assert.equal(hash(values(db,name)),hash(values(before,name)),'Full existing values retained: '+name);};protect();
  for(const route of ['/me/workspace','/auth/profile','/auth/identities','/commerce/orders','/learning/ai/allowance','/learning/ai/conversations','/admin/readiness','/me/certificates','/admin/certificates','/admin/parsing','/admin/analytics'])assert.equal((await get(route)).status,401,route);
  const users=db.prepare("SELECT u.id,u.role,u.token_version FROM users u WHERE status='active' AND email_verified=1 ORDER BY CASE role WHEN 'learner' THEN 0 ELSE 1 END,id LIMIT 2").all(),owner=db.prepare("SELECT id,role,token_version FROM users WHERE role='admin' AND status='active' AND email_verified=1 ORDER BY id LIMIT 1").get();assert.ok(users.length&&owner);
  for(const user of users){
   const ws=await get('/me/workspace',user);assert.equal(ws.status,200);assert.match(ws.headers.get('cache-control'),/no-store/);const saved=JSON.parse(db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id)?.state_json||'{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}');assert.equal(hash((await ws.json()).state),hash(saved));
   const response=await get('/auth/profile',user);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const u=db.prepare('SELECT name,email,email_verified,password_hash,created_at FROM users WHERE id=?').get(user.id),p=db.prepare('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?').get(user.id);assert.equal(hash(await response.json()),hash({hasPassword:Boolean(u.password_hash),name:u.name,email:u.email,emailVerified:Boolean(u.email_verified),createdAt:u.created_at,bio:p?.bio||'',avatar:p?.avatar||'',version:hash([u.name,p?.revision||0])}));
   const bindings=await get('/auth/identities',user);assert.equal(bindings.status,200);const identities=db.prepare('SELECT provider,subject FROM login_identities WHERE user_id=?').all(user.id);assert.equal(hash(await bindings.json()),hash({hasPassword:Boolean(u.password_hash),phone:identities.find(i=>i.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'',wechat:identities.some(i=>i.provider==='wechat')}));
   const orders=await get('/commerce/orders',user);assert.equal(orders.status,200);assert.match(orders.headers.get('cache-control'),/no-store/);for(const o of (await orders.json()).items){const r=db.prepare('SELECT user_id,order_no,amount_cents FROM orders WHERE id=?').get(o.id);assert.equal(r.user_id,user.id);assert.equal(r.order_no,o.orderNo);assert.equal(r.amount_cents,o.amountCents);}
   for(const route of ['/me/certificates','/learning/ai/allowance']){const r=await get(route,user);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const data=await r.json();if(route.endsWith('allowance')){assert.equal(typeof data.daily.remaining,'number');assert.equal(typeof data.available,'boolean');}}
   if(user.role==='learner')for(const route of ['/admin/readiness','/admin/parsing','/admin/certificates','/admin/analytics'])assert.equal((await get(route,user)).status,403);
  }
  for(const route of ['/admin/readiness','/admin/analytics?days=7','/admin/parsing','/admin/certificates','/admin/commercial/settings']){const r=await get(route,owner);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok(!/Bearer |BEGIN PRIVATE KEY|accessKey|secrets_cipher|sk-[A-Za-z0-9]{16}/.test(JSON.stringify(await r.json())),'No credential disclosure');}
  for(const [name,route] of [['offer','/commerce/offer'],['status','/auth/status'],['resources','/resources'],['entry','/learning/entry'],['projects','/learning/projects'],['service','/service/public']]){
   const res=await get(route);assert.equal(res.status,200);const data=await res.json(),expected=JSON.parse(readFileSync(backup+'/'+name+'.before.json'));
   if(name==='offer'){const valid=db.prepare("SELECT p.pack_id FROM products p JOIN project_packs c ON c.id=p.pack_id AND c.status='published' JOIN learning_paths l ON l.id=c.path_id AND l.status='published' WHERE p.id=? AND p.status='active'").get(expected.productId);assert.equal(data.includesPublishedProjects,Boolean(valid));if(!Object.hasOwn(expected,'includesPublishedProjects'))delete data.includesPublishedProjects;}
   assert.equal(hash(data),hash(expected),'Published configuration retained: '+name);
  }
  const r=await get('/ready');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);protect();
  console.log(JSON.stringify({mode,tables:tables.length,protectedTables:tables.filter(t=>mode==='rehearse'||!transient.has(t.name)).length,schemaChanged:false,providersCalled:0,writeRequests:0}));
 }finally{db.close();before.close();if(server)await new Promise(r=>server.close(r));applicationDb?.close();globalThis.fetch=originalFetch;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await acceptance(...process.argv.slice(2));
