import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");

test("commercial API supports catalog, admin CMS and orders", async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "oneshowlearn-api-"));
  const port = 18787;
  const databasePath = path.join(temp, "test.db");
  const env = { ...process.env, API_PORT: String(port), DATABASE_PATH: databasePath, UPLOAD_DIR: path.join(temp, "uploads"), JWT_SECRET: "test-secret-for-oneshowlearn", ADMIN_PASSWORD: "Admin-Test-Password-2026", ALLOW_DEV_EMAIL_DELIVERY: "true", REGISTRATION_ENABLED: "true" };
  const seeded = spawnSync(process.execPath, ["server/seed.mjs"], { cwd: root, env, encoding: "utf8" });
  assert.equal(seeded.status, 0, seeded.stderr);
  const server = spawn(process.execPath, ["server/index.mjs"], { cwd: root, env, stdio: "ignore" });
  t.after(() => { server.kill(); rmSync(temp, { recursive: true, force: true }); });

  const base = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "liyulong19950316@163.com", password: "Admin-Test-Password-2026" }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const headers = { authorization: `Bearer ${token}` };

  const catalog = await fetch(`${base}/catalog/paths`).then((response) => response.json());
  assert.equal(catalog.items.length, 6);
  const pack = await fetch(`${base}/project-packs/cursor-first-site`, { headers }).then((response) => response.json());
  assert.equal(pack.steps.length, 5);
  assert.equal(pack.entitled, true);
  const dashboard = await fetch(`${base}/admin/dashboard`, { headers }).then((response) => response.json());
  assert.equal(dashboard.publishedPacks, 6);

  const learnerLogin = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "learner@oneshowlearn.com", password: "OneShowLearn-Learner-2026" }) }).then((response) => response.json());
  const orderResponse = await fetch(`${base}/orders`, { method: "POST", headers: { authorization: `Bearer ${learnerLogin.token}`, "content-type": "application/json" }, body: JSON.stringify({ productId: pack.product_id }) });
  assert.equal(orderResponse.status, 201);
  assert.equal((await orderResponse.json()).status, "pending");

  const newAccount = { name: "邮箱测试用户", email: "verify@example.com", password: "Verification-Password-2026" };
  const requestCode = await fetch(`${base}/auth/register/request-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(newAccount) });
  assert.equal(requestCode.status, 202);
  const testDb = new DatabaseSync(databasePath);
  const outbox = testDb.prepare("SELECT text FROM email_outbox WHERE recipient=? ORDER BY id DESC LIMIT 1").get(newAccount.email);
  const code = outbox.text.match(/\b\d{6}\b/)[0];
  const verify = await fetch(`${base}/auth/register/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: newAccount.email, code }) });
  assert.equal(verify.status, 201);
  assert.ok((await verify.json()).token);
  const reuse = await fetch(`${base}/auth/register/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: newAccount.email, code }) });
  assert.notEqual(reuse.status, 201);
  testDb.close();
});
