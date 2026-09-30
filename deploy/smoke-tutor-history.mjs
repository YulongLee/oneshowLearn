// Live read/validation probes only: do not create production conversations or test accounts.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base='https://oneshowlearn.com/api';
const request=(route,options={})=>fetch(base+route,{signal:AbortSignal.timeout(20000),...options});
const root='/learning/ai/conversations';
assert.equal((await request(root)).status,401);
assert.equal((await request(root,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:randomUUID()})})).status,401);
const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);const {token}=await login.json();
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const list=await request(root,{headers});assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');
const data=await list.json();assert.ok(Array.isArray(data.items));assert.ok(Object.hasOwn(data,'nextOffset'));
assert.equal((await request(root+'?offset=-1',{headers})).status,400);
assert.equal((await request(root+'/'+randomUUID(),{headers})).status,404);
assert.equal((await request(root,{method:'POST',headers,body:JSON.stringify({id:'invalid'})})).status,400);
console.log('PASS HTTPS tutor history: authenticated private listing, no-store, anonymous guards and invalid request rejection; no conversations created');
