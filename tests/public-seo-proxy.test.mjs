import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
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
    const assets=locationBlock(source,'location ^~ /assets/ {');
    assert.match(assets,/expires 7d;/);
    assert.match(assets,/add_header X-Content-Type-Options "nosniff" always;/);
    assert.match(assets,/try_files \$uri =404;/);
    assert.doesNotMatch(assets,/proxy_pass/);
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

test('actual isolated Nginx preserves exact public assets and crawler routing while blocking document API bypass',{
  skip:process.env.PUBLIC_SEO_PROXY_DOCKER!=='1'?'Set PUBLIC_SEO_PROXY_DOCKER=1 with an existing local Nginx image for integration acceptance':false,
},()=>{
  const image=process.env.PUBLIC_SEO_PROXY_IMAGE||'nginx:stable-alpine';
  const directory=mkdtempSync(path.join(tmpdir(),'osl-seo-document-proxy-'));
  chmodSync(directory,0o755);
  const names=[];
  const invoke=(args,options={})=>spawnSync('docker',args,{encoding:'utf8',timeout:20000,...options});
  const checked=args=>{const result=invoke(args);assert.equal(result.status,0,result.stderr||result.stdout);return result;};
  // Never pull an image or open a public port/network for these checks.
  checked(['image','inspect',image]);
  const base=readFileSync('deploy/nginx-oneshowlearn.conf','utf8').split('\n\nserver {')[0];
  mkdirSync(path.join(directory,'assets'));
  const licenses={'dmsans-OFL.txt':'Isolated DM Sans license fixture\n','manrope-OFL.txt':'Isolated Manrope license fixture\n'};
  for(const [file,body] of Object.entries(licenses))writeFileSync(path.join(directory,'assets',file),body);
  // Deliberate root files prove crawler documents are still sent to Node.
  for(const file of ['robots.txt','sitemap.xml','llms.txt'])writeFileSync(path.join(directory,file),'incorrect-static-crawler-fixture');
  const templates=[
    ['app','server { listen 8080;\n'+readFileSync('deploy/nginx-oneshowlearn-app.conf','utf8').replace('root /var/www/oneshowlearn/dist/client;','root /review;')+'\n}'],
    ['portable',readFileSync('deploy/portable/nginx.conf','utf8').replace('root /usr/share/nginx/html;','root /review;').replaceAll('http://api:8787','http://127.0.0.1:8791')],
  ];
  try{
    for(const [variant,server] of templates){
    const name='osl-seo-document-proxy-'+process.pid+'-'+variant;names.push(name);
    const configFile=variant+'.conf',config='events {}\nhttp {\n'+base+'\nserver { listen 8791; location / { return 200 "upstream-ok"; } }\n'+server+'\n}\n';
    writeFileSync(path.join(directory,configFile),config);
    checked(['run','--detach','--name',name,'--network','none','--read-only','--tmpfs','/var/run','--tmpfs','/var/cache/nginx','--tmpfs','/tmp','--mount','type=bind,source='+directory+',target=/review,readonly',image,'nginx','-c','/review/'+configFile,'-g','daemon off;']);
    checked(['exec',name,'nginx','-t','-c','/review/'+configFile]);
    const get=route=>checked(['exec',name,'wget','-q','-O','-','http://127.0.0.1:8080'+route]).stdout;
    assert.equal(get('/'),'upstream-ok');assert.equal(get('/course-offer?course=actual-course'),'upstream-ok');
    for(const [file,body] of Object.entries(licenses))assert.equal(get('/assets/'+file),body,variant+' exact public license '+file);
    const absentAsset=invoke(['exec',name,'wget','-S','-O','-','http://127.0.0.1:8080/assets/missing-OFL.txt']);
    assert.notEqual(absentAsset.status,0);assert.match(absentAsset.stderr,/HTTP\/1\.1 404\b/);assert.doesNotMatch(absentAsset.stdout,/upstream-ok/);
    for(const route of ['/robots.txt','/sitemap.xml','/llms.txt'])assert.equal(get(route),'upstream-ok',variant+' crawler route '+route);
    for(const route of ['/API/auth/status','/API/auth/wechat/callback?code=isolated','/Api/auth/google/callback?code=isolated','/Uploads/isolated']){
      const result=invoke(['exec',name,'wget','-S','-O','-','http://127.0.0.1:8080'+route]);
      assert.notEqual(result.status,0,route);assert.match(result.stderr,/HTTP\/1\.1 404\b/,route);assert.doesNotMatch(result.stdout,/upstream-ok/,route);
    }
    assert.equal(get('/api/auth/status'),'upstream-ok');assert.equal(get('/api/example'),'upstream-ok');assert.equal(get('/uploads/isolated'),'upstream-ok');
    if(variant==='app')assert.equal(get('/uploads/isolated.png'),'upstream-ok');
    for(const route of ['/','/course-offer','/API/auth/login','/Api/auth/password/request-code']){
      const result=invoke(['exec',name,'wget','-S','-O','-','--post-data={}','http://127.0.0.1:8080'+route]);
      assert.notEqual(result.status,0,route);assert.match(result.stderr,/HTTP\/1\.1 405\b/,route);assert.doesNotMatch(result.stdout,/upstream-ok/,route);
    }
    assert.equal(checked(['exec',name,'wget','-q','-O','-','--post-data={}','http://127.0.0.1:8080/api/auth/login']).stdout,'upstream-ok');
    assert.equal(checked(['exec',name,'wget','-q','-O','-','--post-data={}','http://127.0.0.1:8080/api/example']).stdout,'upstream-ok');
    }
  }finally{
    for(const name of names)invoke(['rm','--force',name]);
    rmSync(directory,{recursive:true,force:true});
  }
});
