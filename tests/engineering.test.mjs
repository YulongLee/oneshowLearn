import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,mkdirSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {parseEnv} from 'node:util';
import {initialEnvironment,parseEnvironment,validateEnvironment} from '../deploy/portable/environment.mjs';
import {safeDirectory,validateImagePair,verifyBackup} from '../deploy/portable/manage.mjs';
import {onlyLoopbackWebBinding} from '../deploy/portable/container-inspection.mjs';
import {mineruEnvironment} from '../deploy/configure-mineru.mjs';
import {inspectOperations} from '../scripts/check-operations.mjs';
const temp=t=>{const p=realpathSync(mkdtempSync(path.join(tmpdir(),'osl-engineering-unit-')));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;};
const env=()=>initialEnvironment('https://engineering.example.invalid','owner@example.invalid');
test('Nginx preserves mutation guards and separates only a closed set of account GET/HEAD reads',()=>{
 const http=readFileSync('deploy/nginx-oneshowlearn.conf','utf8'),https=readFileSync('deploy/nginx-oneshowlearn-https.conf','utf8'),app=readFileSync('deploy/nginx-oneshowlearn-app.conf','utf8');
 assert.equal(http.split('\n\nserver {')[0],https.split('\n\nserver {')[0]);
 const blocks=[...http.matchAll(/map "\$request_method:\$uri" \$(\w+) \{([\s\S]*?)\n\}/g)];assert.equal(blocks.length,2);
 const expected=['GET','HEAD'].flatMap(method=>['status','me','profile','identities'].map(endpoint=>method+':/api/auth/'+endpoint)).sort();
 for(const block of blocks)assert.deepEqual([...block[2].matchAll(/^\s+"([^"\n]+)"/gm)].map(m=>m[1]).sort(),expected);
 assert.match(blocks[0][2],/default \$binary_remote_addr/);assert.match(blocks[1][2],/default ""/);
 assert.match(http,/zone=oneshowlearn_auth:10m rate=10r\/m/);assert.match(app,/zone=oneshowlearn_auth burst=10 nodelay/);assert.match(app,/zone=oneshowlearn_auth_read burst=30 nodelay/);assert.match(app,/limit_req_status 429/);
});
test('operations checks are read-only, validate selected backup hashes and fail honestly on missing, stale or invalid evidence',async t=>{
 const directory=temp(t),backup=path.join(directory,'backup');mkdirSync(backup);const files={};
 for(const [name,body] of Object.entries({'oneshowlearn.db':'isolated','app.env':'isolated-not-a-secret','deployment.json':'{}'})){writeFileSync(path.join(backup,name),body);files[name]=createHash('sha256').update(body).digest('hex');}
 const createdAt=new Date().toISOString();
 const writeManifest=createdAt=>writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({format:'oneshowlearn-backup-v1',files,...(createdAt?{createdAt}:{})}));
 writeManifest(createdAt);
 const before=readFileSync(path.join(backup,'app.env'),'utf8'),fetcher=async url=>{assert.equal(url.pathname,'/api/ready');return Response.json({ok:true,service:'oneshowlearn-api'});};
 const args={origin:'http://127.0.0.1:8791',dataDirectory:directory,backupDirectory:backup,fetcher,diskStats:()=>({bavail:20n,blocks:100n})};
 assert.equal((await inspectOperations(args)).ok,true);assert.equal(readFileSync(path.join(backup,'app.env'),'utf8'),before);
 assert.equal((await inspectOperations({...args,now:Date.now()+49*3600000})).ok,false);
 writeManifest();assert.equal((await inspectOperations(args)).ok,false);
 writeManifest(new Date(Date.now()-49*3600000).toISOString());assert.equal((await inspectOperations(args)).ok,false,'copying an old manifest must not make a stale backup fresh');
 writeManifest('invalid');assert.equal((await inspectOperations(args)).ok,false);
 writeManifest(new Date(Date.now()+3600000).toISOString());assert.equal((await inspectOperations(args)).ok,false);
 writeManifest(createdAt);
 assert.equal((await inspectOperations({...args,diskStats:()=>({bavail:1n,blocks:100n})})).ok,false);
 assert.equal((await inspectOperations({origin:args.origin,fetcher})).ok,false);
 assert.equal((await inspectOperations({...args,fetcher:async()=>Response.json({ok:true,service:'another-api'})})).ok,false);
 assert.equal((await inspectOperations({...args,fetcher:async()=>new Response('x'.repeat(4097))})).ok,false);
 assert.equal((await inspectOperations({...args,fetcher:async()=>{throw Error('secret-provider-content');}})).checks.some(c=>c.message.includes('secret')),false);
 for(const origin of ['http://public.invalid','https://user:pass@oneshowlearn.com','https://oneshowlearn.com/path','https://oneshowlearn.com?token=secret'])await assert.rejects(()=>inspectOperations({...args,origin}));
 writeFileSync(path.join(backup,'app.env'),'tampered');assert.equal((await inspectOperations(args)).ok,false);
});
test('container inspection accepts unpublished Docker ports but strictly rejects public or unexpected bindings',()=>{
 const binding={HostIp:'127.0.0.1',HostPort:'4188'};
 assert.equal(onlyLoopbackWebBinding({'80/tcp':null,'8080/tcp':[binding]},4188),true);
 assert.equal(onlyLoopbackWebBinding({'8080/tcp':[binding]},4188),true);
 for(const ports of [null,{},[],{'80/tcp':null},{'8080/tcp':[]},{'8080/tcp':[null]},
  {'8080/tcp':[{...binding,HostIp:'0.0.0.0'}]}, {'8080/tcp':[{...binding,HostIp:'::'}]},
  {'8080/tcp':[{...binding,HostPort:'4189'}]}, {'80/tcp':[binding],'8080/tcp':[binding]},
  {'8080/tcp':binding}])assert.equal(onlyLoopbackWebBinding(ports,4188),false);
});
test('portable initialization creates independent server secrets with providers and registration disabled',()=>{
 const a=env(),b=env();assert.equal(a.NODE_ENV,'production');assert.equal(a.REGISTRATION_ENABLED,'false');assert.equal(a.ALLOW_DEV_EMAIL_DELIVERY,'false');assert.equal(a.AI_ENABLED,'false');
 for(const key of ['ADMIN_PASSWORD','JWT_SECRET','AI_CONFIG_ENCRYPTION_KEY','PAYMENT_CONFIG_ENCRYPTION_KEY','AUTH_CONFIG_ENCRYPTION_KEY'])assert.notEqual(a[key],b[key]);
 assert.throws(()=>validateEnvironment({...a,PAYMENT_CONFIG_ENCRYPTION_KEY:a.AI_CONFIG_ENCRYPTION_KEY}));
 assert.throws(()=>validateEnvironment({...a,JWT_SECRET:'short'}));assert.throws(()=>validateEnvironment({...a,REGISTRATION_ENABLED:'true'}));
 assert.throws(()=>validateEnvironment({...a,ALLOW_DEV_EMAIL_DELIVERY:'true'}));
});
test('environment text is literal, rejects duplicates and ambiguous origins',()=>{
 assert.deepEqual(parseEnvironment('# comment\nA=$(not-executed)\nB=literal $ with spaces\n'),{A:'$(not-executed)',B:'literal $ with spaces'});
 assert.throws(()=>parseEnvironment('A=1\nA=2'));assert.throws(()=>parseEnvironment('export A=1'));
 for(const url of ['https://x.invalid/path','https://user:pass@x.invalid','https://x.invalid/?x=1','https://x.invalid/#a','file:///tmp/a'])assert.throws(()=>initialEnvironment(url,'a@b.invalid'));
 assert.throws(()=>validateEnvironment({...env(),APP_ORIGIN:'https://other.invalid'}));
});
test('installation refuses broad, repository, relative, interpolated and symlink targets',t=>{
 const dir=temp(t);assert.equal(safeDirectory(path.join(dir,'instance')),path.join(dir,'instance'));
 for(const p of ['/',process.env.HOME,process.cwd(),'relative','/var',path.join(dir,"a'$x"),dir+'/../x'])assert.throws(()=>safeDirectory(p));
 symlinkSync(dir,path.join(dir,'link'));assert.throws(()=>safeDirectory(path.join(dir,'link','instance')));
});
test('release pairing requires immutable IDs, identical sources and correct roles',()=>{
 const make=role=>({Id:'sha256:'+role.charCodeAt(0).toString(16).repeat(32),Config:{Labels:{'org.opencontainers.image.revision':'test-revision','io.oneshowlearn.source-hash':'ab'.repeat(32),'io.oneshowlearn.role':role}}});
 const api=make('api'),web=make('web'),inspect=v=>v==='api'?api:web;
 assert.equal(validateImagePair('api','web',inspect).api,api.Id);
 assert.throws(()=>validateImagePair('-bad','web',inspect));assert.throws(()=>validateImagePair('web','api',inspect));
 web.Config.Labels['io.oneshowlearn.source-hash']='cd'.repeat(32);assert.throws(()=>validateImagePair('api','web',inspect));
 web.Config.Labels['io.oneshowlearn.source-hash']='ab'.repeat(32);api.Id='mutable:tag';assert.throws(()=>validateImagePair('api','web',inspect));
});
test('backup verification refuses tampering, extra files and linked files',t=>{
 const dir=temp(t),files={};for(const [name,body] of Object.entries({'oneshowlearn.db':'isolated-db','app.env':'not-real','deployment.json':'{}'})){writeFileSync(path.join(dir,name),body);files[name]=createHash('sha256').update(body).digest('hex');}
 writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({format:'oneshowlearn-backup-v1',files}));verifyBackup(dir);
 writeFileSync(path.join(dir,'extra'),'unexpected');assert.throws(()=>verifyBackup(dir));unlinkSync(path.join(dir,'extra'));
 writeFileSync(path.join(dir,'app.env'),'changed');assert.throws(()=>verifyBackup(dir));unlinkSync(path.join(dir,'app.env'));symlinkSync(path.join(dir,'deployment.json'),path.join(dir,'app.env'));assert.throws(()=>verifyBackup(dir));
});
test('explicit migration and owner bootstrap are repeatable without seeding business content',t=>{
 const dir=temp(t),database=path.join(dir,'isolated.db'),settings={...process.env,...env(),DATABASE_PATH:database,UPLOAD_DIR:path.join(dir,'uploads')};
 const run=(file)=>spawnSync(process.execPath,['deploy/portable/'+file+'.mjs'],{env:settings,encoding:'utf8'});
 assert.equal(run('migrate').status,0);assert.equal(run('bootstrap').status,0);
 let db=new DatabaseSync(database);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,1);
 for(const table of ['learning_paths','products','project_packs','practice_projects','orders'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 const password=db.prepare('SELECT password_hash FROM users').get().password_hash;
 db.prepare("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES('ISOLATED-ENGINEERING',1,'paid',49900)").run();
 db.prepare('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)').run(1,JSON.stringify({notes:[{id:'private',body:'isolated retained note'}]}));db.close();
 assert.notEqual(run('bootstrap').status,0);assert.equal(run('migrate').status,0);assert.equal(run('migrate').status,0);
 db=new DatabaseSync(database);try{assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash,password);assert.equal(db.prepare('SELECT amount_cents FROM orders').get().amount_cents,49900);assert.match(db.prepare('SELECT state_json FROM workspace_state').get().state_json,/retained note/);assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');}finally{db.close();}
});
test('portable initialization never overwrites an existing installation or prints secrets',t=>{
 const dir=path.join(temp(t),'install'),args=['deploy/portable/manage.mjs','init','--directory',dir,'--origin','https://new.example.invalid','--admin-email','owner@example.invalid'];
 let result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0);const text=readFileSync(path.join(dir,'app.env'),'utf8'),settings=parseEnvironment(text);
 assert.ok(!result.stdout.includes(settings.ADMIN_PASSWORD));result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(readFileSync(path.join(dir,'app.env'),'utf8'),text);
});
test('MinerU environment installation preserves unrelated settings and rejects silent key replacement',()=>{
 const key='isolated-mineru-token',text='JWT_SECRET="keep-unchanged"\nAI_ENABLED=false\nMINERU_API_KEY=\n';
 const next=mineruEnvironment(text,key);assert.equal(parseEnv(next).JWT_SECRET,'keep-unchanged');assert.equal(parseEnv(next).MINERU_API_KEY,key);assert.equal(mineruEnvironment(next,key),next);assert.equal(next.match(/^MINERU_API_KEY=/gm).length,1);
 assert.throws(()=>mineruEnvironment(next,'different-isolated-token'));assert.throws(()=>mineruEnvironment(text,'bad\nAI_ENABLED=true'));
 try{mineruEnvironment(text,'invalid-private-token!');assert.fail('Expected token rejection');}catch(e){assert.equal(e.message,'Invalid MinerU token format');assert.ok(!e.stack.includes('invalid-private-token!'));assert.equal(e.actual,false);}
});
test('commercial publication checks the deliberately maintained proxy separately before cutover',()=>{
 const source=readFileSync('deploy/update-commercial-completion.sh','utf8');
 assert.match(source,/sha256sum "\$snippet" > "\$backup\/maintenance\.sha256"/);
 assert.match(source,/awk '\$2 != "\/etc\/nginx\/snippets\/oneshowlearn-app\.conf"'/);
 assert.match(source,/sha256sum --quiet -c "\$backup\/maintenance\.sha256"/);
 assert.ok(source.indexOf('"$backup/maintenance.sha256"\n',source.indexOf('DATABASE_PATH='))<source.indexOf('systemctl stop oneshowlearn\nsnapshot'));
});
test('release definitions keep data out of images and production deployment out of CI',()=>{
 const docker=readFileSync('Dockerfile','utf8'),ignore=readFileSync('.dockerignore','utf8'),workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(docker,/USER node/);assert.doesNotMatch(docker,/COPY \. /);assert.match(ignore,/^\*\*$/m);assert.doesNotMatch(ignore,/!\.env|!data|!uploads|!\.git\//);
 for(const name of ['scripts/check-operations.mjs','deploy/configure-mineru.mjs','deploy/update-commercial-completion.sh','deploy/nginx-oneshowlearn.conf','deploy/nginx-oneshowlearn-https.conf','deploy/nginx-oneshowlearn-app.conf']){
  assert.ok(docker.includes(name));assert.ok(ignore.split('\n').includes('!'+name));assert.ok(readFileSync('deploy/portable/manage.mjs','utf8').includes("'"+name+"'"),'verification input included in immutable source hash');
 }
 assert.match(workflow,/npm run check:dependencies/);assert.match(workflow,/npm run test:auth-proxy/);
 assert.match(workflow,/npm run test:deployment/);assert.doesNotMatch(workflow,/secrets\.|ssh |ops -- deploy/);
 assert.match(readFileSync('deploy/portable/compose.yaml','utf8'),/127\.0\.0\.1:/);assert.match(readFileSync('server/config.mjs','utf8'),/host: process.env.API_HOST \|\| "127.0.0.1"/);
});
