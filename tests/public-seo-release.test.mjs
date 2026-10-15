import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync,symlinkSync,chmodSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {publicAssetLocation} from '../deploy/check-public-seo-release.mjs';

const source=readFileSync(new URL('../deploy/update-public-seo.sh',import.meta.url),'utf8');
const validation=source.match(/"\$stage" "\$app" "\$snippet" <<'NODE'\n([\s\S]*?)\nNODE/)?.[1];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snippet='/etc/nginx/snippets/oneshowlearn-app.conf';
const modules=['index','payment-configuration','public-seo','public-seo-data','public-seo-model'];
function fixture(t){
  const folder=mkdtempSync(path.join(tmpdir(),'osl-seo-release-unit-')),stage=path.join(folder,'stage'),app=path.join(folder,'app');
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const put=(base,name,body)=>{mkdirSync(path.dirname(path.join(base,name)),{recursive:true});writeFileSync(path.join(base,name),body);};
  const manifest=()=>{
    const files=[];function walk(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())walk(path.join(dir,entry.name),relative+'/');else if(relative!=='release.sha256')files.push(relative);}}walk(stage);
    put(stage,'release.sha256',files.sort().map(name=>hash(readFileSync(path.join(stage,name)))+'  '+name).join('\n')+'\n');
  };
  const pkg={name:'isolated-seo-release',type:'module',scripts:{build:'old'},dependencies:{react:'19.2.0'}};
  put(app,'package.json',JSON.stringify(pkg));put(app,'package-lock.json','{"isolated":"unchanged-lock"}');
  put(stage,'package.json',JSON.stringify({...pkg,scripts:{build:'new paired build'}}));
  put(stage,'package-lock.json',readFileSync(path.join(app,'package-lock.json')));
  for(const name of modules)put(stage,'server/'+name+'.mjs','export const isolated = '+JSON.stringify(name)+';\n');
  for(const name of ['index','payment-configuration','unchanged'])put(app,'server/'+name+'.mjs','export const old = '+JSON.stringify(name)+';\n');
  put(stage,'server/unchanged.mjs',readFileSync(path.join(app,'server/unchanged.mjs')));
  for(const name of ['deploy/update-public-seo.sh','deploy/check-public-seo-release.mjs','deploy/portable/database-tools.mjs'])put(stage,name,'// isolated reviewed input\n');
  put(stage,'client/index.html','<meta name="document-rendering" content="public-ssr-v1"><div id="root"></div>');
  put(stage,'client/.vite/manifest.json','{}');put(stage,'client/assets/index-hash.js','// isolated compiled client');
  put(stage,'render/public-render.mjs','export const renderPublicPage = () => "isolated";');
  const proxy='location ^~ /api/auth/ {\n limit_req zone=oneshowlearn_auth_write_v2 burst=10 nodelay;\n limit_req zone=oneshowlearn_auth_read burst=30 nodelay;\n limit_req_status 429;\n}\n'+publicAssetLocation+'\n\nlocation / {\n if ($request_method !~ ^(GET|HEAD)$) { return 405; }\n if ($uri ~* ^/(api|uploads)(/|$)) { return 404; }\n proxy_pass http://127.0.0.1:8791;\n}\n';
  put(stage,'nginx-app.conf',proxy);put(stage,'nginx-maintenance.conf','location / { return 503; }\n');
  put(stage,'maintenance.sha256',hash(readFileSync(path.join(stage,'nginx-maintenance.conf')))+'  '+snippet+'\n');
  const live=[app+'/package.json',app+'/package-lock.json',app+'/dist/client/index.html',
    '/etc/oneshowlearn/oneshowlearn.env','/etc/systemd/system/oneshowlearn.service',snippet];
  put(stage,'live.sha256',live.map(name=>'0'.repeat(64)+'  '+name).join('\n')+'\n');manifest();
  const run=()=>spawnSync(process.execPath,['--input-type=module','-',stage,app,snippet],{input:validation,encoding:'utf8'});
  return {folder,stage,app,put,manifest,run};
}
function pairedFixture(t){
  const f=fixture(t);
  for(const name of modules)f.put(f.app,'server/'+name+'.mjs','export const prior = '+JSON.stringify(name)+';\n');
  f.put(f.app,'dist/client/index.html','<meta name="document-rendering" content="public-ssr-v1"><div id="root"></div>');
  f.put(f.app,'dist/client/.vite/manifest.json','{"isolated":"prior-client-manifest"}');
  const renderNames=['public-render.mjs','assets/old-entry.js','assets/nested/old-style.css','assets/old-font-OFL.txt'];
  for(const name of renderNames)f.put(f.app,'dist/render/'+name,'// isolated previous renderer: '+name+'\n');
  const serverPaths=readdirSync(path.join(f.app,'server')).filter(name=>name.endsWith('.mjs')).map(name=>f.app+'/server/'+name);
  const renderPaths=renderNames.map(name=>f.app+'/dist/render/'+name),manifestPath=f.app+'/dist/client/.vite/manifest.json';
  const guardPaths=[...serverPaths,manifestPath,...renderPaths],live=readFileSync(path.join(f.stage,'live.sha256'),'utf8');
  f.put(f.stage,'live.sha256',live+guardPaths.map(name=>'0'.repeat(64)+'  '+name+'\n').join(''));f.manifest();
  const omitGuard=target=>{const file=path.join(f.stage,'live.sha256');writeFileSync(file,readFileSync(file,'utf8').split('\n').filter(line=>!line.endsWith('  '+target)).join('\n'));f.manifest();};
  const addGuard=target=>{const file=path.join(f.stage,'live.sha256');writeFileSync(file,readFileSync(file,'utf8')+'0'.repeat(64)+'  '+target+'\n');f.manifest();};
  return {...f,serverPaths,renderPaths,manifestPath,omitGuard,addGuard};
}

