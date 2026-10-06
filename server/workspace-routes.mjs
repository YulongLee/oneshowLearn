import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "./auth.mjs";
import { db, row, rows, run } from "./db.mjs";
import {courseLessonStats} from './learning-model.mjs';
import {contentFavoriteSchema,contentFavoriteKey,resolveContentFavorite} from './workspace-favorites.mjs';

const emptyState = () => ({ tasks: [], notes: [], favorites: [], checkIns: [] });
const MAX_STATE_BYTES = 1024 * 1024;
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

export function shanghaiDay(now = new Date()) {
  const parts = Object.fromEntries(dayFormat.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateSchema = z.string().refine(isCalendarDate, "日期须为有效的 YYYY-MM-DD 日期");
const idSchema = z.string().uuid("记录编号格式不正确");
const tagsSchema = z.array(z.string().trim().min(1).max(24)).max(8);
const isoSchema = z.string().datetime({offset:true});
const linkSchema = z.string().max(2000).refine(value=>{
  if(!value)return true;
  try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
},'请填写有效的 HTTP 或 HTTPS 链接');
const stateSchema = z.object({
  tasks: z.array(z.object({
    id: idSchema,
    title: z.string().trim().min(1, "请填写任务标题").max(160, "任务标题最多 160 字"),
    date: dateSchema,
    done: z.boolean(),
  }).strict()).max(200, "学习任务最多保存 200 条"),
  notes: z.array(z.object({
    id: idSchema,
    title: z.string().trim().min(1, "请填写笔记标题").max(120, "笔记标题最多 120 字"),
    body: z.string().max(20000, "单篇笔记正文最多 20000 字"),
    updatedAt: z.string().datetime({ offset: true, message: "笔记更新时间须为有效的 ISO 时间" }),
    createdAt: isoSchema.optional(),
    deletedAt: isoSchema.nullable().optional(),
    tags: tagsSchema.optional(),
    starred: z.boolean().optional(),
  }).strict()).max(100, "学习笔记最多保存 100 篇"),
  favorites: z.array(z.number().int().positive()).max(200, "收藏最多保存 200 项"),
  checkIns: z.array(dateSchema).max(3660, "打卡记录最多保存 3660 天"),
  resourceFavorites: z.array(z.object({id:z.number().int().positive(),savedAt:isoSchema}).strict()).max(200).optional(),
  contentFavorites:z.array(contentFavoriteSchema).max(200,'关联内容收藏最多保存 200 项').optional(),
  achievements: z.array(z.object({
    id:idSchema,title:z.string().trim().min(1).max(120),description:z.string().max(5000),
    type:z.enum(['product','work','document','code']),stage:z.enum(['idea','building','launched']),
    url:linkSchema,tags:tagsSchema,createdAt:isoSchema,updatedAt:isoSchema,
    deletedAt:isoSchema.nullable().optional(),
    sourceProjectId:z.number().int().positive().optional(),githubUrl:linkSchema.optional(),screenshotUrl:linkSchema.optional(),
  }).strict()).max(100).optional(),
}).strict().superRefine((state, context) => {
  for (const key of ["tasks", "notes", "favorites", "checkIns", "resourceFavorites", "achievements"]) {
    const values = (state[key]||[]).map((item) => typeof item === "object" ? item.id : item);
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [key], message: "同类记录不能重复，请刷新后重试" });
    }
  }
  if (state.checkIns.some((date) => date > shanghaiDay())) {
    context.addIssue({ code: "custom", path: ["checkIns"], message: "不能提前记录未来日期的打卡" });
  }
  const refs=(state.contentFavorites||[]).map(contentFavoriteKey);
  if(new Set(refs).size!==refs.length)context.addIssue({code:'custom',path:['contentFavorites'],message:'同一内容不能重复收藏'});
});

export function streakDays(checkIns, today = shanghaiDay()) {
  const dates = new Set(checkIns);
  let cursor = new Date(`${today}T00:00:00.000Z`).getTime();
  const dayAt = () => new Date(cursor).toISOString().slice(0, 10);
  // Yesterday's streak remains current until the learner checks in today.
  if (!dates.has(dayAt())) cursor -= 86400000;
  let count = 0;
  while (dates.has(dayAt())) { count += 1; cursor -= 86400000; }
  return count;
}

