// Reads production state only; existing admin login updates normal auth metadata.
import assert from 'node:assert/strict';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base='http://127.0.0.1:8791/api';
const req=(url,options={})=>fetch(base+url,{signal:AbortSignal.timeout(15000),...options});
for(const url of ['/learning/notes','/learning/me/projects','/admin/learning/snapshot'])assert.equal((await req(url)).status,401,url);
const catalog=await req('/learning/projects');assert.equal(catalog.status,200);assert.ok(Array.isArray((await catalog.json()).items));
const entryResponse=await req('/learning/entry');assert.equal(entryResponse.status,200);
const entry=await entryResponse.json();
for(const field of ['courses','chapters','lessons'])assert.ok(Array.isArray(entry[field]),field);
for(const lesson of entry.lessons){assert.equal(lesson.config,undefined);assert.equal(lesson.body,undefined);assert.equal(lesson.materials,undefined);assert.equal(lesson.progress.completed_at,null);}
console.log(`PASS learning entry metadata: ${entry.courses.length} published courses, ${entry.lessons.length} published lessons; no protected bodies`);
const ai=await req('/learning/ai/capabilities');assert.equal(ai.status,200);assert.equal((await ai.json()).available,false);
const auth=await req('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});assert.equal(auth.status,200);
const {token}=await auth.json();
for(const url of ['/admin/learning/snapshot','/learning/entry','/learning/notes','/learning/me/projects']){const r=await req(url,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,200,url);assert.ok(await r.json());}
console.log('PASS learning/project APIs and account guards; no fixtures, orders, notes or progress written');
