// Read-only production probes; only normal authentication metadata may change.
import assert from 'node:assert/strict';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const request=(route,options={})=>fetch('https://oneshowlearn.com/api'+route,{signal:AbortSignal.timeout(20000),...options});
for(const route of ['/community','/admin/community','/community/articles/1'])assert.equal((await request(route)).status,401,route);
const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);const {token}=await login.json();assert.ok(token);
const headers={authorization:`Bearer ${token}`};
for(const route of ['/community','/admin/community']){
  const response=await request(route,{headers});assert.equal(response.status,200,route);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();assert.ok(Array.isArray(body.items));
  assert.ok(!body.items.some(item=>JSON.stringify(item).includes('【本地自测】')),'No local fixtures');
  if(route==='/community'){assert.ok(body.settings);assert.ok(Array.isArray(body.resources));assert.equal(typeof body.settings.groupReady,'boolean');assert.equal(typeof body.settings.groupInstructions,'string');}
}
for(const route of ['/admin/cms/assets','/learning/entry','/learning/ai/conversations'])assert.equal((await request(route,{headers})).status,200,route);
console.log('PASS HTTPS community/admin APIs, private cache, anonymous guards, existing attachment/course/tutor APIs; no content written');
