import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("account and administrator security regressions", async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "oneshowlearn-accounts-"));
  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_PATH: path.join(temp, "test.db"), UPLOAD_DIR: path.join(temp, "uploads"),
    ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "Admin-Test-Password-2026", JWT_SECRET: "account-tests-only",
    REGISTRATION_ENABLED: "true", ALLOW_DEV_EMAIL_DELIVERY: "true", EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "",
  });
  const { db, row, run } = await import("../server/db.mjs");
  const { config } = await import("../server/config.mjs");
  await import("../server/seed.mjs");
  const { createApp } = await import("../server/index.mjs");
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(temp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (url, body, token, method) => {
    const res = await fetch(base + url, { method: method || (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), retry: res.headers.get("Retry-After") };
  };
  const clearLimits = () => run("DELETE FROM auth_rate_limits");
  const mailCode = (email) => row("SELECT text FROM email_outbox WHERE recipient=? ORDER BY id DESC LIMIT 1", [email]).text.match(/\b\d{6}\b/)[0];
  const signup = async (email) => {
    const response = await request("/auth/register/request-code", { email, name: "Test learner", password: "Learner-Password-2026" });
    assert.equal(response.status, 202);
    return request("/auth/register/verify", { email, code: mailCode(email) });
  };
  const admin = (await request("/auth/login", { email: "owner@example.com", password: "Admin-Test-Password-2026" })).data.token;
  let learner;

  await t.test("verified registration, normalized login, confirmation replay and enumeration", async () => {
    const registration = await request("/auth/register/request-code", { email: "  Learner@Example.com ", name: "学员测试", password: "Learner-Password-2026" });
    assert.equal(registration.status, 202);
    assert.equal(row("SELECT id FROM users WHERE email='learner@example.com'"), undefined);
    const code = mailCode("learner@example.com");
    const registered = await request("/auth/register/verify", { email: "learner@example.com", code });
    assert.equal(registered.status, 201);
    learner = registered.data;
    assert.equal(learner.user.role, "learner");
    assert.equal((await request("/auth/register/verify", { email: "learner@example.com", code })).status, 400);
    assert.equal((await request("/auth/login", { email: " LEARNER@example.com ", password: "Learner-Password-2026" })).status, 200);
    const count = row("SELECT COUNT(*) total FROM email_outbox").total;
    clearLimits();
    const duplicate = await request("/auth/register/request-code", { email: "learner@example.com", name: "Intruder", password: "Different-Password-2026" });
    assert.equal(duplicate.status, 202);
    assert.equal(row("SELECT COUNT(*) total FROM email_outbox").total, count);
    assert.equal((await request("/auth/login", { email: "learner@example.com", password: "Different-Password-2026" })).status, 401);
    assert.equal(row("SELECT pending_password_hash FROM account_codes WHERE email='learner@example.com'").pending_password_hash, "");
  });

  await t.test("cooldown, resend supersession, expiration and five wrong attempts", async () => {
    clearLimits();
    const payload = { email: "codes@example.com", name: "Code test", password: "Learner-Password-2026" };
    assert.equal((await request("/auth/register/request-code", payload)).status, 202);
    const first = mailCode(payload.email);
    const limited = await request("/auth/register/request-code", payload);
    assert.equal(limited.status, 429); assert.ok(Number(limited.retry) > 0);
    clearLimits();
    assert.equal((await request("/auth/register/request-code", payload)).status, 202);
    assert.ok(row("SELECT consumed_at FROM account_codes WHERE email=? ORDER BY id LIMIT 1", [payload.email]).consumed_at);
    const second = mailCode(payload.email);
    if (first !== second) assert.equal((await request("/auth/register/verify", { email: payload.email, code: first })).status, 400);
    run("UPDATE account_codes SET expires_at=0 WHERE email=?", [payload.email]);
    assert.equal((await request("/auth/register/verify", { email: payload.email, code: second })).status, 400);
    clearLimits();
    assert.equal((await request("/auth/register/request-code", payload)).status, 202);
    const current = mailCode(payload.email);
    const wrong = String((Number(current) + 1) % 1000000).padStart(6, "0");
    for (let i = 0; i < 5; i++) assert.equal((await request("/auth/register/verify", { email: payload.email, code: wrong })).status, 400);
    assert.equal((await request("/auth/register/verify", { email: payload.email, code: current })).status, 429);
    assert.equal(row("SELECT id FROM users WHERE email=?", [payload.email]), undefined);
  });

  await t.test("reset is one-time, invalidates sessions and keeps purposes separate", async () => {
    clearLimits();
    const reset = await request("/auth/password/request-code", { email: "learner@example.com" });
    assert.equal(reset.status, 202);
    const code = mailCode("learner@example.com");
    assert.equal((await request("/auth/register/verify", { email: "learner@example.com", code })).status, 400);
    const payload = { email: "learner@example.com", code, newPassword: "New-Learner-Password-2026" };
    assert.equal((await request("/auth/password/reset", payload)).status, 200);
    assert.equal((await request("/auth/password/reset", payload)).status, 400);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    assert.equal((await request("/auth/login", { email: payload.email, password: "Learner-Password-2026" })).status, 401);
    learner = (await request("/auth/login", { email: payload.email, password: payload.newPassword })).data;
    assert.ok(learner.token);
  });

  await t.test("current-password verification, bcrypt byte limit, and logout revocation", async () => {
    clearLimits();
    assert.equal((await request("/auth/password/change", { currentPassword: "wrong", newPassword: "Another-Password-2026" }, learner.token)).status, 400);
    assert.equal((await request("/auth/password/change", { currentPassword: "New-Learner-Password-2026", newPassword: "密".repeat(30) }, learner.token)).status, 400);
    assert.equal((await request("/auth/password/change", { currentPassword: "New-Learner-Password-2026", newPassword: "Another-Password-2026" }, learner.token)).status, 200);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    learner = (await request("/auth/login", { email: "learner@example.com", password: "Another-Password-2026" })).data;
    assert.equal((await request("/auth/logout", {}, learner.token)).status, 200);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    learner = (await request("/auth/login", { email: "learner@example.com", password: "Another-Password-2026" })).data;
  });

  await t.test("role isolation, user search, account suspension and audit", async () => {
    clearLimits();
    // The same manager session can use learner APIs, without granting learners
    // any CMS permissions. Switching UI areas never changes the stored role.
    assert.equal((await request("/me/library", null, admin)).status, 200);
    assert.equal((await request("/admin/dashboard", null, admin)).status, 200);
    assert.equal((await request("/me/library", null, learner.token)).status, 200);
    assert.equal((await request("/admin/dashboard", null, learner.token)).status, 403);
    assert.equal((await request("/admin/users")).status, 401);
    assert.equal((await request("/admin/email", null, learner.token)).status, 403);
    const editorAccount = await signup("editor@example.com");
    run("UPDATE users SET role='editor' WHERE id=?", [editorAccount.data.user.id]);
    assert.equal((await request("/me/library", null, editorAccount.data.token)).status, 200);
    assert.equal((await request("/admin/dashboard", null, editorAccount.data.token)).status, 200);
    assert.equal((await request("/admin/users", null, editorAccount.data.token)).status, 403);
    assert.equal((await request("/admin/email/test", {}, editorAccount.data.token)).status, 403);
    const result = await request("/admin/users?q=learner%40example.com", null, admin);
    assert.equal(result.data.items.length, 1); assert.equal(result.data.total, 1);
    assert.equal((await request(`/admin/users/${result.data.currentUserId}/action`, { action: "disable", reason: "Must not lock self" }, admin)).status, 400);
    const action = (kind) => request(`/admin/users/${learner.user.id}/action`, { action: kind, reason: "Regression check" }, admin);
    assert.equal((await action("disable")).status, 200);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    assert.equal((await request("/auth/login", { email: "learner@example.com", password: "Another-Password-2026" })).status, 401);
    assert.equal((await request("/project-packs/cursor-first-site", null, learner.token)).data.entitled, false);
    assert.equal((await action("enable")).status, 200);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    learner = (await request("/auth/login", { email: "learner@example.com", password: "Another-Password-2026" })).data;
    assert.equal((await action("revoke")).status, 200);
    assert.equal((await request("/auth/me", null, learner.token)).status, 401);
    assert.ok((await request("/admin/account-audit", null, admin)).data.items.some((a) => a.action === "disable" && a.reason === "Regression check"));
  });

  await t.test("disabled registration cannot be verified and login abuse is limited", async () => {
    clearLimits();
    config.registrationEnabled = false;
    assert.equal((await request("/auth/status")).data.registrationEnabled, false);
    assert.equal((await request("/auth/register/verify", { email: "codes@example.com", code: "123456" })).status, 503);
    config.registrationEnabled = true;
    for (let i = 0; i < 15; i++) assert.equal((await request("/auth/login", { email: "unknown@example.com", password: "wrong-password" })).status, 401);
    assert.equal((await request("/auth/login", { email: "unknown@example.com", password: "wrong-password" })).status, 429);
    assert.ok(row("SELECT COUNT(*) total FROM auth_rate_limits").total > 0);
  });

  await t.test("mail failure is visible, secrets are not logged, failed codes unusable", async () => {
    clearLimits();
    const originalFetch = globalThis.fetch;
    config.allowDevEmail = false;
    globalThis.fetch = (url, options) => String(url).startsWith("https://api.resend.com/") ? Promise.resolve(new Response("upstream secret detail", { status: 503 })) : originalFetch(url, options);
    try {
      const failure = await request("/auth/register/request-code", { email: "failure@example.com", name: "Fail test", password: "Failure-Password-2026" });
      assert.equal(failure.status, 503);
      assert.doesNotMatch(JSON.stringify(failure.data), /secret detail|test-secret/);
      const code = row("SELECT * FROM account_codes WHERE email='failure@example.com'");
      assert.equal(code.delivery_status, "failed"); assert.ok(code.consumed_at); assert.equal(code.pending_password_hash, "");
      const logs = (await request("/admin/email", null, admin)).data;
      assert.equal(logs.items[0].status, "failed");
      assert.equal(logs.items[0].error_code, "DELIVERY_FAILED");
      assert.equal(logs.password, undefined); assert.equal(logs.items[0].text, undefined);
    } finally { config.allowDevEmail = true; globalThis.fetch = originalFetch; }
    clearLimits();
    const testEmail = await request("/admin/email/test", { recipient: "not-authorized@example.com" }, admin);
    assert.equal(testEmail.status, 200);
    assert.equal(row("SELECT recipient FROM email_deliveries ORDER BY id DESC LIMIT 1").recipient, "owner@example.com");
    assert.equal((await request("/admin/email/test", {}, admin)).status, 429);
  });
});
