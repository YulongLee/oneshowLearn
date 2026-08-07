import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.mjs";
import { db, row, rows, run } from "./db.mjs";
import { optionalAuth, requireAdmin, requireAuth, signUser } from "./auth.mjs";
import { sendVerificationCode } from "./email.mjs";

mkdirSync(config.uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, done) => done(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const packSchema = z.object({
  pathId: z.coerce.number().int().positive(), slug: z.string().min(2), title: z.string().min(2),
  subtitle: z.string().default(""), description: z.string().default(""), deliverable: z.string().default(""),
  coverUrl: z.string().default(""), priceCents: z.coerce.number().int().nonnegative().default(0),
  estimatedMinutes: z.coerce.number().int().nonnegative().default(0), status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const contentSchema = z.object({
  stepId: z.coerce.number().int().positive(), type: z.enum(["document", "prompt", "code", "template", "task", "checklist", "video", "download"]),
  title: z.string().min(2), body: z.string().default(""), resourceUrl: z.string().default(""),
  durationSeconds: z.coerce.number().int().nonnegative().default(0), isPreview: z.coerce.boolean().default(false),
  status: z.enum(["draft", "published", "archived"]).default("draft"), sortOrder: z.coerce.number().int().default(0),
});

function validated(schema, handler) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "提交内容不完整", fields: parsed.error.flatten().fieldErrors });
    req.validated = parsed.data;
    return handler(req, res, next);
  };
}

const registrationSchema = z.object({ email: z.string().email(), password: z.string().min(10).max(128), name: z.string().min(2).max(80) });
const normalizedEmail = (value) => String(value || "").trim().toLowerCase();
const codeHash = (email, code) => createHash("sha256").update(`${config.jwtSecret}:${email}:${code}`).digest("hex");
const safeHashMatch = (left, right) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

