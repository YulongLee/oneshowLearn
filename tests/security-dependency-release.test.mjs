import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,cpSync,symlinkSync,lstatSync,readlinkSync,existsSync,chmodSync,chownSync,readdirSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {SECURITY_BASELINE_COMMIT,BASELINE_PACKAGE_SHA256,BASELINE_LOCK_SHA256,SECURITY_FORMAT,PRODUCTION_NODE_VERSION,reviewedDependencyEntries,assertDependencyDelta,assertBaselineFiles,assertSecurityManifest,assertProductionNodeIdentity,runtimeTree,runtimeIdentity,digest,digestObject,assertSealedMode,assertSameFilesystem,requiredAppHeadroom,prepareRuntimePair,activateRuntimePair,recoverRuntimePair,assertInstalledPair,assertRecoverableRuntimePair,notePublicationStep,journalProof} from '../deploy/security-dependency-policy.mjs';
import {compareDatabase,validateAcceptance,validateSecurityAcceptance} from '../deploy/check-security-dependency-release.mjs';
const source=readFileSync(new URL('../deploy/update-security-dependencies.sh',import.meta.url),'utf8');
const checker=readFileSync(new URL('../deploy/check-security-dependency-release.mjs',import.meta.url),'utf8');
const policy=readFileSync(new URL('../deploy/security-dependency-policy.mjs',import.meta.url),'utf8');
const candidatePackage=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
const candidateLock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
function dependencyFixture(){
  const oldPackage=structuredClone(candidatePackage),oldLock=structuredClone(candidateLock);
  Object.assign(oldPackage.dependencies,{multer:'2.4.0',nodemailer:'10.0.16',zod:'^4.4.3'});Object.assign(oldPackage.overrides,{qs:'6.16.0'});delete oldPackage.overrides['body-parser'];delete oldPackage.overrides.undici;
  oldLock.packages[''].dependencies=structuredClone(oldPackage.dependencies);
  for(const [name,[before]] of Object.entries(reviewedDependencyEntries))oldLock.packages[name].version=before;
  return {oldPackage,oldLock,nextPackage:structuredClone(candidatePackage),nextLock:structuredClone(candidateLock)};
}
const delta=f=>assertDependencyDelta(f.oldPackage,f.oldLock,f.nextPackage,f.nextLock);
function productionNodeFixture(t,{version=PRODUCTION_NODE_VERSION,mode=0o555}={}){
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),'osl-production-node-identity-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=root+'/node-version-fixture',bytes=Buffer.from('#!/bin/sh\nprintf \'%s\\n\' '+JSON.stringify(version)+'\n');
  writeFileSync(file,bytes,{mode,flag:'wx'});chmodSync(file,mode);
  // Only the owned disposable fixture is assigned a non-root owner when tests
  // themselves run as root. This shell fixture is not a real Node binary proof.
  if(process.getuid()===0)chownSync(file,1001,1001);
  const identity=()=>{const s=lstatSync(file);return {uid:s.uid,gid:s.gid,mode:s.mode&0o777,ino:s.ino,dev:s.dev,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,hash:digest(readFileSync(file))};};
  return {root,file,hash:digest(bytes),identity};
}
function fixture(t,{linked=false}={}){
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),'osl-security-pair-test-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const app=root+'/app',stage=root+'/oneshowlearn-seo-Fixture1',backup=root+'/backup',runtime=root+'/candidate-runtime';
  const put=(file,body,mode=0o644)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,body,{mode});chmodSync(file,mode);};
  for(const dir of [app,stage,backup,runtime])mkdirSync(dir,{mode:0o700});
  put(app+'/package.json','{"old":"package"}\n',0o640);put(app+'/package-lock.json','{"old":"lock"}\n',0o600);
  const oldRoot=linked?app+'/original-dependency-tree':app+'/node_modules';mkdirSync(oldRoot,{mode:0o755});
  put(oldRoot+'/retained/package.json','{"name":"retained","version":"1"}');put(oldRoot+'/retained/index.js','old dependency bytes');mkdirSync(oldRoot+'/.bin');symlinkSync('../retained/index.js',oldRoot+'/.bin/retained');
  if(linked)symlinkSync('./original-dependency-tree',app+'/node_modules');
  put(runtime+'/node_modules/retained/package.json','{"name":"retained","version":"2"}');put(runtime+'/node_modules/retained/index.js','new dependency bytes');mkdirSync(runtime+'/node_modules/.bin');symlinkSync('../retained/index.js',runtime+'/node_modules/.bin/retained');
  for(const name of ['node_modules','node_modules/retained','node_modules/.bin'])chmodSync(runtime+'/'+name,0o755);
  put(stage+'/package.json','{"new":"package"}\n');put(stage+'/package-lock.json','{"new":"lock"}\n');put(stage+'/security-manifest.json','{"isolated":"not-a-production-manifest"}\n',0o600);
  cpSync(app+'/package.json',backup+'/package.json');chmodSync(backup+'/package.json',0o640);cpSync(app+'/package-lock.json',backup+'/package-lock.json');chmodSync(backup+'/package-lock.json',0o600);
  for(const [name,body] of [['data/current.db','CURRENT USER RECORDS'],['private.env','ORIGINAL ENVIRONMENT'],['node','ORIGINAL NODE'],['server/immutable.mjs','ORIGINAL BUSINESS MODULE'],['uploads-private/owned.txt','ORIGINAL PRIVATE MATERIAL']])put(app+'/'+name,body);
  const retained=Object.fromEntries(['data/current.db','private.env','node','server/immutable.mjs','uploads-private/owned.txt'].map(name=>[name,readFileSync(app+'/'+name,'utf8')]));
  const manifest={runtime:{directory:runtime},packageSha256:digest(readFileSync(stage+'/package.json')),lockSha256:digest(readFileSync(stage+'/package-lock.json'))};
  const options={app,stage,backup,manifest};const old=runtimeIdentity(app+'/node_modules');
  const keep=()=>{for(const [name,body]of Object.entries(retained))assert.equal(readFileSync(app+'/'+name,'utf8'),body,'Current private state retained: '+name);};
  prepareRuntimePair(options);return {root,app,stage,backup,runtime,put,manifest,options,old,keep};
}
test('closed baseline and seven exact security entries are explicit, not a general audit-fix permission',()=>{
  assert.equal(SECURITY_BASELINE_COMMIT,'bbdcf6f33ee402188cb7bdc9a17b30ab1a617754');assert.match(BASELINE_PACKAGE_SHA256,/^[a-f0-9]{64}$/);assert.match(BASELINE_LOCK_SHA256,/^[a-f0-9]{64}$/);
  assert.equal(Object.keys(reviewedDependencyEntries).length,7);assert.equal(delta(dependencyFixture()).changedEntries.length,7);
  assert.equal(candidatePackage.overrides['alipay-sdk'].urllib,'4.9.1');assert.equal(candidateLock.packages['node_modules/alipay-sdk'].version,'4.14.0');
});
test('unrelated dependencies, metadata, package specs, Node and scopes fail closed',async t=>{
  const cases={
    'new direct package':f=>f.nextPackage.dependencies.extra='1',
    'new dev package':f=>f.nextPackage.devDependencies.extra='1',
    'other direct version':f=>f.nextPackage.dependencies.express='5.3.0',
    'Node engine':f=>f.nextPackage.engines.node='>=25',
    'scripts':f=>f.nextPackage.scripts.unsafe='anything',
    'payment override':f=>f.nextPackage.overrides['alipay-sdk'].urllib='5',
    'wrong selected version':f=>f.nextLock.packages['node_modules/multer'].version='2.6.0',
    'known-version tampered integrity':f=>f.nextLock.packages['node_modules/zod'].integrity='sha512-tampered',
    'package registry':f=>f.nextLock.packages['node_modules/undici'].resolved='https://other.invalid/undici.tgz',
    'unrelated lock entry':f=>f.nextLock.packages['node_modules/react'].version='19.3.0',
    'added package':f=>f.nextLock.packages['node_modules/unapproved']={version:'1'},
    'removed package':f=>delete f.nextLock.packages['node_modules/qs'],
    'changed lock format':f=>f.nextLock.lockfileVersion=1,
    'wrong previous version':f=>f.oldLock.packages['node_modules/multer'].version='1.0.0',
    'caret instead of exact zod':f=>f.nextLock.packages[''].dependencies.zod='^4.6.6',
  };
  for(const [name,change]of Object.entries(cases))await t.test(name,()=>{const f=dependencyFixture();change(f);assert.throws(()=>delta(f));});
});
test('a synthetic or stale baseline is never accepted as the live baseline',t=>{const f=fixture(t);assert.throws(()=>assertBaselineFiles(f.backup));f.keep();});
test('candidate runtime inventory includes directories, hidden lock and bounded relative bin links',t=>{
  const f=fixture(t);f.put(f.runtime+'/node_modules/.package-lock.json','{"locked":true}');
  const inventory=runtimeTree(f.runtime);assert.equal(inventory.node_modules.directory,true);assert.ok(inventory['node_modules/.package-lock.json'].hash);assert.equal(inventory['node_modules/.bin/retained'].link,'../retained/index.js');
  const before=digestObject(inventory);chmodSync(f.runtime+'/node_modules/retained/index.js',0o600);assert.notEqual(digestObject(runtimeTree(f.runtime)),before);
  assert.equal(digestObject({b:1,a:{d:2,c:3}}),digestObject({a:{c:3,d:2},b:1}));
});
test('runtime links cannot escape node_modules, point to sidecar package, be absolute, broken or arbitrary',async t=>{
  for(const [name,target,location]of [['sidecar-package','../../package.json','.bin/unsafe'],['absolute','/etc/passwd','.bin/unsafe'],['broken','../absent','.bin/unsafe'],['non-bin','retained/index.js','unsafe']])await t.test(name,t=>{
    const f=fixture(t);f.put(f.runtime+'/package.json','{}');symlinkSync(target,f.runtime+'/node_modules/'+location);assert.throws(()=>runtimeTree(f.runtime));
  });
  await t.test('candidate root link',t=>{const f=fixture(t);symlinkSync(f.runtime+'/node_modules',f.root+'/linked');assert.throws(()=>runtimeTree(f.root+'/linked'));assert.deepEqual(runtimeTree(f.root+'/linked',{allowRootLink:true}),runtimeTree(f.runtime+'/node_modules'));});
});
test('sealed permission policy forbids writable files and directories while retaining exact readable/executable modes',()=>{
  for(const mode of [0o600,0o640,0o644,0o700,0o750,0o755])assert.doesNotThrow(()=>assertSealedMode(mode));for(const mode of [0o666,0o664,0o775,0o777,0o702])assert.throws(()=>assertSealedMode(mode));
});
test('retained production Node identity accepts an existing non-root owner without mutating bytes or stat metadata',t=>{
  const f=productionNodeFixture(t),before=f.identity();assert.notEqual(before.uid,0);assert.equal(before.mode,0o555);
  assert.deepEqual(assertProductionNodeIdentity(f.file,f.hash),{uid:before.uid,gid:before.gid,mode:before.mode,hash:f.hash});
  // Access time is intentionally not compared: ordinary reads may update it.
  assert.deepEqual(f.identity(),before);
});
test('retained production Node rejects different bytes/version, writable modes, links and non-files without changing the fixture',async t=>{
  await t.test('different captured bytes',t=>{const f=productionNodeFixture(t),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.file,'0'.repeat(64)),/Original production Node bytes/);assert.deepEqual(f.identity(),before);});
  await t.test('malformed captured SHA',t=>{const f=productionNodeFixture(t),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.file,'not-a-sha'));assert.deepEqual(f.identity(),before);});
  await t.test('different actual version despite matching bytes',t=>{const f=productionNodeFixture(t,{version:'v22.23.3'}),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.file,f.hash));assert.deepEqual(f.identity(),before);});
  for(const mode of [0o775,0o757,0o777])await t.test('writable mode '+mode.toString(8),t=>{const f=productionNodeFixture(t,{mode}),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.file,f.hash),/not group\/world writable/);assert.deepEqual(f.identity(),before);});
  await t.test('non-executable regular file',t=>{const f=productionNodeFixture(t,{mode:0o444}),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.file,f.hash));assert.deepEqual(f.identity(),before);});
  await t.test('symbolic link',t=>{const f=productionNodeFixture(t),before=f.identity(),link=f.root+'/linked-node';symlinkSync('node-version-fixture',link);const original=lstatSync(link);assert.throws(()=>assertProductionNodeIdentity(link,f.hash),/Ordinary file/);const retained=lstatSync(link);assert.equal(retained.ino,original.ino);assert.equal(retained.uid,original.uid);assert.equal(retained.gid,original.gid);assert.equal(retained.mode,original.mode);assert.equal(readlinkSync(link),'node-version-fixture');assert.deepEqual(f.identity(),before);});
  await t.test('directory',t=>{const f=productionNodeFixture(t),before=f.identity();assert.throws(()=>assertProductionNodeIdentity(f.root,f.hash),/Ordinary file/);assert.deepEqual(f.identity(),before);});
});
test('manifest Node validation keeps platform/architecture and root-owned stage/runtime guards separate from installed Node ownership',t=>{
  const f=productionNodeFixture(t),before=f.identity(),manifest={format:SECURITY_FORMAT,baselineCommit:SECURITY_BASELINE_COMMIT,baselinePackageSha256:BASELINE_PACKAGE_SHA256,baselineLockSha256:BASELINE_LOCK_SHA256,packageSha256:'1'.repeat(64),lockSha256:'2'.repeat(64),gitCommit:'3'.repeat(40),ciId:123,ciSuccess:true,runtime:{directory:'/tmp/oneshowlearn-security-runtime-Node1',treeSha256:'4'.repeat(64),platform:'linux',arch:process.arch,nodeVersion:PRODUCTION_NODE_VERSION,nodeSha256:f.hash}};
  if(process.platform==='linux')assert.doesNotThrow(()=>assertSecurityManifest(manifest,{runtime:false,nodePath:f.file,root:true}));
  else assert.throws(()=>assertSecurityManifest(manifest,{runtime:false,nodePath:f.file,root:true}),error=>error.actual===process.platform&&error.expected==='linux');
  const foreignStage=f.root+'/foreign-stage';mkdirSync(foreignStage,{mode:0o700});if(process.getuid()===0)chownSync(foreignStage,1001,1001);
  assert.throws(()=>assertSecurityManifest(manifest,{stage:foreignStage,runtime:false,root:true}),/Root-owned sealed input/);
  assert.throws(()=>runtimeTree(foreignStage,{rootOwned:true}),/Root-owned sealed input/);
  assert.deepEqual(f.identity(),before);
});
test('security manifest is closed and binds the package, lock, CI, Linux architecture and unchanged production Node',async t=>{
  const valid={format:SECURITY_FORMAT,baselineCommit:SECURITY_BASELINE_COMMIT,baselinePackageSha256:BASELINE_PACKAGE_SHA256,baselineLockSha256:BASELINE_LOCK_SHA256,packageSha256:'1'.repeat(64),lockSha256:'2'.repeat(64),gitCommit:'3'.repeat(40),ciId:123,ciSuccess:true,runtime:{directory:'/tmp/oneshowlearn-security-runtime-Case1',treeSha256:'4'.repeat(64),platform:'linux',arch:'x64',nodeVersion:PRODUCTION_NODE_VERSION,nodeSha256:'5'.repeat(64)}};
  assert.doesNotThrow(()=>assertSecurityManifest(valid,{runtime:false}));
  for(const [name,change]of Object.entries({format:x=>x.format='anything',baseline:x=>x.baselineLockSha256='f'.repeat(64),ci:x=>x.ciSuccess=false,node:x=>x.runtime.nodeVersion='v22.23.3',platform:x=>x.runtime.platform='darwin',architecture:x=>x.runtime.arch='unknown',sidecar:x=>x.runtime.directory='/var/www/oneshowlearn/node_modules',extra:x=>x.bypass=true}))await t.test(name,()=>{const x=structuredClone(valid);change(x);assert.throws(()=>assertSecurityManifest(x,{runtime:false}));});
});
test('same-filesystem rename never silently falls back to a cross-filesystem copy',t=>{const f=fixture(t);assert.doesNotThrow(()=>assertSameFilesystem(f.app,f.root));if(lstatSync('/dev').dev!==lstatSync(f.app).dev)assert.throws(()=>assertSameFilesystem('/dev',f.app));});
test('real cpSync under the publisher umask077 preserves candidate 755 roots/directories, 644 files and relative binlinks',t=>{
  const previous=process.umask(0o077);try{const f=fixture(t),journal=JSON.parse(readFileSync(f.backup+'/runtime-pair.json'));assert.equal(lstatSync(journal.paths.next).mode&0o777,0o755);assert.equal(lstatSync(journal.paths.next+'/retained').mode&0o777,0o755);assert.equal(lstatSync(journal.paths.next+'/retained/index.js').mode&0o777,0o644);assert.equal(readlinkSync(journal.paths.next+'/.bin/retained'),'../retained/index.js');activateRuntimePair(f.options);assertInstalledPair({...f.options,expected:'new'});recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});f.keep();}finally{process.umask(previous);}
});
test('app headroom covers full candidate clones, retained client and both new/old renderer recovery copies',()=>{
  assert.equal(requiredAppHeadroom({candidateRuntimeBytes:'700000000',clientBytes:'100000000',newRenderBytes:'50000000',oldRenderBytes:'40000000'}),2216870912n);
  assert.throws(()=>requiredAppHeadroom({candidateRuntimeBytes:'-1',clientBytes:0,newRenderBytes:0,oldRenderBytes:0}));
  assert.match(source,/app_available > app_required/);assert.match(source,/du -sb -- "\$candidate_runtime"/);assert.match(source,/requiredAppHeadroom/);
});
test('successful activation preserves root mode/uid/gid, exact installed bytes and old runtime instead of deleting it',async t=>{
  for(const linked of [false,true])await t.test(linked?'original link':'original ordinary directory',t=>{
    const f=fixture(t,{linked}),before=runtimeIdentity(f.app+'/node_modules'),record=activateRuntimePair(f.options);assertInstalledPair({...f.options,expected:'new'});assert.deepEqual(runtimeIdentity(record.paths.previous),before);assert.equal(record.state,'activated');assert.ok(existsSync(f.backup+'/runtime-original.json'));f.keep();
    recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});assert.deepEqual(runtimeIdentity(f.app+'/node_modules'),f.old);if(linked)assert.equal(readlinkSync(f.app+'/node_modules'),'./original-dependency-tree');assert.ok(existsSync(record.paths.failed));f.keep();
  });
});
const activationFaults=['before-old-rename','old-rename-unacknowledged','old-retained','before-new-rename','new-rename-unacknowledged','new-installed','before-package','package-unacknowledged','package-installed','before-lock','lock-unacknowledged','lock-installed','activated'];
test('every activation boundary, including unacknowledged filesystem operations, restores the exact old pair without rewinding data',async t=>{
  for(const linked of [false,true])for(const boundary of activationFaults)await t.test((linked?'link ':'directory ')+boundary,t=>{
    const f=fixture(t,{linked});assert.throws(()=>activateRuntimePair({...f.options,checkpoint:step=>{if(step===boundary)throw Error('ISOLATED INTERRUPTION');}}),/ISOLATED INTERRUPTION/);
    assertRecoverableRuntimePair(f.options);recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});assert.deepEqual(runtimeIdentity(f.app+'/node_modules'),f.old);f.keep();
  });
});
test('interrupted recovery can be repeated safely at every durable restoration boundary',async t=>{
  for(const boundary of ['before-failed-retain','failed-retained','before-old-restore','old-restored','before-package-restore','package-restored','before-lock-restore','lock-restored','rolled-back'])await t.test(boundary,t=>{
    const f=fixture(t);activateRuntimePair(f.options);assert.throws(()=>recoverRuntimePair({...f.options,checkpoint:step=>{if(step===boundary)throw Error('ISOLATED RECOVERY INTERRUPTION');}}),/ISOLATED RECOVERY INTERRUPTION/);
    recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});f.keep();
  });
});
test('unknown current dependencies or packages stop recovery rather than being overwritten',async t=>{
  for(const target of ['node_modules/retained/index.js','package.json','package-lock.json'])await t.test(target,t=>{const f=fixture(t);activateRuntimePair(f.options);f.put(f.app+'/'+target,'UNREVIEWED CURRENT BYTES');assert.throws(()=>recoverRuntimePair(f.options));assert.equal(readFileSync(f.app+'/'+target,'utf8'),'UNREVIEWED CURRENT BYTES');f.keep();});
});
test('durable original identity cannot be altered by mutable progress or an interrupted journal write',t=>{
  const f=fixture(t);activateRuntimePair(f.options);f.put(f.backup+'/runtime-pair.json.next','PARTIAL JOURNAL WRITE',0o600);recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});assert.ok(readdirSync(f.backup).some(name=>name.startsWith('runtime-pair.interrupted-')));f.keep();
  const j=JSON.parse(readFileSync(f.backup+'/runtime-pair.json'));j.paths.active=f.root+'/unrelated';f.put(f.backup+'/runtime-pair.json',JSON.stringify(j),0o600);assert.throws(()=>recoverRuntimePair(f.options));
});
test('pending package writes are retained as evidence, not deleted or treated as completed pairs',t=>{const f=fixture(t);activateRuntimePair(f.options);f.put(f.app+'/package.json.security-next','PARTIAL PACKAGE WRITE');recoverRuntimePair(f.options);assertInstalledPair({...f.options,expected:'old'});assert.ok(readdirSync(f.app).some(name=>name.startsWith('.security-pending-')));f.keep();});
test('only the final acceptance marker disarms dependency recovery',t=>{const f=fixture(t);activateRuntimePair(f.options);f.put(f.backup+'/receipt.json','{"partial":true}');assert.doesNotThrow(()=>assertRecoverableRuntimePair(f.options));f.put(f.backup+'/recovery.final.json','{"rollbackArmed":false}');assert.throws(()=>recoverRuntimePair(f.options),/Final acceptance/);assertInstalledPair({...f.options,expected:'new'});f.keep();});
test('publication intent is durable, closed and included in the dependency journal proof',t=>{const f=fixture(t);activateRuntimePair(f.options);notePublicationStep(f.options,'before-client-template');assert.equal(JSON.parse(readFileSync(f.backup+'/runtime-pair.json')).publicationSteps.at(-1),'before-client-template');assert.match(journalProof(f.options).journalSha256,/^[a-f0-9]{64}$/);assert.throws(()=>notePublicationStep(f.options,'delete-database'));f.keep();});
test('all 76 tables, all 73 protected values and exact schema remain guarded',()=>{
  const transient=['auth_rate_limits','login_challenges','payment_checkout_locks'],tables=Object.fromEntries([...Array.from({length:73},(_,i)=>'business_'+i),...transient].map(name=>[name,'old-value'])),before={schema:'exact-schema',tables};compareDatabase(before,before,{all:true});
  for(let i=0;i<73;i++){const next=structuredClone(before);next.tables['business_'+i]='new-value';assert.throws(()=>compareDatabase(next,before));}
  for(const name of transient){const next=structuredClone(before);next.tables[name]='expired';assert.doesNotThrow(()=>compareDatabase(next,before));assert.throws(()=>compareDatabase(next,before,{all:true}));}
  for(const next of [{...before,schema:'changed'},{schema:before.schema,tables:{...before.tables,extra:'x'}}])assert.throws(()=>compareDatabase(next,before,{schemaOnly:true}));
});
test('outer acceptance retains exact stage/CI/asset/zero-provider-write guards',()=>{const inputs={stage:'/isolated',backup:'/private',manifest:'a'.repeat(64),assets:3},proof={...inputs,releaseManifest:inputs.manifest,gitCommit:'b'.repeat(40),ciSuccess:true,ciId:1,providerRequests:0,writeRequests:0,copyBrowser:1,counts:{anonymous:1,promotion:1,seo:1,staticAssets:3}};delete proof.manifest;delete proof.assets;assert.doesNotThrow(()=>validateAcceptance(proof,inputs));for(const key of ['providerRequests','writeRequests'])assert.throws(()=>validateAcceptance({...proof,[key]:1},inputs));assert.throws(()=>validateAcceptance({...proof,counts:{...proof.counts,staticAssets:2}},inputs));});
test('inner receipt cannot combine the security candidate with a different successful commit or CI',()=>{
  const inputs={stage:'/isolated',backup:'/private',manifest:'a'.repeat(64),assets:3},proof={stage:inputs.stage,backup:inputs.backup,releaseManifest:inputs.manifest,gitCommit:'b'.repeat(40),ciSuccess:true,ciId:1,providerRequests:0,writeRequests:0,copyBrowser:1,counts:{anonymous:1,promotion:1,seo:1,staticAssets:3}};
  const security={format:SECURITY_FORMAT,baselineCommit:SECURITY_BASELINE_COMMIT,baselinePackageSha256:BASELINE_PACKAGE_SHA256,baselineLockSha256:BASELINE_LOCK_SHA256,packageSha256:'1'.repeat(64),lockSha256:'2'.repeat(64),gitCommit:proof.gitCommit,ciId:proof.ciId,ciSuccess:true,runtime:{directory:'/tmp/oneshowlearn-security-runtime-Case1',treeSha256:'4'.repeat(64),platform:'linux',arch:'x64',nodeVersion:PRODUCTION_NODE_VERSION,nodeSha256:'5'.repeat(64)}};
  assert.doesNotThrow(()=>validateSecurityAcceptance(proof,inputs,security));assert.throws(()=>validateSecurityAcceptance({...proof,gitCommit:'c'.repeat(40)},inputs,security));assert.throws(()=>validateSecurityAcceptance({...proof,ciId:2},inputs,security));
});
test('security publisher is inert without execute and all new sources parse',()=>{
  assert.equal(spawnSync('bash',['-n','deploy/update-security-dependencies.sh']).status,0);
  const inert=spawnSync('bash',['deploy/update-security-dependencies.sh','/isolated-not-production'],{encoding:'utf8'});assert.equal(inert.status,2);assert.match(inert.stderr,/Inert by default/);
  for(const name of ['security-dependency-policy','check-security-dependency-release']){const r=spawnSync(process.execPath,['--check','deploy/'+name+'.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  assert.doesNotMatch(source,/npm (?:ci|install)|(?:bootstrap|migrate)\.mjs|docker (?:system|volume)|rm -rf/);
  const restore=source.slice(source.indexOf('restore_code(){'),source.indexOf('recover(){'));assert.doesNotMatch(restore,/server\/\$name|before\.db|release\.db|oneshowlearn\.env|uploads-private|\/opt\/node/);assert.match(restore,/'?\$policy" recover/);
  assert.match(checker,/createRequire\(stage\+'\/rehearsal\/package\.json'\)\('express'\)/);assert.match(checker,/dependenciesChanged:true/);assert.match(checker,/recovery\.final\.next/);assert.match(policy,/same filesystem; never a copy fallback/);
});
test('maintenance/idle, complete original-pair verification and stop failure all fail closed before restart',()=>{
  const recover=source.slice(source.indexOf('recover(){'),source.indexOf('\nif [[ "$mode" = --rollback-only ]]'));
  const run=({maintenance=0,idle=0,stop=0,restore=0,verified=0}={})=>spawnSync('bash',['-c',`
stage=/isolated/stage;backup=/isolated/backup;snippet=/isolated/snippet
changed=true;stopped=true;proxy_changed=true;maintenance=false;rollback_mode=false
enter_maintenance(){ echo MAINTENANCE;maintenance=true;return ${maintenance}; }
idle(){ echo IDLE;return ${idle}; }
check(){ echo CHECK "$@";if [[ "$1" = verify-restored ]];then return ${verified};fi;return 0; }
systemctl(){ echo SERVICE "$@";if [[ "$1" = stop ]];then return ${stop};fi;return 0; }
restore_code(){ echo RESTORE_PAIR;return ${restore}; }
ready(){ echo READY; }
atomic_original(){ echo REOPEN; }
atomic_file(){ echo REOPEN; }
nginx(){ return 0; }
${recover}
false
recover
`],{encoding:'utf8'});
  for(const options of [{maintenance:1},{idle:1}]){const r=run(options);assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/SERVICE|RESTORE_PAIR|REOPEN/);}
  for(const options of [{stop:1},{restore:1},{verified:1}]){const r=run(options);assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/SERVICE start|REOPEN/);if(options.stop)assert.doesNotMatch(r.stdout,/RESTORE_PAIR/);}
  const safe=run();assert.equal(safe.status,1);assert.ok(safe.stdout.indexOf('CHECK verify-restored')<safe.stdout.indexOf('SERVICE start'));assert.ok(safe.stdout.indexOf('SERVICE stop')<safe.stdout.indexOf('RESTORE_PAIR'));
});
test('paired publication records every SSR boundary and verifies matching new bytes before starting',()=>{
  assert.match(source,/modules=\(\)/);assert.match(source,/check verify-restored rollback\n  systemctl start/);
  const start=source.slice(source.indexOf('changed=true\n"$node" "$policy" activate'));
  for(const label of ['render-copy','old-render-rename','new-render-rename','client-manifest','client-template','service-start','public-proxy'])assert.ok(start.includes('note before-'+label));
  assert.ok(start.indexOf('new_files_guard allow-maintenance')<start.indexOf('systemctl start oneshowlearn'));assert.ok(start.indexOf('unchanged_guard')<start.indexOf('systemctl start oneshowlearn'));
  assert.match(source,/! -name runtime-pair\.json ! -name runtime-pair\.json\.next/);assert.match(source,/\[\[ ! -e "\$backup\/recovery\.final\.json" \]\]/);
});
