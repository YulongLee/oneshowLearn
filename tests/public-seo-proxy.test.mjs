import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function locationBlock(source,header){
  const start=source.indexOf(header);assert.ok(start>=0,header);
  const open=source.indexOf('{',start);let depth=1,end=open+1;
  while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
  assert.equal(depth,0);return source.slice(open+1,end-1);
}
const guard=/if\s*\(\$request_method\s*!~\s*\^\(GET\|HEAD\)\$\)\s*\{\s*return 405;\s*\}/;
for(const file of ['deploy/nginx-oneshowlearn-app.conf','deploy/portable/nginx.conf']){
  test(file+' limits the new document proxy to GET/HEAD without restricting canonical APIs',()=>{
    const source=readFileSync(file,'utf8'),documents=locationBlock(source,'location / {');
    assert.match(documents,guard);
    assert.match(documents,/if \(\$uri ~\* \^\/\(api\|uploads\)\(\/\|\$\)\) \{ return 404; \}/);
    assert.ok(documents.indexOf('return 405;')<documents.indexOf('proxy_pass'));
    assert.match(documents,/proxy_set_header Cookie "";/);
    assert.match(documents,/proxy_set_header Authorization "";/);
    const api=locationBlock(source,file.includes('portable')?'location /api/ {':'location ^~ /api/ {');
    assert.doesNotMatch(api,guard);
    if(!file.includes('portable')){
      const auth=locationBlock(source,'location ^~ /api/auth/ {');
      assert.match(auth,/limit_req zone=oneshowlearn_auth burst=10 nodelay;/);
      assert.match(auth,/limit_req zone=oneshowlearn_auth_read burst=30 nodelay;/);
      assert.doesNotMatch(auth,guard);
    }
  });
}

test('actual isolated Nginx rejects document mutations and mixed-case API bypass while canonical APIs remain callable',{
  skip:process.env.PUBLIC_SEO_PROXY_DOCKER!=='1'?'Set PUBLIC_SEO_PROXY_DOCKER=1 with an existing local Nginx image for integration acceptance':false,
},()=>{
  const image=process.env.PUBLIC_SEO_PROXY_IMAGE||'nginx:stable-alpine';
  const directory=mkdtempSync(path.join(tmpdir(),'osl-seo-document-proxy-'));
  const name='osl-seo-document-proxy-'+process.pid;
  const invoke=(args,options={})=>spawnSync('docker',args,{encoding:'utf8',timeout:20000,...options});
  const checked=args=>{const result=invoke(args);assert.equal(result.status,0,result.stderr||result.stdout);return result;};
  // Never pull an image or open a public port/network for these checks.
  checked(['image','inspect',image]);
  const base=readFileSync('deploy/nginx-oneshowlearn.conf','utf8').split('\n\nserver {')[0];
  const app=readFileSync('deploy/nginx-oneshowlearn-app.conf','utf8').replace('root /var/www/oneshowlearn/dist/client;','root /tmp;');
  const config='events {}\nhttp {\n'+base+'\nserver { listen 8791; location / { return 200 "upstream-ok"; } }\nserver { listen 8080;\n'+app+'\n}\n}\n';
  writeFileSync(path.join(directory,'nginx.conf'),config);
  try{
    checked(['run','--detach','--name',name,'--network','none','--read-only','--tmpfs','/var/run','--tmpfs','/var/cache/nginx','--tmpfs','/tmp','--mount','type=bind,source='+directory+',target=/review,readonly',image,'nginx','-c','/review/nginx.conf','-g','daemon off;']);
    checked(['exec',name,'nginx','-t','-c','/review/nginx.conf']);
    const get=route=>checked(['exec',name,'wget','-q','-O','-','http://127.0.0.1:8080'+route]).stdout;
    assert.equal(get('/'),'upstream-ok');assert.equal(get('/course-offer?course=actual-course'),'upstream-ok');
    for(const route of ['/API/auth/status','/API/auth/wechat/callback?code=isolated','/Api/auth/google/callback?code=isolated','/Uploads/isolated']){
      const result=invoke(['exec',name,'wget','-S','-O','-','http://127.0.0.1:8080'+route]);
      assert.notEqual(result.status,0,route);assert.match(result.stderr,/HTTP\/1\.1 404\b/,route);assert.doesNotMatch(result.stdout,/upstream-ok/,route);
    }
    assert.equal(get('/api/auth/status'),'upstream-ok');assert.equal(get('/api/example'),'upstream-ok');assert.equal(get('/uploads/isolated.png'),'upstream-ok');
    for(const route of ['/','/course-offer','/API/auth/login','/Api/auth/password/request-code']){
      const result=invoke(['exec',name,'wget','-S','-O','-','--post-data={}','http://127.0.0.1:8080'+route]);
      assert.notEqual(result.status,0,route);assert.match(result.stderr,/HTTP\/1\.1 405\b/,route);assert.doesNotMatch(result.stdout,/upstream-ok/,route);
    }
    assert.equal(checked(['exec',name,'wget','-q','-O','-','--post-data={}','http://127.0.0.1:8080/api/auth/login']).stdout,'upstream-ok');
    assert.equal(checked(['exec',name,'wget','-q','-O','-','--post-data={}','http://127.0.0.1:8080/api/example']).stdout,'upstream-ok');
  }finally{
    invoke(['rm','--force',name]);
    rmSync(directory,{recursive:true,force:true});
  }
});
