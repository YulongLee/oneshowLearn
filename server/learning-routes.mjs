import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, row, rows, run } from "./db.mjs";
import { optionalAuth, requireAuth, requireAdmin } from "./auth.mjs";
import { materialUrl } from "./materials.mjs";
import { validNoteBody } from "./learning-note-body.mjs";
import { courseAIService } from "./course-ai-service.mjs";
import {rateLimit} from './account-security.mjs';
import {recordCompletion,issueCourseCertificate} from './course-certificates.mjs';
import {bundlePackId} from './bundle-access.mjs';
import {tutorConversationRouter} from './tutor-conversations.mjs';
import {
  lessonSchema,
  placementSchema,
  status,
  checklist,
  placement,
  canReadPlacement,
  lessonMetadata,
  lessonAssets,
  progressFor,
  projectAccess,
  courseAccess,
  stageAccessIssue,
} from "./learning-model.mjs";

class LearningError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (s, m) => {
  throw new LearningError(s, m);
};
const parse = (schema, body) => {
  const p = schema.safeParse(body);
  if (!p.success) fail(400, p.error.issues.map((i) => i.message).join("；"));
  return p.data;
};
const transaction = (fn) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
};
const match = (req, item) => {
  if (String(req.headers["if-match"]) !== String(item?.version ?? 0))
    fail(409, "记录已更新；请刷新后核对，当前输入未覆盖服务器数据。");
};
const audit = (req, type, id, title, state) =>
  run(
    "INSERT INTO cms_audit(actor_id,entity,entity_id,title,status,action) VALUES(?,?,?,?,?,?)",
    [req.user.id, type, id, title, state, "save"],
  );
const readPlacement = (req) => {
  const p = placement(Number(req.params.id));
  if (!p) fail(404, "课时不存在或尚未发布");
  if (!canReadPlacement(req.user, p)) fail(403, "当前账号没有此课时的访问权限");
  return p;
};
const assetDescriptor = (id, user) => {
  const a =
    id &&
    row(
      "SELECT id,original_name,mime_type,size_bytes,url FROM assets WHERE id=?",
      [id],
    );
  return a ? { ...a, url: materialUrl(a.url, user) } : null;
};
function stageAccess(user, p) {
  const issue = stageAccessIssue(user, p);
  if (issue) fail(issue.status, issue.message);
}
function detail(p, user) {
  const materials = rows(
    `SELECT m.*,l.title,l.body,l.type,l.resource_url,l.duration_seconds FROM lesson_materials m JOIN content_library l ON l.id=m.library_id WHERE m.placement_id=? AND l.status='published' ORDER BY m.sort_order`,
    [p.id],
  ).map((m) => {
    const revision =
      m.role === "prompt"
        ? row(
            `SELECT r.id,r.version,r.title,r.body FROM lesson_prompt_versions v JOIN prompt_revisions r ON r.id=v.revision_id WHERE v.placement_id=? AND v.library_id=?`,
            [p.id, m.library_id],
          )
        : null;
    return {
      ...m,
      ...(revision
        ? {
            title: revision.title,
            body: revision.body,
            promptVersion: revision.version,
          }
        : {}),
      resource_url: materialUrl(m.resource_url, user),
      asset: /^\/api\/materials\/\d+$/.test(m.resource_url || "")
        ? assetDescriptor(Number(m.resource_url.split("/").pop()), user)
        : null,
    };
  });
  return {
    ...lessonMetadata(p, user),
    config: {
      ...p.config,
      video: assetDescriptor(p.config.videoAssetId, user),
      ppt: assetDescriptor(p.config.pptAssetId, user),
      subtitle: assetDescriptor(p.config.subtitleAssetId, user),
      result: assetDescriptor(p.config.resultAssetId, user),
      slides: p.config.slides.map((s) => ({
        ...s,
        asset: assetDescriptor(s.assetId, user),
      })),
    },
    materials,
    relatedLessons: (p.config.relatedPlacementIds || [])
      .filter((id) => id !== p.id)
      .map(placement)
      .filter(Boolean)
      .map((p) => lessonMetadata(p, user)),
  };
}
function projectSummary(project, user) {
  const stages = rows(
    "SELECT * FROM practice_project_stages WHERE project_id=? AND status='published' ORDER BY sort_order,id",
    [project.id],
  );
  const lessons = stages.flatMap((s) =>
    rows(
      "SELECT id FROM lesson_placements WHERE stage_id=? ORDER BY sort_order,id",
      [s.id],
    )
      .map((r) => placement(r.id))
      .filter(Boolean),
  );
  const own = user
    ? row("SELECT * FROM project_runs WHERE project_id=? AND user_id=?", [
        project.id,
        user.id,
      ])
    : null;
  const completed = lessons.filter(
    (p) => progressFor(user?.id, p.id).completed_at,
  ).length;
  const accepted = own
    ? stages.filter((s) =>
        row(
          "SELECT 1 FROM project_stage_acceptances WHERE run_id=? AND stage_id=? AND stage_version=?",
          [own.id, s.id, s.version],
        ),
      ).length
    : 0;
  const config = row(
    "SELECT * FROM practice_project_settings WHERE project_id=?",
    [project.id],
  );
  const countRole = (role) =>
    new Set(
      lessons.flatMap((p) =>
        rows(
          "SELECT m.library_id FROM lesson_materials m JOIN content_library l ON l.id=m.library_id WHERE m.placement_id=? AND m.role=? AND l.status='published'",
          [p.id, role],
        ).map((x) => x.library_id),
      ),
    ).size;
  return {
    ...project,
    relatedCourses: rows(
      `SELECT pp.id,pp.slug,pp.title FROM practice_project_courses pc JOIN project_packs pp ON pp.id=pc.pack_id AND pp.status='published' JOIN learning_paths lp ON lp.id=pp.path_id AND lp.status='published' WHERE pc.project_id=? ORDER BY pp.sort_order,pp.id`,
      [project.id],
    ),
    product:
      row(
        "SELECT id,price_cents,currency FROM products WHERE project_id=? AND status='active'",
        [project.id],
      ) || null,
    tags: JSON.parse(project.tags),
    settings: config
      ? { ...config, tech_stack: JSON.parse(config.tech_stack) }
      : null,
    entitled: projectAccess(user, project.id),
    bundleIncluded: Boolean(bundlePackId()),
    lessonCount: lessons.length,
    pptCount: new Set(lessons.map((p) => p.config.pptAssetId).filter(Boolean))
      .size,
    promptCount: countRole("prompt"),
    learnerCount: row(
      "SELECT COUNT(*) n FROM project_runs WHERE project_id=?",
      [project.id],
    ).n,
    stages: stages.map((s) => ({
      ...s,
      checklist: JSON.parse(s.checklist),
      lessons: lessons
        .filter((p) => p.stage_id === s.id)
        .map((p) => lessonMetadata(p, user)),
      accepted: Boolean(
        own &&
        row(
          "SELECT 1 FROM project_stage_acceptances WHERE run_id=? AND stage_id=? AND stage_version=?",
          [own.id, s.id, s.version],
        ),
      ),
    })),
    run: own || null,
    progress: own
      ? {
          completed,
          total: lessons.length,
          accepted,
          stageCount: stages.length,
          percent: lessons.length
            ? Math.round(
                ((completed + accepted) / (lessons.length + stages.length)) *
                  100,
              )
            : 0,
        }
      : null,
  };
}