test('paired public-document updater parses as Bash and has an isolated executable input validator',()=>{
  assert.ok(validation);const result=spawnSync('bash',['-n','deploy/update-public-seo.sh'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('reviewed package scripts, five modules, matching lock and complete paired inputs are accepted',t=>{
  const f=fixture(t),result=f.run();assert.equal(result.status,0,result.stderr);
});
test('a subsequent paired SSR release requires the complete prior renderer, client manifest and server guards',t=>{
  const f=pairedFixture(t),result=f.run();assert.equal(result.status,0,result.stderr);
});
test('a prior SSR renderer cannot lose any original server, renderer or client-manifest guard',async t=>{
  const entries=[...modules.map(name=>'server/'+name+'.mjs'),'server/unchanged.mjs','dist/client/.vite/manifest.json','dist/render/public-render.mjs','dist/render/assets/old-entry.js','dist/render/assets/nested/old-style.css','dist/render/assets/old-font-OFL.txt'];
  for(const relative of entries)await t.test(relative,t=>{const f=pairedFixture(t);f.omitGuard(f.app+'/'+relative);assert.notEqual(f.run().status,0,'Missing prior pair guard: '+relative);});
});
test('a prior SSR renderer requires its actual entry and client manifest, not merely manifest target names',async t=>{
  for(const relative of ['dist/client/index.html','dist/render/public-render.mjs','dist/client/.vite/manifest.json'])await t.test(relative,t=>{
    const f=pairedFixture(t);rmSync(path.join(f.app,relative));assert.notEqual(f.run().status,0,'Missing original pair input: '+relative);
  });
  await t.test('missing entire renderer with a retained SSR template',t=>{const f=pairedFixture(t);rmSync(path.join(f.app,'dist/render'),{recursive:true});assert.notEqual(f.run().status,0,'An existing SSR template cannot be treated as a legacy static-only release');});
  await t.test('existing renderer with a static-only template',t=>{const f=pairedFixture(t);f.put(f.app,'dist/client/index.html','<div id="root"></div>');assert.notEqual(f.run().status,0,'The complete existing pair must identify itself as SSR');});
});
test('prior renderer guards cannot name unobserved render files or unrelated filesystem targets',async t=>{
  for(const relative of ['dist/render/assets/not-present.js','dist/render/not-reviewed.mjs','data/oneshowlearn.db'])await t.test(relative,t=>{
    const f=pairedFixture(t);f.addGuard(f.app+'/'+relative);assert.notEqual(f.run().status,0,'Not an actual reviewed original render path: '+relative);
  });
});
test('prior renderer collection rejects private, hidden, malformed and unapproved paths before publication',async t=>{
  for(const relative of ['.env','private.pem','extra.mjs','assets/.env','assets/private.key','assets/data.sqlite','assets/._old.js','assets/.hidden/entry.js','assets/bad name.js','assets/bad\nname.js','assets/bad$name.js','assets/unapproved.mjs','assets/../outside.js','unapproved/entry.js'])await t.test(JSON.stringify(relative),t=>{
    const f=pairedFixture(t);f.put(f.app,'dist/render/'+relative,'ISOLATED_NOT_A_VALID_PUBLIC_RENDER_INPUT');assert.notEqual(f.run().status,0,'Unsafe prior renderer input must not be silently omitted: '+relative);
  });
  for(const relative of ['private.pem','extra.mjs','assets/private.key','assets/.hidden/entry.js'])await t.test('explicit guard cannot authorize '+relative,t=>{const f=pairedFixture(t);f.put(f.app,'dist/render/'+relative,'ISOLATED_NOT_A_VALID_PUBLIC_RENDER_INPUT');f.addGuard(f.app+'/dist/render/'+relative);assert.notEqual(f.run().status,0,'An explicit hash cannot authorize an unsafe renderer input');});
  for(const relative of ['.hidden','assets/.hidden','assets/bad name'])await t.test('empty directory '+relative,t=>{const f=pairedFixture(t);mkdirSync(path.join(f.app,'dist/render',relative),{recursive:true});assert.notEqual(f.run().status,0,'Unsafe prior renderer directory: '+relative);});
});
test('prior renderer and client-manifest inputs cannot be replaced with symlinks or non-files',async t=>{
  await t.test('linked asset file',t=>{const f=pairedFixture(t),relative='dist/render/assets/linked.js';symlinkSync(path.join(f.app,'package.json'),path.join(f.app,relative));assert.notEqual(f.run().status,0);});
  await t.test('linked asset directory',t=>{const f=pairedFixture(t);symlinkSync(path.join(f.app,'server'),path.join(f.app,'dist/render/assets/linked'));assert.notEqual(f.run().status,0);});
  await t.test('linked renderer root',t=>{const f=pairedFixture(t),root=path.join(f.app,'dist/render');rmSync(root,{recursive:true});symlinkSync(path.join(f.app,'server'),root);assert.notEqual(f.run().status,0);});
  await t.test('linked client manifest',t=>{const f=pairedFixture(t);rmSync(f.manifestPath);symlinkSync(path.join(f.app,'package.json'),f.manifestPath);assert.notEqual(f.run().status,0);});
  await t.test('linked client template',t=>{const f=pairedFixture(t),file=path.join(f.app,'dist/client/index.html');rmSync(file);symlinkSync(path.join(f.stage,'client/index.html'),file);assert.notEqual(f.run().status,0);});
  for(const relative of ['dist/render/public-render.mjs','dist/client/.vite/manifest.json'])await t.test('directory at '+relative,t=>{const f=pairedFixture(t),file=path.join(f.app,relative);rmSync(file);mkdirSync(file);assert.notEqual(f.run().status,0);});
});
test('tampered, omitted and additional manifest inputs fail closed',async t=>{
  await t.test('changed client bytes',t=>{const f=fixture(t);f.put(f.stage,'client/assets/index-hash.js','tampered');assert.notEqual(f.run().status,0);});
  await t.test('extra unlisted file',t=>{const f=fixture(t);f.put(f.stage,'client/assets/extra.js','extra');assert.notEqual(f.run().status,0);});
  await t.test('duplicate entry',t=>{const f=fixture(t),file=path.join(f.stage,'release.sha256'),body=readFileSync(file,'utf8');writeFileSync(file,body+body.split('\n')[0]+'\n');assert.notEqual(f.run().status,0);});
  await t.test('absolute or traversing targets',t=>{for(const name of ['/etc/passwd','../escape','client/../escape']){const f=fixture(t);f.put(f.stage,'release.sha256','0'.repeat(64)+'  '+name+'\n');assert.notEqual(f.run().status,0);}});
});
test('private files, symlinks and metadata sidecars are not valid public stages',async t=>{
  await t.test('private env',t=>{const f=fixture(t);f.put(f.stage,'.env','ISOLATED_SECRET');f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('nested env or credential file cannot masquerade as a public asset',t=>{for(const name of ['client/assets/.env','client/assets/nested/.env','client/assets/private.pem','render/assets/private.pem','render/.key','render/assets/.hidden/visible.js']){const f=fixture(t);f.put(f.stage,name,'ISOLATED_NOT_A_PUBLIC_ASSET');f.manifest();assert.notEqual(f.run().status,0);}});
  await t.test('linked module',t=>{const f=fixture(t);symlinkSync(path.join(f.app,'package.json'),path.join(f.stage,'server/linked.mjs'));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('AppleDouble metadata',t=>{const f=fixture(t);f.put(f.stage,'client/assets/._cover.png','sidecar');f.manifest();assert.notEqual(f.run().status,0);});
});
test('unreviewed module changes and dependency or lock changes are rejected',async t=>{
  await t.test('unreviewed server source',t=>{const f=fixture(t);f.put(f.stage,'server/unchanged.mjs','unexpected');f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('dependency update',t=>{const f=fixture(t),pkg=JSON.parse(readFileSync(path.join(f.stage,'package.json')));pkg.dependencies.react='other';f.put(f.stage,'package.json',JSON.stringify(pkg));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('lock byte change',t=>{const f=fixture(t);f.put(f.stage,'package-lock.json','{}');f.manifest();assert.notEqual(f.run().status,0);});
});
test('fresh expected live targets cannot be omitted or point outside the protected deployment',async t=>{
  await t.test('missing original entry guard',t=>{const f=fixture(t),file=path.join(f.stage,'live.sha256');writeFileSync(file,readFileSync(file,'utf8').split('\n').filter(line=>!line.includes('/dist/client/index.html')).join('\n'));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('unrelated filesystem target',t=>{const f=fixture(t),file=path.join(f.stage,'live.sha256');writeFileSync(file,readFileSync(file,'utf8')+'0'.repeat(64)+'  /etc/shadow\n');f.manifest();assert.notEqual(f.run().status,0);});
});
test('document writes, weakened authentication limits and wrong maintenance hashes fail validation',async t=>{
  await t.test('document mutation bypass',t=>{const f=fixture(t),file=path.join(f.stage,'nginx-app.conf');writeFileSync(file,readFileSync(file,'utf8').replace('if ($request_method !~ ^(GET|HEAD)$) { return 405; }',''));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('mixed-case GET callback bypass',t=>{const f=fixture(t),file=path.join(f.stage,'nginx-app.conf');writeFileSync(file,readFileSync(file,'utf8').replace('if ($uri ~* ^/(api|uploads)(/|$)) { return 404; }',''));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('wrong authentication zone',t=>{const f=fixture(t),file=path.join(f.stage,'nginx-app.conf');writeFileSync(file,readFileSync(file,'utf8').replace('oneshowlearn_auth_write_v2','bypassed'));f.manifest();assert.notEqual(f.run().status,0);});
  for(const [name,from,to] of [['weakened authentication write budget','burst=10 nodelay','burst=999 nodelay'],['weakened authentication read budget','burst=30 nodelay','burst=999 nodelay'],['removed authentication status','limit_req_status 429;','']])await t.test(name,t=>{const f=fixture(t),file=path.join(f.stage,'nginx-app.conf');writeFileSync(file,readFileSync(file,'utf8').replace(from,to));f.manifest();assert.notEqual(f.run().status,0);});
  await t.test('maintenance hash differs from reviewed maintenance snippet',t=>{const f=fixture(t);f.put(f.stage,'maintenance.sha256','0'.repeat(64)+'  '+snippet+'\n');f.manifest();assert.notEqual(f.run().status,0);});
});
test('public assets require the exact isolated static prefix, without document or filesystem leaks',async t=>{
  for(const [name,changed] of [
    ['missing public asset prefix',''],
    ['broad prefix without slash',publicAssetLocation.replace('/assets/ {','/assets {')],
    ['duplicate asset prefix',publicAssetLocation+'\n'+publicAssetLocation],
    ['alias escapes the public root',publicAssetLocation.replace('try_files $uri =404;','alias /isolated/private/;')],
    ['root escapes the public directory',publicAssetLocation.replace('try_files $uri =404;','root /isolated/private;\n    try_files $uri =404;')],
    ['proxy would expose another route',publicAssetLocation.replace('try_files $uri =404;','proxy_pass http://127.0.0.1:8791;')],
    ['missing asset falls back to the document shell',publicAssetLocation.replace('try_files $uri =404;','try_files $uri /index.html;')],
  ])await t.test(name,t=>{const f=fixture(t),file=path.join(f.stage,'nginx-app.conf');writeFileSync(file,readFileSync(file,'utf8').replace(publicAssetLocation,changed));f.manifest();assert.notEqual(f.run().status,0);});
});
test('publication orders consistent backups, provider-blocked rehearsal, idle guards and paired cutover',()=>{
  assert.match(source,/stage.*\^\/tmp\/oneshowlearn-seo-\[a-zA-Z0-9\]\+\$/);
  assert.match(source,/modules=\(index payment-configuration public-seo public-seo-data public-seo-model\)/);
  assert.ok(source.indexOf('check capture original')<source.indexOf('check rehearse original'));
  assert.ok(source.indexOf('check rehearse original')<source.indexOf('if [[ "$mode" = --rehearse-only ]]'));
  const publication=source.slice(source.indexOf('preserve_assets\noriginal_guard'));
  assert.ok(publication.indexOf('enter_maintenance')<publication.indexOf('systemctl stop oneshowlearn'));
  assert.match(publication,/idle\nmaintenance_guard[\s\S]*systemctl stop oneshowlearn\nidle/);
  assert.ok(publication.indexOf('snapshot "$backup/release.db"')<publication.indexOf('changed=true'));
  assert.ok(publication.indexOf('"$backup/rollback.sha256"')<publication.indexOf('changed=true'));
  assert.ok(publication.indexOf('check live post')<publication.indexOf('atomic_file "$stage/nginx-app.conf"'));
  assert.ok(publication.indexOf('systemctl reload nginx')<publication.indexOf('check https post'));
  assert.ok(publication.indexOf('check verify-guard post')<publication.indexOf('trap - EXIT'));
});
test('rollback is code-only, retains all assets/runtime and remains armed until outer acceptance',()=>{
  assert.match(source,/--rollback-only/);assert.match(source,/rollbackArmed:true/);assert.match(source,/r\.rollbackArmed,true/);
  assert.match(source,/\[\[ ! -e "\$backup\/recovery\.final\.json" \]\] \|\| exit 1/);
  assert.doesNotMatch(source,/! -e "\$backup\/receipt\.json"/);
  assert.match(source,/check verify-guard rollback/);assert.doesNotMatch(source,/check receipt/);
  assert.match(source,/if \[\[ "\$changed" = true \]\]; then[\s\S]*if \[\[ "\$maintenance" = false \]\] && ! enter_maintenance/);
  assert.match(source,/if \[\[ "\$proxy_changed" = true && "\$recovery_status" = 0 \]\]/);
  const restore=source.slice(source.indexOf('restore_code(){'),source.indexOf('recover(){'));
  assert.doesNotMatch(restore,/(?:cp|install|mv)[^\n]*\$backup\/(?:data|before\.db|release\.db|node_modules|uploads|oneshowlearn\.env)/);
  assert.match(restore,/case "\$name" in public-seo\|public-seo-data\|public-seo-model\)/);
  assert.doesNotMatch(restore,/atomic_(?:file|original) "\$backup\/package-lock\.json"/);
  assert.match(restore,/atomic_original "\$backup\/server\/\$name\.mjs"/);
  for(const name of ['package.json','client/index.html','client/.vite/manifest.json'])assert.ok(restore.includes('atomic_original "$backup/'+name+'"'));
  assert.doesNotMatch(restore,/chmod -R a\+rX/);
  assert.match(source,/atomic_original "\$backup\/oneshowlearn-app\.conf" "\$snippet"/);
  assert.doesNotMatch(source,/rm -rf|docker (?:system|volume|container)|npm (?:ci|install)|(?:bootstrap|migrate)\.mjs|systemctl (?:stop|start|restart) (?:nginx|oneshowseo|pocketledger)/);
  assert.match(source,/if \[\[ -e "\$target" \]\]; then cmp/);
  assert.match(source,/sleep 3/);assert.doesNotMatch(source,/sleep (?:[6-9]\d|\d{3,})/);
});
test('atomic original-file recovery preserves backed-up bytes, owner, group and private modes',t=>{
  const folder=mkdtempSync(path.join(tmpdir(),'osl-seo-original-metadata-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const original=source.slice(source.indexOf('atomic_original(){'),source.indexOf('original_guard(){'));assert.match(original,/cp -p -- "\$source" "\$pending"/);assert.ok(original.indexOf('cp -p')<original.indexOf('mv -f'));
  const backup=path.join(folder,'backup'),target=path.join(folder,'target');
  for(const mode of [0o600,0o640,0o644]){
    writeFileSync(backup,'original-content-'+mode);chmodSync(backup,mode);writeFileSync(target,'new-content');chmodSync(target,0o644);
    const result=spawnSync('bash',['-c',original+'\natomic_original "$1" "$2"','isolated',backup,target],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const a=statSync(backup),b=statSync(target);assert.equal(readFileSync(target,'utf8'),readFileSync(backup,'utf8'));assert.equal(b.mode&0o777,a.mode&0o777);assert.equal(b.uid,a.uid);assert.equal(b.gid,a.gid);
  }
  const linked=path.join(folder,'linked');symlinkSync(target,linked);const rejected=spawnSync('bash',['-c',original+'\natomic_original "$1" "$2"','isolated',backup,linked],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.equal(readFileSync(target,'utf8'),readFileSync(backup,'utf8'));
});
test('an interrupted receipt remains recoverable until the final commit marker exists',t=>{
  const backup=mkdtempSync(path.join(tmpdir(),'osl-seo-final-marker-'));
  t.after(()=>rmSync(backup,{recursive:true,force:true}));
  const guard=source.match(/^\s*(\[\[ ! -e "\$backup\/recovery\.final\.json" \]\] \|\| exit 1)$/m)?.[1];
  assert.ok(guard);
  const run=()=>spawnSync('bash',['-c',`${guard}\necho RECOVERY_STILL_ARMED`],{env:{...process.env,backup},encoding:'utf8'});
  writeFileSync(path.join(backup,'receipt.json'),'{"attempted":true}\n');
  const partial=run();assert.equal(partial.status,0);assert.ok(partial.stdout.includes('RECOVERY_STILL_ARMED'));
  writeFileSync(path.join(backup,'recovery.final.json'),'{"rollbackArmed":false}\n');
  const committed=run();assert.equal(committed.status,1);assert.equal(committed.stdout,'');
});
test('recovery stops no service or code when fresh maintenance or idle checks fail',()=>{
  const recover=source.slice(source.indexOf('recover(){'),source.indexOf('\nif [[ "$mode" = --rollback-only ]]'));
  const run=(maintenanceResult,idleResult,rollback=false)=>spawnSync('bash',['-c',`
stage=/isolated/stage; backup=/isolated/backup; snippet=/isolated/snippet
changed=${rollback?'false':'true'}; stopped=false; proxy_changed=true; maintenance=${rollback?'true':'false'}; rollback_mode=${rollback?'true':'false'}
enter_maintenance(){ echo MAINTENANCE; maintenance=true; return ${maintenanceResult}; }
idle(){ echo IDLE; return ${idleResult}; }
systemctl(){ echo SYSTEMCTL "$@"; }
restore_code(){ echo RESTORE_CODE; }
ready(){ echo READY; }
atomic_file(){ echo ATOMIC "$@"; }
atomic_original(){ echo ORIGINAL "$@"; }
nginx(){ echo NGINX "$@"; }
${recover}
false
recover
`],{encoding:'utf8'});
  for(const [maintenance,idle] of [[1,0],[0,1]]){
    const result=run(maintenance,idle);assert.equal(result.status,1);assert.ok(result.stdout.includes('MAINTENANCE'));
    assert.ok(!result.stdout.includes('SYSTEMCTL'));assert.ok(!result.stdout.includes('RESTORE_CODE'));assert.ok(!result.stdout.includes('ATOMIC'));assert.ok(!result.stdout.includes('ORIGINAL'));
  }
  const earlyRollback=run(0,1,true);assert.equal(earlyRollback.status,1);
  assert.ok(earlyRollback.stdout.includes('ATOMIC /isolated/stage/nginx-app.conf /isolated/snippet'));
  assert.ok(!earlyRollback.stdout.includes('/isolated/backup/oneshowlearn-app.conf'));
  assert.doesNotMatch(earlyRollback.stdout,/SYSTEMCTL (?:stop|start)/);assert.ok(!earlyRollback.stdout.includes('RESTORE_CODE'));
  const safe=run(0,0);assert.equal(safe.status,1);assert.ok(safe.stdout.indexOf('IDLE')<safe.stdout.indexOf('SYSTEMCTL stop'));
  assert.ok(safe.stdout.indexOf('SYSTEMCTL stop')<safe.stdout.indexOf('RESTORE_CODE'));
  assert.ok(safe.stdout.includes('ORIGINAL /isolated/backup/oneshowlearn-app.conf /isolated/snippet'));
});
