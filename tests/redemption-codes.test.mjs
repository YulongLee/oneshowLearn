import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

test('course redemption codes are one-time, course-scoped and admin-controlled', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'oneshowlearn-redemption-test-'));
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_PATH: path.join(directory, 'test.db'), UPLOAD_DIR: path.join(directory, 'uploads'), JWT_SECRET: 'redemption-test-only', PAYMENT_CONFIG_ENCRYPTION_KEY: 'ab'.repeat(32) });
  const { createApp } = await import('../server/index.mjs');
  const { run, row, db } = await import('../server/db.mjs');
  const { signUser } = await import('../server/auth.mjs');
  const account = (role = 'learner') => {
    const email = `${randomUUID()}@test.local`;
    const id = Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)', [email, 'x', role, role]).lastInsertRowid);
    return { id, token: signUser({ id, role, email, token_version: 0 }) };
  };
  const admin = account('admin'), editor = account('editor'), learner = account(), other = account();
  const pathId = Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('redemption-path','兑换测试路径','published')").lastInsertRowid);
  const packId = Number(run("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?, 'redemption-pack','兑换测试课程','published')", [pathId]).lastInsertRowid);
  const productId = Number(run("INSERT INTO products(pack_id,sku,title,price_cents) VALUES(?, 'redemption-sku','兑换测试课程',49900)", [packId]).lastInsertRowid);
  const server = createApp().listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, user, method = 'GET', body) => { const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() }; };

  assert.equal((await request('/admin/redemption-codes', learner)).status, 403);
  assert.equal((await request('/admin/redemption-codes', editor)).status, 403);
  const generated = await request('/admin/redemption-codes', admin, 'POST', { productId, count: 2, note: '测试批次' });
  assert.equal(generated.status, 201, JSON.stringify(generated.body)); assert.equal(generated.body.codes.length, 2); assert.match(generated.body.codes[0], /^OSL-/);
  const plaintext = generated.body.codes[0];
  const list = await request('/admin/redemption-codes', admin); assert.equal(list.status, 200); assert.equal(list.body.items.length, 2); assert.equal(JSON.stringify(list.body), JSON.stringify(list.body).replace(plaintext, '')); assert.ok(list.body.items[0].codeLast4);
  const redeemed = await request('/commerce/redeem', learner, 'POST', { code: plaintext });
  assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body)); assert.equal(redeemed.body.product.packId, packId);
  assert.equal(row('SELECT status FROM redemption_codes WHERE code_last4=?', [plaintext.replace(/[\s-]/g, '').slice(-4)]).status, 'used');
  assert.ok(row('SELECT id FROM entitlements WHERE user_id=? AND pack_id=? AND status=\'active\'', [learner.id, packId]));
  assert.equal(row('SELECT COUNT(*) n FROM orders').n, 0); assert.equal(row('SELECT COUNT(*) n FROM payments').n, 0);
  assert.equal((await request('/commerce/redeem', other, 'POST', { code: plaintext })).status, 409);
  assert.equal((await request('/commerce/redeem', learner, 'POST', { code: plaintext })).status, 409);
  assert.equal((await request('/commerce/redeem', learner, 'POST', { code: 'OSL-NOT-A-REAL-CODE' })).status, 400);
  const invalid = await request('/admin/redemption-codes', admin, 'POST', { productId, count: 501 }); assert.equal(invalid.status, 400);
  assert.equal((await request('/admin/redemption-codes/1/revoke', admin, 'POST', {})).status, 409, 'used codes cannot be revoked');
});
