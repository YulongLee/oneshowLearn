// Generate public-code release manifests; never include environments, data or uploaded files.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [input,preflight]=process.argv.slice(2),stage=realpathSync(input);
assert.match(stage,/^\/private\/tmp\/oneshowlearn-commercial-package-[a-zA-Z0-9]+$/);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const changed=new Set(['db','index','learning-model','learning-routes','notifications','service-definition','bundle-access','commercial-analytics','commercial-schema','course-certificates','document-parsing','mineru-provider']);
const live=readFileSync(preflight,'utf8').split(/\r?\n/).filter(s=>/^[a-f0-9]{64}  \/(?:var\/www\/oneshowlearn\/(?:server\/[^/]+\.mjs|package(?:-lock)?\.json|dist\/client\/index\.html)|etc\/(?:oneshowlearn\/oneshowlearn\.env|systemd\/system\/oneshowlearn\.service|nginx\/snippets\/oneshowlearn-app\.conf))$/.test(s));
assert.ok(live.length>60,'Complete preflight hashes required');
for(const line of live){const [digest,file]=line.split('  ');if(file.startsWith('/var/www/oneshowlearn/server/')){const name=path.basename(file,'.mjs');if(!changed.has(name))assert.equal(hash(readFileSync(path.join(stage,'server',name+'.mjs'))),digest,'Unreviewed server change: '+name);}}
const walk=folder=>readdirSync(folder).flatMap(name=>{const file=path.join(folder,name),s=lstatSync(file);assert.ok(!s.isSymbolicLink(),'No release symlinks');return s.isDirectory()?walk(file):[file];});
const files=walk(stage).filter(f=>!['live.sha256','release.sha256'].includes(path.basename(f))).sort();
for(const file of files)assert.ok(!/(?:^|\/)(?:\.env[^/]*|uploads(?:-private)?|data|node_modules|\.git)(?:\/|$)|\.(?:db|sqlite|pem)$/.test(file.slice(stage.length)),'Private data forbidden');
writeFileSync(path.join(stage,'live.sha256'),live.join('\n')+'\n',{mode:0o600});
files.push(path.join(stage,'live.sha256'));
writeFileSync(path.join(stage,'release.sha256'),files.map(file=>hash(readFileSync(file))+'  '+path.relative(stage,file)).join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({files:files.length,liveHashes:live.length,frontend:hash(readFileSync(path.join(stage,'client/index.html')))}));
