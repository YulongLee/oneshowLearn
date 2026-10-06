import assert from "node:assert/strict";
import test from "node:test";
import { canManage, completeLogin, getPlatform, loginDestination,safeLoginReturn } from "../src/platforms.js";

for (const role of ["admin", "editor", "learner"]) {
  test(`${role}: user login always enters the learner platform`, () => {
    assert.equal(loginDestination({ role }), "/app");
    assert.equal(loginDestination({ role }, "user"), "/app");
  });
}

test("only administrators and editors can enter management", () => {
  for (const role of ["admin", "editor"]) {
    assert.equal(canManage({ role }), true);
    assert.equal(loginDestination({ role }, "admin"), "/admin");
  }
  for (const user of [{ role: "learner" }, { role: "unknown" }, {}, null]) {
    assert.equal(canManage(user), false);
    assert.throws(() => loginDestination(user, "admin"), /没有管理权限/);
  }
});

test("account return, sign-in and password recovery retain the entry platform", () => {
  assert.deepEqual(getPlatform("user"), { label: "用户平台", home: "/app", login: "/login", account: "/account", forgot: "/forgot-password" });
  assert.deepEqual(getPlatform("admin"), { label: "管理平台", home: "/admin", login: "/admin/login", account: "/admin/account", forgot: "/admin/forgot-password" });
  assert.equal(getPlatform("unexpected"), getPlatform("user"));
});

test("successful login shares a session but chooses the destination by entry", () => {
  const result = { token: "test-session", user: { role: "admin" } };
  for (const platform of ["user", "admin"]) {
    const actions = [];
    completeLogin(result, { platform, saveToken: (token) => actions.push(["save", token]), navigate: (url) => actions.push(["navigate", url]) });
    assert.deepEqual(actions, [["save", result.token], ["navigate", getPlatform(platform).home]]);
  }
});

test("rejected management login does not overwrite the existing session", () => {
  const actions = [];
  assert.throws(() => completeLogin({ token: "learner-session", user: { role: "learner" } }, {
    platform: "admin", saveToken: () => actions.push("save"), navigate: () => actions.push("navigate"), onSuccess: () => actions.push("callback"),
  }), /没有管理权限/);
  assert.deepEqual(actions, []);
});

test("embedded course login preserves its callback for every role", () => {
  for (const role of ["admin", "editor", "learner"]) {
    const actions = [];
    const result = { token: "test-session", user: { role } };
    completeLogin(result, { saveToken: (token) => actions.push(token), onSuccess: (user) => actions.push(user), navigate: () => assert.fail("must not leave the course") });
    assert.deepEqual(actions, [result.token, result.user]);
  }
});
test('login returns to a safe originating page without opening external or management destinations',()=>{
 const learner={role:'learner'},admin={role:'admin'};
 for(const value of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/login?returnTo=/notes','/api/secret','/admin/payments','/notes\n'])assert.equal(safeLoginReturn(value,'user',learner),null);
 assert.equal(safeLoginReturn('/notes?learningNote=abc','user',learner),'/notes?learningNote=abc');
 assert.equal(safeLoginReturn('/admin/orders','admin',admin),'/admin/orders');
 assert.equal(safeLoginReturn('/notes','admin',admin),null);
 const calls=[];completeLogin({token:'test',user:learner},{saveToken:()=>{},navigate:x=>calls.push(x),returnTo:'/resources?resource=5'});assert.deepEqual(calls,['/resources?resource=5']);
});
