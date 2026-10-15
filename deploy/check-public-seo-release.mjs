// Root-only existing-systemd acceptance. Never migrate, restore records or call providers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {parseEnv} from 'node:util';
import {readFileSync,writeFileSync,readdirSync,lstatSync,readlinkSync,existsSync,chmodSync,copyFileSync,mkdtempSync,renameSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

export const reviewedModules=['index','payment-configuration','public-seo','public-seo-data','public-seo-model'];
export const publicAssetLocation='location ^~ /assets/ {\n    expires 7d;\n    add_header X-Content-Type-Options "nosniff" always;\n    try_files $uri =404;\n}';
export const transientTables=new Set(['auth_rate_limits','login_challenges','payment_checkout_locks']);
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const encode=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?{$integer:item.toString()}:item instanceof Uint8Array?{$bytes:Buffer.from(item).toString('base64')}:item);
export const valueHash=value=>digest(encode(value));
const app='/var/www/oneshowlearn',envPath='/etc/oneshowlearn/oneshowlearn.env',node='/opt/node-v22/bin/node',snippet='/etc/nginx/snippets/oneshowlearn-app.conf';
const publicSnapshots={offer:'/commerce/offer',status:'/auth/status',resources:'/resources',entry:'/learning/entry',projects:'/learning/projects',service:'/service/public'};
const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
function privateJson(file,value){writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});chmodSync(file,0o600);}
export function treeState(root){
  const state={};
  function visit(dir){for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name),relative=path.relative(root,file),stat=lstatSync(file);assert.ok(!/[\r\n]/.test(relative),'Safe runtime path');if(stat.isSymbolicLink())state[relative]={link:readlinkSync(file)};else if(stat.isDirectory())visit(file);else {assert.ok(stat.isFile(),'Only ordinary files in protected tree');state[relative]={hash:digest(readFileSync(file)),mode:stat.mode&0o777};}}}
  visit(root);return state;
}
function fileStates(files){return Object.fromEntries(files.filter(existsSync).sort().map(file=>[file,{hash:digest(readFileSync(file)),mode:lstatSync(file).mode&0o777}]));}
export function databaseState(file){
  const db=new DatabaseSync(file,{readOnly:true});
  try{db.exec('PRAGMA busy_timeout=5000; BEGIN');assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok','Database integrity');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'Foreign-key integrity');
    const schema=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all(),names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name),tables={};
    for(const name of names){assert.match(name,/^[a-zA-Z_][a-zA-Z_0-9]*$/);const statement=db.prepare('SELECT * FROM "'+name+'"');statement.setReadBigInts(true);tables[name]=valueHash(statement.all().map(encode).sort());}
    db.exec('COMMIT');return {schema:valueHash(schema),tables};
  }finally{db.close();}
}
export function compareDatabase(actual,expected,{all=false,schemaOnly=false}={}){
  assert.equal(actual.schema,expected.schema,'Exact database schema retained; no migration');assert.deepEqual(Object.keys(actual.tables),Object.keys(expected.tables),'Exact table set retained');
  if(!schemaOnly)for(const name of Object.keys(expected.tables))if(all||!transientTables.has(name))assert.equal(actual.tables[name],expected.tables[name],'Full protected table values retained: '+name);
}
export function validateAcceptance(proof,{stage,backup,manifest,assets}){
  assert.equal(proof.stage,stage);assert.equal(proof.backup,backup);assert.equal(proof.releaseManifest,manifest);assert.match(proof.gitCommit,/^[a-f0-9]{40}$/);assert.equal(proof.ciSuccess,true);assert.ok(Number.isSafeInteger(proof.ciId)&&proof.ciId>0);assert.equal(proof.providerRequests,0);assert.equal(proof.writeRequests,0);assert.ok(Number.isSafeInteger(proof.copyBrowser)&&proof.copyBrowser>0);
  assert.deepEqual(Object.keys(proof.counts).sort(),['anonymous','promotion','seo','staticAssets']);for(const count of Object.values(proof.counts))assert.ok(Number.isSafeInteger(count)&&count>0);assert.equal(proof.counts.staticAssets,assets,'Every compiled asset accepted before final receipt');
}
function services({allowStoppedApplication=false}={}){
  const output=execFileSync('systemctl',['show','oneshowlearn','nginx','oneshowseo','pocketledger','-p','Id','-p','MainPID','-p','NRestarts','-p','ActiveState'],{encoding:'utf8'});
  const result=Object.fromEntries(output.trim().split(/\n\s*\n/).map(block=>{const row=Object.fromEntries(block.split('\n').map(line=>{const at=line.indexOf('=');assert.ok(at>0);return [line.slice(0,at),line.slice(at+1)];}));return [row.Id,row];}));
  assert.equal(Object.keys(result).length,4);for(const row of Object.values(result)){if(allowStoppedApplication&&row.Id==='oneshowlearn.service'&&row.ActiveState==='inactive'){assert.equal(row.MainPID,'0');}else{assert.equal(row.ActiveState,'active','Protected service active');assert.ok(Number(row.MainPID)>1);}assert.equal(row.NRestarts,'0','No crash restart');}return result;
}
export function assertProxyPair(original,next,maintenance){
  const root=/location \/ \{\n[\s\S]*?\n\}/g,roots=original.match(root);assert.equal(roots?.length,1,'One reviewed original document location');
  const newRoots=next.match(root);assert.equal(newRoots?.length,1,'One paired document location');assert.equal(next,original.replace(root,publicAssetLocation+'\n\n'+newRoots[0]),'Only exact public-asset/document routing changes; API/auth/uploads/other static policy retained');
  assert.match(newRoots[0],/if \(\$request_method !~ \^\(GET\|HEAD\)\$\) \{ return 405; \}/,'Document proxy never introduces a write-rate-limit bypass');
  assert.match(newRoots[0],/if \(\$uri ~\* \^\/\(api\|uploads\)\(\/\|\$\)\) \{ return 404; \}/,'Noncanonical API/upload spelling cannot enter the document proxy');
  assert.match(newRoots[0],/proxy_pass http:\/\/127\.0\.0\.1:8791;/);assert.match(newRoots[0],/proxy_set_header Cookie "";/);assert.match(newRoots[0],/proxy_set_header Authorization "";/);assert.ok(!newRoots[0].includes('try_files'),'Directory index cannot bypass raw SSR');
  for(const zone of ['oneshowlearn_auth_write_v2','oneshowlearn_auth_read'])assert.equal((next.match(new RegExp('limit_req zone='+zone+' ','g'))||[]).length,1,'Existing authentication limits retained');
  const expected=original.replace(/(location (?:\^~ \/(?:api\/(?:auth\/)?|uploads\/)|\/) \{)/g,'$1\n    add_header Retry-After 30 always;\n    return 503;');
  assert.equal(maintenance,expected,'Maintenance blocks documents, APIs and uploads using the exact live proxy');
}
function verifyGuard(stage,backup,phase){
  assert.ok(['original','maintenance','post','rollback'].includes(phase));const guard=readJson(backup+'/guard.json');
  assert.equal(valueHash(treeState(app+'/node_modules')),valueHash(guard.runtime),'Installed dependency bytes/modes/links unchanged');
  assert.deepEqual(fileStates(Object.keys(guard.protectedFiles)),guard.protectedFiles,'Private environment, keys, unit, site and Node bytes/modes retained');
  const current=services({allowStoppedApplication:phase==='maintenance'});for(const id of ['nginx.service','oneshowseo.service','pocketledger.service'])assert.deepEqual(current[id],guard.services[id],'Unrelated service identity retained');
  if(phase==='original')assert.deepEqual(current['oneshowlearn.service'],guard.services['oneshowlearn.service'],'No early application restart');
  const oldAssets=guard.oldAssets,currentAssets=treeState(app+'/dist/client/assets');for(const [name,stat] of Object.entries(oldAssets))assert.deepEqual(currentAssets[name],stat,'Every previous asset retained: '+name);
  const released=existsSync(backup+'/release.db'),expected=databaseState(backup+((phase==='original'||phase==='rollback'||!released)?'/before.db':'/release.db'));compareDatabase(databaseState(app+'/data/oneshowlearn.db'),expected,{schemaOnly:phase==='rollback'||(phase==='maintenance'&&!released)});
  console.log(JSON.stringify({mode:'verify-guard',phase,exactSchema:true,protectedTables:phase==='rollback'?0:Object.keys(expected.tables).filter(name=>!transientTables.has(name)).length,runtimeFiles:Object.keys(guard.runtime).length,oldAssets:Object.keys(oldAssets).length,privateEnvironmentChanged:false,otherServicesChanged:false}));
}
async function capture(stage,backup){
  assertProxyPair(readFileSync(backup+'/oneshowlearn-app.conf','utf8'),readFileSync(stage+'/nginx-app.conf','utf8'),readFileSync(stage+'/nginx-maintenance.conf','utf8'));
  assert.equal(digest(readFileSync(app+'/package-lock.json')),digest(readFileSync(stage+'/package-lock.json')),'Exact dependency lock retained');
  const old=readJson(app+'/package.json'),next=readJson(stage+'/package.json');for(const field of ['dependencies','devDependencies','engines','type'])assert.deepEqual(next[field],old[field],'No dependency/runtime contract change: '+field);
  const files=[envPath,node,'/etc/systemd/system/oneshowlearn.service','/etc/nginx/sites-available/oneshowlearn','/etc/nginx/sites-available/default','/etc/nginx/sites-available/oneshowseo','/etc/nginx/sites-available/pocketledger',app+'/package-lock.json',...['.ai-config.key','.payment-config.key','.auth-config.key'].map(file=>app+'/data/'+file)];
  const guard={format:'oneshowlearn-public-seo-guard-v1',createdAt:new Date().toISOString(),services:services(),runtime:treeState(app+'/node_modules'),protectedFiles:fileStates(files),oldAssets:treeState(app+'/dist/client/assets'),before:databaseState(backup+'/before.db')};
  privateJson(backup+'/guard.json',guard);
  for(const [name,route] of Object.entries(publicSnapshots)){const response=await fetch('http://127.0.0.1:8791/api'+route,{signal:AbortSignal.timeout(20000),redirect:'error'});assert.equal(response.status,200,'Fresh public baseline '+name);const data=await response.json(),file=backup+'/'+name+'.before.json';if(existsSync(file))assert.equal(valueHash(readJson(file)),valueHash(data),'Fresh baseline agrees');else privateJson(file,data);}
  console.log(JSON.stringify({mode:'capture',tables:Object.keys(guard.before.tables).length,protectedFiles:Object.keys(guard.protectedFiles).length,runtimeFiles:Object.keys(guard.runtime).length,oldAssets:Object.keys(guard.oldAssets).length,providersCalled:0,writeRequests:0}));
}
async function startRehearsal(stage,backup){
  const privateEnv=parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8'));
  // Only non-secret origin preferences cross into the isolated process. Actual
  // public login capabilities are replayed from the just-fetched public baseline;
  // no merchant/model/email/parse credentials or encryption keys are copied.
  Object.assign(process.env,{NODE_ENV:'production',APP_URL:privateEnv.APP_URL||'https://oneshowlearn.com',APP_ORIGIN:privateEnv.APP_ORIGIN||'https://oneshowlearn.com',API_PORT:'0',API_HOST:'127.0.0.1',DATABASE_PATH:stage+'/rehearsal/copy.db',UPLOAD_DIR:stage+'/rehearsal/uploads',JWT_SECRET:'public-seo-query-only-rehearsal',ADMIN_PASSWORD:'isolated-not-a-real-account-password',EMAIL_PROVIDER:'resend',EMAIL_FROM:'rehearsal@example.invalid',EMAIL_API_KEY:'blocked-placeholder',DATABASE_AUTO_MIGRATE:'false',ASSET_STORAGE:'local'});
  // Preserve the installation's legacy startup contract without changing its
  // environment or production records. Prove that its already-installed schema
  // bootstrap is value/schema-neutral on a separate snapshot before restart.
  const startup=mkdtempSync(stage+'/rehearsal/startup-')+'/copy.db';copyFileSync(backup+'/before.db',startup);
  const startupEnv={PATH:path.dirname(node)+':/usr/bin:/bin',NODE_ENV:'production',APP_URL:process.env.APP_URL,APP_ORIGIN:process.env.APP_ORIGIN,DATABASE_PATH:startup,JWT_SECRET:'isolated-startup-only',ADMIN_PASSWORD:'isolated-not-a-real-password',EMAIL_PROVIDER:'resend',EMAIL_FROM:'rehearsal@example.invalid',EMAIL_API_KEY:'blocked-placeholder'};
  if(privateEnv.DATABASE_AUTO_MIGRATE!==undefined)startupEnv.DATABASE_AUTO_MIGRATE=privateEnv.DATABASE_AUTO_MIGRATE;
  execFileSync(node,['--input-type=module','-e','const {db}=await import('+JSON.stringify(pathToFileURL(stage+'/rehearsal/server/db.mjs').href)+');db.close();'],{env:startupEnv,stdio:['ignore','pipe','pipe'],timeout:30000});
  compareDatabase(databaseState(startup),databaseState(backup+'/before.db'),{all:true});
  let providers=0,writes=0,allowedOrigin='';const originalFetch=globalThis.fetch,originalHttp={request:http.request,get:http.get},originalHttps={request:https.request,get:https.get};
  const forbidden=()=>{providers++;throw Error('External/provider operation forbidden in rehearsal');};
  globalThis.fetch=(input,options={})=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=options.method||(typeof input==='object'?input.method:undefined)||'GET';if(url.origin!==allowedOrigin)return forbidden();if(!['GET','HEAD'].includes(method)){writes++;throw Error('Write forbidden in rehearsal');}return originalFetch(input,options);};
  http.request=forbidden;http.get=forbidden;https.request=forbidden;https.get=forbidden;syncBuiltinESMExports();
  let server,applicationDb;
  try{
    const {paymentTransport}=await import(pathToFileURL(stage+'/rehearsal/server/payment-providers.mjs'));for(const key of ['fetch','alipay','alipayConfirmMissing','client'])paymentTransport[key]=forbidden;
    const {courseAIService}=await import(pathToFileURL(stage+'/rehearsal/server/course-ai-service.mjs'));courseAIService.configure({generate:forbidden});
    const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));({db:applicationDb}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs')));applicationDb.exec('PRAGMA query_only=ON');
    const express=createRequire(app+'/package.json')('express'),wrapper=express();wrapper.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)){writes++;return res.sendStatus(405);}return next();});
    wrapper.get('/api/auth/status',(_req,res)=>res.json(readJson(backup+'/status.before.json')));
    // Assets only; no index fallback is allowed to hide real document statuses.
    wrapper.use('/assets',express.static(stage+'/client/assets',{index:false,redirect:false,fallthrough:false}));wrapper.use(createApp({mineruProvider:null,assetStorage:null}));
    server=wrapper.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});allowedOrigin='http://127.0.0.1:'+server.address().port;
    return {base:allowedOrigin,secret:process.env.JWT_SECRET,counts:()=>({providers,writes}),async close(){await new Promise(resolve=>server.close(resolve));applicationDb.close();globalThis.fetch=originalFetch;Object.assign(http,originalHttp);Object.assign(https,originalHttps);syncBuiltinESMExports();compareDatabase(databaseState(stage+'/rehearsal/copy.db'),databaseState(backup+'/before.db'),{all:true});assert.equal(providers,0);assert.equal(writes,0);}};
  }catch(error){if(server)await new Promise(resolve=>server.close(resolve));applicationDb?.close();globalThis.fetch=originalFetch;Object.assign(http,originalHttp);Object.assign(https,originalHttps);syncBuiltinESMExports();throw error;}
}
function jsonBlocks(html,id){return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(match=>new RegExp('(?:id=["\']'+id+'["\'])').test(match[1])).map(match=>JSON.parse(match[2]));}
async function acceptance(mode,stage,backup,{serve=false}={}){
  const rehearsal=mode==='rehearse'?await startRehearsal(stage,backup):null;
  const base=rehearsal?.base||(mode==='https'?'https://oneshowlearn.com':'http://127.0.0.1:8791'),secret=rehearsal?.secret||parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8')).JWT_SECRET;
  const db=new DatabaseSync(rehearsal?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db',{readOnly:true}),expected=databaseState(backup+(rehearsal?'/before.db':'/release.db')),jwt=createRequire(app+'/package.json')('jsonwebtoken');let checks=0;
  const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
  const get=(route,user)=>fetch(base+route,{signal:AbortSignal.timeout(20000),redirect:'error',headers:user?{Authorization:'Bearer '+jwt.sign({sub:user.id,ver:user.token_version},secret,{expiresIn:'3m'})}:{}});
  try{
    compareDatabase(databaseState(rehearsal?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db'),expected,{all:Boolean(rehearsal)});
    for(const [name,route] of Object.entries(publicSnapshots)){const res=await get('/api'+route);equal(res.status,200,'Public '+name);equal(valueHash(await res.json()),valueHash(readJson(backup+'/'+name+'.before.json')),'Exact actual public configuration: '+name);}
    for(const route of ['/api/me/workspace','/api/auth/profile','/api/auth/identities','/api/commerce/orders','/api/admin/readiness','/api/admin/certificates','/api/admin/parsing'])equal((await get(route)).status,401,'Anonymous gate '+route);
    const users=db.prepare("SELECT id,role,token_version FROM users WHERE status='active' AND email_verified=1 ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END,id LIMIT 2").all();assert.ok(users.length);
    for(const user of users){
      const workspace=await get('/api/me/workspace',user);equal(workspace.status,200,'Own workspace');assert.match(workspace.headers.get('cache-control'),/no-store/);const saved=JSON.parse(db.prepare('SELECT state_json FROM workspace_state WHERE user_id=?').get(user.id)?.state_json||'{"tasks":[],"notes":[],"favorites":[],"checkIns":[]}');equal(valueHash((await workspace.json()).state),valueHash(saved),'Own complete saved workspace retained');
      const response=await get('/api/auth/profile',user);equal(response.status,200,'Own profile');assert.match(response.headers.get('cache-control'),/no-store/);const u=db.prepare('SELECT name,email,email_verified,password_hash,created_at FROM users WHERE id=?').get(user.id),p=db.prepare('SELECT bio,avatar,revision FROM account_profiles WHERE user_id=?').get(user.id);equal(valueHash(await response.json()),valueHash({hasPassword:Boolean(u.password_hash),name:u.name,email:u.email,emailVerified:Boolean(u.email_verified),createdAt:u.created_at,bio:p?.bio||'',avatar:p?.avatar||'',version:valueHash([u.name,p?.revision||0])}),'Own profile/revision retained');
      const identities=db.prepare('SELECT provider,subject FROM login_identities WHERE user_id=?').all(user.id),bindings=await get('/api/auth/identities',user);equal(bindings.status,200,'Own masked identities');equal(valueHash(await bindings.json()),valueHash({hasPassword:Boolean(u.password_hash),phone:identities.find(item=>item.provider==='phone')?.subject.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')||'',wechat:identities.some(item=>item.provider==='wechat')}),'Own masked bindings retained');
      const orders=await get('/api/commerce/orders',user);equal(orders.status,200,'Own bounded orders');assert.match(orders.headers.get('cache-control'),/no-store/);for(const order of (await orders.json()).items){const record=db.prepare('SELECT user_id,order_no,amount_cents FROM orders WHERE id=?').get(order.id);equal(record.user_id,user.id,'Order ownership');equal(record.order_no,order.orderNo,'Order identity');equal(record.amount_cents,order.amountCents,'Order amount');}
      if(user.role==='learner')equal((await get('/api/admin/readiness',user)).status,403,'Learner cannot read admin');
    }
    const offer=readJson(backup+'/offer.before.json'),home=await get('/'),homeHtml=await home.text();equal(home.status,200,'Actual homepage SSR');assert.match(home.headers.get('content-type'),/text\/html/);assert.match(homeHtml,/<div id="root">[\s\S]*?class="sales-page/);assert.match(homeHtml,/Cody老师/);assert.match(homeHtml,/OneShowAiLab/);assert.match(homeHtml,/<link rel="canonical" href="https:\/\/oneshowlearn\.com\/"/);equal(jsonBlocks(homeHtml,'public-bootstrap').length,1,'One actual anonymous bootstrap');
    assert.ok(typeof offer.slug==='string'&&offer.slug);const coursePath='/course-offer?course='+encodeURIComponent(offer.slug),course=await get(coursePath),courseHtml=await course.text();equal(course.status,200,'Actual offered course SSR');assert.match(courseHtml,/class="co-layout"/);assert.match(courseHtml,/CourseOffer-[\w-]+\.css/);const boot=jsonBlocks(courseHtml,'public-bootstrap');equal(boot.length,1,'One actual course bootstrap');equal(boot[0].slug,offer.slug,'Actual offered slug');
    for(const html of [homeHtml,courseHtml]){assert.doesNotMatch(html,/secrets_cipher|password_hash|BEGIN (?:RSA )?PRIVATE KEY|sk-[A-Za-z0-9]{24}/);equal(jsonBlocks(html,'public-schema').length,1,'One factual structured-data graph');}
    for(const [route,mime] of [['/robots.txt','text/plain'],['/sitemap.xml','application/xml'],['/llms.txt','text/plain']]){const res=await get(route),text=await res.text();equal(res.status,200,'Crawler endpoint '+route);assert.ok(res.headers.get('content-type')?.includes(mime));assert.ok(!text.includes('<div id="root"'));}
    for(const route of ['/seo-release-no-such-route-20261015','/course-offer?course=seo-release-unpublished-20261015']){const res=await get(route);equal(res.status,404,'True unknown/unpublished 404');assert.match(res.headers.get('x-robots-tag'),/noindex/);}
    for(const route of ['/app','/account','/notes','/favorites','/tutor','/admin/login',coursePath+'&return=readonly-release']){const res=await get(route),text=await res.text();equal(res.status,200,'Known private shell available');assert.match(res.headers.get('x-robots-tag'),/noindex/);equal(jsonBlocks(text,'public-bootstrap').length,0,'No bootstrap on private/return shells');}
    const ready=await get('/api/ready');equal(ready.status,200,'Readiness');equal((await ready.json()).ok,true,'Readiness okay');compareDatabase(databaseState(rehearsal?stage+'/rehearsal/copy.db':app+'/data/oneshowlearn.db'),expected,{all:Boolean(rehearsal)});
    console.log(JSON.stringify({mode,checks,exactSchema:true,protectedTables:Object.keys(expected.tables).filter(name=>rehearsal||!transientTables.has(name)).length,writeRequests:0,providersCalled:0,privateEnvironmentChanged:false,publicLoginStatusReplay:Boolean(rehearsal),...(serve?{rehearsalOrigin:base,processId:process.pid}:{})}));
    if(serve){console.log('REHEARSAL_READY '+base);await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});}
  }finally{db.close();await rehearsal?.close();if(serve)console.log(JSON.stringify({mode:'rehearsal-closed',allTableValuesUnchanged:true,exactSchema:true,providersCalled:rehearsal.counts().providers,writeRequests:rehearsal.counts().writes}));}
}
async function receipt(stage,backup){
  const proof=readJson(backup+'/browser-acceptance.json');validateAcceptance(proof,{stage,backup,manifest:digest(readFileSync(stage+'/release.sha256')),assets:Object.keys(treeState(stage+'/client/assets')).length});
  verifyGuard(stage,backup,'post');for(const name of reviewedModules)assert.equal(digest(readFileSync(app+'/server/'+name+'.mjs')),digest(readFileSync(stage+'/server/'+name+'.mjs')));
  for(const relative of ['package.json','package-lock.json'])assert.equal(digest(readFileSync(app+'/'+relative)),digest(readFileSync(stage+'/'+relative)));
  assert.equal(digest(readFileSync(snippet)),digest(readFileSync(stage+'/nginx-app.conf')));
  const expected=treeState(stage+'/render');assert.deepEqual(treeState(app+'/dist/render'),Object.fromEntries(Object.entries(expected).map(([file,value])=>[file,{...value,mode:0o644}])),'Exact complete SSR runtime pair');
  for(const [relative,state] of Object.entries(treeState(stage+'/client'))){const live=lstatSync(app+'/dist/client/'+relative);assert.ok(live.isFile());assert.equal(digest(readFileSync(app+'/dist/client/'+relative)),state.hash,'Exact compiled client '+relative);}
  const recovery=readJson(backup+'/recovery.json');assert.equal(recovery.rollbackArmed,true,'Outer rollback remains armed until final acceptance');
  compareDatabase(databaseState(backup+'/data/oneshowlearn.db'),databaseState(backup+'/release.db'),{all:true});
  const result={format:'oneshowlearn-public-seo-receipt-v1',createdAt:new Date().toISOString(),stage,backup,gitCommit:proof.gitCommit,ciId:proof.ciId,checks:proof.counts,releaseManifest:digest(readFileSync(stage+'/release.sha256')),entry:digest(readFileSync(app+'/dist/client/index.html')),privateEnvironmentChanged:false,schemaChanged:false,dependenciesChanged:false,providersCalled:0,writeRequests:0,rollback:'code/render/template/manifest/proxy only; never restore old database over current records',services:services()};
  privateJson(backup+'/receipt.json',result);
  const files=treeState(backup);privateJson(backup+'/files.json',files);assert.deepEqual(treeState(backup),{...files,'files.json':{hash:digest(readFileSync(backup+'/files.json')),mode:0o600}});
  // This is the sole commit marker. All fallible code/data/backup verification
  // precedes its atomic rename, so a partial receipt never disables rollback.
  const final={...recovery,rollbackArmed:false,acceptedAt:result.createdAt,receiptSha256:digest(readFileSync(backup+'/receipt.json')),backupManifestSha256:digest(readFileSync(backup+'/files.json'))};
  privateJson(backup+'/recovery.final.next',final);assert.deepEqual(readJson(backup+'/recovery.final.next'),final);renameSync(backup+'/recovery.final.next',backup+'/recovery.final.json');
  console.log(JSON.stringify({mode:'receipt',backup,backupFiles:Object.keys(files).length,receiptSha256:final.receiptSha256,backupManifestSha256:final.backupManifestSha256,accepted:true}));
}
function verifyReceipt(stage,backup){
  const final=readJson(backup+'/recovery.final.json');assert.equal(final.rollbackArmed,false);assert.equal(final.stage,stage);assert.equal(final.backup,backup);assert.equal(digest(readFileSync(backup+'/receipt.json')),final.receiptSha256);assert.equal(digest(readFileSync(backup+'/files.json')),final.backupManifestSha256);
  const manifest=readJson(backup+'/files.json'),actual=treeState(backup);assert.deepEqual(Object.keys(actual).sort(),[...Object.keys(manifest),'files.json','recovery.final.json'].sort(),'Exact recoverable backup coverage');for(const [file,state] of Object.entries(manifest))assert.deepEqual(actual[file],state,'Sealed private backup '+file);
  console.log(JSON.stringify({mode:'verify-receipt',backup,backupFiles:Object.keys(manifest).length,receiptSha256:final.receiptSha256,backupManifestSha256:final.backupManifestSha256,accepted:true}));
}
async function main(){
  const [mode,stage,backup,phase='original']=process.argv.slice(2);assert.equal(process.getuid(),0,'Root-only private acceptance');assert.match(stage||'',/^\/tmp\/oneshowlearn-seo-[a-zA-Z0-9]+$/);assert.match(backup||'',/^\/var\/backups\/oneshowlearn\/seo-[a-zA-Z0-9]+$/);for(const dir of [stage,backup])assert.ok(lstatSync(dir).isDirectory()&&!lstatSync(dir).isSymbolicLink());
  if(mode==='capture')return capture(stage,backup);if(mode==='verify-guard')return verifyGuard(stage,backup,phase);if(mode==='receipt')return receipt(stage,backup);if(mode==='verify-receipt')return verifyReceipt(stage,backup);if(['rehearse','live','https','serve-rehearsal'].includes(mode))return acceptance(mode==='serve-rehearsal'?'rehearse':mode,stage,backup,{serve:mode==='serve-rehearsal'});throw Error('Unsupported public SEO acceptance mode');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{console.error('Public SEO acceptance failed:',error.code||error.name);if(error instanceof assert.AssertionError)console.error(String(error.message).split('\n')[0]);process.exitCode=1;});
