import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareProxy} from '../deploy/check-commercial-refinement.mjs';
const directory=realpathSync(mkdtempSync(path.join(tmpdir(),'osl-auth-proxy-'))),name='osl-auth-check-'+randomUUID();
const nginxImage=process.env.AUTH_PROXY_IMAGE||'public.ecr.aws/docker/library/nginx:stable-alpine';
if(!nginxImage||nginxImage.startsWith('-')||/[\s]/.test(nginxImage))throw Error('Invalid isolated proxy image');
const docker=args=>{const result=spawnSync('docker',args,{encoding:'utf8',timeout:30000});if(result.status!==0)throw Error('Isolated proxy operation failed: '+args[0]+'; '+String(result.stderr||result.error?.message||'').slice(0,2000));return result.stdout.trim();};
let started=false,checks=0;
try{
 const limits=readFileSync('deploy/nginx-oneshowlearn.conf','utf8').split('\n\nserver {')[0];
 const application=readFileSync('deploy/nginx-oneshowlearn-app.conf','utf8').replaceAll('http://127.0.0.1:8791','http://127.0.0.1:8081');
 // Same maps/zones/location limits, with an isolated static upstream only.
 const oldLimits='limit_req_zone $binary_remote_addr zone=oneshowlearn_auth:10m rate=10r/m;',oldApplication=application.replace('    limit_req zone=oneshowlearn_auth_read burst=30 nodelay;\n','');
 const config=(prefix,app)=>`events {} http { ${prefix}\nserver { listen 8080; ${app} } server { listen 8081; location / { return 200 'isolated upstream'; } } }`;
 writeFileSync(path.join(directory,'nginx.conf'),config(oldLimits,oldApplication));
 docker(['run','--rm','--pull=never','--name',name,'-d','-p','127.0.0.1::8080','-v',directory+'/nginx.conf:/etc/nginx/nginx.conf:ro',nginxImage]);started=true;
 const binding=JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['8080/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');checks++;
 const origin='http://127.0.0.1:'+binding.HostPort;
 const request=(method,route)=>fetch(origin+route,{method,redirect:'manual',signal:AbortSignal.timeout(5000)});
 docker(['exec',name,'nginx','-t']);
 let ready=false;
 for(let attempt=0;attempt<20&&!ready;attempt++){try{const r=await request('GET','/api/health');ready=r.status===200;await r.arrayBuffer();}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'isolated proxy started');checks++;
 const upgraded=prepareProxy(oldLimits,oldApplication,limits);
 writeFileSync(path.join(directory,'nginx.conf'),config(upgraded.site,upgraded.snippet));
 docker(['exec',name,'nginx','-t']);docker(['exec',name,'nginx','-s','reload']);
 await new Promise(r=>setTimeout(r,500));
 const afterReload=await request('GET','/api/auth/profile');assert.equal(afterReload.status,200,'real old-zone to new-zone hot reload');await afterReload.arrayBuffer();checks++;
 for(const method of ['GET','HEAD'])for(const endpoint of ['status','me','profile','identities'])for(let i=0;i<3;i++){
  const r=await request(method,'/api/auth/'+endpoint+'?refresh='+i);assert.equal(r.status,200,'safe read refresh');await r.arrayBuffer();checks++;
 }
 let limited=0;
 for(let i=0;i<32;i++){const r=await request(i%2?'POST':'PUT',i%2?'/api/auth/login':'/api/auth/profile');assert.ok([200,429].includes(r.status));limited+=r.status===429;await r.arrayBuffer();checks++;}
 assert.ok(limited>=20,'original strict mutation burst retained');checks++;
 for(const route of ['/api/auth/register','/api/auth/send-code','/api/auth/profile/','/api/auth/unknown']){const r=await request(route.includes('profile/')||route.includes('unknown')?'GET':'POST',route);assert.equal(r.status,429,'unknown reads and critical mutations remain guarded');await r.arrayBuffer();checks++;}
 const read=await request('GET','/api/auth/me');assert.equal(read.status,200,'login burst does not block safe profile refresh');await read.arrayBuffer();checks++;
 console.log(JSON.stringify({checks,mutation429s:limited,isolatedProxy:true,productionChanged:false}));
}catch(error){
 if(process.env.GITHUB_ACTIONS==='true')console.log('::error title=Isolated proxy acceptance failure::'+String(error.stack||error).slice(0,3000).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
 throw error;
}finally{if(started)docker(['stop','-t','2',name]);rmSync(directory,{recursive:true,force:true});}