function stateVersion(serialized) {
  return createHash("sha256").update(serialized).digest("hex");
}

function readState(userId) {
  const saved = row("SELECT state_json FROM workspace_state WHERE user_id=?", [userId]);
  const serialized = saved ? saved.state_json : JSON.stringify(emptyState());
  return { state: JSON.parse(serialized), version: stateVersion(serialized) };
}

function publishedPacks(userId = 0) {
  return rows(`SELECT pp.id, pp.slug, pp.title, pp.subtitle, pp.description, pp.deliverable, pp.cover_url, pp.estimated_minutes,
      pp.created_at, pp.is_featured, lp.slug path_slug, lp.title path_title, COUNT(ci.id) contentCount,
      COUNT(DISTINCT ps.id) chapterCount, GROUP_CONCAT(DISTINCT ci.type) contentTypes,
      SUM(CASE WHEN pr.status IN ('started','completed') THEN 1 ELSE 0 END) startedCount,
      SUM(CASE WHEN pr.status='completed' THEN 1 ELSE 0 END) completedCount,
      MAX(julianday(pr.updated_at)) last_progress_at
    FROM project_packs pp
    JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published'
    LEFT JOIN project_steps ps ON ps.pack_id=pp.id AND ps.status='published'
    LEFT JOIN published_content_items ci ON ci.step_id=ps.id AND ci.status='published'
    LEFT JOIN progress pr ON pr.content_item_id=ci.id AND pr.user_id=?
    WHERE pp.status='published'
    GROUP BY pp.id
    ORDER BY pp.is_featured DESC, lp.sort_order, pp.sort_order, pp.id`, [userId]).map(pack=>{const lessons=courseLessonStats(pack.id,userId);return lessons.total?{...pack,contentCount:lessons.total,startedCount:lessons.started,completedCount:lessons.completed||0,last_progress_at:lessons.last||pack.last_progress_at,learningFormat:'lessons'}:pack;}).map((pack) => ({
      ...pack,
      progressPercent: pack.contentCount ? Math.round(pack.completedCount / pack.contentCount * 100) : 0,
    }));
}

function metadata({ last_progress_at: _lastProgress, ...pack }) { return pack; }

function workspaceStats(library, state) {
  return {
    completedItems: library.reduce((total, pack) => total + pack.completedCount, 0),
    completedPacks: library.filter((pack) => pack.contentCount > 0 && pack.completedCount === pack.contentCount).length,
    studyMinutes: null,
    streakDays: streakDays(state.checkIns),
  };
}

function userLibrary(user, packs = publishedPacks(user.id)) {
  if (["admin", "editor"].includes(user.role)) return packs;
  const permitted = new Set(rows(`SELECT pack_id FROM entitlements WHERE user_id=? AND status='active'
    AND julianday(starts_at)<=julianday('now')
    AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`, [user.id]).map((item) => item.pack_id));
  return packs.filter((pack) => permitted.has(pack.id));
}

