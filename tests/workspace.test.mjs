import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("workspace data is private, persistent and based on published accessible content", async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "oneshowlearn-workspace-"));
  const databasePath = path.join(temp, "workspace-test.db");
  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_PATH: databasePath, UPLOAD_DIR: path.join(temp, "uploads"),
    JWT_SECRET: "workspace-tests-only", REGISTRATION_ENABLED: "false", ALLOW_DEV_EMAIL_DELIVERY: "false",
  });
  const { db, row, run } = await import("../server/db.mjs");
  const { signUser } = await import("../server/auth.mjs");
  const { createApp } = await import("../server/index.mjs");
  const { shanghaiDay, streakDays } = await import("../server/workspace-routes.mjs");
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close(); rmSync(temp, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, token, data, extraHeaders = {}) => {
    const response = await fetch(base + route, {
      method: data === undefined ? "GET" : "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get("Cache-Control") };
  };
  const user = (name, role = "learner") => {
    const id = Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)", [`${name}@example.com`, "unused-test-hash", name, role]).lastInsertRowid);
    return { id, token: signUser(row("SELECT * FROM users WHERE id=?", [id])) };
  };
  const first = user("first"); const second = user("second");
  const admin = user("admin", "admin"); const editor = user("editor", "editor");
  const publishedPath = Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('public','公开路径','published')").lastInsertRowid);
  const draftPath = Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('draft','草稿路径','draft')").lastInsertRowid);
  const pack = (slug, status = "published", pathId = publishedPath) => Number(run("INSERT INTO project_packs(path_id,slug,title,subtitle,status,estimated_minutes) VALUES(?,?,?,?,?,?)", [pathId, slug, slug, "课程简介", status, 45]).lastInsertRowid);
  const available = pack("available"); const expired = pack("expired"); const future = pack("future");
  const revoked = pack("revoked"); const unowned = pack("unowned"); const empty = pack("empty");
  const unpublished = pack("unpublished", "draft"); const privatePathPack = pack("private-path", "published", draftPath);
  run("UPDATE project_packs SET description='公开项目介绍',deliverable='完成一个 AI 产品' WHERE id=?", [available]);
  const step = (packId, status = "published") => Number(run("INSERT INTO project_steps(pack_id,title,status) VALUES(?,?,?)", [packId, "章节", status]).lastInsertRowid);
  const content = (stepId, status = "published") => Number(run("INSERT INTO content_items(step_id,type,title,body,resource_url,status) VALUES(?,'document','课程文档','PAID_BODY_SECRET','https://private.example.com/secret',?)", [stepId, status]).lastInsertRowid);
  const publicStep = step(available);
  const itemOne = content(publicStep); const itemTwo = content(publicStep);
  const draftItem = content(publicStep, "draft"); const draftStepItem = content(step(available, "draft"));
  const expiredItem = content(step(expired)); const unownedItem = content(step(unowned));
  const entitlement = (packId, status, starts, expires) => run("INSERT INTO entitlements(user_id,pack_id,status,starts_at,expires_at) VALUES(?,?,?,?,?)", [first.id, packId, status, starts, expires]);
  entitlement(available, "active", "2000-01-01T00:00:00Z", null);
  entitlement(empty, "active", "2000-01-01T00:00:00Z", null);
  entitlement(expired, "active", "2000-01-01T00:00:00Z", "2001-01-01T00:00:00Z");
  entitlement(future, "active", "2999-01-01T00:00:00Z", null);
  entitlement(revoked, "revoked", "2000-01-01T00:00:00Z", null);
  entitlement(unpublished, "active", "2000-01-01T00:00:00Z", null);
  entitlement(privatePathPack, "active", "2000-01-01T00:00:00Z", null);
  const blank = () => ({ tasks: [], notes: [], favorites: [], checkIns: [] });

  await t.test("anonymous catalog has only published metadata; personal routes require authentication", async () => {
    const catalog = await request("/catalog/workspace");
    assert.equal(catalog.status, 200);
    assert.deepEqual(catalog.data.items.map((item) => item.id), [available, expired, future, revoked, unowned, empty]);
    assert.equal(catalog.data.items[0].contentCount, 2);
    assert.equal(catalog.data.items[0].progressPercent, 0);
    assert.equal(catalog.data.items[0].path_slug, "public");
    assert.equal(catalog.data.items[0].description, "公开项目介绍");
    assert.equal(catalog.data.items[0].deliverable, "完成一个 AI 产品");
    for (const item of catalog.data.items) {
      assert.equal("body" in item, false); assert.equal("resource_url" in item, false);
    }
    assert.equal(JSON.stringify(catalog.data).includes("PAID_BODY_SECRET"), false);
    assert.equal((await request("/me/workspace")).status, 401);
    assert.equal((await request("/me/workspace/state", null, blank())).status, 401);
    assert.equal((await request("/me/workspace", "invalid-token")).status, 401);
  });

  await t.test("empty statistics are honest; role and entitlement scope are respected", async () => {
    const result = await request("/me/workspace", first.token);
    assert.equal(result.status, 200); assert.equal(result.cache, "private, no-store");
    assert.deepEqual(result.data.library.map((item) => item.id), [available, empty]);
    assert.deepEqual(result.data.state, blank()); assert.equal(result.data.recent, null);
    assert.deepEqual(result.data.stats, { completedItems: 0, completedPacks: 0, studyMinutes: null, streakDays: 0 });
    assert.equal((await request("/me/workspace", second.token)).data.library.length, 0);
    for (const manager of [admin, editor]) {
      assert.equal((await request("/me/workspace", manager.token)).data.library.length, 6);
    }
  });

  await t.test("progress counts only published accessible content and never another user's activity", async () => {
    const progress = (userId, itemId, status, updated) => run("INSERT INTO progress(user_id,content_item_id,status,updated_at) VALUES(?,?,?,?)", [userId, itemId, status, updated]);
    progress(first.id, itemOne, "completed", "2026-01-01T09:00:00Z");
    progress(first.id, itemTwo, "started", "2026-01-01T10:00:00Z");
    for (const itemId of [draftItem, draftStepItem, expiredItem, unownedItem]) progress(first.id, itemId, "completed", "2026-02-01T10:00:00Z");
    progress(second.id, itemTwo, "completed", "2026-02-01T10:00:00Z");
    let workspace = (await request("/me/workspace", first.token)).data;
    assert.equal(workspace.recent.id, available);
    assert.equal(workspace.recent.progressPercent, 50);
    assert.equal(workspace.recent.contentCount, 2);
    assert.equal(workspace.stats.completedItems, 1); assert.equal(workspace.stats.completedPacks, 0);
    run("UPDATE progress SET status='completed' WHERE user_id=? AND content_item_id=?", [first.id, itemTwo]);
    workspace = (await request("/me/workspace", first.token)).data;
    assert.equal(workspace.stats.completedItems, 2); assert.equal(workspace.stats.completedPacks, 1);
    assert.equal(workspace.recent.progressPercent, 100);
    assert.equal((await request("/catalog/workspace")).data.items[0].completedCount, 0);
    assert.equal((await request("/me/workspace", second.token)).data.recent, null);
  });

  const today = shanghaiDay();
  const adjacentDay = (difference) => new Date(Date.parse(`${today}T00:00:00Z`) + difference * 86400000).toISOString().slice(0, 10);
  const savedState = {
    tasks: [{ id: randomUUID(), title: "完成课程练习", date: today, done: false }],
    notes: [{ id: randomUUID(), title: "我的学习笔记", body: "只属于 first 用户的内容", updatedAt: new Date().toISOString() }],
    favorites: [available], checkIns: [adjacentDay(-2), adjacentDay(-1), today],
  };
  await t.test("state persists in the database, remains isolated and updates streak statistics", async () => {
    const saved = await request("/me/workspace/state", first.token, savedState);
    assert.equal(saved.status, 200); assert.deepEqual(saved.data.state, savedState);
    assert.equal(saved.data.stats.streakDays, 3);
    assert.deepEqual((await request("/me/workspace", first.token)).data.state, savedState);
    assert.deepEqual((await request("/me/workspace", second.token)).data.state, blank());
    const independentDb = new DatabaseSync(databasePath);
    assert.deepEqual(JSON.parse(independentDb.prepare("SELECT state_json FROM workspace_state WHERE user_id=?").get(first.id).state_json), savedState);
    independentDb.close();
    assert.equal((await request("/me/workspace/state", second.token, { ...blank(), userId: first.id })).status, 400);
    assert.deepEqual((await request("/me/workspace", first.token)).data.state, savedState);
  });

  await t.test("If-Match prevents an older tab from overwriting newer notes", async () => {
    const original = (await request("/me/workspace", admin.token)).data;
    assert.equal(original.version, createHash("sha256").update(JSON.stringify(blank())).digest("hex"));
    const noteFromTabA = { ...blank(), notes: [{ id: randomUUID(), title: "A 页面笔记", body: "A 页面刚保存的内容", updatedAt: new Date().toISOString() }] };
    const savedA = await request("/me/workspace/state", admin.token, noteFromTabA, { "If-Match": original.version });
    assert.equal(savedA.status, 200);
    assert.notEqual(savedA.data.version, original.version);
    assert.equal(savedA.data.version, createHash("sha256").update(row("SELECT state_json FROM workspace_state WHERE user_id=?", [admin.id]).state_json).digest("hex"));
    const staleB = await request("/me/workspace/state", admin.token, blank(), { "If-Match": original.version });
    assert.equal(staleB.status, 409); assert.match(staleB.data.error, /其他页面更新/);
    assert.equal(staleB.data.version, savedA.data.version);
    const refreshed = (await request("/me/workspace", admin.token)).data;
    assert.deepEqual(refreshed.state, noteFromTabA); assert.equal(refreshed.version, savedA.data.version);
    const mergedB = { ...refreshed.state, tasks: [{ id: randomUUID(), title: "B 页面任务", date: today, done: false }] };
    const savedB = await request("/me/workspace/state", admin.token, mergedB, { "If-Match": `"${refreshed.version}"` });
    assert.equal(savedB.status, 200); assert.deepEqual(savedB.data.state.notes, noteFromTabA.notes);
    const latest = (await request("/me/workspace", admin.token)).data;
    assert.deepEqual(latest.state, mergedB); assert.equal(latest.version, savedB.data.version);
    assert.deepEqual((await request("/me/workspace", first.token)).data.state, savedState);
  });

  await t.test("strict validation rejects invalid dates, duplicate records and excessive text", async () => {
    const invalidStates = [
      { ...blank(), userId: first.id },
      { ...blank(), tasks: [{ ...savedState.tasks[0], title: "x".repeat(161) }] },
      { ...blank(), tasks: [{ ...savedState.tasks[0], date: "2026-02-30" }] },
      { ...blank(), tasks: [{ ...savedState.tasks[0], done: "yes" }] },
      { ...blank(), tasks: [{ ...savedState.tasks[0], id: "not-a-uuid" }] },
      { ...blank(), tasks: [savedState.tasks[0], savedState.tasks[0]] },
      { ...blank(), notes: [{ ...savedState.notes[0], title: "x".repeat(121) }] },
      { ...blank(), notes: [{ ...savedState.notes[0], body: "x".repeat(20001) }] },
      { ...blank(), notes: [{ ...savedState.notes[0], updatedAt: "yesterday" }] },
      { ...blank(), notes: [{ ...savedState.notes[0], user_id: second.id }] },
      { ...blank(), favorites: [available, available] },
      { ...blank(), favorites: [String(available)] },
      { ...blank(), checkIns: [adjacentDay(1)] },
      { ...blank(), checkIns: [today, today] },
      { ...blank(), checkIns: ["2026-13-01"] },
      { ...blank(), tasks: Array.from({ length: 201 }, () => ({ ...savedState.tasks[0], id: randomUUID() })) },
      { ...blank(), notes: Array.from({ length: 60 }, () => ({ ...savedState.notes[0], id: randomUUID(), body: "x".repeat(20000) })) },
    ];
    for (const state of invalidStates) {
      const result = await request("/me/workspace/state", first.token, state);
      assert.equal(result.status, 400); assert.match(result.data.error, /[\u4e00-\u9fff]/);
    }
    const oversized = await request("/me/workspace/state", first.token, {
      ...blank(), notes: [{ ...savedState.notes[0], body: "x".repeat(2 * 1024 * 1024) }],
    });
    assert.equal(oversized.status, 413); assert.match(oversized.data.error, /[\u4e00-\u9fff]/);
    assert.deepEqual((await request("/me/workspace", first.token)).data.state, savedState);
  });

  await t.test("unpublished or deleted favorites are hidden and cannot block note or task saves", async () => {
    const laterDeleted = pack("later-deleted");
    const before = { ...savedState, favorites: [available, unowned, laterDeleted] };
    assert.equal((await request("/me/workspace/state", second.token, before)).status, 200);
    run("UPDATE project_packs SET status='archived' WHERE id=?", [unowned]);
    run("DELETE FROM project_packs WHERE id=?", [laterDeleted]);
    const read = (await request("/me/workspace", second.token)).data;
    assert.deepEqual(read.state.favorites, [available]);
    assert.deepEqual(read.state.notes, before.notes);
    assert.equal(read.recommendations.some((item) => item.id === unowned || item.id === laterDeleted), false);
    const update = { ...before,
      notes: [{ ...before.notes[0], body: "下架之后仍然可以更新笔记" }],
      tasks: [{ ...before.tasks[0], done: true }],
      favorites: [...before.favorites, unpublished, privatePathPack, 999999],
    };
    const saved = await request("/me/workspace/state", second.token, update);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.state, { ...update, favorites: [available] });
    assert.deepEqual(JSON.parse(row("SELECT state_json FROM workspace_state WHERE user_id=?", [second.id]).state_json), saved.data.state);
    assert.deepEqual((await request("/me/workspace", first.token)).data.state, savedState);
  });

  await t.test("Shanghai date boundaries and ongoing streak calculations are deterministic", () => {
    assert.equal(shanghaiDay(new Date("2026-09-23T15:59:59Z")), "2026-09-23");
    assert.equal(shanghaiDay(new Date("2026-09-23T16:00:00Z")), "2026-09-24");
    assert.equal(streakDays(["2026-09-21", "2026-09-22", "2026-09-23"], "2026-09-24"), 3);
    assert.equal(streakDays(["2026-09-22"], "2026-09-24"), 0);
    assert.equal(streakDays(["2026-09-22", "2026-09-24"], "2026-09-24"), 1);
    assert.equal(streakDays([], "2026-09-24"), 0);
  });
});
