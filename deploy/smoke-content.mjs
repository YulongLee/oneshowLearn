// Production read-only checks; login only updates normal authentication metadata.
import assert from 'node:assert/strict';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base=process.argv[2]||'https://oneshowlearn.com';
assert.ok(['http://127.0.0.1:8791','https://oneshowlearn.com'].includes(base));
const request=(p,options={})=>fetch(`${base}/api${p}`,{signal:AbortSignal.timeout(15000),...options});
const adminPaths=['/admin/cms/snapshot','/admin/cms/assets','/admin/platform/library','/admin/platform/projects','/admin/platform/pages/public','/admin/platform/pages/workbench'];
for(const p of [...adminPaths,'/me/workspace','/materials/1'])assert.equal((await request(p)).status,401,p);
for(const p of ['/site/pages/public','/site/pages/workbench','/practice-projects','/catalog/workspace','/resources','/opc/curriculum']){
  const r=await request(p);assert.equal(r.status,200,p);const d=await r.json();assert.ok(d&&typeof d==='object');
  if(p.startsWith('/site/pages/')){assert.ok(Array.isArray(d.courses)&&Array.isArray(d.projects));assert.equal(d.draft,undefined);}
  if(p==='/resources')assert.ok(d.items.every(i=>i.body===undefined&&i.resource_url===undefined));
}
const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200,'Existing admin login');
const {token}=await login.json();assert.ok(token);
for(const p of [...adminPaths,'/me/workspace','/admin/opc/steps']){
  const r=await request(p,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,200,p);assert.ok(await r.json());
}
console.log('PASS CMS, library, project and page APIs, existing administrator login and anonymous access guards; no course/user content written');