export function learningRouter() {
  const router = Router();
  router.use(tutorConversationRouter());
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get("/learning/courses/:slug", optionalAuth, (req, res) => {
    const course = row(
      `SELECT p.id,p.title,p.subtitle,p.slug FROM project_packs p JOIN learning_paths l ON l.id=p.path_id WHERE p.slug=? AND p.status='published' AND l.status='published'`,
      [req.params.slug],
    );
    if (!course) fail(404, "课程不存在或尚未发布");
    const lessons = rows(
      "SELECT l.id FROM lesson_placements l JOIN project_steps s ON s.id=l.chapter_id WHERE s.pack_id=? ORDER BY s.sort_order,s.id,l.sort_order,l.id",
      [course.id],
    )
      .map((x) => placement(x.id))
      .filter(Boolean);
    res.json({
      course,
      legacyCount: row(
        "SELECT COUNT(*) n FROM published_content_items i JOIN project_steps s ON s.id=i.step_id WHERE s.pack_id=? AND s.status='published' AND i.status='published'",
        [course.id],
      ).n,
      lessons: lessons.map((p) => lessonMetadata(p, req.user)),
    });
  });
  // Entry metadata only. No note bodies, lesson config, transcripts or signed assets.
  // Course ownership and recent progress stay account scoped; phase membership is explicit.
  router.get("/learning/entry", optionalAuth, (req, res) => {
    const courses = rows(`SELECT p.id,p.title,p.subtitle,p.slug,p.cover_url FROM project_packs p
      JOIN learning_paths lp ON lp.id=p.path_id AND lp.status='published'
      WHERE p.status='published' ORDER BY p.sort_order,p.id`).map(c => ({
      ...c, entitled: courseAccess(req.user,c.id),
      legacyCount: row(`SELECT COUNT(*) n FROM published_content_items i JOIN project_steps s ON s.id=i.step_id
        WHERE s.pack_id=? AND s.status='published' AND i.status='published'`,[c.id]).n,
    }));
    const chapters = rows(`SELECT s.id,s.pack_id,s.title,m.phase FROM project_steps s
      JOIN project_packs p ON p.id=s.pack_id AND p.status='published'
      JOIN learning_paths lp ON lp.id=p.path_id AND lp.status='published'
      LEFT JOIN opc_stage_steps m ON m.step_id=s.id
      WHERE s.status='published' ORDER BY p.sort_order,p.id,s.sort_order,s.id`);
    const lessons = rows(`SELECT l.id,m.phase FROM lesson_placements l
      JOIN project_steps s ON s.id=l.chapter_id
      LEFT JOIN opc_stage_steps m ON m.step_id=s.id ORDER BY s.sort_order,s.id,l.sort_order,l.id`)
      .map(item => {const p=placement(item.id);return p?{...lessonMetadata(p,req.user),phase:item.phase}:null;}).filter(Boolean);
    const selected=row('SELECT course_id FROM learning_entry_settings WHERE id=1')?.course_id;
    const defaultCourseId=courses.some(c=>c.id===selected)?selected:null;
    res.json({courses,chapters,lessons,defaultCourseId});
  });
  router.get("/learning/placements/:id", optionalAuth, (req, res) => {
    const p = readPlacement(req);
    stageAccess(req.user, p);
    res.json(detail(p, req.user));
  });
  router.get("/learning/projects", optionalAuth, (req, res) => {
    const q = String(req.query.q || "")
        .trim()
        .toLowerCase()
        .slice(0, 200),
      category = Number(req.query.category) || 0,
      sort = String(req.query.sort || "recommended");
    const where="p.status='published' AND (?=0 OR s.category_id=?) AND instr(lower(p.title||' '||p.description||' '||COALESCE((SELECT group_concat(value,' ') FROM json_each(p.tags)),'')||' '||COALESCE((SELECT group_concat(value,' ') FROM json_each(s.tech_stack)),'')),?)>0";
    const args=[category,category,q];
    const order=sort==="difficulty"?"COALESCE(NULLIF(s.difficulty,0),99),p.id":sort==="popular"?"(SELECT COUNT(*) FROM project_runs r WHERE r.project_id=p.id) DESC,p.id":sort==="newest"?"p.id DESC":"COALESCE(s.is_recommended,0) DESC,p.sort_order,p.id";
    const offset=Math.min(1000000,Math.max(0,Math.trunc(Number(req.query.offset)||0))),limit=Math.min(48,Math.max(1,Math.trunc(Number(req.query.limit)||12)));
    const selected=rows(`SELECT p.* FROM practice_projects p LEFT JOIN practice_project_settings s ON s.project_id=p.id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,[...args,limit,offset]);
    res.json({
      items:selected.map(p=>projectSummary(p,req.user)),
      total:row(`SELECT COUNT(*) n FROM practice_projects p LEFT JOIN practice_project_settings s ON s.project_id=p.id WHERE ${where}`,args).n,
      categories: rows(
        "SELECT * FROM project_categories WHERE is_active=1 ORDER BY sort_order,id",
      ),
    });
  });
  router.get("/learning/projects/:slug", optionalAuth, (req, res) => {
    const p = row(
      "SELECT * FROM practice_projects WHERE slug=? AND status='published'",
      [req.params.slug],
    );
    if (!p) fail(404, "项目不存在或尚未发布");
    res.json(projectSummary(p, req.user));
  });
  router.post("/learning/projects/:slug/start", requireAuth, (req, res) => {
    const p = row(
      "SELECT * FROM practice_projects WHERE slug=? AND status='published'",
      [req.params.slug],
    );
    if (!p) fail(404, "项目不存在");
    if (!projectAccess(req.user, p.id))
      fail(403, "当前账号没有项目权益；课程关联不代表项目授权");
    const summary = projectSummary(p, req.user);
    if (!summary.lessonCount) fail(409, "项目教程尚未发布");
    run(
      "INSERT INTO project_runs(user_id,project_id) VALUES(?,?) ON CONFLICT(user_id,project_id) DO NOTHING",
      [req.user.id, p.id],
    );
    res.json(projectSummary(p, req.user));
  });
  router.get("/learning/me/projects", requireAuth, (req, res) =>
    res.json({
      items: rows(
        "SELECT p.* FROM practice_projects p JOIN project_runs r ON r.project_id=p.id WHERE r.user_id=? AND p.status='published' ORDER BY r.updated_at DESC",
        [req.user.id],
      ).map((p) => projectSummary(p, req.user)),
    }),
  );
  router.put("/learning/placements/:id/progress", requireAuth, (req, res) => {
    const p = readPlacement(req);
    stageAccess(req.user, p);
    const d = parse(
      z
        .object({
          video_time: z.number().min(0).max(86400),
          video_duration: z.number().min(0).max(86400).default(0),
          current_prompt_id: z
            .number()
            .int()
            .positive()
            .nullable()
            .default(null),
          slide_id: z.string().nullable(),
          follow_video: z.boolean(),
          tasks: z.array(z.string()).max(100),
          complete: z.boolean().default(false),
        })
        .strict(),
      req.body,
    );
    if (d.complete && p.config.isDemoMedia) fail(409,'当前为演示素材，替换正式教学内容后才能标记课时完成');
    if (d.slide_id && !p.config.slides.some((s) => s.id === d.slide_id))
      fail(400, "课件页不存在");
    if (
      d.current_prompt_id &&
      !row(
        "SELECT 1 FROM lesson_materials m JOIN content_library l ON l.id=m.library_id AND l.status='published' WHERE m.placement_id=? AND m.library_id=? AND m.role='prompt'",
        [p.id, d.current_prompt_id],
      )
    )
      fail(400, "Prompt 不属于本课时");
    if (
      new Set(d.tasks).size !== d.tasks.length ||
      d.tasks.some((id) => !p.config.tasks.some((t) => t.id === id))
    )
      fail(400, "任务编号无效");
    if (
      d.complete &&
      p.kind === "project" &&
      p.config.tasks.some((t) => t.required && !d.tasks.includes(t.id))
    )
      fail(409, "请先完成本节必需实践任务");
    transaction(() => {
      const old = progressFor(req.user.id, p.id);
      match(req, old);
      if (
        old.completed_at &&
        p.config.tasks.some(
          (t) =>
            t.required && old.tasks.includes(t.id) && !d.tasks.includes(t.id),
        )
      )
        fail(409, "已完成课时的必需任务不能撤销；如需修改请联系管理员");
      const completed =
        old.completed_at || (d.complete ? new Date().toISOString() : null);
      run(
        `INSERT INTO learning_progress(user_id,placement_id,video_time,slide_id,follow_video,tasks,completed_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(user_id,placement_id) DO UPDATE SET video_time=excluded.video_time,slide_id=excluded.slide_id,follow_video=excluded.follow_video,tasks=excluded.tasks,completed_at=excluded.completed_at,version=learning_progress.version+1,updated_at=CURRENT_TIMESTAMP`,
        [
          req.user.id,
          p.id,
          d.video_time,
          d.slide_id,
          Number(d.follow_video),
          JSON.stringify(d.tasks),
          completed,
        ],
      );
      run(
        "UPDATE learning_progress SET video_duration=?,current_prompt_id=? WHERE user_id=? AND placement_id=?",
        [d.video_duration, d.current_prompt_id, req.user.id, p.id],
      );
      if(d.complete)recordCompletion(req.user,p);
      if (p.kind === "project")
        run(
          "UPDATE project_runs SET current_placement_id=?,current_prompt_id=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE user_id=? AND project_id=?",
          [p.id, d.current_prompt_id, req.user.id, p.owner_id],
        );
    });
    const certificate=p.kind==='course'?issueCourseCertificate(req.user,p.owner_id):null;
    res.json({ progress: progressFor(req.user.id, p.id),certificate:certificate?{id:certificate.id,revoked:Boolean(certificate.revoked_at)}:null });
  });
  router.post(
    "/learning/projects/:slug/stages/:id/accept",
    requireAuth,
    (req, res) => {
      const project = row(
        "SELECT * FROM practice_projects WHERE slug=? AND status='published'",
        [req.params.slug],
      );
      const stage = row(
        "SELECT * FROM practice_project_stages WHERE id=? AND project_id=? AND status='published'",
        [Number(req.params.id), project?.id || 0],
      );
      if (!stage) fail(404, "阶段不存在");
      if (!projectAccess(req.user, project.id)) fail(403, "没有项目权限");
      match(req, stage);
      const own = row(
        "SELECT * FROM project_runs WHERE user_id=? AND project_id=?",
        [req.user.id, project.id],
      );
      if (!own) fail(409, "请先开始项目");
      const checked = parse(
          z.object({ checked: z.array(z.string()).max(100) }).strict(),
          req.body,
        ).checked,
        tasks = JSON.parse(stage.checklist);
      if (
        checked.some((id) => !tasks.some((t) => t.id === id)) ||
        tasks.some((t) => t.required && !checked.includes(t.id))
      )
        fail(409, "请完成所有必需阶段验收项");
      const lessons = rows(
        "SELECT id FROM lesson_placements WHERE stage_id=?",
        [stage.id],
      )
        .map((x) => placement(x.id))
        .filter(Boolean);
      if (
        !lessons.length ||
        lessons.some((p) => !progressFor(req.user.id, p.id).completed_at)
      )
        fail(409, "请先完成本阶段课时和实践");
      stageAccess(req.user, lessons[0]);
      run(
        "INSERT INTO project_stage_acceptances(run_id,stage_id,stage_version,checked_items) VALUES(?,?,?,?) ON CONFLICT(run_id,stage_id) DO UPDATE SET stage_version=excluded.stage_version,checked_items=excluded.checked_items,accepted_at=CURRENT_TIMESTAMP",
        [own.id, stage.id, stage.version, JSON.stringify(checked)],
      );
      res.json({ ok: true, project: projectSummary(project, req.user) });
    },
  );
  router.get("/learning/notes", requireAuth, (req, res) => {
    const id = Number(req.query.placement) || 0;
    const offset = Math.max(
      0,
      Math.min(1000, Math.floor(Number(req.query.offset) || 0)),
    );
    const total = row(
      "SELECT COUNT(*) n FROM learning_notes WHERE user_id=? AND (?=0 OR placement_id=?)",
      [req.user.id, id, id],
    ).n;
    res.json({
      total,
      nextOffset: offset + 100 < total ? offset + 100 : null,
      items: rows(
        `SELECT n.*,l.title lesson_title FROM learning_notes n JOIN lesson_placements p ON p.id=n.placement_id JOIN learning_lessons l ON l.id=p.lesson_id WHERE n.user_id=? AND (?=0 OR n.placement_id=?) ORDER BY n.updated_at DESC,n.id DESC LIMIT 100 OFFSET ?`,
        [req.user.id, id, id, offset],
      ).map((n) => {
        const p = placement(n.placement_id);
        return {
          ...n,
          source_url: p
            ? p.kind === "course"
              ? `/learn/${encodeURIComponent(p.owner_slug)}/lessons/${p.id}`
              : `/projects/${encodeURIComponent(p.owner_slug)}/workspace/${p.id}`
            : null,
        };
      }),
    });
  });
  const noteSchema = z
    .object({
      placement_id: z.number().int().positive(),
      title: z.string().trim().min(1).max(120),
      body: z
        .string()
        .max(250000)
        .refine(validNoteBody, "笔记包含不支持的内容或不安全的图片链接"),
      video_time: z.number().min(0).max(86400).nullable(),
      slide_id: z.string().max(80).nullable(),
      deleted: z.boolean().default(false),
    })
    .strict();
  router.post("/learning/notes", requireAuth, (req, res) => {
    if (
      row("SELECT COUNT(*) n FROM learning_notes WHERE user_id=?", [
        req.user.id,
      ]).n >= 1000
    )
      fail(409, "课时笔记已达到 1000 条上限，请整理现有笔记");
    const d = parse(noteSchema, req.body),
      p = placement(d.placement_id);
    if (!canReadPlacement(req.user, p)) fail(403, "没有课时访问权限");
    stageAccess(req.user, p);
    if (d.slide_id && !p.config.slides.some((s) => s.id === d.slide_id))
      fail(400, "课件页不存在");
    const id = randomUUID();
    run(
      "INSERT INTO learning_notes(id,user_id,placement_id,title,body,video_time,slide_id) VALUES(?,?,?,?,?,?,?)",
      [id, req.user.id, p.id, d.title, d.body, d.video_time, d.slide_id],
    );
    res
      .status(201)
      .json({ item: row("SELECT * FROM learning_notes WHERE id=?", [id]) });
  });
  router.put("/learning/notes/:id", requireAuth, (req, res) => {
    const old = row("SELECT * FROM learning_notes WHERE id=? AND user_id=?", [
      req.params.id,
      req.user.id,
    ]);
    if (!old) fail(404, "笔记不存在");
    match(req, old);
    const d = parse(noteSchema, req.body);
    if (d.placement_id !== old.placement_id) fail(400, "不能更换笔记所属课时");
    if (
      d.slide_id !== old.slide_id &&
      d.slide_id &&
      !placement(old.placement_id)?.config.slides.some(
        (s) => s.id === d.slide_id,
      )
    )
      fail(400, "课件页不存在");
    run(
      "UPDATE learning_notes SET title=?,body=?,video_time=?,slide_id=?,deleted_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
      [
        d.title,
        d.body,
        d.video_time,
        d.slide_id,
        d.deleted ? new Date().toISOString() : null,
        old.id,
        req.user.id,
      ],
    );
    res.json({
      item: row("SELECT * FROM learning_notes WHERE id=?", [old.id]),
    });
  });
  router.get("/learning/ai/capabilities", (_req, res) =>
    res.json(courseAIService.capabilities()),
  );
  router.get('/learning/ai/allowance',requireAuth,(req,res)=>res.set('Cache-Control','private, no-store').json(courseAIService.allowance(req.user)));
  router.post('/learning/ai/tutor', requireAuth, async(req,res)=>{
    const d=parse(z.object({question:z.string().trim().min(1).max(4000),mode:z.enum(['knowledge','general']).default('knowledge'),courseId:z.number().int().positive().nullable().default(null),includeProduct:z.boolean().default(false),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(18000)}).strict()).max(8).default([])}).strict(),req.body);
    rateLimit('tutor-retrieval-minute',String(req.user.id),20,60);
    if(d.history.reduce((sum,m)=>sum+m.content.length,0)>36000)fail(400,'对话过长，请开启新对话');
    const course=d.courseId?row("SELECT p.id,p.title,p.description FROM project_packs p JOIN learning_paths l ON l.id=p.path_id WHERE p.id=? AND p.status='published' AND l.status='published'",[d.courseId]):null;
    if(d.courseId&&(!course||!courseAccess(req.user,d.courseId)))fail(403,'没有所选课程的学习权限');
    try {res.json(await courseAIService.tutor({user:req.user,...d,course}));}catch(e){fail(e.status||502,e.status?e.message:'AI 服务暂时不可用，请稍后重试');}
  });
  router.post("/learning/placements/:id/ai", requireAuth, async (req, res) => {
    const p = readPlacement(req);
    stageAccess(req.user, p);
    const d = parse(
      z
        .object({
          action: z.enum([
            "ask",
            "summary",
            "keypoints",
            "notes",
            "mindmap",
            "flashcards",
          ]),
          question: z.string().max(5000).default(""),
          slideId: z.string().min(1).max(80).nullable().default(null),
        })
        .strict(),
      req.body,
    );
    if (d.action === "ask" && !d.question.trim()) fail(400, "请输入问题");
    if(d.slideId&&!p.config.slides.some(s=>s.id===d.slideId))fail(400,'所选课件页不属于当前课时');
    try {
      res.json(
        await courseAIService.generate({ user: req.user, lesson: p, ...d }),
      );
    } catch (e) {
      fail(
        e.status || 502,
        e.status ? e.message : "AI 服务暂时不可用，请稍后重试",
      );
    }
  });

  router.use("/admin/learning", requireAdmin);
  router.put('/admin/learning/default-course',(req,res)=>{
    const d=parse(z.object({courseId:z.number().int().positive().nullable()}).strict(),req.body);
    const saved=transaction(()=>{
      const current=row('SELECT * FROM learning_entry_settings WHERE id=1');match(req,current);
      if(d.courseId&&!row("SELECT p.id FROM project_packs p JOIN learning_paths l ON l.id=p.path_id WHERE p.id=? AND p.status='published' AND l.status='published'",[d.courseId]))fail(400,'默认学习课程必须已经发布');
      run('INSERT INTO learning_entry_settings(id,course_id,version) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,version=learning_entry_settings.version+1',[d.courseId]);
      audit(req,'learning-entry',1,'默认学习课程','saved');
      return row('SELECT * FROM learning_entry_settings WHERE id=1');
    });res.json({courseId:saved.course_id,version:saved.version});
  });
  router.get("/admin/learning/snapshot", (_req, res) =>
    res.json({
      entrySettings: (()=>{const s=row('SELECT * FROM learning_entry_settings WHERE id=1');return {courseId:s?.course_id??null,version:s?.version??0};})(),
      courses: rows('SELECT id,title,slug,status FROM project_packs ORDER BY sort_order,id'),
      lessons: rows("SELECT * FROM learning_lessons ORDER BY id DESC").map(
        (l) => ({ ...l, config: JSON.parse(l.config) }),
      ),
      placements: rows(
        "SELECT * FROM lesson_placements ORDER BY sort_order,id",
      ).map((p) => ({
        ...p,
        materials: rows(
          "SELECT library_id,role FROM lesson_materials WHERE placement_id=? ORDER BY sort_order",
          [p.id],
        ),
      })),
      chapters: rows(
        "SELECT s.id,s.title,s.pack_id,p.title course FROM project_steps s JOIN project_packs p ON p.id=s.pack_id ORDER BY p.id,s.sort_order",
      ),
      projects: rows(
        "SELECT id,title,slug,status FROM practice_projects ORDER BY id",
      ),
      stages: rows(
        "SELECT * FROM practice_project_stages ORDER BY sort_order,id",
      ).map((s) => ({ ...s, checklist: JSON.parse(s.checklist) })),
      categories: rows(
        "SELECT * FROM project_categories ORDER BY sort_order,id",
      ),
      settings: rows("SELECT * FROM practice_project_settings").map((s) => ({
        ...s,
        price_cents:
          row("SELECT price_cents FROM products WHERE project_id=?", [
            s.project_id,
          ])?.price_cents || 0,
        tech_stack: JSON.parse(s.tech_stack),
      })),
      library: rows(
        "SELECT id,title,type,status FROM content_library ORDER BY id DESC",
      ),
      assets: rows(
        "SELECT id,original_name,mime_type,size_bytes FROM assets ORDER BY id DESC",
      ),
    }),
  );
  router.put("/admin/learning/lessons/:id", (req, res) => {
    const id = Number(req.params.id),
      old = id ? row("SELECT * FROM learning_lessons WHERE id=?", [id]) : null;
    if (id && !old) fail(404, "课时不存在");
    if (old) match(req, old);
    const d = parse(lessonSchema, req.body);
    if (
      d.config.relatedPlacementIds.some(
        (id) => !row("SELECT id FROM lesson_placements WHERE id=?", [id]),
      )
    )
      fail(400, "关联课时位置不存在");
    if (
      d.config.resultAssetId &&
      !/^image\/(png|jpeg|webp)$/.test(
        row("SELECT mime_type FROM assets WHERE id=?", [d.config.resultAssetId])
          ?.mime_type || "",
      )
    )
      fail(400, "预期成果需要图片附件");
    for (const asset of lessonAssets(d.config))
      if (!row("SELECT id FROM assets WHERE id=?", [asset]))
        fail(400, "附件不存在");
    if (
      d.config.videoAssetId &&
      !/^video\//.test(
        row("SELECT mime_type FROM assets WHERE id=?", [d.config.videoAssetId])
          .mime_type,
      )
    )
      fail(400, "主视频需要视频文件");
    if (
      d.config.slides.some(
        (s) =>
          !/^image\/(png|jpeg|webp)$/.test(
            row("SELECT mime_type FROM assets WHERE id=?", [s.assetId])
              .mime_type,
          ),
      )
    )
      fail(400, "课件预览页需要 PNG/JPEG/WebP 图片");
    const savedId = transaction(() => {
      let saved = id;
      if (old)
        run(
          "UPDATE learning_lessons SET title=?,subtitle=?,config=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          [d.title, d.subtitle, JSON.stringify(d.config), d.status, id],
        );
      else
        saved = Number(
          run(
            "INSERT INTO learning_lessons(title,subtitle,config,status) VALUES(?,?,?,?)",
            [d.title, d.subtitle, JSON.stringify(d.config), d.status],
          ).lastInsertRowid,
        );
      audit(req, "lessons", saved, d.title, d.status);
      return saved;
    });
    res.json({ id: savedId });
  });
  router.put("/admin/learning/placements/:id", (req, res) => {
    const id = Number(req.params.id),
      old = id ? row("SELECT * FROM lesson_placements WHERE id=?", [id]) : null;
    if (id && !old) fail(404, "投放不存在");
    if (old) match(req, old);
    const d = parse(placementSchema, req.body),
      lesson = row("SELECT id,status FROM learning_lessons WHERE id=?", [
        d.lesson_id,
      ]);
    if (!lesson) fail(400, "课时不存在");
    if (d.status === "published" && lesson.status !== "published")
      fail(400, "请先发布共享课时");
    if (
      row(
        "SELECT id FROM lesson_placements WHERE lesson_id=? AND (chapter_id=? OR stage_id=?) AND id!=?",
        [d.lesson_id, d.chapter_id, d.stage_id, id],
      )
    )
      fail(409, "此课时已编排在当前目录中");
    if (
      (d.chapter_id &&
        !row("SELECT id FROM project_steps WHERE id=?", [d.chapter_id])) ||
      (d.stage_id &&
        !row("SELECT id FROM practice_project_stages WHERE id=?", [d.stage_id]))
    )
      fail(400, "父级不存在");
    if (
      old &&
      (old.chapter_id !== d.chapter_id ||
        old.stage_id !== d.stage_id ||
        old.lesson_id !== d.lesson_id)
    )
      fail(409, "已有投放不能更换所属关系，请归档并新建，以保留学习记录");
    for (const m of d.materials) {
      const source = row("SELECT * FROM content_library WHERE id=?", [
        m.library_id,
      ]);
      if (!source || (m.role === "prompt" && source.type !== "prompt"))
        fail(400, "资料不存在或 Prompt 类型不匹配");
      if (d.status === "published" && source.status !== "published")
        fail(400, "请先发布引用的原资料");
    }
    const saved = transaction(() => {
      const values = [
        d.lesson_id,
        d.chapter_id,
        d.stage_id,
        Number(d.is_preview),
        d.sort_order,
        d.status,
      ];
      let saved = id;
      if (old)
        run(
          "UPDATE lesson_placements SET lesson_id=?,chapter_id=?,stage_id=?,is_preview=?,sort_order=?,status=?,version=version+1 WHERE id=?",
          [...values, id],
        );
      else
        saved = Number(
          run(
            "INSERT INTO lesson_placements(lesson_id,chapter_id,stage_id,is_preview,sort_order,status) VALUES(?,?,?,?,?,?)",
            values,
          ).lastInsertRowid,
        );
      run("DELETE FROM lesson_materials WHERE placement_id=?", [saved]);
      run("DELETE FROM lesson_prompt_versions WHERE placement_id=?", [saved]);
      d.materials.forEach((m, index) => {
        run(
          "INSERT INTO lesson_materials(placement_id,library_id,role,sort_order) VALUES(?,?,?,?)",
          [saved, m.library_id, m.role, index],
        );
        if (m.role === "prompt") {
          const source = row("SELECT * FROM content_library WHERE id=?", [
            m.library_id,
          ]);
          let revision = row(
            "SELECT * FROM prompt_revisions WHERE library_id=? ORDER BY version DESC LIMIT 1",
            [m.library_id],
          );
          if (
            !revision ||
            revision.body !== source.body ||
            revision.title !== source.title
          ) {
            const rid = Number(
              run(
                "INSERT INTO prompt_revisions(library_id,version,title,body) VALUES(?,?,?,?)",
                [
                  m.library_id,
                  (revision?.version || 0) + 1,
                  source.title,
                  source.body,
                ],
              ).lastInsertRowid,
            );
            revision = { id: rid };
          }
          run(
            "INSERT INTO lesson_prompt_versions(placement_id,library_id,revision_id) VALUES(?,?,?)",
            [saved, m.library_id, revision.id],
          );
        }
      });
      audit(req, "lesson-placements", saved, "课时投放", d.status);
      return saved;
    });
    res.json({ id: saved });
  });
  router.put("/admin/learning/stages/:id", (req, res) => {
    const id = Number(req.params.id),
      old = id
        ? row("SELECT * FROM practice_project_stages WHERE id=?", [id])
        : null;
    if (id && !old) fail(404, "阶段不存在");
    if (old) match(req, old);
    const d = parse(
      z
        .object({
          project_id: z.number().int().positive(),
          title: z.string().trim().min(1).max(200),
          description: z.string().max(5000),
          checklist,
          sort_order: z.number().int().min(0),
          status,
        })
        .strict(),
      req.body,
    );
    if (!row("SELECT id FROM practice_projects WHERE id=?", [d.project_id]))
      fail(400, "项目不存在");
    if (old && old.project_id !== d.project_id) fail(409, "不能迁移已有阶段");
    const saved = transaction(() => {
      const values = [
        d.project_id,
        d.title,
        d.description,
        JSON.stringify(d.checklist),
        d.sort_order,
        d.status,
      ];
      let saved = id;
      if (old)
        run(
          "UPDATE practice_project_stages SET project_id=?,title=?,description=?,checklist=?,sort_order=?,status=?,version=version+1 WHERE id=?",
          [...values, id],
        );
      else
        saved = Number(
          run(
            "INSERT INTO practice_project_stages(project_id,title,description,checklist,sort_order,status) VALUES(?,?,?,?,?,?)",
            values,
          ).lastInsertRowid,
        );
      audit(req, "project-stages", saved, d.title, d.status);
      return saved;
    });
    res.json({ id: saved });
  });
  router.put("/admin/learning/categories/:id", (req, res) => {
    const id = Number(req.params.id),
      old = id
        ? row("SELECT * FROM project_categories WHERE id=?", [id])
        : null;
    if (id && !old) fail(404, "分类不存在");
    if (old) match(req, old);
    const d = parse(
      z
        .object({
          slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(80),
          name: z.string().trim().min(1).max(40),
          sort_order: z.number().int().min(0),
          is_active: z.boolean(),
        })
        .strict(),
      req.body,
    );
    if (
      row("SELECT id FROM project_categories WHERE slug=? AND id!=?", [
        d.slug,
        id,
      ])
    )
      fail(409, "分类标识已存在");
    const values = [d.slug, d.name, d.sort_order, Number(d.is_active)];
    if (old)
      run(
        "UPDATE project_categories SET slug=?,name=?,sort_order=?,is_active=?,version=version+1 WHERE id=?",
        [...values, id],
      );
    else
      run(
        "INSERT INTO project_categories(slug,name,sort_order,is_active) VALUES(?,?,?,?)",
        values,
      );
    res.json({ ok: true });
  });
  router.put("/admin/learning/settings/:id", (req, res) => {
    const id = Number(req.params.id),
      old = row("SELECT * FROM practice_project_settings WHERE project_id=?", [
        id,
      ]);
    if (!row("SELECT id FROM practice_projects WHERE id=?", [id]))
      fail(404, "项目不存在");
    match(req, old);
    const d = parse(
      z
        .object({
          category_id: z.number().int().positive().nullable(),
          tech_stack: z.array(z.string().trim().min(1).max(40)).max(12),
          difficulty: z.number().int().min(1).max(5).nullable(),
          estimated_minutes: z.number().int().min(0).max(100000),
          audience: z.string().max(5000),
          prerequisites: z.string().max(5000),
          access_type: z.enum(["free", "paid", "membership"]),
          price_cents: z.number().int().min(0).max(100000000).default(0),
          is_recommended: z.boolean(),
        })
        .strict(),
      req.body,
    );
    if (
      d.category_id &&
      !row("SELECT id FROM project_categories WHERE id=?", [d.category_id])
    )
      fail(400, "分类不存在");
    transaction(() => {
      run(
        `INSERT INTO practice_project_settings(project_id,category_id,tech_stack,difficulty,estimated_minutes,audience,prerequisites,access_type,is_recommended) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET category_id=excluded.category_id,tech_stack=excluded.tech_stack,difficulty=excluded.difficulty,estimated_minutes=excluded.estimated_minutes,audience=excluded.audience,prerequisites=excluded.prerequisites,access_type=excluded.access_type,is_recommended=excluded.is_recommended,version=practice_project_settings.version+1`,
        [
          id,
          d.category_id,
          JSON.stringify(d.tech_stack),
          d.difficulty,
          d.estimated_minutes,
          d.audience,
          d.prerequisites,
          d.access_type,
          Number(d.is_recommended),
        ],
      );
      run(
        `INSERT INTO products(project_id,sku,title,price_cents,status) VALUES(?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET title=excluded.title,price_cents=excluded.price_cents,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,
        [
          id,
          `PROJECT-${randomUUID()}`,
          row("SELECT title FROM practice_projects WHERE id=?", [id]).title,
          d.price_cents,
          d.access_type === "paid" ? "active" : "inactive",
        ],
      );
      audit(req, "project-settings", id, "项目访问与商业化配置", d.access_type);
    });
    res.json({ ok: true });
  });
  router.use((error, _req, res, next) => {
    if (error instanceof LearningError)
      return res.status(error.status).json({ error: error.message });
    next(error);
  });
  return router;
}
