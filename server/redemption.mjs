import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, row, rows, run } from './db.mjs';
import { requireAuth, requireOwner } from './auth.mjs';
import { rateLimit } from './account-security.mjs';
import { publishedProduct } from './learning-commerce.mjs';
import { listPage } from './list-page.mjs';

const codeBody = z.object({ code: z.string().trim().min(8).max(100) }).strict();
const batchBody = z.object({
  productId: z.coerce.number().int().positive(),
  count: z.coerce.number().int().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(200).optional().default(''),
}).strict();

function canonicalCode(value) {
  return String(value || '').replace(/[\s-]/g, '').toUpperCase();
}
function hashCode(value) {
  return createHash('sha256').update(canonicalCode(value)).digest('hex');
}
function newCode() {
  const raw = randomBytes(12).toString('hex').toUpperCase();
  return `OSL-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 24)}`;
}
function fail(status, error) {
  const e = new Error(error); e.status = status; return e;
}
function validExpiry(expiresAt) {
  if (!expiresAt) return null;
  const value = new Date(expiresAt);
  if (!Number.isFinite(value.getTime()) || value.getTime() <= Date.now()) throw fail(400, '兑换码有效期必须晚于当前时间');
  return value.toISOString();
}
function audit(userId, id, title, status, action) {
  run('INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)', [userId, 'redemption_codes', id, title, status, action]);
}

function publicCodeRow(item) {
  return {
    id: item.id,
    codeLast4: item.code_last4,
    productId: item.product_id,
    productTitle: item.product_title,
    status: item.status,
    expiresAt: item.expires_at,
    usedAt: item.used_at,
    usedBy: item.used_by_name || null,
    createdAt: item.created_at,
    note: item.note,
  };
}

