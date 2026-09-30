// Run on the production host as root. Read-only except normal login metadata.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base = 'https://oneshowlearn.com';
const staging = process.argv[2];
assert.ok(staging?.startsWith('/tmp/oneshowlearn-workspace-'));
const root = path.join(staging, 'dist/client');
const hash = value => createHash('sha256').update(value).digest('hex');
const request = (url, options = {}) => fetch(base + url, { signal: AbortSignal.timeout(20000), ...options });
const htmlHash = hash(readFileSync(path.join(root, 'index.html')));
for (const route of ['/', '/app', '/opc', '/opc/phase/2', '/paths', '/projects', '/tutor', '/resources', '/community', '/notes', '/favorites', '/achievements', '/login', '/admin/login', '/admin/opc']) {
  const r = await request(route);
  assert.equal(r.status, 200, route);
  assert.equal(hash(Buffer.from(await r.arrayBuffer())), htmlHash, route);
}
console.log('PASS 15 production SPA entry hashes');
let assets = 0;
function files(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(path.join(dir,entry.name)) : [path.join(dir,entry.name)]);
}
for (const file of files(path.join(root, 'assets'))) {
  const url = '/' + path.relative(root,file);
  const r = await request(url);
  assert.equal(r.status,200,url);
  assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(readFileSync(file)),url);
  assets++;
}
console.log(`PASS ${assets} production asset hashes`);
for (const url of ['/api/me/workspace','/api/me/opc/product','/api/admin/opc/steps']) {
  assert.equal((await request(url)).status,401,url);
}
const resources = await request('/api/resources').then(r=>r.json());
assert.ok(Array.isArray(resources.items));
assert.ok(resources.items.every(item => item.body === undefined && item.resource_url === undefined));
const curriculum = await request('/api/opc/curriculum').then(r=>r.json());
assert.equal(curriculum.phases.length,5);
const login = await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200,'admin sign in');
const {token} = await login.json();
assert.ok(token);
const headers = {authorization:`Bearer ${token}`};
for (const url of ['/api/me/workspace','/api/me/opc/product','/api/admin/opc/steps','/api/resources','/api/opc/curriculum']) {
  const r = await request(url,{headers});
  assert.equal(r.status,200,url);
  const data = await r.json();
  assert.ok(data && typeof data === 'object');
}
if (resources.items.length) {
  const slug = encodeURIComponent(resources.items[0].pack_slug);
  assert.equal((await request(`/api/projects/${slug}`,{headers})).status,200);
  assert.equal((await request(`/api/projects/${slug}/content/${resources.items[0].id}`,{headers})).status,200);
}
console.log('PASS new catalogs, private guards, authenticated APIs and project reader; no learning records modified');
