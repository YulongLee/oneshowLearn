// Production read-only workspace checks; credentials and account data are never printed.
import assert from "node:assert/strict";
process.loadEnvFile("/etc/oneshowlearn/oneshowlearn.env");
const base = "https://oneshowlearn.com";
const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(15000), ...options });
for (const path of ["/app", "/courses", "/projects", "/resources", "/notes", "/favorites", "/plan", "/tools", "/community", "/certificates", "/membership"]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /<div id="root">/);
}
console.log("PASS all workspace SPA routes over HTTPS");
const catalog = await request("/api/catalog/workspace").then(r => r.json());
assert.ok(Array.isArray(catalog.items) && catalog.items.length > 0);
assert.ok(catalog.items.every(p => p.body === undefined && p.download_url === undefined));
assert.equal((await request("/api/me/workspace")).status, 401);
assert.equal((await request("/api/me/workspace/state", { method: "PUT" })).status, 401);
console.log("PASS public metadata and private workspace guards");
const login = await request("/api/auth/login", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const { token } = await login.json();
assert.ok(token);
const headers = { authorization: `Bearer ${token}` };
const response = await request("/api/me/workspace", { headers });
assert.equal(response.status, 200);
assert.match(response.headers.get("cache-control"), /no-store/);
const workspace = await response.json();
assert.match(workspace.version, /^[a-f0-9]{64}$/);
for (const field of ["tasks", "notes", "favorites", "checkIns"]) assert.ok(Array.isArray(workspace.state[field]));
assert.ok(Array.isArray(workspace.library) && Array.isArray(workspace.recommendations));
assert.equal(workspace.stats.studyMinutes, null);
assert.ok(Number.isInteger(workspace.stats.completedItems));
// An intentionally stale version verifies write-path auth/conflict handling without writing.
const conflict = await request("/api/me/workspace/state", {
  method: "PUT", headers: { ...headers, "content-type": "application/json", "if-match": "deployment-check-stale-version" },
  body: JSON.stringify(workspace.state),
});
assert.equal(conflict.status, 409);
const unchanged = await request("/api/me/workspace", { headers }).then(r => r.json());
assert.equal(unchanged.version, workspace.version);
assert.deepEqual(unchanged.state, workspace.state);
console.log("PASS account workspace, persistence schema and conflict guard (no learning data changed)");
