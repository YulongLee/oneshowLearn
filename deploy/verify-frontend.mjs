// Read-only verification of a frontend release, against its exact staged files.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const base = 'https://oneshowlearn.com';
const hash = data => createHash('sha256').update(data).digest('hex');
const request = route => fetch(base + route, {signal:AbortSignal.timeout(20000)});
const expected = hash(readFileSync(path.join(root, 'index.html')));
const routes = ['/', '/app', '/app/', '/opc', '/opc/phase/2', '/paths', '/projects', '/tutor', '/resources', '/community', '/notes', '/favorites', '/achievements', '/courses', '/plan', '/membership', '/login', '/admin/login', '/admin/learning', '/admin/ai', '/learn/cursor', '/learn/cursor-first-site', '/packs/cursor-first-site'];
routes.push('/admin/payments');
routes.push('/membership/', '/course-offer');
routes.push('/account', '/account/', '/admin/account');
routes.push('/admin/login-settings', '/admin/email');
routes.push('/legal/terms','/legal/privacy','/legal/purchase','/support','/admin/service','/admin/support');
routes.push('/opc/lessons/1','/projects/preview-project-2/workspace');
for (const route of routes) {
  const response = await request(route);
  assert.equal(response.status, 200, route);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), expected, route);
}
console.log(`PASS ${routes.length} HTTPS page entry hashes`);
function files(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(path.join(dir,entry.name)) : [path.join(dir,entry.name)]);
}
const assets = files(path.join(root,'assets'));
for (const file of assets) {
  const route = '/' + path.relative(root, file);
  const response = await request(route);
  assert.equal(response.status, 200, route);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(file)), route);
}
console.log(`PASS ${assets.length} HTTPS asset hashes`);
const health = await request('/api/health');
assert.equal(health.status,200);
assert.equal((await health.json()).service,'oneshowlearn-api');
for (const route of ['/api/me/workspace','/api/me/opc/product','/api/admin/opc/steps','/api/auth/profile','/api/support/orders','/api/support/requests','/api/admin/service','/api/admin/support']) assert.equal((await request(route)).status,401,route);
const resources = await request('/api/resources');
assert.equal(resources.status,200);
assert.ok(Array.isArray((await resources.json()).items));
console.log('PASS API health, catalogs and anonymous access protection; no data written');