export function workspaceRouter() {
  const router = Router();
  router.get('/me/favorites/contents',requireAuth,(req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.json({items:(readState(req.user.id).state.contentFavorites||[]).map(ref=>({reference:ref,content:resolveContentFavorite(req.user,ref)}))});
  });
  router.get("/catalog/workspace", (_req, res) => res.json({ items: publishedPacks().map(metadata) }));

  router.get("/me/workspace", requireAuth, (req, res) => {
    const packs = publishedPacks(req.user.id);
    const library = userLibrary(req.user, packs);
    const recent = library.filter((pack) => pack.last_progress_at).sort((a, b) =>
      b.last_progress_at - a.last_progress_at)[0];
    const snapshot = readState(req.user.id);
    // References are private records, not a projection of the current catalogue.
    // Missing publication metadata must not erase a learner's saved reference.
    const state = snapshot.state;
    res.set("Cache-Control", "private, no-store");
    res.json({
      library: library.map(metadata),
      recommendations: packs.map(metadata),
      stats: workspaceStats(library, state),
      state,
      version: snapshot.version,
      recent: recent ? metadata(recent) : null,
    });
  });

  router.put("/me/workspace/state", requireAuth, (req, res) => {
    const parsed = stateSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const chineseMessage = issue && /[\u4e00-\u9fff]/.test(issue.message) ? issue.message : "工作空间数据格式不正确，请检查填写内容";
      return res.status(400).json({ error: chineseMessage });
    }
    const packs = publishedPacks(req.user.id);
    const state = {...parsed.data};
    for(const item of state.achievements||[]){
      if(item.sourceProjectId&&!row('SELECT 1 FROM project_runs WHERE user_id=? AND project_id=?',[req.user.id,item.sourceProjectId]))return res.status(400).json({error:'成果只能关联自己已开始的项目'});
    }
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) {
      return res.status(400).json({ error: "工作空间内容超过 1 MB，请精简笔记后再保存" });
    }
    // Compare and write while holding a DB write lock: another tab or server
    // process must not replace a newer note snapshot with its older copy.
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = readState(req.user.id);
      const suppliedVersion = req.get("If-Match");
      if(parsed.data.contentFavorites!==undefined&&suppliedVersion===undefined){db.exec('ROLLBACK');return res.status(428).json({error:'请同步最新工作空间后再修改关联收藏'});}
      const expectedVersion = suppliedVersion?.replace(/^"(.*)"$/, "$1");
      if (suppliedVersion !== undefined && expectedVersion !== current.version) {
        db.exec("ROLLBACK");
        res.set("Cache-Control", "private, no-store");
        return res.status(409).json({ error: "工作空间已在其他页面更新，请刷新最新内容后重试，当前修改尚未保存", version: current.version });
      }
      const publishedIds=new Set(packs.map(pack=>pack.id)),previousCourses=new Set(current.state.favorites);
      // Preserve unavailable references for older clients which used to receive
      // a filtered list. Only a versioned, explicit removal may discard them.
      let removed=[];
      try {removed=JSON.parse(req.get('X-Removed-Course-Favorites')||'[]');}catch{db.exec('ROLLBACK');return res.status(400).json({error:'取消收藏标识无效'});}
      if(!Array.isArray(removed)||removed.some(id=>!Number.isSafeInteger(id)||id<=0)||removed.length>200){db.exec('ROLLBACK');return res.status(400).json({error:'取消收藏标识无效'});}
      if(removed.length&&suppliedVersion===undefined){db.exec('ROLLBACK');return res.status(428).json({error:'请同步最新收藏后再取消'});}
      if(removed.some(id=>!previousCourses.has(id)||state.favorites.includes(id))){db.exec('ROLLBACK');return res.status(400).json({error:'请核对要取消的收藏'});}
      state.favorites=state.favorites.filter(id=>publishedIds.has(id)||previousCourses.has(id));
      for(const id of previousCourses)if(!publishedIds.has(id)&&!removed.includes(id)&&!state.favorites.includes(id))state.favorites.push(id);
      if(state.favorites.length>200){db.exec('ROLLBACK');return res.status(400).json({error:'收藏最多保存 200 项，请先明确取消部分收藏'});}
      // Older clients must not erase new references while editing unrelated notes.
      if(state.contentFavorites===undefined&&current.state.contentFavorites!==undefined)state.contentFavorites=current.state.contentFavorites;
      const previous=new Set((current.state.contentFavorites||[]).map(contentFavoriteKey));
      for(const ref of state.contentFavorites||[]){
        const content=resolveContentFavorite(req.user,ref);
        if(!previous.has(contentFavoriteKey(ref))&&(!content||ref.kind==='material'&&content.locked)){
          db.exec('ROLLBACK');return res.status(400).json({error:'这项内容暂不可收藏，请核对访问权限或最新发布状态'});
        }
      }
      const finalSerialized=JSON.stringify(state);
      if(Buffer.byteLength(finalSerialized,'utf8')>MAX_STATE_BYTES){db.exec('ROLLBACK');return res.status(400).json({error:'工作空间内容超过 1 MB，请精简后保存'});}
      run(`INSERT INTO workspace_state (user_id,state_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP`, [req.user.id, finalSerialized]);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.set("Cache-Control", "private, no-store");
    res.json({ ok: true, state, version: stateVersion(JSON.stringify(state)), stats: workspaceStats(userLibrary(req.user, packs), state) });
  });
  return router;
}