function packDetails(pack, user) {
  const entitled = user && (user.role !== "learner" || row("SELECT id FROM entitlements WHERE user_id = ? AND pack_id = ? AND status = 'active'", [user.id, pack.id]));
  const steps = rows("SELECT * FROM project_steps WHERE pack_id = ? AND status != 'archived' ORDER BY sort_order,id", [pack.id]).map((step) => ({
    ...step,
    contents: rows("SELECT * FROM content_items WHERE step_id = ? AND status != 'archived' ORDER BY sort_order,id", [step.id]).map((item) => entitled || item.is_preview ? item : { id: item.id, type: item.type, title: item.title, is_preview: 0, locked: true }),
  }));
  return { ...pack, entitled: Boolean(entitled), steps };
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.appOrigin }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(config.uploadDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "oneshowlearn-api" }));
  app.post("/api/auth/register/request-code", validated(registrationSchema, async (req, res, next) => {
    if (!config.registrationEnabled) return res.status(503).json({ error: "邮箱注册暂未开放" });
    const email = normalizedEmail(req.validated.email);
    const existing = row("SELECT id,email_verified FROM users WHERE email = ?", [email]);
    if (existing?.email_verified) return res.status(202).json({ ok: true, verificationRequired: true, message: "如果该邮箱可以注册，验证码将发送至邮箱" });
    const recentCount = row("SELECT COUNT(*) total FROM email_verification_codes WHERE email=? AND created_at > datetime('now','-10 minutes')", [email]).total;
    if (recentCount >= 5) return res.status(429).json({ error: "验证码发送过于频繁，请稍后再试" });
    const latest = row("SELECT created_at FROM email_verification_codes WHERE email=? ORDER BY id DESC LIMIT 1", [email]);
    if (latest && Date.now() - Date.parse(`${latest.created_at}Z`) < 60000) return res.status(202).json({ ok: true, verificationRequired: true, cooldownSeconds: 60 });
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    run("INSERT INTO email_verification_codes (email,code_hash,pending_name,pending_password_hash,expires_at) VALUES (?,?,?,?,?)", [email, codeHash(email, code), req.validated.name, bcrypt.hashSync(req.validated.password, 12), expiresAt]);
    try {
      await sendVerificationCode(email, code);
      return res.status(202).json({ ok: true, verificationRequired: true, cooldownSeconds: 60 });
    } catch (error) {
      run("DELETE FROM email_verification_codes WHERE email=? AND code_hash=?", [email, codeHash(email, code)]);
      if (error.message === "EMAIL_NOT_CONFIGURED") return res.status(503).json({ error: "邮件服务尚未配置" });
      return next(error);
    }
  }));
  app.post("/api/auth/register/verify", validated(z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }), (req, res) => {
    const email = normalizedEmail(req.validated.email);
    const verification = row("SELECT * FROM email_verification_codes WHERE email=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1", [email]);
    if (!verification || Date.parse(verification.expires_at) <= Date.now()) return res.status(400).json({ error: "验证码已失效，请重新获取" });
    if (verification.attempts >= 5) return res.status(429).json({ error: "验证次数过多，请重新获取验证码" });
    if (!safeHashMatch(verification.code_hash, codeHash(email, req.validated.code))) {
      run("UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?", [verification.id]);
      return res.status(400).json({ error: "验证码不正确" });
    }
    const existing = row("SELECT * FROM users WHERE email=?", [email]);
    if (existing?.email_verified) return res.status(409).json({ error: "该邮箱已经注册，请直接登录" });
    db.exec("BEGIN IMMEDIATE");
    try {
      let userId;
      if (existing) {
        userId = existing.id;
        run("UPDATE users SET name=?,password_hash=?,email_verified=1,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?", [verification.pending_name, verification.pending_password_hash, userId]);
      } else {
        const result = run("INSERT INTO users (email,password_hash,name,role,status,email_verified) VALUES (?,?,?,?,?,1)", [email, verification.pending_password_hash, verification.pending_name, "learner", "active"]);
        userId = Number(result.lastInsertRowid);
      }
      run("UPDATE email_verification_codes SET consumed_at=CURRENT_TIMESTAMP WHERE email=? AND consumed_at IS NULL", [email]);
      db.exec("COMMIT");
      const user = row("SELECT id,email,name,role,status,email_verified FROM users WHERE id=?", [userId]);
      return res.status(201).json({ token: signUser(user), user });
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }));
  app.post("/api/auth/login", validated(z.object({ email: z.string().email(), password: z.string().min(1) }), (req, res) => {
    const user = row("SELECT * FROM users WHERE email = ?", [req.validated.email]);
    if (!user || user.status !== "active" || !bcrypt.compareSync(req.validated.password, user.password_hash)) return res.status(401).json({ error: "邮箱或密码不正确" });
    if (!user.email_verified) return res.status(403).json({ error: "请先完成邮箱验证", code: "EMAIL_UNVERIFIED" });
    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
    res.json({ token: signUser(safeUser), user: safeUser });
  }));
  app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

  app.get("/api/catalog/paths", (_req, res) => {
    const items = rows(`SELECT lp.*, COUNT(pp.id) pack_count, COALESCE(MIN(pp.price_cents),0) starting_price_cents
      FROM learning_paths lp LEFT JOIN project_packs pp ON pp.path_id=lp.id AND pp.status='published'
      WHERE lp.status='published' GROUP BY lp.id ORDER BY lp.sort_order,lp.id`);
    res.json({ items });
  });
  app.get("/api/catalog/paths/:slug", optionalAuth, (req, res) => {
    const pathRow = row("SELECT * FROM learning_paths WHERE slug = ? AND status = 'published'", [req.params.slug]);
    if (!pathRow) return res.status(404).json({ error: "学习路径不存在" });
    const packs = rows(`SELECT pp.*,p.sku,p.price_cents product_price_cents,p.status product_status
      FROM project_packs pp LEFT JOIN products p ON p.pack_id=pp.id WHERE pp.path_id=? AND pp.status='published' ORDER BY pp.sort_order,pp.id`, [pathRow.id]);
    res.json({ ...pathRow, packs });
  });
  app.get("/api/project-packs/:slug", optionalAuth, (req, res) => {
    const pack = row(`SELECT pp.*,lp.title path_title,lp.slug path_slug,p.id product_id,p.sku,p.price_cents product_price_cents
      FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id LEFT JOIN products p ON p.pack_id=pp.id WHERE pp.slug=? AND pp.status='published'`, [req.params.slug]);
    if (!pack) return res.status(404).json({ error: "项目包不存在" });
    res.json(packDetails(pack, req.user));
  });

  app.get("/api/me/library", requireAuth, (req, res) => res.json({ items: rows(`SELECT pp.*,lp.title path_title,e.status entitlement_status
    FROM entitlements e JOIN project_packs pp ON pp.id=e.pack_id JOIN learning_paths lp ON lp.id=pp.path_id WHERE e.user_id=? AND e.status='active' ORDER BY e.starts_at DESC`, [req.user.id]) }));
  app.put("/api/me/progress/:contentId", requireAuth, validated(z.object({ status: z.enum(["started", "completed"]) }), (req, res) => {
    run(`INSERT INTO progress (user_id,content_item_id,status,completed_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,content_item_id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, Number(req.params.contentId), req.validated.status, req.validated.status === "completed" ? new Date().toISOString() : null]);
    res.json({ ok: true });
  }));
  app.post("/api/orders", requireAuth, validated(z.object({ productId: z.coerce.number().int().positive() }), (req, res) => {
    const product = row("SELECT * FROM products WHERE id=? AND status='active'", [req.validated.productId]);
    if (!product) return res.status(404).json({ error: "商品不存在或已下架" });
    const orderNo = `OSL${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run("INSERT INTO orders (order_no,user_id,status,amount_cents,currency) VALUES (?,?,?,?,?)", [orderNo, req.user.id, "pending", product.price_cents, product.currency]);
      const orderId = Number(result.lastInsertRowid);
      run("INSERT INTO order_items (order_id,product_id,title,price_cents) VALUES (?,?,?,?)", [orderId, product.id, product.title, product.price_cents]);
      run("INSERT INTO payments (order_id,provider,status,amount_cents) VALUES (?,?,?,?)", [orderId, "manual", "created", product.price_cents]);
      db.exec("COMMIT");
      res.status(201).json({ id: orderId, orderNo, status: "pending", amountCents: product.price_cents, currency: product.currency });
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }));

  app.use("/api/admin", requireAdmin);
  app.get("/api/admin/dashboard", (_req, res) => res.json({
    users: row("SELECT COUNT(*) total FROM users WHERE role='learner'").total,
    publishedPaths: row("SELECT COUNT(*) total FROM learning_paths WHERE status='published'").total,
    publishedPacks: row("SELECT COUNT(*) total FROM project_packs WHERE status='published'").total,
    paidRevenueCents: row("SELECT COALESCE(SUM(amount_cents),0) total FROM orders WHERE status='paid'").total,
    pendingOrders: row("SELECT COUNT(*) total FROM orders WHERE status='pending'").total,
  }));
  app.get("/api/admin/paths", (_req, res) => res.json({ items: rows("SELECT * FROM learning_paths ORDER BY sort_order,id") }));
  app.put("/api/admin/paths/:id", validated(z.object({ title: z.string().min(2), description: z.string(), level: z.string(), status: z.enum(["draft","published","archived"]), sortOrder: z.coerce.number().int() }), (req, res) => {
    const d = req.validated; run("UPDATE learning_paths SET title=?,description=?,level=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", [d.title,d.description,d.level,d.status,d.sortOrder,Number(req.params.id)]); res.json({ ok: true });
  }));
  app.get("/api/admin/packs", (_req, res) => res.json({ items: rows(`SELECT pp.*,lp.title path_title,p.id product_id,p.sku,p.status product_status FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id LEFT JOIN products p ON p.pack_id=pp.id ORDER BY lp.sort_order,pp.sort_order`) }));
  app.post("/api/admin/packs", validated(packSchema, (req, res) => {
    const d=req.validated; const result=run(`INSERT INTO project_packs (path_id,slug,title,subtitle,description,deliverable,cover_url,price_cents,estimated_minutes,status) VALUES (?,?,?,?,?,?,?,?,?,?)`,[d.pathId,d.slug,d.title,d.subtitle,d.description,d.deliverable,d.coverUrl,d.priceCents,d.estimatedMinutes,d.status]);
    const packId=Number(result.lastInsertRowid); run("INSERT INTO products (pack_id,sku,title,price_cents,currency,status) VALUES (?,?,?,?,?,?)",[packId,`OSL-${Date.now()}`,d.title,d.priceCents,"CNY","active"]); res.status(201).json({ id: packId });
  }));
  app.put("/api/admin/packs/:id", validated(packSchema, (req,res)=>{ const d=req.validated; run(`UPDATE project_packs SET path_id=?,slug=?,title=?,subtitle=?,description=?,deliverable=?,cover_url=?,price_cents=?,estimated_minutes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[d.pathId,d.slug,d.title,d.subtitle,d.description,d.deliverable,d.coverUrl,d.priceCents,d.estimatedMinutes,d.status,Number(req.params.id)]); run("UPDATE products SET title=?,price_cents=?,updated_at=CURRENT_TIMESTAMP WHERE pack_id=?",[d.title,d.priceCents,Number(req.params.id)]); res.json({ok:true}); }));
  app.get("/api/admin/packs/:id/steps", (req,res)=>res.json({items:rows("SELECT * FROM project_steps WHERE pack_id=? ORDER BY sort_order,id",[Number(req.params.id)])}));
  app.post("/api/admin/steps", validated(z.object({packId:z.coerce.number().int().positive(),title:z.string().min(2),summary:z.string().default(""),status:z.enum(["draft","published","archived"]).default("draft"),sortOrder:z.coerce.number().int().default(0)}),(req,res)=>{const d=req.validated;const result=run("INSERT INTO project_steps (pack_id,title,summary,status,sort_order) VALUES (?,?,?,?,?)",[d.packId,d.title,d.summary,d.status,d.sortOrder]);res.status(201).json({id:Number(result.lastInsertRowid)});}));
  app.get("/api/admin/content", (req,res)=>{const stepId=Number(req.query.stepId);res.json({items:rows("SELECT * FROM content_items WHERE step_id=? ORDER BY sort_order,id",[stepId])});});
  app.post("/api/admin/content", validated(contentSchema,(req,res)=>{const d=req.validated;const result=run(`INSERT INTO content_items (step_id,type,title,body,resource_url,duration_seconds,is_preview,status,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,[d.stepId,d.type,d.title,d.body,d.resourceUrl,d.durationSeconds,d.isPreview?1:0,d.status,d.sortOrder]);res.status(201).json({id:Number(result.lastInsertRowid)});}));
  app.put("/api/admin/content/:id", validated(contentSchema,(req,res)=>{const d=req.validated;run(`UPDATE content_items SET step_id=?,type=?,title=?,body=?,resource_url=?,duration_seconds=?,is_preview=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[d.stepId,d.type,d.title,d.body,d.resourceUrl,d.durationSeconds,d.isPreview?1:0,d.status,d.sortOrder,Number(req.params.id)]);res.json({ok:true});}));
  app.delete("/api/admin/content/:id", (req,res)=>{run("DELETE FROM content_items WHERE id=?",[Number(req.params.id)]);res.status(204).end();});
  app.post("/api/admin/assets", upload.single("file"), (req,res)=>{if(!req.file)return res.status(400).json({error:"请选择文件"});const url=`/uploads/${req.file.filename}`;const result=run("INSERT INTO assets (filename,original_name,mime_type,size_bytes,url,uploaded_by) VALUES (?,?,?,?,?,?)",[req.file.filename,req.file.originalname,req.file.mimetype,req.file.size,url,req.user.id]);res.status(201).json({id:Number(result.lastInsertRowid),url});});
  app.get("/api/admin/orders", (_req,res)=>res.json({items:rows(`SELECT o.*,u.email,u.name,GROUP_CONCAT(oi.title,'、') item_titles FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC`)}));
  app.post("/api/admin/orders/:id/mark-paid", (req,res)=>{const order=row("SELECT * FROM orders WHERE id=?",[Number(req.params.id)]);if(!order)return res.status(404).json({error:"订单不存在"});db.exec("BEGIN IMMEDIATE");try{run("UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",[order.id]);run("UPDATE payments SET status='succeeded',updated_at=CURRENT_TIMESTAMP WHERE order_id=?",[order.id]);for(const item of rows("SELECT p.pack_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?",[order.id]))run(`INSERT INTO entitlements (user_id,pack_id,source,status) VALUES (?,?,?,?) ON CONFLICT(user_id,pack_id) DO UPDATE SET status='active',source='purchase'`,[order.user_id,item.pack_id,"purchase","active"]);db.exec("COMMIT");res.json({ok:true});}catch(error){db.exec("ROLLBACK");throw error;}});
  app.get("/api/admin/users", (_req,res)=>res.json({items:rows(`SELECT u.id,u.email,u.name,u.role,u.status,u.created_at,COUNT(DISTINCT e.pack_id) pack_count,COUNT(DISTINCT o.id) order_count FROM users u LEFT JOIN entitlements e ON e.user_id=u.id AND e.status='active' LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC`)}));

  app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: "服务暂时不可用" }); });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createApp().listen(config.port, "127.0.0.1", () => console.log(`OneShowLearn API running on http://127.0.0.1:${config.port}`));
}
