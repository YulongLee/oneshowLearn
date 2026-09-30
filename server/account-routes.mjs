import { Router } from "express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config, emailAvailable } from "./config.mjs";
import { db, row, rows, run } from "./db.mjs";
import { requireAuth, requireOwner, signUser } from "./auth.mjs";
import { sendEmail, emailStatus, verifyEmailTransport } from "./email.mjs";
import { AccountError, audit, rateLimit } from "./account-security.mjs";

const email = z.string().trim().toLowerCase().email().max(254);
// bcrypt only processes the first 72 UTF-8 bytes: reject longer input explicitly.
const password = z.string().min(10).max(72).refine((s) => Buffer.byteLength(s, "utf8") <= 72);
const codeSchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });
const generic = { ok: true, verificationRequired: true, cooldownSeconds: 60, message: "若邮箱符合条件，验证码将发送至邮箱；请检查收件箱和垃圾邮件。" };
const codeHash = (address, purpose, code) => createHmac("sha256", config.jwtSecret).update(`${purpose}:${address}:${code}`).digest("hex");
const dummyHash = bcrypt.hashSync("invalid-account-timing-padding", 12);
const validate = (schema, handler) => async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new AccountError(400, "请检查邮箱、验证码及密码（密码需 10–72 字节）");
  return handler(req, res, parsed.data);
};
function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}
function revokeCodes(address) {
  run("UPDATE account_codes SET consumed_at=? WHERE email=? AND consumed_at IS NULL", [Date.now(), address]);
}
function checkCode(address, purpose, code) {
  // Never fall back to an older code after a newer code was consumed or failed.
  const item = row("SELECT * FROM account_codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1", [address, purpose]);
  if (!item || item.delivery_status !== "sent" || item.consumed_at || item.expires_at <= Date.now()) throw new AccountError(400, "验证码已失效，请重新获取");
  if (item.attempts >= 5) throw new AccountError(429, "验证次数过多，请重新获取验证码");
  const expected = Buffer.from(item.code_hash, "hex");
  const actual = Buffer.from(codeHash(address, purpose, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    run("UPDATE account_codes SET attempts=attempts+1 WHERE id=?", [item.id]);
    throw new AccountError(400, "验证码不正确");
  }
  return item;
}

async function requestCode(req, res, data, purpose) {
  if (purpose === "register" && !config.registrationEnabled) throw new AccountError(503, "邮箱注册暂未开放");
  if (!emailAvailable) throw new AccountError(503, "邮件服务尚未配置");
  rateLimit("send-ip", req.ip, 15, 600);
  rateLimit("send-email", data.email, 5, 600);
  rateLimit(`cooldown-${purpose}`, data.email, 1, 60);
  const user = row("SELECT * FROM users WHERE email=?", [data.email]);
  const eligible = purpose === "register" ? !user || (!user.email_verified && user.status === "active") : user?.email_verified && user.status === "active";
  // Hash on both paths to avoid the obvious timing signal of an existing account.
  const hash = purpose === "register" ? await bcrypt.hash(data.password, 12) : "";
  if (!eligible) return res.status(202).json(generic);
  const now = Date.now();
  const code = String(randomInt(100000, 1000000));
  const id = transaction(() => {
    run("UPDATE account_codes SET consumed_at=? WHERE email=? AND purpose=? AND consumed_at IS NULL", [now, data.email, purpose]);
    // Expired registration password hashes are not retained indefinitely.
    run("DELETE FROM account_codes WHERE expires_at < ?", [now - 86400000]);
    return Number(run(`INSERT INTO account_codes
      (email,purpose,code_hash,pending_name,pending_password_hash,token_version,expires_at,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, [data.email, purpose, codeHash(data.email, purpose, code), data.name || "", hash, user?.token_version || 0, now + 600000, now]).lastInsertRowid);
  });
  try {
    await sendEmail(data.email, code, purpose);
    run("UPDATE account_codes SET delivery_status='sent' WHERE id=?", [id]);
    return res.status(202).json(generic);
  } catch (e) {
    run("UPDATE account_codes SET delivery_status='failed',consumed_at=?,pending_password_hash='' WHERE id=?", [Date.now(), id]);
    throw e;
  }
}

export function accountRouter() {
  const router = Router();
  router.get("/status", (_req, res) => res.json({
    registrationEnabled: config.registrationEnabled && emailAvailable,
    passwordResetEnabled: emailAvailable,
    deliveryMode: config.allowDevEmail && !config.isProduction ? "development" : "email",
  }));
  router.post("/register/request-code", validate(z.object({ email, password, name: z.string().trim().min(2).max(80) }), (req, res, data) => requestCode(req, res, data, "register")));
  router.post("/register/verify", validate(codeSchema, (req, res, data) => {
    if (!config.registrationEnabled || !emailAvailable) throw new AccountError(503, "邮箱注册暂未开放");
    rateLimit("verify-ip", req.ip, 40, 600);
    const verification = checkCode(data.email, "register", data.code);
    const user = transaction(() => {
      const existing = row("SELECT * FROM users WHERE email=?", [data.email]);
      if (existing?.email_verified || existing?.status === "disabled") throw new AccountError(409, "无法完成注册，请直接登录或联系管理员");
      let id = existing?.id;
      if (id) run("UPDATE users SET name=?,password_hash=?,email_verified=1,token_version=token_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", [verification.pending_name, verification.pending_password_hash, id]);
      else id = Number(run("INSERT INTO users (email,password_hash,name,role,status,email_verified) VALUES (?,?,?,'learner','active',1)", [data.email, verification.pending_password_hash, verification.pending_name]).lastInsertRowid);
      revokeCodes(data.email);
      run("UPDATE account_codes SET pending_password_hash='' WHERE email=?", [data.email]);
      audit(id, id, "register");
      return row("SELECT id,email,name,role,status,email_verified,token_version FROM users WHERE id=?", [id]);
    });
    return res.status(201).json({ token: signUser(user), user });
  }));
  router.post("/password/request-code", validate(z.object({ email }), (req, res, data) => requestCode(req, res, data, "reset")));
  router.post("/password/reset", validate(codeSchema.extend({ newPassword: password }), async (req, res, data) => {
    rateLimit("verify-ip", req.ip, 40, 600);
    checkCode(data.email, "reset", data.code);
    const hash = await bcrypt.hash(data.newPassword, 12);
    transaction(() => {
      const verification = checkCode(data.email, "reset", data.code);
      const user = row("SELECT * FROM users WHERE email=? AND status='active' AND email_verified=1", [data.email]);
      if (!user || user.token_version !== verification.token_version) throw new AccountError(400, "验证码已失效，请重新获取");
      run("UPDATE users SET password_hash=?,token_version=token_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", [hash, user.id]);
      revokeCodes(data.email);
      audit(user.id, user.id, "password_reset");
    });
    res.json({ ok: true, message: "密码已更新，所有设备已退出，请重新登录" });
  }));
  router.post("/login", validate(z.object({ email, password: z.string().min(1).max(128) }), async (req, res, data) => {
    rateLimit("login-ip", req.ip, 40, 600);
    rateLimit("login-email", data.email, 15, 600);
    const candidate = row("SELECT * FROM users WHERE email=?", [data.email]);
    const valid = await bcrypt.compare(data.password, candidate?.password_hash || dummyHash);
    // Re-read after the asynchronous comparison: status/password may have changed meanwhile.
    const user = candidate && row("SELECT * FROM users WHERE id=?", [candidate.id]);
    if (!valid || !user || user.password_hash !== candidate.password_hash || user.status !== "active") throw new AccountError(401, "邮箱或密码不正确");
    if (!user.email_verified) return res.status(403).json({ error: "请先完成邮箱验证", code: "EMAIL_UNVERIFIED" });
    run("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", [user.id]);
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, email_verified: user.email_verified, token_version: user.token_version };
    res.json({ token: signUser(safe), user: safe });
  }));
  router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
  router.post("/password/change", requireAuth, validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }), async (req, res, data) => {
    rateLimit("change-password", req.user.id, 5, 600);
    const original = row("SELECT * FROM users WHERE id=?", [req.user.id]);
    if (!await bcrypt.compare(data.currentPassword, original.password_hash)) throw new AccountError(400, "当前密码不正确");
    if (await bcrypt.compare(data.newPassword, original.password_hash)) throw new AccountError(400, "新密码不能与当前密码相同");
    const hash = await bcrypt.hash(data.newPassword, 12);
    transaction(() => {
      const result = run("UPDATE users SET password_hash=?,token_version=token_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND token_version=? AND status='active'", [hash, req.user.id, original.token_version]);
      if (result.changes !== 1) throw new AccountError(409, "账号状态已变化，请重新登录");
      revokeCodes(req.user.email);
      audit(req.user.id, req.user.id, "password_change");
    });
    res.json({ ok: true, message: "密码已更新，请重新登录" });
  }));
  router.post("/logout", requireAuth, (req, res) => {
    transaction(() => {
      run("UPDATE users SET token_version=token_version+1 WHERE id=?", [req.user.id]);
      revokeCodes(req.user.email);
      audit(req.user.id, req.user.id, "logout_all");
    });
    res.json({ ok: true });
  });
  return router;
}

export function accountAdminRouter() {
  const router = Router();
  router.use(["/users", "/account-audit", "/email"], requireOwner);
  router.get("/users", (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const q = String(req.query.q || "").trim().slice(0, 100);
    const status = ["active", "disabled"].includes(req.query.status) ? req.query.status : "";
    const params = [q, `%${q}%`, `%${q}%`, status, status];
    const where = "(?='' OR u.email LIKE ? OR u.name LIKE ?) AND (?='' OR u.status=?)";
    const total = row(`SELECT COUNT(*) total FROM users u WHERE ${where}`, params).total;
    const items = rows(`SELECT u.id,u.email,u.name,u.role,u.status,u.email_verified,u.created_at,u.last_login_at,
      (SELECT COUNT(*) FROM entitlements e WHERE e.user_id=u.id AND e.status='active') pack_count,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) order_count
      FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT 20 OFFSET ?`, [...params, (page - 1) * 20]);
    res.json({ items, total, page, pageSize: 20, currentUserId: req.user.id });
  });
  router.post("/users/:id/action", validate(z.object({ action: z.enum(["disable", "enable", "revoke"]), reason: z.string().trim().min(2).max(300) }), (req, res, data) => {
    const user = row("SELECT * FROM users WHERE id=?", [Number(req.params.id)]);
    if (!user) throw new AccountError(404, "用户不存在");
    if (user.id === req.user.id || user.role === "admin") throw new AccountError(400, "为避免锁定管理员，请在账号安全页管理自己的登录状态");
    transaction(() => {
      const status = data.action === "disable" ? "disabled" : data.action === "enable" ? "active" : user.status;
      run("UPDATE users SET status=?,token_version=token_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", [status, user.id]);
      revokeCodes(user.email);
      audit(req.user.id, user.id, data.action, data.reason);
    });
    res.json({ ok: true });
  }));
  router.get("/account-audit", (_req, res) => res.json({ items: rows(`SELECT a.id,a.action,a.reason,a.created_at,u.email actor_email,t.email target_email
    FROM account_audit a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN users t ON t.id=a.target_id ORDER BY a.id DESC LIMIT 50`) }));
  router.get("/email", (_req, res) => res.json({ ...emailStatus(), items: rows("SELECT id,recipient,purpose,provider,status,error_code,created_at FROM email_deliveries ORDER BY id DESC LIMIT 50") }));
  router.post("/email/verify", async (req, res) => {
    rateLimit("email-verify", req.user.id, 5, 600);
    res.json(await verifyEmailTransport());
  });
  router.post("/email/test", async (req, res) => {
    rateLimit("email-test", req.user.id, 1, 60);
    const result = await sendEmail(req.user.email, "", "test");
    audit(req.user.id, req.user.id, "email_test");
    res.json({ ...result, message: result.provider === "development" ? "当前为本地模拟模式，没有发送真实邮件。" : "邮件服务器已接受，请在当前管理员邮箱中确认收件（含垃圾邮件）。" });
  });
  return router;
}
