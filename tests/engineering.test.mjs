import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync,mkdirSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {initialEnvironment,parseEnvironment,validateEnvironment} from '../deploy/portable/environment.mjs';
import {safeDirectory,validateImagePair,verifyBackup} from '../deploy/portable/manage.mjs';
const temp=t=>{const p=realpathSync(mkdtempSync(path.join(tmpdir(),'osl-engineering-unit-')));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;};
const env=()=>initialEnvironment('https://engineering.example.invalid','owner@example.invalid');
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
test('release definitions keep data out of images and production deployment out of CI',()=>{
 const docker=readFileSync('Dockerfile','utf8'),ignore=readFileSync('.dockerignore','utf8'),workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(docker,/USER node/);assert.doesNotMatch(docker,/COPY \. /);assert.match(ignore,/^\*\*$/m);assert.doesNotMatch(ignore,/!\.env|!data|!uploads|!\.git\//);
 assert.match(workflow,/npm run test:deployment/);assert.doesNotMatch(workflow,/secrets\.|ssh |ops -- deploy/);
 assert.match(readFileSync('deploy/portable/compose.yaml','utf8'),/127\.0\.0\.1:/);assert.match(readFileSync('server/config.mjs','utf8'),/host: process.env.API_HOST \|\| "127.0.0.1"/);
});
