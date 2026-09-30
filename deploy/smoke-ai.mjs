// No course/account content mutations: one fixed, low-token model probe only.
import assert from 'node:assert/strict';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base=process.argv[2]||'http://127.0.0.1:8791';
assert.ok(['http://127.0.0.1:8791','https://oneshowlearn.com'].includes(base));
const req=(route,options={})=>fetch(base+'/api'+route,{signal:AbortSignal.timeout(60000),...options});
for(const [route,method] of [['/admin/ai','GET'],['/admin/ai','PUT'],['/admin/ai/test','POST'],['/admin/ai/usage','GET'],['/learning/ai/tutor','POST']])assert.equal((await req(route,{method})).status,401,route);
const cap=await (await req('/learning/ai/capabilities')).json();assert.equal(cap.available,true);assert.equal(cap.model,process.env.AI_MODEL);
const login=await req('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});assert.equal(login.status,200);
const {token}=await login.json(),headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const result=await req('/admin/ai',{headers});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
const settings=await result.json();assert.equal(settings.keyConfigured,true);assert.equal(settings.encryptionReady,true);assert.equal(settings.settings.model,process.env.AI_MODEL);assert.equal(JSON.stringify(settings).includes(process.env.AI_API_KEY),false);assert.equal(JSON.stringify(settings).includes(process.env.AI_CONFIG_ENCRYPTION_KEY),false);
if(process.argv.includes('--probe')){
  const tested=await req('/admin/ai/test',{method:'POST',headers,body:JSON.stringify({version:settings.version})});
  assert.equal(tested.status,200,'Real provider connection probe');assert.equal((await tested.json()).ok,true);
}
const usage=await req('/admin/ai/usage',{headers});assert.equal(usage.status,200);const data=await usage.json();assert.ok(Array.isArray(data.items));assert.equal(JSON.stringify(data).includes(process.env.AI_API_KEY),false);
if(process.argv.includes('--probe'))assert.ok(data.items.some(item=>item.action==='connection_test'&&item.status==='success'));
console.log(`PASS AI admin masking, permissions, capabilities, usage${process.argv.includes('--probe')?' and real model probe':''}; no learner content changed`);