export function redemptionRouter() {
  const router = Router();
  router.use(['/commerce/redeem', '/admin/redemption-codes'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); next();
  });

  router.post('/commerce/redeem', requireAuth, (req, res) => {
    rateLimit('course-redemption', String(req.user.id), 10, 60);
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '请输入有效的兑换码' });
    const canonical = canonicalCode(parsed.data.code);
    if (!/^OSL[A-Z0-9]{16,64}$/.test(canonical)) return res.status(400).json({ error: '兑换码格式不正确，请检查后重试' });
    try {
      db.exec('BEGIN IMMEDIATE');
      const item = row(`SELECT rc.*,p.pack_id,p.project_id,p.title product_title
        FROM redemption_codes rc JOIN products p ON p.id=rc.product_id WHERE rc.code_hash=?`, [hashCode(canonical)]);
      if (!item) throw fail(404, '兑换码无效或不存在');
      if (item.status === 'used') throw fail(409, '兑换码已使用，请勿重复兑换');
      if (item.status === 'revoked') throw fail(409, '兑换码已失效，请联系管理员');
      if (item.expires_at && Date.parse(item.expires_at) <= Date.now()) {
        run("UPDATE redemption_codes SET status='revoked' WHERE id=? AND status='active'", [item.id]);
        audit(req.user.id, item.id, item.product_title, 'revoked', 'expired');
        db.exec('COMMIT');
        return res.status(410).json({ error: '兑换码已过期，请联系管理员' });
      }
      const product = publishedProduct(item.product_id);
      if (!product || !product.pack_id) throw fail(409, '该兑换码对应的课程暂不可兑换，请联系管理员');
      const existing = row(`SELECT id FROM entitlements WHERE user_id=? AND pack_id=? AND status='active'
        AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`, [req.user.id, product.pack_id]);
      if (existing) throw fail(409, '当前账号已拥有课程权限，无需重复兑换');
      run(`INSERT INTO entitlements(user_id,pack_id,source,status,starts_at,expires_at,purchase_order_id)
        VALUES(?,?, 'redemption','active',CURRENT_TIMESTAMP,NULL,NULL)
        ON CONFLICT(user_id,pack_id) DO UPDATE SET source='redemption',status='active',starts_at=CURRENT_TIMESTAMP,expires_at=NULL,purchase_order_id=NULL`, [req.user.id, product.pack_id]);
      const used = run("UPDATE redemption_codes SET status='used',used_by=?,used_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'", [req.user.id, item.id]);
      if (!used.changes) throw fail(409, '兑换码状态已变化，请刷新后重试');
      audit(req.user.id, item.id, item.product_title, 'used', 'redeemed');
      db.exec('COMMIT');
      return res.json({ ok: true, message: '兑换成功，课程已解锁', product: { id: product.id, title: product.title, packId: product.pack_id, sku: product.sku } });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      if (error?.status) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  });

  router.get('/admin/redemption-codes', requireOwner, (req, res) => {
    const page = listPage(req.query, { size: 30, max: 100 });
    const status = ['active', 'used', 'revoked'].includes(req.query.status) ? req.query.status : '';
    const where = status ? 'WHERE rc.status=?' : '';
    const params = status ? [status] : [];
    const items = rows(`SELECT rc.id,rc.code_last4,rc.product_id,rc.status,rc.expires_at,rc.used_at,rc.created_at,rc.note,
      p.title product_title,u.name used_by_name FROM redemption_codes rc JOIN products p ON p.id=rc.product_id
      LEFT JOIN users u ON u.id=rc.used_by ${where} ORDER BY rc.id DESC LIMIT ? OFFSET ?`, [...params, page.limit, page.offset]).map(publicCodeRow);
    const total = row(`SELECT COUNT(*) n FROM redemption_codes rc ${where}`, params)?.n || 0;
    const products = rows(`SELECT p.id,p.title,p.price_cents,p.currency FROM products p JOIN project_packs pp ON pp.id=p.pack_id
      JOIN learning_paths lp ON lp.id=pp.path_id WHERE p.status='active' AND pp.status='published' AND lp.status='published' ORDER BY p.id DESC`);
    res.json({ items, total, products, ...page, status: status || 'all' });
  });

  router.post('/admin/redemption-codes', requireOwner, (req, res) => {
    rateLimit('redemption-generation', String(req.user.id), 12, 60);
    const parsed = batchBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '请填写课程、生成数量和有效期' });
    const product = publishedProduct(parsed.data.productId);
    if (!product || !product.pack_id) return res.status(409).json({ error: '只能为已发布的课程商品生成兑换码' });
    let expiresAt;
    try { expiresAt = validExpiry(parsed.data.expiresAt); } catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
    const batchId = `RC-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const codes = [];
    try {
      db.exec('BEGIN IMMEDIATE');
      let firstId = 0;
      for (let i = 0; i < parsed.data.count; i += 1) {
        let code, inserted;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          code = newCode();
          try {
            inserted = run(`INSERT INTO redemption_codes(code_hash,code_last4,product_id,expires_at,created_by,note)
              VALUES(?,?,?,?,?,?)`, [hashCode(code), canonicalCode(code).slice(-4), product.id, expiresAt, req.user.id, parsed.data.note]);
            break;
          } catch (error) { if (!String(error.message).includes('UNIQUE')) throw error; }
        }
        if (!inserted) throw new Error('兑换码生成失败，请重试');
        if (!firstId) firstId = Number(inserted.lastInsertRowid);
        codes.push(code);
      }
      audit(req.user.id, firstId, `${product.title} · ${batchId}`, 'active', 'generated-batch');
      db.exec('COMMIT');
      return res.status(201).json({ batchId, product: { id: product.id, title: product.title, priceCents: product.price_cents }, count: codes.length, expiresAt, note: parsed.data.note, codes });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  });

  router.post('/admin/redemption-codes/:id/revoke', requireOwner, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: '兑换码编号无效' });
    const item = row('SELECT rc.*,p.title product_title FROM redemption_codes rc JOIN products p ON p.id=rc.product_id WHERE rc.id=?', [id]);
    if (!item) return res.status(404).json({ error: '兑换码不存在' });
    if (item.status === 'used') return res.status(409).json({ error: '已使用的兑换码不能撤销' });
    if (item.status === 'revoked') return res.json({ ok: true, status: 'revoked' });
    run("UPDATE redemption_codes SET status='revoked' WHERE id=? AND status='active'", [id]);
    audit(req.user.id, id, item.product_title, 'revoked', 'revoked');
    res.json({ ok: true, status: 'revoked' });
  });
  return router;
}
