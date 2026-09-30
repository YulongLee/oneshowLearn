import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("production bootstrap excludes development accounts and entitlements", (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "oneshowlearn-production-seed-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const databasePath = path.join(temp, "production.db");
  const seeded = spawnSync(process.execPath, ["server/seed.mjs"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_PATH: databasePath,
      JWT_SECRET: "isolated-production-seed-test-secret",
      ADMIN_EMAIL: "admin-production@example.com",
      ADMIN_PASSWORD: "isolated-production-seed-test-password",
      REGISTRATION_ENABLED: "false",
      ALLOW_DEV_EMAIL_DELIVERY: "false",
    },
    encoding: "utf8",
  });
  assert.equal(seeded.status, 0, seeded.stderr);
  const db = new DatabaseSync(databasePath);
  try {
    assert.deepEqual(db.prepare("SELECT email,role,status,email_verified FROM users").all().map((user) => ({ ...user })), [
      { email: "admin-production@example.com", role: "admin", status: "active", email_verified: 1 },
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM entitlements").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM learning_paths").get().total, 6);
  } finally {
    db.close();
  }
});
