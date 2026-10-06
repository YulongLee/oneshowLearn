import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.mjs";
import { db, row, rows, run } from "./db.mjs";
import { optionalAuth, requireAdmin, requireAuth } from "./auth.mjs";
import { accountRouter, accountAdminRouter } from "./account-routes.mjs";
import { externalLoginRouter, loginAdminRouter } from './login-routes.mjs';
import { AccountError } from "./account-security.mjs";
import { workspaceRouter } from "./workspace-routes.mjs";
import { projectRouter } from "./project-routes.mjs";
import { resourceRouter } from "./resource-routes.mjs";
import { opcRouter, canReadPack, publishedContent } from "./opc-routes.mjs";
import {cmsRouter} from './cms-routes.mjs';
import {materialsRouter,materialUrl} from './materials.mjs';
import {platformContentRouter} from './platform-content.mjs';
import {communityRouter} from './community-routes.mjs';
import {learningRouter} from './learning-routes.mjs';
import {aiAdminRouter} from './ai-admin-routes.mjs';
import {publishedProduct,markOrderPaid} from './learning-commerce.mjs';
import {paymentRouter,paymentNotificationRouter} from './payment-routes.mjs';
import {startPaymentReconciliation} from './payment-lifecycle.mjs';
import {serviceRouter} from './service-routes.mjs';
import {workspaceSearchRouter} from './workspace-search.mjs';
import {manualRefundRouter} from './manual-refunds.mjs';
import {listPage} from './list-page.mjs';
import {notificationsRouter} from './notifications.mjs';
import {workspaceCapacityRouter} from './workspace-capacity.mjs';
import {operationalReadinessRouter} from './operational-readiness.mjs';

mkdirSync(config.uploadDir, { recursive: true });

// Historical public files remain recoverable. Never serve active web content
// from this same-origin directory; all new uploads use the private adapter.
const legacyMedia = new Set(['.mp4','.webm','.mp3','.png','.jpg','.jpeg','.webp','.vtt']);
const legacyDownloads = new Set(['.pdf','.txt','.md','.csv','.json','.zip','.pptx','.docx','.xlsx']);

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

function packDetails(pack, user) {
  const entitled = canReadPack(user,pack.id);
  const steps = rows("SELECT * FROM project_steps WHERE pack_id = ? AND status = 'published' ORDER BY sort_order,id", [pack.id]).map((step) => ({
    ...step,
    contents: rows("SELECT * FROM published_content_items WHERE step_id = ? AND status = 'published' ORDER BY sort_order,id", [step.id]).map((item) => entitled || item.is_preview ? {...item,resource_url:materialUrl(item.resource_url,user)} : { id: item.id, type: item.type, title: item.title, is_preview: 0, locked: true }),
  }));
  return { ...pack, entitled: Boolean(entitled), steps };
}

