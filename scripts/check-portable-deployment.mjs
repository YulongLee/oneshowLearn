// Destructive tests target only two freshly generated, account-free installations.
// Never use live databases, accounts, provider keys or existing Docker projects.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,readdirSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {verifyBackup} from '../deploy/portable/manage.mjs';
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const releaseIndex=process.argv.indexOf('--release'),release=process.argv[releaseIndex+1];
if(releaseIndex<0||!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(release||''))throw Error('Pass the name of an already-built isolated release');
const root=realpathSync(mkdtempSync(path.join(process.platform==='darwin'?'/private/tmp':tmpdir(),'osl-portable-acceptance-'))),installations=[];
const api='oneshowlearn-api:'+release,web='oneshowlearn-web:'+release;
function exec(args,{expected=0,input}={}){
 const result=spawnSync(args[0],args.slice(1),{encoding:'utf8',input,maxBuffer:10*1024*1024});
 if(expected===0&&result.status!==0){console.error(result.stderr);throw Error('Isolated command failed: '+args.slice(0,3).join(' '));}
 if(expected!==0)check(result.status!==0,'unsafe operation rejected');return result.stdout;
}
const ops=(...args)=>exec([process.execPath,'deploy/portable/manage.mjs',...args]);
const state=d=>JSON.parse(readFileSync(path.join(d,'deployment.json'),'utf8'));
const compose=(d,...args)=>exec(['docker','compose','--env-file',path.join(d,'compose.env'),'--project-name',state(d).project,'-f','deploy/portable/compose.yaml',...args]);
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
// Maintenance replaces containers: do not reuse a socket to a stopped version.
async function http(d,route){return fetch('http://127.0.0.1:'+state(d).port+route,{headers:{connection:'close'},signal:AbortSignal.timeout(10000)});}
const query=(d,code)=>compose(d,'exec','-T','api','node','--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync('/app/data/oneshowlearn.db');try{"+code+"}finally{db.close()}");
function fingerprint(d){return compose(d,'exec','-T','api','node','--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';const db=new DatabaseSync('/app/data/oneshowlearn.db',{readOnly:true});const tables=['users','orders','workspace_state'];console.log(createHash('sha256').update(JSON.stringify(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY 1').all()))).digest('hex'));db.close();").trim();}
try {
 exec(['docker','info']);
 const a=path.join(root,'primary');installations.push(a);const p=await port();
 ops('init','--directory',a,'--origin','http://127.0.0.1:'+p,'--port',String(p),'--admin-email','owner@engineering.example.invalid');
 ops('deploy','--directory',a,'--api',api,'--web',web,'--bootstrap');
 console.log('Isolated empty installation started');
 let response=await http(a,'/api/ready');check(response.ok,'database readiness');check(response.headers.get('cache-control')==='no-store','readiness never cached');check((await response.json()).service==='oneshowlearn-api','correct application');
 response=await http(a,'/');check(response.ok&&(await response.text()).includes('id="root"'),'compiled homepage served');
 for(const route of ['/app','/courses','/notes','/account','/tutor']){response=await http(a,route);check(response.ok&&(await response.text()).includes('id="root"'),'SPA entry '+route);}
 for(const route of ['/api/auth/me','/api/me/workspace','/api/admin/orders']){response=await http(a,route);check([401,403].includes(response.status),'anonymous private gate '+route);}
 const ids=compose(a,'ps','-q').trim().split(/\s+/),containers=JSON.parse(exec(['docker','inspect',...ids]));
 check(containers.every(c=>c.HostConfig.ReadonlyRootfs),'read-only code containers');
 const apiContainer=containers.find(c=>c.Config.Labels['com.docker.compose.service']==='api');
 check(apiContainer.Config.User&&!apiContainer.Config.User.startsWith('0:'),'non-root API');check(!Object.values(apiContainer.NetworkSettings.Ports||{}).some(Boolean),'API port not exposed');
 const webContainer=containers.find(c=>c.Config.Labels['com.docker.compose.service']==='web');
 check(Object.values(webContainer.NetworkSettings.Ports).flat().every(p=>p.HostIp==='127.0.0.1'),'HTTP bound to loopback');
 check(containers.every(c=>c.HostConfig.LogConfig.Config['max-size']==='10m'),'bounded logs');
 check(query(a,"console.log(db.prepare('SELECT COUNT(*) n FROM users').get().n)").trim()==='1','only owner initialized');
 for(const table of ['products','project_packs','learning_paths','practice_projects','orders'])check(query(a,`console.log(db.prepare('SELECT COUNT(*) n FROM ${table}').get().n)`).trim()==='0','no sample '+table);
 query(a,"db.prepare(\"INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES('ISOLATED-DEPLOYMENT',1,'paid',49900)\").run();db.prepare('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)').run(1,JSON.stringify({notes:[{id:'isolated',body:'retained local fixture'}]}));");
 writeFileSync(path.join(a,'uploads-private/isolated.txt'),'ISOLATED PRIVATE UPLOAD');writeFileSync(path.join(a,'uploads/isolated.txt'),'ISOLATED PUBLIC UPLOAD');
 const before=fingerprint(a),keys=readFileSync(path.join(a,'app.env'),'utf8');
 writeFileSync(path.join(a,'static-assets/old-tab-fixture.js'),'/* isolated retained chunk */');
 query(a,"db.prepare('INSERT INTO payment_checkout_locks(user_id,token,lease_until) VALUES(?,?,?)').run(1,'isolated-lease',Math.floor(Date.now()/1000)+120);");
 exec([process.execPath,'deploy/portable/manage.mjs','deploy','--directory',a,'--api',api,'--web',web,'--allow-maintenance'],{expected:1});
 check((await http(a,'/api/ready')).ok,'active operation refuses maintenance without stopping service');
 check(query(a,"console.log(db.prepare('SELECT token FROM payment_checkout_locks WHERE user_id=1').get().token)").trim()==='isolated-lease','maintenance never clears active payment lease');
 query(a,"db.prepare(\"DELETE FROM payment_checkout_locks WHERE user_id=1 AND token='isolated-lease'\").run();");
 exec([process.execPath,'deploy/portable/manage.mjs','deploy','--directory',a,'--api',api,'--web',web],{expected:1});check((await http(a,'/api/ready')).ok,'refused upgrade stays healthy');
 exec([process.execPath,'deploy/portable/manage.mjs','backup','--directory',a],{expected:1});check(fingerprint(a)===before,'online backup refusal retains records');
 ops('deploy','--directory',a,'--api',api,'--web',web,'--allow-maintenance');
 check(fingerprint(a)===before,'upgrade preserves all fixture values');check(readFileSync(path.join(a,'app.env'),'utf8')===keys,'upgrade preserves encryption/session secrets');
 response=await http(a,'/assets/old-tab-fixture.js');check(response.ok&&(await response.text()).includes('retained chunk'),'old browser chunks retained across upgrade');
 check(readFileSync(path.join(a,'uploads-private/isolated.txt'),'utf8')==='ISOLATED PRIVATE UPLOAD','upgrade preserves private file');
 ops('rollback','--directory',a,'--allow-maintenance');check(fingerprint(a)===before,'code rollback does not rewind business data');
 console.log('Isolated upgrade and code rollback verified');
 // Build a deliberately broken migration candidate from the same test image.
 // Only a uniquely named fixture image is changed; never mutate the release itself.
 const bad='oneshowlearn-broken-qa:'+randomUUID(),dockerfile=`FROM ${api}\nUSER root\nRUN chmod 000 /app/deploy/portable/migrate.mjs\nUSER node\n`;let badCreated=false;
 try{
  exec(['docker','build','-t',bad,'-'],{input:dockerfile});badCreated=true;
  exec([process.execPath,'deploy/portable/manage.mjs','deploy','--directory',a,'--api',bad,'--web',web,'--allow-maintenance'],{expected:1});
  check((await http(a,'/api/ready')).ok,'failed migration restores previous serving image');check(fingerprint(a)===before,'failed upgrade retains database');check(state(a).current.api!==JSON.parse(exec(['docker','inspect',bad]))[0].Id,'failed image not activated');
  console.log('Deliberate migration failure recovered without database rollback');
 }finally{if(badCreated)exec(['docker','image','rm',bad]);}
 ops('stop','--directory',a);ops('backup','--directory',a);
 const backup=path.join(a,'backups',readdirSync(path.join(a,'backups')).sort().at(-1));verifyBackup(backup);check(true,'complete hashed database/files/env snapshot verified');
 const b=path.join(root,'restored');installations.push(b);ops('restore','--directory',b,'--from',backup,'--port',String(await port()));
 check(readFileSync(path.join(b,'app.env'),'utf8')===keys,'restore preserves original keys and origin');
 check(readFileSync(path.join(b,'uploads-private/isolated.txt'),'utf8')==='ISOLATED PRIVATE UPLOAD','restore preserves private files');
 check(readFileSync(path.join(b,'static-assets/old-tab-fixture.js'),'utf8').includes('retained chunk'),'restore preserves earlier static chunks');
 ops('deploy','--directory',b,'--api',api,'--web',web,'--allow-maintenance');check((await http(b,'/api/ready')).ok,'restored installation starts');check(fingerprint(b)===before,'migration to new directory preserves complete business values');
 const out=path.resolve('artifacts/engineering');mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'portable-acceptance.json'),JSON.stringify({checks,release,verifiedAt:new Date().toISOString(),nodePolicy:'22',sourceHash:state(b).current.sourceHash,privateEvidenceExcluded:true},null,2));
 console.log(`PASS ${checks} isolated portable deployment checks; new install, guards, upgrade, failed migration recovery, code rollback, consistent backup and restore`);
}finally {
 for(const dir of installations)if(existsSync(path.join(dir,'compose.env'))){const s=state(dir);check(/^osl-[a-f0-9]{12}$/.test(s.project),'isolated cleanup project');compose(dir,'down','--remove-orphans');}
 if(path.basename(root).startsWith('osl-portable-acceptance-'))rmSync(root,{recursive:true,force:true});
}
