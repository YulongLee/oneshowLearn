// Fresh read-only preflight; a public-code package never contains a key or live data.
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,cpSync,mkdirSync,readdirSync,lstatSync} from 'node:fs';
import {checkDependencyDelta,prepareProxy,reviewedModules,digest} from './check-commercial-refinement.mjs';
const key=process.argv[2];assert.ok(path.isAbsolute(key)&&lstatSync(key).isFile());
const args=['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','ubuntu@124.223.104.160'];
const read=command=>execFileSync('ssh',[...args,command],{encoding:'utf8',timeout:30000});
const app='/var/www/oneshowlearn',site='/etc/nginx/sites-available/oneshowlearn',snippet='/etc/nginx/snippets/oneshowlearn-app.conf';
const live=read('sudo -n sha256sum '+app+'/server/*.mjs '+app+'/package.json '+app+'/package-lock.json '+app+'/dist/client/index.html /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service '+site+' '+snippet+' /etc/nginx/sites-available/default /etc/nginx/sites-available/oneshowseo /etc/nginx/sites-available/pocketledger');
const lines=live.trim().split('\n');assert.ok(lines.length>70);for(const line of lines)assert.match(line,/^[a-f0-9]{64}  \/[a-zA-Z0-9_./-]+$/);
const old=JSON.parse(read('sudo -n cat '+app+'/package-lock.json')),next=JSON.parse(readFileSync('package-lock.json'));checkDependencyDelta(old,next);
const localNames=readdirSync('server').filter(n=>n.endsWith('.mjs'));for(const line of lines){const [h,file]=line.split('  ');if(file.startsWith(app+'/server/')){const name=path.basename(file,'.mjs');assert.ok(localNames.includes(name+'.mjs'));if(!reviewedModules.includes(name))assert.equal(digest(readFileSync('server/'+name+'.mjs')),h,'Unreviewed module: '+name);}}
const liveNames=lines.filter(l=>l.includes(app+'/server/')).map(l=>path.basename(l.split('  ')[1]));for(const name of localNames)if(!liveNames.includes(name))assert.equal(name,'tutor-intent.mjs','Only reviewed added module');
const currentSite=read('sudo -n cat '+site),currentSnippet=read('sudo -n cat '+snippet),prefix=readFileSync('deploy/nginx-oneshowlearn.conf','utf8').split('\n\nserver {')[0];
const proxy=prepareProxy(currentSite,currentSnippet,prefix);
assert.equal(digest(currentSite),lines.find(l=>l.endsWith('  '+site)).slice(0,64));assert.equal(digest(currentSnippet),lines.find(l=>l.endsWith('  '+snippet)).slice(0,64));
const stage=realpathSync(mkdtempSync(path.join(tmpdir(),'oneshowlearn-refinement-package-')));cpSync('server',stage+'/server',{recursive:true});cpSync('dist/client',stage+'/client',{recursive:true});mkdirSync(stage+'/deploy/portable',{recursive:true});
for(const name of ['package.json','package-lock.json'])cpSync(name,stage+'/'+name);
for(const name of ['check-commercial-refinement.mjs','update-commercial-refinement.sh','verify-frontend.mjs'])cpSync('deploy/'+name,stage+'/deploy/'+name);
cpSync('deploy/portable/database-tools.mjs',stage+'/deploy/portable/database-tools.mjs');
writeFileSync(stage+'/live.sha256',live,{mode:0o600});writeFileSync(stage+'/nginx-site.conf',proxy.site);writeFileSync(stage+'/nginx-app.conf',proxy.snippet);
const walk=dir=>readdirSync(dir).flatMap(n=>{const p=path.join(dir,n),s=lstatSync(p);assert.ok(!s.isSymbolicLink());return s.isDirectory()?walk(p):[p];});const files=walk(stage).sort();
for(const file of files)assert.ok(!/(?:^|\/)(?:\.env[^/]*|data|uploads(?:-private)?|node_modules|\.git)(?:\/|$)|\.(?:db|sqlite|pem)$/.test(path.relative(stage,file)));
writeFileSync(stage+'/release.sha256',files.map(p=>digest(readFileSync(p))+'  '+path.relative(stage,p)).join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({stage,files:files.length,liveHashes:lines.length,frontend:digest(readFileSync(stage+'/client/index.html')),modules:reviewedModules}));