export function createApp({loginProviders,assetStorage} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(cors({ origin: config.appOrigin }));
  app.use(paymentNotificationRouter());
  app.use(express.json({ limit: "2mb" }));
  app.use('/uploads', (req,res,next)=>{
    let filename;try{filename=decodeURIComponent(req.path);}catch{return res.status(400).end();}
    const extension=path.extname(filename).toLowerCase();
    res.set({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'});
    if(!legacyMedia.has(extension)&&!legacyDownloads.has(extension))return res.status(404).end();
    if(legacyDownloads.has(extension))res.attachment(path.basename(filename));
    next();
  },express.static(config.uploadDir,{index:false,dotfiles:'deny'}));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "oneshowlearn-api" }));
  app.get('/api/ready', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { row('SELECT id FROM users LIMIT 1'); res.json({ok:true,service:'oneshowlearn-api'}); }
    catch { res.status(503).json({ok:false,service:'oneshowlearn-api'}); }
  });
  app.use("/api/auth", accountRouter());
  app.use('/api/auth', externalLoginRouter(loginProviders));
  app.use('/api/admin/login-settings', loginAdminRouter());
  app.use('/api',materialsRouter(assetStorage));
  app.use('/api',learningRouter());
  app.use('/api',aiAdminRouter());
  app.use('/api',paymentRouter());
  app.use('/api',serviceRouter());
  app.use('/api',workspaceSearchRouter());
  app.use('/api',manualRefundRouter());
  app.use('/api',notificationsRouter());
  app.use('/api',workspaceCapacityRouter());
  app.use('/api',operationalReadinessRouter());
  app.use('/api',platformContentRouter());
  app.use('/api',communityRouter());
  app.use('/api/admin/cms',cmsRouter());
  app.use("/api/admin", accountAdminRouter());
  app.use("/api", workspaceRouter());
  app.use("/api", projectRouter());
  app.use("/api", resourceRouter());
  app.use("/api", opcRouter());

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
      FROM project_packs pp JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' LEFT JOIN products p ON p.pack_id=pp.id WHERE pp.slug=? AND pp.status='published'`, [req.params.slug]);
    if (!pack) return res.status(404).json({ error: "项目包不存在" });
    res.json(packDetails(pack, req.user));
  });

  app.get("/api/me/library", requireAuth, (req, res) => res.json({ items: rows(`SELECT pp.*,lp.title path_title,e.status entitlement_status
    FROM entitlements e JOIN project_packs pp ON pp.id=e.pack_id JOIN learning_paths lp ON lp.id=pp.path_id WHERE e.user_id=? AND e.status='active' ORDER BY e.starts_at DESC`, [req.user.id]) }));
  app.put("/api/me/progress/:contentId", requireAuth, validated(z.object({ status: z.enum(["started", "completed"]) }), (req, res) => {
    const item = publishedContent(Number(req.params.contentId));
    if (!item) return res.status(404).json({ error: "内容不存在或暂未发布" });
    if (!item.is_preview && !canReadPack(req.user, item.pack_id)) return res.status(403).json({ error: "当前账号没有此内容的学习权限" });
    run(`INSERT INTO progress (user_id,content_item_id,status,completed_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,content_item_id) DO UPDATE SET status=CASE WHEN progress.status='completed' THEN progress.status ELSE excluded.status END,completed_at=COALESCE(progress.completed_at,excluded.completed_at),updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, Number(req.params.contentId), req.validated.status, req.validated.status === "completed" ? new Date().toISOString() : null]);
    res.json({ ok: true });
  }));
  app.post("/api/orders", requireAuth, validated(z.object({ productId: z.coerce.number().int().positive() }), (req, res) => {
    const product = publishedProduct(req.validated.productId);
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
  app.put("/api/admin/content/:id", validated(contentSchema,(req,res)=>{if(row('SELECT library_id FROM content_items WHERE id=?',[Number(req.params.id)])?.library_id)return res.status(409).json({error:'这份资料由统一资料库维护，请通过新版课程资料编辑引用设置，或前往统一资料库编辑正文。'});const d=req.validated;run(`UPDATE content_items SET step_id=?,type=?,title=?,body=?,resource_url=?,duration_seconds=?,is_preview=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[d.stepId,d.type,d.title,d.body,d.resourceUrl,d.durationSeconds,d.isPreview?1:0,d.status,d.sortOrder,Number(req.params.id)]);res.json({ok:true});}));
  app.delete("/api/admin/content/:id", (req,res)=>{run("DELETE FROM content_items WHERE id=?",[Number(req.params.id)]);res.status(204).end();});
  app.get("/api/admin/orders", (req,res)=>{const page=listPage(req.query);res.set('Cache-Control','private, no-store').json({items:rows(`SELECT o.*,u.email,u.name,pc.provider online_provider,GROUP_CONCAT(oi.title,'、') item_titles FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN payment_checkouts pc ON pc.order_id=o.id WHERE instr(lower(o.order_no),lower(?))>0 GROUP BY o.id ORDER BY o.id DESC LIMIT ? OFFSET ?`,[page.q,page.limit,page.offset]),total:row('SELECT COUNT(*) n FROM orders WHERE instr(lower(order_no),lower(?))>0',[page.q]).n,...page});});
  app.post("/api/admin/orders/:id/mark-paid", markOrderPaid);

  app.use((error, _req, res, _next) => {
    if (error instanceof AccountError) {
      if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
      return res.status(error.status).json({ error: error.message, cooldownSeconds: error.retryAfter || undefined });
    }
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "请求格式不正确" });
    if (error.isPaymentError) return res.status(error.status).json({error:error.message});
    if (error.type === "entity.too.large") return res.status(413).json({ error: "提交内容过大，请精简后重试" });
    console.error("API request failed", error.name, error.code || "UNKNOWN");
    res.status(500).json({ error: "服务暂时不可用" });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createApp().listen(config.port, config.host, () => console.log(`OneShowLearn API running on http://${config.host}:${config.port}`));
  startPaymentReconciliation();
}
