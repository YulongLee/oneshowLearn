import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, row, rows, run } from "./db.mjs";
import { optionalAuth, requireAuth, requireAdmin } from "./auth.mjs";
import {materialUrl} from './materials.mjs';
import {
  OPC_PHASES,
  PRODUCT_MILESTONES,
  emptyProduct,
  safeResourceUrl,
} from "./opc-definition.mjs";

export function canReadPack(user, packId) {
  return Boolean(
    user &&
      (["admin", "editor"].includes(user.role) ||
        row(
          `SELECT id FROM entitlements
    WHERE user_id=? AND pack_id=? AND status='active' AND julianday(starts_at)<=julianday('now')
    AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`,
          [user.id, packId],
        )),
  );
}
export function publishedContent(id) {
  return row(
    `SELECT ci.*,pp.id pack_id,pp.slug pack_slug FROM published_content_items ci
    JOIN project_steps ps ON ps.id=ci.step_id AND ps.status='published'
    JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    WHERE ci.id=? AND ci.status='published'`,
    [id],
  );
}
const productSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.string().trim().max(80),
    description: z.string().trim().max(1000),
    phase: z.number().int().min(1).max(5),
    milestones: z
      .array(z.enum(["todo", "doing", "done"]))
      .length(PRODUCT_MILESTONES.length),
    outcomes: z
      .array(
        z
          .object({
            phase: z.number().int().min(1).max(5),
            summary: z.string().trim().min(1).max(5000),
            url: z
              .string()
              .max(2000)
              .refine((v) => !v || /^https?:\/\//.test(safeResourceUrl(v))),
            updatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict()
  .refine(
    (p) => new Set(p.outcomes.map((o) => o.phase)).size === p.outcomes.length,
  );
const versionOf = (json) => createHash("sha256").update(json).digest("hex");
function productSnapshot(userId) {
  const json =
    row("SELECT state_json FROM opc_products WHERE user_id=?", [userId])
      ?.state_json || JSON.stringify(emptyProduct());
  return { product: JSON.parse(json), version: versionOf(json) };
}
export function opcRouter() {
  const router = Router();
  router.put('/admin/opc/chapters/:id', requireAdmin, (req, res) => {
    const parsed = z.object({ packId:z.number().int().positive(),title:z.string().trim().min(2).max(120),summary:z.string().max(1000),sortOrder:z.number().int().nonnegative(),status:z.enum(['draft','published','archived']) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({error:'请检查章节标题、排序和发布状态'});
    const id=Number(req.params.id), d=parsed.data;
    if (!row('SELECT id FROM project_steps WHERE id=?',[id]) || !row('SELECT id FROM project_packs WHERE id=?',[d.packId])) return res.status(404).json({error:'章节或项目包不存在'});
    run('UPDATE project_steps SET pack_id=?,title=?,summary=?,sort_order=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[d.packId,d.title,d.summary,d.sortOrder,d.status,id]);
    res.json({id,ok:true});
  });
  router.get("/opc/curriculum", optionalAuth, (req, res) => {
    const items = rows(
      `SELECT ci.id,ci.title,ci.type,ci.duration_seconds,ci.is_preview,
      ps.title step_title,ps.summary,pp.id pack_id,pp.slug pack_slug,pp.title pack_title,m.phase,
      pr.status progress FROM opc_stage_steps m
      JOIN project_steps ps ON ps.id=m.step_id AND ps.status='published'
      JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
      JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
      JOIN published_content_items ci ON ci.step_id=ps.id AND ci.status='published'
      LEFT JOIN progress pr ON pr.content_item_id=ci.id AND pr.user_id=?
      ORDER BY m.phase,pp.sort_order,pp.id,ps.sort_order,ps.id,ci.sort_order,ci.id`,
      [req.user?.id || 0],
    ).map((item) => {
      const locked = !item.is_preview && !canReadPack(req.user, item.pack_id);
      return { ...item, locked, progress: locked ? null : item.progress };
    });
    const configuredLessons=rows(`SELECT p.id, l.title, p.is_preview, ps.title step_title,ps.summary,
      pp.id pack_id,pp.slug pack_slug,pp.title pack_title,m.phase,pr.completed_at,pr.version progress_version
      FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published'
      JOIN project_steps ps ON ps.id=p.chapter_id AND ps.status='published'
      JOIN opc_stage_steps m ON m.step_id=ps.id
      JOIN project_packs pp ON pp.id=ps.pack_id AND pp.status='published'
      JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
      LEFT JOIN learning_progress pr ON pr.placement_id=p.id AND pr.user_id=?
      WHERE p.status='published' ORDER BY m.phase,pp.sort_order,ps.sort_order,p.sort_order,p.id`,[req.user?.id||0]);
    items.unshift(...configuredLessons.map(item=>{
      const locked=!item.is_preview&&!canReadPack(req.user,item.pack_id);
      return {...item,id:`lesson-${item.id}`,type:'lesson',duration_seconds:0,locked,
        progress:locked?null:item.completed_at?'completed':item.progress_version?'started':null,
        learning_url:`/learn/${encodeURIComponent(item.pack_slug)}/lessons/${item.id}`};
    }));
    res.set("Cache-Control", "private, no-store");
    res.json({
      phases: OPC_PHASES.map((phase) => ({
        ...phase,
        items: items.filter((item) => item.phase === phase.id),
      })),
    });
  });
  router.get("/opc/content/:id", optionalAuth, (req, res) => {
    const item = publishedContent(Number(req.params.id));
    if (
      !item ||
      !row("SELECT step_id FROM opc_stage_steps WHERE step_id=?", [
        item.step_id,
      ])
    )
      return res.status(404).json({ error: "内容不存在或暂未发布" });
    if (!item.is_preview && !canReadPack(req.user, item.pack_id))
      return res
        .status(403)
        .json({ error: "当前账号尚未获得此课程的学习权限" });
    res.set("Cache-Control", "private, no-store");
    res.json({ item:{...item,resource_url:materialUrl(item.resource_url,req.user)} });
  });
  router.get("/me/opc/product", requireAuth, (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json(productSnapshot(req.user.id));
  });
  router.put("/me/opc/product", requireAuth, (req, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "请填写产品名称，并检查产品资料与成果格式" });
    if (!req.get("If-Match"))
      return res.status(428).json({ error: "请先读取最新产品资料再保存" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = productSnapshot(req.user.id);
      if (req.get("If-Match").replace(/^"(.*)"$/, "$1") !== current.version) {
        db.exec("ROLLBACK");
        return res
          .status(409)
          .json({ error: "产品已在其他窗口更新，请同步最新资料后重试" });
      }
      const json = JSON.stringify(parsed.data);
      run(
        `INSERT INTO opc_products(user_id,state_json) VALUES(?,?) ON CONFLICT(user_id)
        DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, json],
      );
      db.exec("COMMIT");
      res.set("Cache-Control", "private, no-store");
      res.json({ product: parsed.data, version: versionOf(json) });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
  router.get("/admin/opc/steps", requireAdmin, (_req, res) =>
    res.json({
      items:
        rows(`SELECT ps.*,pp.title pack_title,pp.status pack_status,lp.title path_title,m.phase,
    (SELECT COUNT(*) FROM published_content_items WHERE step_id=ps.id AND status='published') content_count
    FROM project_steps ps JOIN project_packs pp ON pp.id=ps.pack_id JOIN learning_paths lp ON lp.id=pp.path_id
    LEFT JOIN opc_stage_steps m ON m.step_id=ps.id ORDER BY pp.id,ps.sort_order,ps.id`),
    }),
  );
  router.put("/admin/opc/steps/:id", requireAdmin, (req, res) => {
    const phase = z
      .object({ phase: z.number().int().min(1).max(5).nullable() })
      .strict()
      .safeParse(req.body);
    if (!phase.success)
      return res.status(400).json({ error: "请选择正确的 AI OPC 阶段" });
    const id = Number(req.params.id);
    if (!row("SELECT id FROM project_steps WHERE id=?", [id]))
      return res.status(404).json({ error: "章节不存在" });
    if (phase.data.phase === null)
      run("DELETE FROM opc_stage_steps WHERE step_id=?", [id]);
    else
      run(
        "INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,?) ON CONFLICT(step_id) DO UPDATE SET phase=excluded.phase",
        [id, phase.data.phase],
      );
    res.json({ ok: true });
  });
  return router;
}
