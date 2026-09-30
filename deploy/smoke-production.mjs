// Run as root on the deployed server. Credentials remain in memory and are never logged.
import assert from "node:assert/strict";
process.loadEnvFile("/etc/oneshowlearn/oneshowlearn.env");
const base = "https://oneshowlearn.com";
const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(15000), ...options });
const health = await request("/api/health").then((r) => r.json());
assert.deepEqual(health, { ok: true, service: "oneshowlearn-api" });
console.log("PASS HTTPS backend health");
for (const path of ["/", "/app", "/login", "/register", "/forgot-password", "/account", "/paths", "/admin/login", "/admin/forgot-password", "/admin/account", "/admin/content", "/admin/email"]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /<div id="root">/);
}
console.log("PASS homepage and direct SPA routes");
const denied = await request("/api/admin/dashboard");
assert.equal(denied.status, 401);
console.log("PASS anonymous admin access blocked");
const login = await request("/api/auth/login", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const session = await login.json();
assert.equal(session.user.role, "admin");
const headers = { authorization: `Bearer ${session.token}` };
for (const path of ["/api/me/library", "/api/admin/dashboard", "/api/admin/paths", "/api/admin/packs", "/api/admin/orders", "/api/admin/account-audit"]) {
  assert.equal((await request(path, { headers })).status, 200, path);
}
console.log("PASS one admin session can access both learner and management APIs");
const users = await request("/api/admin/users", { headers }).then((r) => r.json());
assert.equal(users.items.some((u) => ["admin@oneshowlearn.com", "learner@oneshowlearn.com"].includes(u.email)), false);
console.log("PASS no local test accounts in production");
const catalog = await request("/api/catalog/paths").then((r) => r.json());
assert.equal(catalog.items.length, 6);
console.log("PASS six learning paths available");
const status = await request("/api/auth/status").then((r) => r.json());
const mail = await request("/api/admin/email", { headers }).then((r) => r.json());
assert.equal(status.deliveryMode, "email");
assert.equal(mail.mode, "smtp");
assert.equal(mail.configured, true);
assert.equal(status.registrationEnabled, process.env.REGISTRATION_ENABLED !== "false");
assert.equal(status.passwordResetEnabled, true);
assert.equal(mail.smtpPassword, undefined);
console.log("PASS real mail configuration, registration and reset capabilities");
assert.equal((await request("/api/admin/email")).status, 401);
assert.equal((await request("/api/admin/users")).status, 401);
console.log("PASS private mail/user administration endpoints protected");
if (process.argv.includes("--send-test-email")) {
  const response = await request("/api/admin/email/test", { method: "POST", headers });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.provider, "smtp");
  assert.equal(result.status, "accepted");
  console.log("PASS test email accepted by SMTP for the current admin (inbox receipt still needs confirmation)");
}
if (process.env.REGISTRATION_ENABLED === "false") {
  const registration = await request("/api/auth/register/request-code", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Deployment check", email: "deploy-check@example.com", password: "Not-An-Account-Password-2026" }),
  });
  assert.equal(registration.status, 503);
  assert.equal((await registration.json()).error, "邮箱注册暂未开放");
  console.log("PASS unconfigured email registration is disabled, no email sent");
}
