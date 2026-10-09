#!/usr/bin/env node
// Independent installation boundary. Never uses the existing systemd deployment.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,renameSync,copyFileSync,cpSync,existsSync,lstatSync,chmodSync,chownSync,readdirSync,rmdirSync,realpathSync,openSync,readSync,closeSync,rmSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {initialEnvironment,parseEnvironment,validateEnvironment} from './environment.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const composeFile=path.join(sourceRoot,'deploy/portable/compose.yaml');
const stateDirs=['data','uploads','uploads-private','uploads-staging','static-assets'];
const fail=message=>{throw Object.assign(Error(message),{isOperationError:true});};
export function safeDirectory(value) {
  if(!value||!path.isAbsolute(value)||path.resolve(value)!==value||value.split(path.sep).filter(Boolean).length<2||/[\r\n'$]/.test(value)||[sourceRoot,process.env.HOME].includes(value))fail('Use a dedicated absolute installation directory');
  let current=path.parse(value).root;
  for(const part of value.split(path.sep).filter(Boolean)){current=path.join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())fail('Symlink installation directories are refused');}
  return value;
}
function execute(args,{capture=false,cwd=sourceRoot}={}) {
  const result=spawnSync(args[0],args.slice(1),{cwd,stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:'utf8'});
  if(result.error||result.status!==0)fail('Command failed: '+args[0]+' '+args.slice(1,3).join(' '));
  return capture?result.stdout.trim():'';
}
function atomicText(file,value) {const next=file+'.'+randomUUID()+'.next';writeFileSync(next,value,{mode:0o600,flag:'wx'});renameSync(next,file);}
function atomicJson(file,value) {atomicText(file,JSON.stringify(value,null,2)+'\n');}
function ownerDirectory(directory,uid,gid) {mkdirSync(directory,{mode:0o700});if(process.getuid?.()===0)chownSync(directory,uid,gid);}
function readState(directory) {
  safeDirectory(directory);
  const file=path.join(directory,'deployment.json');if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())fail('Deployment metadata must be a regular file');
  const state=JSON.parse(readFileSync(file,'utf8'));
  if(state.format!=='oneshowlearn-deployment-v1'||!/^osl-[a-f0-9]{12}$/.test(state.project)||!Number.isInteger(state.port)||state.port<1024||state.port>65535||![state.uid,state.gid].every(n=>Number.isInteger(n)&&n>0))fail('Invalid deployment metadata');
  for(const pair of [state.current,state.previous].filter(Boolean))if(![pair.api,pair.web].every(v=>/^sha256:[a-f0-9]{64}$/.test(v))||!pair.revision||!/^[a-f0-9]{64}$/.test(pair.sourceHash))fail('Invalid immutable release metadata');
  const envPath=path.join(directory,'app.env');
  if(!lstatSync(envPath).isFile()||lstatSync(envPath).isSymbolicLink()||(lstatSync(envPath).mode&0o077))fail('app.env must be a private regular file');
  validateEnvironment(parseEnvironment(readFileSync(envPath,'utf8')));
  for(const name of stateDirs)if(!lstatSync(path.join(directory,name)).isDirectory()||lstatSync(path.join(directory,name)).isSymbolicLink())fail('Unsafe data directory');
  return state;
}
function withLock(directory,fn) {
  const lock=path.join(directory,'.operation-lock');
  mkdirSync(lock,{mode:0o700});
  try{return fn();}finally{rmdirSync(lock);}
}
function compose(directory,state,args) {
  const config={API_IMAGE:state.current?.api||'unconfigured',WEB_IMAGE:state.current?.web||'unconfigured',APP_UID:state.uid,APP_GID:state.gid,HTTP_PORT:state.port,STATE_DIR:directory,APP_ENV_FILE:path.join(directory,'app.env')};
  const file=path.join(directory,'compose.env');
  atomicText(file,Object.entries(config).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n');
  return execute(['docker','compose','--env-file',file,'--project-name',state.project,'-f',composeFile,...args]);
}
function offline(directory,state) {
  const running=execute(['docker','ps','--filter',`label=com.docker.compose.project=${state.project}`,'--filter','label=com.docker.compose.oneoff=False','--format','{{.ID}}'],{capture:true});
  if(running)fail('Stop this installation before offline backup or restore');
}
function runTool(directory,state,tool,args=[]) {compose(directory,state,['run','--rm','--no-deps','-T','--entrypoint','node','api','deploy/portable/'+tool+'.mjs',...args]);}
export function validateImagePair(api,web,inspect) {
  const images=[api,web].map(image=>{if(!image||/[\s\r\n]/.test(image)||image.startsWith('-'))fail('Invalid image reference');return inspect(image);});
  const labels=images.map(i=>i.Config?.Labels||{}),revision=labels[0]['org.opencontainers.image.revision'],hash=labels[0]['io.oneshowlearn.source-hash'];
  if(!revision||!hash||hash==='unknown'||!/^[a-f0-9]{64}$/.test(hash)||labels[1]['org.opencontainers.image.revision']!==revision||labels[1]['io.oneshowlearn.source-hash']!==hash)fail('API and web images must come from the same verified source');
  if(labels[0]['io.oneshowlearn.role']!=='api'||labels[1]['io.oneshowlearn.role']!=='web')fail('Image service roles must match');
  if(!images.every(i=>/^sha256:[a-f0-9]{64}$/.test(i.Id)))fail('Immutable image IDs required');
  return {api:images[0].Id,web:images[1].Id,revision,sourceHash:hash};
}
function imagePair(api,web) {return validateImagePair(api,web,image=>JSON.parse(execute(['docker','image','inspect',image],{capture:true}))[0]);}
function treeHash(directory,hash=createHash('sha256')) {
  for(const name of readdirSync(directory).sort()) {
    const file=path.join(directory,name),stat=lstatSync(file);
    if(stat.isSymbolicLink())fail('Release source cannot contain symlinks');
    hash.update(path.relative(sourceRoot,file)+'\0');
    if(stat.isDirectory())treeHash(file,hash);else if(stat.isFile())hash.update(readFileSync(file));
  }
  return hash;
}
function releaseSourceHash() {
  const hash=createHash('sha256');
  for(const name of ['src','server','deploy/portable','worker','.openai','tests'])treeHash(path.join(sourceRoot,name),hash);
  for(const name of ['package.json','package-lock.json','Dockerfile','.dockerignore','index.html','vite.config.mjs','scripts/prepare-sites-build.mjs','scripts/prepare-opc-curriculum.mjs','deploy/import-demo-materials.mjs','deploy/publish-demo-projects.mjs','deploy/import-opc-curriculum.mjs','docs/curriculum/ai-opc-20261001.json','.github/workflows/ci.yml'])hash.update(name+'\0').update(readFileSync(path.join(sourceRoot,name)));
  for(const name of ['scripts/check-operations.mjs','deploy/configure-mineru.mjs','deploy/update-commercial-completion.sh','deploy/nginx-oneshowlearn.conf','deploy/nginx-oneshowlearn-https.conf','deploy/nginx-oneshowlearn-app.conf'])hash.update(name+'\0').update(readFileSync(path.join(sourceRoot,name)));
  return hash.digest('hex');
}
function fileDigest(file) {
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024),fd=openSync(file,'r');
  try{let size;while((size=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,size));return hash.digest('hex');}finally{closeSync(fd);}
}
function inventory(directory) {
  const files=[];
  const walk=d=>{for(const name of readdirSync(d).sort()){const file=path.join(d,name),s=lstatSync(file);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile()))fail('Backup refused unsafe file');if(s.isDirectory())walk(file);else files.push(path.relative(directory,file));}};
  walk(directory);return files;
}
function retainAssets(directory,state) {
  const stage=path.join(directory,'assets-stage-'+randomUUID()),container='osl-assets-'+randomUUID();
  mkdirSync(stage,{mode:0o700});let created=false;
  try {
    execute(['docker','create','--name',container,state.current.web],{capture:true});created=true;
    execute(['docker','cp',container+':/usr/share/nginx/html/assets/.',stage]);
    const files=inventory(stage),dest=path.join(directory,'static-assets');inventory(dest);chmodSync(dest,0o755);
    // Never replace an old hashed chunk. A naming collision aborts the release.
    for(const name of files){const target=path.join(dest,name);if(existsSync(target)&&fileDigest(target)!==fileDigest(path.join(stage,name)))fail('Static asset collision; previous assets retained');}
    for(const name of files){const target=path.join(dest,name);if(!existsSync(target)){mkdirSync(path.dirname(target),{recursive:true,mode:0o755});copyFileSync(path.join(stage,name),target);chmodSync(target,0o644);}}
  }finally{if(created)execute(['docker','rm',container],{capture:true});rmSync(stage,{recursive:true,force:true});}
}
function backup(directory,state) {
  offline(directory,state);
  if(!state.current)fail('No deployed version to snapshot');
  for(const name of stateDirs)inventory(path.join(directory,name));
  const id='backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
  const parent=path.join(directory,'backups');if(existsSync(parent)&&(!lstatSync(parent).isDirectory()||lstatSync(parent).isSymbolicLink()))fail('Unsafe backup directory');mkdirSync(parent,{recursive:true,mode:0o700});
  const dest=path.join(parent,id);mkdirSync(dest,{mode:0o700});
  const snapshot='snapshot-'+randomUUID()+'.db';
  runTool(directory,state,'database-tools',['check']);
  runTool(directory,state,'database-tools',['snapshot','/app/data/'+snapshot]);
  renameSync(path.join(directory,'data',snapshot),path.join(dest,'oneshowlearn.db'));
  copyFileSync(path.join(directory,'app.env'),path.join(dest,'app.env'));chmodSync(path.join(dest,'app.env'),0o600);
  for(const name of stateDirs.filter(n=>n!=='data'))cpSync(path.join(directory,name),path.join(dest,name),{recursive:true,dereference:false});
  // Retain local encryption files/other data without copying live WAL/main DB files.
  mkdirSync(path.join(dest,'data'),{mode:0o700});
  for(const name of readdirSync(path.join(directory,'data')))if(!/^(oneshowlearn\.db(?:-wal|-shm|-journal)?|snapshot-.*\.db)$/.test(name))cpSync(path.join(directory,'data',name),path.join(dest,'data',name),{recursive:true,dereference:false});
  atomicJson(path.join(dest,'deployment.json'),state);
  const entries={};
  for(const relative of inventory(dest))entries[relative]=fileDigest(path.join(dest,relative));
  atomicJson(path.join(dest,'manifest.json'),{format:'oneshowlearn-backup-v1',createdAt:new Date().toISOString(),files:entries});
  console.log('Private consistent backup: '+dest);return dest;
}
export function verifyBackup(directory) {
  safeDirectory(directory);const manifestFile=path.join(directory,'manifest.json');if(!lstatSync(manifestFile).isFile()||lstatSync(manifestFile).isSymbolicLink())fail('Unsafe backup manifest file');const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
  if(manifest.format!=='oneshowlearn-backup-v1'||!manifest.files?.['oneshowlearn.db']||!manifest.files['app.env']||!manifest.files['deployment.json'])fail('Incomplete backup');
  const actual=inventory(directory).filter(n=>n!=='manifest.json').sort(),expected=Object.keys(manifest.files).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Backup contains missing or unlisted files');
  for(const [relative,digest] of Object.entries(manifest.files)) {
    if(path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..')||!/^([a-f0-9]{64})$/.test(digest))fail('Unsafe backup manifest');
    const file=path.join(directory,relative);
    if(!realpathSync(file).startsWith(realpathSync(directory)+path.sep)||lstatSync(file).isSymbolicLink()||fileDigest(file)!==digest)fail('Backup integrity verification failed');
  }
  return manifest;
}
async function main() {
  const [command,...raw]=process.argv.slice(2),options={};
  const allowed={init:['directory','origin','admin-email','port'],build:['release','allow-dirty','node-image','nginx-image'],deploy:['directory','api','web','bootstrap','allow-maintenance'],rollback:['directory','allow-maintenance'],restore:['directory','from','port'],backup:['directory'],stop:['directory'],status:['directory']};
  if(!allowed[command])fail('Commands: init, build, deploy, status, stop, backup, restore, rollback');
  for(let i=0;i<raw.length;i++){
    if(!/^--[a-z-]+$/.test(raw[i]))fail('Named options required');const key=raw[i].slice(2);
    if(!allowed[command].includes(key)||Object.hasOwn(options,key))fail('Unknown or duplicate option');
    if(['allow-dirty','allow-maintenance','bootstrap'].includes(key))options[key]=true;
    else{if(!raw[i+1]||raw[i+1].startsWith('--'))fail('Option value required');options[key]=raw[++i];}
  }
  if(command==='init') {
    const directory=safeDirectory(options.directory),env=initialEnvironment(options.origin,options['admin-email']);
    if(existsSync(directory))fail('Initialization refuses to overwrite any existing directory');
    const port=Number(options.port||8080);if(!Number.isInteger(port)||port<1024||port>65535)fail('Invalid local HTTP port');
    const uid=process.getuid?.()===0?1000:(process.getuid?.()||1000),gid=process.getuid?.()===0?1000:(process.getgid?.()||1000);
    mkdirSync(directory,{recursive:true,mode:0o700});
    for(const name of stateDirs)ownerDirectory(path.join(directory,name),uid,gid);
    writeFileSync(path.join(directory,'app.env'),Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
    atomicJson(path.join(directory,'deployment.json'),{format:'oneshowlearn-deployment-v1',project:'osl-'+randomUUID().replaceAll('-','').slice(0,12),uid,gid,port,current:null,previous:null});
    console.log('Private installation prepared; credentials are only in app.env. Registration/providers remain disabled.');return;
  }
  if(command==='build') {
    const release=options.release;if(!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(release||''))fail('Explicit release name required');
    const dirty=execute(['git','status','--porcelain'],{capture:true});if(dirty&&!options['allow-dirty'])fail('Production builds require a clean Git checkout; --allow-dirty is for isolated rehearsal only');
    const revision=execute(['git','rev-parse','HEAD'],{capture:true})+(dirty?'-dirty':'');
    const sourceHash=releaseSourceHash();
    const bases=[];
    for(const [key,arg] of [['node-image','NODE_IMAGE'],['nginx-image','NGINX_IMAGE']])if(options[key]){if(typeof options[key]!=='string'||/[\s]/.test(options[key])||options[key].startsWith('-'))fail('Invalid base image');bases.push('--build-arg',arg+'='+options[key]);}
    execute(['docker','build','--target','verification',...bases,'.']);
    for(const target of ['api','web'])execute(['docker','build','--target',target,...bases,'--build-arg','REVISION='+revision,'--build-arg','SOURCE_HASH='+sourceHash,'-t',`oneshowlearn-${target}:${release}`,'.']);
    if(releaseSourceHash()!==sourceHash)fail('Source changed during build; release refused, rebuild a stable checkout');
    const pair=imagePair(`oneshowlearn-api:${release}`,`oneshowlearn-web:${release}`),output=path.join(sourceRoot,'artifacts/releases');mkdirSync(output,{recursive:true});atomicJson(path.join(output,release+'.json'),{...pair,release,dirty:Boolean(dirty),createdAt:new Date().toISOString()});console.log('Versioned images built: '+release);return;
  }
  if(command==='restore') {
    const directory=safeDirectory(options.directory),source=safeDirectory(options.from);verifyBackup(source);
    if(existsSync(directory))fail('Restore requires a new directory; existing data is never overwritten');
    const old=JSON.parse(readFileSync(path.join(source,'deployment.json'),'utf8'));
    const port=Number(options.port||old.port);if(!Number.isInteger(port)||port<1024||port>65535)fail('Invalid restore HTTP port');
    validateEnvironment(parseEnvironment(readFileSync(path.join(source,'app.env'),'utf8')));
    for(const name of stateDirs)if(!lstatSync(path.join(source,name)).isDirectory()||lstatSync(path.join(source,name)).isSymbolicLink())fail('Incomplete backup directories');
    mkdirSync(directory,{recursive:true,mode:0o700});
    for(const name of stateDirs)cpSync(path.join(source,name),path.join(directory,name),{recursive:true,dereference:false});
    copyFileSync(path.join(source,'oneshowlearn.db'),path.join(directory,'data/oneshowlearn.db'));copyFileSync(path.join(source,'app.env'),path.join(directory,'app.env'));chmodSync(path.join(directory,'app.env'),0o600);
    const uid=process.getuid?.()===0?1000:(process.getuid?.()||1000),gid=process.getuid?.()===0?1000:(process.getgid?.()||1000);
    const own=d=>{if(process.getuid?.()===0)chownSync(d,uid,gid);if(lstatSync(d).isDirectory())for(const n of readdirSync(d))own(path.join(d,n));};for(const n of stateDirs)own(path.join(directory,n));
    atomicJson(path.join(directory,'deployment.json'),{...old,project:'osl-'+randomUUID().replaceAll('-','').slice(0,12),uid,gid,port});
    readState(directory);console.log('Verified backup restored offline. Keep the same origin/keys until deliberate cutover; source untouched.');return;
  }
  const directory=safeDirectory(options.directory),state=readState(directory);
  return withLock(directory,()=>{
    if(command==='status')return compose(directory,state,['ps']);
    if(command==='stop')return compose(directory,state,['stop']);
    if(command==='backup')return backup(directory,state);
    if(command==='deploy'||command==='rollback') {
      const candidate=command==='rollback'?state.previous:imagePair(options.api,options.web);
      if(!candidate)fail('No previous release available');
      const next={...state,current:candidate,previous:state.current};
      if(state.current) {
        if(!options['allow-maintenance'])fail('Upgrade/rollback requires --allow-maintenance for a short outage');
        runTool(directory,state,'database-tools',['idle']);
        compose(directory,state,['stop']);
        try{backup(directory,state);}catch(e){compose(directory,state,['up','-d','--wait','--wait-timeout','90']);throw e;}
      }
      try {
        if(command==='deploy')runTool(directory,next,'migrate');
        if(!state.current&&options.bootstrap)runTool(directory,next,'bootstrap');
        retainAssets(directory,next);
        compose(directory,next,['up','-d','--wait','--wait-timeout','90']);
        atomicJson(path.join(directory,'deployment.json'),next);console.log('Healthy release activated; business data retained');
      } catch(e) {
        compose(directory,next,['stop']);
        if(state.current)compose(directory,state,['up','-d','--wait','--wait-timeout','90']);
        fail('Release failed; prior code restored when available. Database not rolled back. Inspect the private snapshot before recovery.');
      }
      return;
    }
    fail('Commands: init, build, deploy, status, stop, backup, restore, rollback');
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.isOperationError?error.message:'Engineering operation failed. Check options, permissions, image availability and private deployment state; no credentials printed.');process.exitCode=1;});
