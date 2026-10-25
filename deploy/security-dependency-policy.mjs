// A closed, one-release dependency exception. No installation, network, migration or provider access.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,statSync,realpathSync,readlinkSync,existsSync,mkdirSync,cpSync,copyFileSync,renameSync,chmodSync,lchmodSync,chownSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SECURITY_BASELINE_COMMIT='bbdcf6f33ee402188cb7bdc9a17b30ab1a617754';
export const BASELINE_PACKAGE_SHA256='e683cce215bc5974defa58328d3db17f8877bfcd69d7b8f0f5bbea40421f9fcb';
export const BASELINE_LOCK_SHA256='bcb75539f79ceafea43c8b2965ae8a81e0279c57541283aee3b3182c243c75ef';
export const PRODUCTION_NODE_VERSION='v22.14.0';
export const SECURITY_FORMAT='oneshowlearn-security-dependency-manifest-v1';
const APP='/var/www/oneshowlearn';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export const digestObject=value=>digest(canonical(value));
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const own=(object,key)=>Object.hasOwn(object,key);
const has=file=>{try{lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const hex=value=>assert.match(value||'',/^[a-f0-9]{64}$/);
export function assertSealedMode(mode){assert.equal(mode&0o022,0,'Sealed input is not group/world writable');}
export function requiredAppHeadroom({candidateRuntimeBytes,clientBytes,newRenderBytes,oldRenderBytes}){
  const values=[candidateRuntimeBytes,clientBytes,newRenderBytes,oldRenderBytes].map(value=>{assert.match(String(value),/^\d+$/,'Nonnegative exact byte count');return BigInt(value);});
  // Preserve failed/new runtime and renderer copies as well as a recoverable old pair.
  return values[0]*2n+values[1]+values[2]*2n+values[3]*2n+536870912n;
}
export const reviewedDependencyEntries={
  'node_modules/body-parser':['2.3.0','2.4.0','0a69692fd22b89a3ea63a1e6970e4fe9e6f3bb577e2b9feb37a861c4fde60146'],
  'node_modules/body-parser/node_modules/content-type':['2.0.0','2.1.0','1529b8982714a9d8efa59de61750cb92dcdce854901271f260165a78e19cf755'],
  'node_modules/multer':['2.4.0','2.5.0','e578f27335be0ec3e979270ef9f54e6c759d0a7a02150c9bf9a385e2206bcb6d'],
  'node_modules/nodemailer':['10.0.16','10.1.4','0f3663a8f66aa6b5a6282ca58da94bf8e9cc514047380cd66404c77e8b247347'],
  'node_modules/qs':['6.16.0','6.16.1','4e8fa858ed0a64b06ec09ec8b340af3ec5ba4e0796c89b0cdc006338d5eb32d6'],
  'node_modules/undici':['7.30.0','7.30.1','d0f7a4867bbb561b49477d20409140495f15be602c303afb7fd90a653597671d'],
  'node_modules/zod':['4.4.3','4.6.6','f6da530a9436cff319fc0ae8eb3d3de06fd3020441e813eacb11797e52d99ab9'],
};
export function assertDependencyDelta(oldPackage,oldLock,candidatePackage,candidateLock){
  const expected=structuredClone(oldPackage);
  Object.assign(expected.dependencies,{multer:'2.5.0',nodemailer:'10.1.4',zod:'4.6.6'});
  Object.assign(expected.overrides,{qs:'6.16.1','body-parser':'2.4.0',undici:'7.30.1'});
  assert.deepEqual(candidatePackage,expected,'Only the reviewed direct security versions and three overrides may change');
  const expectedRoot=structuredClone(oldLock.packages['']);Object.assign(expectedRoot.dependencies,{multer:'2.5.0',nodemailer:'10.1.4',zod:'4.6.6'});
  assert.deepEqual(candidateLock.packages[''],expectedRoot,'Only three reviewed direct lock specs');
  for(const key of new Set([...Object.keys(oldLock),...Object.keys(candidateLock)]))if(key!=='packages')assert.deepEqual(candidateLock[key],oldLock[key],'Other lock metadata retained: '+key);
  assert.deepEqual(Object.keys(candidateLock.packages).sort(),Object.keys(oldLock.packages).sort(),'No dependency package additions or removals');
  for(const [name,before] of Object.entries(oldLock.packages)){
    if(!name)continue;const after=candidateLock.packages[name],reviewed=reviewedDependencyEntries[name];
    if(!reviewed){assert.deepEqual(after,before,'Unreviewed dependency retained: '+name);continue;}
    assert.equal(before.version,reviewed[0],'Exact reviewed previous version: '+name);assert.equal(after.version,reviewed[1]);
    assert.equal(digestObject(after),reviewed[2],'Exact reviewed official package metadata/integrity: '+name);
    assert.match(after.resolved,/^https:\/\/registry\.npmjs\.org\//);assert.match(after.integrity,/^sha512-/);
  }
  for(const name of Object.keys(reviewedDependencyEntries))assert.ok(own(candidateLock.packages,name),'Every reviewed fix required: '+name);
  assert.deepEqual(candidateLock.packages[''].dependencies,candidatePackage.dependencies);assert.deepEqual(candidateLock.packages[''].devDependencies,candidatePackage.devDependencies);
  return {changedEntries:Object.keys(reviewedDependencyEntries),baselineCommit:SECURITY_BASELINE_COMMIT};
}
function ordinary(file,{directory=false,root=false}={}){
  const state=lstatSync(file);assert.ok(!state.isSymbolicLink()&&(directory?state.isDirectory():state.isFile()),'Ordinary '+(directory?'directory:':'file:')+file);
  if(root){assert.equal(state.uid,0,'Root-owned sealed input: '+file);assertSealedMode(state.mode);}return state;
}
// Root links are accepted only when capturing/restoring an existing installation.
// Candidate runtime links must be relative, ordinary-file .bin links contained in node_modules.
export function runtimeTree(root,{allowRootLink=false,rootOwned=false}={}){
  const first=lstatSync(root);assert.ok(first.isDirectory()||allowRootLink&&first.isSymbolicLink(),'Ordinary runtime root');
  const resolved=realpathSync(root);ordinary(resolved,{directory:true,root:rootOwned});const result={};
  function walk(directory,prefix=''){
    for(const name of readdirSync(directory).sort()){
      assert.ok(!/[\r\n\0]/.test(name)&&name!=='.'&&name!=='..','Safe runtime component');
      const file=path.join(directory,name),relative=prefix+name,state=lstatSync(file),mode=state.mode&0o777;
      if(rootOwned){assert.equal(state.uid,0,'Root-owned candidate runtime input');if(!state.isSymbolicLink())assertSealedMode(mode);}
      if(state.isSymbolicLink()){
        const link=readlinkSync(file);assert.equal(path.basename(path.dirname(relative)),'.bin','Only internal executable links');
        assert.ok(!path.isAbsolute(link)&&!/[\r\n\0]/.test(link),'Relative runtime executable link');
        const target=realpathSync(file),boundary=relative.startsWith('node_modules/')?path.join(resolved,'node_modules'):resolved;assert.ok(target.startsWith(boundary+path.sep),'Runtime executable cannot escape node_modules');ordinary(target);
        result[relative]={link,mode};
      }else if(state.isDirectory()){result[relative]={directory:true,mode};walk(file,relative+'/');}
      else{assert.ok(state.isFile(),'Only runtime regular files/directories/binlinks');result[relative]={hash:digest(readFileSync(file)),mode};}
    }
  }
  walk(resolved);return result;
}
export function runtimeIdentity(root){const s=lstatSync(root);return {link:s.isSymbolicLink()?readlinkSync(root):null,mode:s.mode&0o777,uid:s.uid,gid:s.gid,tree:runtimeTree(root,{allowRootLink:true})};}
export function assertSecurityManifest(value,{stage,runtime=true,nodePath,root=false}={}){
  assert.equal(value.format,SECURITY_FORMAT);assert.equal(value.baselineCommit,SECURITY_BASELINE_COMMIT);
  assert.equal(value.baselinePackageSha256,BASELINE_PACKAGE_SHA256);assert.equal(value.baselineLockSha256,BASELINE_LOCK_SHA256);
  for(const key of ['packageSha256','lockSha256'])hex(value[key]);assert.match(value.gitCommit||'',/^[a-f0-9]{40}$/);assert.ok(Number.isSafeInteger(value.ciId)&&value.ciId>0);assert.equal(value.ciSuccess,true);
  assert.deepEqual(Object.keys(value).sort(),['format','baselineCommit','baselinePackageSha256','baselineLockSha256','packageSha256','lockSha256','gitCommit','ciId','ciSuccess','runtime'].sort(),'Closed security manifest fields');
  const r=value.runtime;assert.deepEqual(Object.keys(r).sort(),['directory','treeSha256','platform','arch','nodeVersion','nodeSha256'].sort());
  assert.match(r.directory||'',/^\/tmp\/oneshowlearn-security-runtime-[a-zA-Z0-9]+$/);hex(r.treeSha256);hex(r.nodeSha256);assert.equal(r.platform,'linux');assert.ok(['x64','arm64'].includes(r.arch));assert.equal(r.nodeVersion,PRODUCTION_NODE_VERSION);
  if(stage){ordinary(stage,{directory:true,root});for(const [file,hash] of [['package.json',value.packageSha256],['package-lock.json',value.lockSha256]]){ordinary(stage+'/'+file,{root});assert.equal(digest(readFileSync(stage+'/'+file)),hash,'Exact security candidate '+file);}}
  if(runtime){
    ordinary(r.directory,{directory:true,root});assert.equal(realpathSync(r.directory),r.directory,'Unlinked sidecar ancestors');
    assert.deepEqual(readdirSync(r.directory).sort(),['node_modules','package-lock.json','package.json']);ordinary(r.directory+'/node_modules',{directory:true,root});
    assert.equal(digestObject(runtimeTree(r.directory,{rootOwned:root})),r.treeSha256,'Complete sealed candidate runtime tree');
    for(const [file,hash] of [['package.json',value.packageSha256],['package-lock.json',value.lockSha256]])assert.equal(digest(readFileSync(r.directory+'/'+file)),hash,'Runtime belongs to candidate '+file);
    const lock=json(r.directory+'/package-lock.json');
    for(const [name,[,version]] of Object.entries(reviewedDependencyEntries)){const packageFile=r.directory+'/'+name+'/package.json';ordinary(packageFile,{root});assert.equal(json(packageFile).version,version,'Actual installed security version: '+name);assert.equal(lock.packages[name].version,version);}
  }
  if(nodePath){ordinary(nodePath,{root});assert.equal(digest(readFileSync(nodePath)),r.nodeSha256,'Original production Node bytes');assert.equal(execFileSync(nodePath,['--version'],{encoding:'utf8'}).trim(),PRODUCTION_NODE_VERSION);assert.equal(process.platform,r.platform);assert.equal(process.arch,r.arch);}
  return value;
}
export function assertBaselineFiles(directory){
  for(const [file,hash] of [['package.json',BASELINE_PACKAGE_SHA256],['package-lock.json',BASELINE_LOCK_SHA256]]){ordinary(directory+'/'+file);assert.equal(digest(readFileSync(directory+'/'+file)),hash,'Exact authorized baseline '+file);}
}
export function validateInputs(stage,baseline,{runtime=true,nodePath,root=false}={}){
  assertBaselineFiles(baseline);const manifest=json(stage+'/security-manifest.json');assertSecurityManifest(manifest,{stage,runtime,nodePath,root});
  assertDependencyDelta(json(baseline+'/package.json'),json(baseline+'/package-lock.json'),json(stage+'/package.json'),json(stage+'/package-lock.json'));return manifest;
}
function syncDirectory(directory){const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function atomicJson(file,value){const next=file+'.next';assert.ok(!has(next),'No stale journal write');writeFileSync(next,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});const fd=openSync(next,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(next,file);syncDirectory(path.dirname(file));}
function fileIdentity(file){const s=ordinary(file);return {hash:digest(readFileSync(file)),mode:s.mode&0o777,uid:s.uid,gid:s.gid};}
function atomicCopy(source,target,metadata){
  ordinary(source);assert.ok(!has(target)||!lstatSync(target).isSymbolicLink(),'No linked package target');const next=target+'.security-next';assert.ok(!has(next));
  copyFileSync(source,next);chmodSync(next,metadata.mode);if(process.getuid?.()===0)chownSync(next,metadata.uid,metadata.gid);
  const fd=openSync(next,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(next,target);syncDirectory(path.dirname(target));
}
export function assertSameFilesystem(source,targetParent){assert.equal(statSync(source).dev,statSync(targetParent).dev,'Runtime switch requires same filesystem; never a copy fallback');}
const sameFilesystem=assertSameFilesystem;
function assertIdentity(file,expected){assert.deepEqual(runtimeIdentity(file),expected,'Exact runtime bytes/modes/root link: '+file);}
function restoreCloneModes(directory,expected){
  ordinary(directory,{directory:true});const actual=runtimeTree(directory);assert.deepEqual(Object.keys(actual),Object.keys(expected.tree),'Only the cloned sealed tree may receive its recorded modes');
  for(const [relative,state]of Object.entries(expected.tree)){
    const file=path.join(directory,relative),current=actual[relative];
    if(own(state,'link')){assert.equal(current.link,state.link);if(current.mode!==state.mode){assert.equal(process.platform,'darwin','Linux symlink modes must already match');assert.equal(typeof lchmodSync,'function');lchmodSync(file,state.mode);}}
    else {assert.equal(current.directory,state.directory);assert.equal(current.hash,state.hash,'Candidate clone content before permissions');assert.ok(!lstatSync(file).isSymbolicLink());chmodSync(file,state.mode);}
  }
  chmodSync(directory,expected.mode);if(process.getuid?.()===0)chownSync(directory,expected.uid,expected.gid);
}
export function prepareRuntimePair({app,stage,backup,manifest,checkpoint=()=>{}}){
  const id=path.basename(stage);assert.match(id,/^oneshowlearn-seo-[a-zA-Z0-9]+$/);ordinary(app,{directory:true});ordinary(backup,{directory:true});
  const files={active:app+'/node_modules',previous:app+'/.security-runtime-old-'+id,next:app+'/.security-runtime-next-'+id,failed:app+'/.security-runtime-failed-'+id};
  for(const key of ['previous','next','failed'])assert.ok(!has(files[key]),'Fresh runtime path required');assert.ok(!has(backup+'/runtime-pair.json'));
  for(const file of ['package.json','package-lock.json'])assert.ok(!has(app+'/'+file+'.security-next'),'No pre-existing reserved package write');
  const record={format:'oneshowlearn-security-runtime-pair-v1',stage,app,backup,manifestSha256:digest(readFileSync(stage+'/security-manifest.json')),paths:files,old:runtimeIdentity(files.active),next:runtimeIdentity(manifest.runtime.directory+'/node_modules'),oldPackage:fileIdentity(backup+'/package.json'),oldLock:fileIdentity(backup+'/package-lock.json'),newPackageSha256:manifest.packageSha256,newLockSha256:manifest.lockSha256,state:'prepared',events:[],publicationSteps:[]};
  assert.equal(fileIdentity(app+'/package.json').hash,record.oldPackage.hash);assert.equal(fileIdentity(app+'/package-lock.json').hash,record.oldLock.hash);
  cpSync(manifest.runtime.directory+'/node_modules',files.next,{recursive:true,dereference:false,verbatimSymlinks:true,preserveTimestamps:false});
  // cpSync is affected by umask077. Reapply only the sealed new clone's exact modes, never touch either original runtime.
  restoreCloneModes(files.next,record.next);
  sameFilesystem(files.next,app);sameFilesystem(path.dirname(files.active),app);assertIdentity(files.next,record.next);assertIdentity(files.active,record.old);
  assert.ok(!has(backup+'/runtime-original.json'));atomicJson(backup+'/runtime-original.json',record);
  atomicJson(backup+'/runtime-pair.json',record);checkpoint('prepared');return record;
}
function pairRecord({app,stage,backup}){
  const record=json(backup+'/runtime-pair.json');assert.equal(record.format,'oneshowlearn-security-runtime-pair-v1');assert.equal(record.app,app);assert.equal(record.stage,stage);assert.equal(record.backup,backup);assert.equal(record.manifestSha256,digest(readFileSync(stage+'/security-manifest.json')));
  const id=path.basename(stage);assert.deepEqual(record.paths,{active:app+'/node_modules',previous:app+'/.security-runtime-old-'+id,next:app+'/.security-runtime-next-'+id,failed:app+'/.security-runtime-failed-'+id});
  const original=json(backup+'/runtime-original.json');assert.deepEqual(Object.keys(record).sort(),Object.keys(original).sort(),'Closed runtime journal fields');for(const key of Object.keys(original))if(!['state','events','publicationSteps'].includes(key))assert.deepEqual(record[key],original[key],'Frozen dependency recovery identity: '+key);
  for(const [name,state] of [['package.json',record.oldPackage],['package-lock.json',record.oldLock]])assert.deepEqual(fileIdentity(backup+'/'+name),state,'Exact original recoverable package metadata');
  return record;
}
function mark(record,backup,state,checkpoint){record.state=state;record.events.push(state);atomicJson(backup+'/runtime-pair.json',record);checkpoint(state);}
export function activateRuntimePair(options){
  const {app,stage,backup,checkpoint=()=>{}}=options,record=pairRecord(options),p=record.paths;
  assert.equal(record.state,'prepared');assertIdentity(p.active,record.old);assertIdentity(p.next,record.next);assert.ok(!has(p.previous));sameFilesystem(p.next,app);
  mark(record,backup,'before-old-rename',checkpoint);renameSync(p.active,p.previous);syncDirectory(app);checkpoint('old-rename-unacknowledged');mark(record,backup,'old-retained',checkpoint);
  mark(record,backup,'before-new-rename',checkpoint);renameSync(p.next,p.active);syncDirectory(app);checkpoint('new-rename-unacknowledged');mark(record,backup,'new-installed',checkpoint);
  mark(record,backup,'before-package',checkpoint);atomicCopy(stage+'/package.json',app+'/package.json',record.oldPackage);checkpoint('package-unacknowledged');mark(record,backup,'package-installed',checkpoint);
  mark(record,backup,'before-lock',checkpoint);atomicCopy(stage+'/package-lock.json',app+'/package-lock.json',record.oldLock);checkpoint('lock-unacknowledged');mark(record,backup,'lock-installed',checkpoint);
  assertInstalledPair({...options,expected:'new'});mark(record,backup,'activated',checkpoint);return record;
}
export function assertInstalledPair(options){
  const {app,backup,expected}=options,record=pairRecord(options);assert.ok(['old','new'].includes(expected));
  assertIdentity(record.paths.active,expected==='old'?record.old:record.next);
  for(const [name,old,next] of [['package.json',record.oldPackage,record.newPackageSha256],['package-lock.json',record.oldLock,record.newLockSha256]]){
    const actual=fileIdentity(app+'/'+name);assert.equal(actual.hash,expected==='old'?old.hash:next);assert.equal(actual.mode,old.mode);assert.equal(actual.uid,old.uid);assert.equal(actual.gid,old.gid);
  }
  if(expected==='new')assertIdentity(record.paths.previous,record.old);return record;
}
export function assertRecoverableRuntimePair(options){
  const record=pairRecord(options),active=has(record.paths.active)?runtimeIdentity(record.paths.active):null;
  const old=active&&digestObject(active)===digestObject(record.old),next=active&&digestObject(active)===digestObject(record.next);
  assert.ok(!active||old||next,'Do not overwrite an unknown dependency tree');if(!old)assertIdentity(record.paths.previous,record.old);
  for(const [name,prior,nextHash] of [['package.json',record.oldPackage,record.newPackageSha256],['package-lock.json',record.oldLock,record.newLockSha256]]){
    const current=fileIdentity(options.app+'/'+name);assert.ok([prior.hash,nextHash].includes(current.hash),'Do not overwrite an unknown current package/lock');assert.equal(current.mode,prior.mode);assert.equal(current.uid,prior.uid);assert.equal(current.gid,prior.gid);
  }
  return record;
}
export function notePublicationStep(options,step){
  assert.match(step,/^(?:before|after)-(?:render-copy|old-render-rename|new-render-rename|client-manifest|client-template|service-start|public-proxy|restore-render|restore-template|restore-manifest)$/);const record=pairRecord(options);record.publicationSteps.push(step);atomicJson(options.backup+'/runtime-pair.json',record);return record;
}
export function recoverRuntimePair(options){
  const {app,backup,checkpoint=()=>{}}=options;assert.ok(!has(backup+'/recovery.final.json'),'Final acceptance disarms dependency recovery');const record=assertRecoverableRuntimePair(options),p=record.paths;assert.notEqual(record.state,'accepted');
  if(has(backup+'/runtime-pair.json.next')){ordinary(backup+'/runtime-pair.json.next');const retained=backup+'/runtime-pair.interrupted-'+Date.now()+'-'+process.pid+'.json';assert.ok(!has(retained));renameSync(backup+'/runtime-pair.json.next',retained);syncDirectory(backup);}
  // Inspect reality as well as the durable intent: interruption can occur between rename and journal acknowledgement.
  const active=has(p.active)?runtimeIdentity(p.active):null,oldActive=active&&digestObject(active)===digestObject(record.old),newActive=active&&digestObject(active)===digestObject(record.next);
  assert.ok(!active||oldActive||newActive,'Unknown active runtime: recovery must not overwrite it');
  if(!oldActive){
    assertIdentity(p.previous,record.old);sameFilesystem(p.previous,app);
    if(newActive){assert.ok(!has(p.failed),'Retain rather than overwrite failed runtime');mark(record,backup,'before-failed-retain',checkpoint);renameSync(p.active,p.failed);syncDirectory(app);mark(record,backup,'failed-retained',checkpoint);}
    assert.ok(!has(p.active));mark(record,backup,'before-old-restore',checkpoint);renameSync(p.previous,p.active);syncDirectory(app);mark(record,backup,'old-restored',checkpoint);
  }else assert.ok(!has(p.previous),'Ambiguous duplicate original runtime');
  for(const name of ['package.json','package-lock.json'])if(has(app+'/'+name+'.security-next')){ordinary(app+'/'+name+'.security-next');const retained=app+'/.security-pending-'+path.basename(options.stage)+'-'+name;assert.ok(!has(retained));renameSync(app+'/'+name+'.security-next',retained);syncDirectory(app);}
  mark(record,backup,'before-package-restore',checkpoint);atomicCopy(backup+'/package.json',app+'/package.json',record.oldPackage);mark(record,backup,'package-restored',checkpoint);
  mark(record,backup,'before-lock-restore',checkpoint);atomicCopy(backup+'/package-lock.json',app+'/package-lock.json',record.oldLock);mark(record,backup,'lock-restored',checkpoint);
  assertInstalledPair({...options,expected:'old'});mark(record,backup,'rolled-back',checkpoint);return record;
}
export function journalProof({stage,backup}){const r=json(backup+'/runtime-pair.json');assert.equal(r.stage,stage);assert.equal(r.backup,backup);return {manifestSha256:r.manifestSha256,oldRuntimeSha256:digestObject(r.old),newRuntimeSha256:digestObject(r.next),journalSha256:digest(readFileSync(backup+'/runtime-pair.json')),state:r.state,previousRuntime:r.paths.previous};}
function main(){
  const [mode,stage,backup,expected]=process.argv.slice(2);assert.equal(process.getuid(),0,'Root-only security runtime operation');assert.match(stage||'',/^\/tmp\/oneshowlearn-seo-[a-zA-Z0-9]+$/);ordinary(stage,{directory:true,root:true});
  if(mode==='validate'){validateInputs(stage,backup||APP,{nodePath:'/opt/node-v22/bin/node',root:true});return;}
  assert.match(backup||'',/^\/var\/backups\/oneshowlearn\/seo-[a-zA-Z0-9]+$/);ordinary(backup,{directory:true,root:true});
  const options={app:APP,stage,backup};
  if(mode==='prepare'){const manifest=validateInputs(stage,backup,{nodePath:'/opt/node-v22/bin/node',root:true});prepareRuntimePair({...options,manifest});return;}
  if(mode==='activate'){validateInputs(stage,backup,{nodePath:'/opt/node-v22/bin/node',root:true});activateRuntimePair(options);return;}
  if(mode==='recover'){recoverRuntimePair(options);return;}
  if(mode==='verify-install'){assertInstalledPair({...options,expected});return;}
  if(mode==='note'){notePublicationStep(options,expected);return;}
  throw Error('Unsupported security dependency operation');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)try{main();}catch(error){console.error('Security dependency operation refused:',error instanceof assert.AssertionError?String(error.message).split('\n')[0]:error.code||error.name);process.exitCode=1;}
