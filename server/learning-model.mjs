import { z } from "zod";
import { row, rows } from "./db.mjs";

const text = (n) => z.string().trim().max(n);
const id = z.number().int().positive();
export const status = z.enum(["draft", "published", "archived"]);
export const checklist = z
  .array(
    z
      .object({
        id: text(80).min(1),
        title: text(300).min(1),
        required: z.boolean().default(true),
      })
      .strict(),
  )
  .max(100)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "清单编号不能重复",
  );
export const lessonSchema = z
  .object({
    title: text(200).min(1),
    subtitle: text(500).default(""),
    status: status.default("draft"),
    config: z
      .object({
        videoAssetId: id.nullable().default(null),
        pptAssetId: id.nullable().default(null),
        subtitleAssetId: id.nullable().default(null),
        durationSeconds: z.number().int().min(0).max(86400).default(0),
        expectedResult: text(10000).default(""),
        resultAssetId: id.nullable().default(null),
        relatedPlacementIds: z.array(id).max(20).default([]),
        slides: z
          .array(
            z.object({
              id: text(80).min(1),
              assetId: id,
              text: text(10000).default(""),
            }),
          )
          .max(500)
          .default([]),
        mappings: z
          .array(
            z.object({
              slideId: text(80).min(1),
              start: z.number().min(0),
              end: z.number().positive(),
            }),
          )
          .max(1000)
          .default([]),
        tasks: checklist.default([]),
        operations: z
          .array(
            z.object({
              id: text(80).min(1),
              title: text(200).min(1),
              body: text(10000),
            }),
          )
          .max(100)
          .default([]),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ config: c }, ctx) => {
    const slideIds = new Set(c.slides.map((s) => s.id));
    if (slideIds.size !== c.slides.length)
      ctx.addIssue({ code: "custom", message: "课件页编号不能重复" });
    const sorted = [...c.mappings].sort((a, b) => a.start - b.start);
    sorted.forEach((m, i) => {
      if (
        !slideIds.has(m.slideId) ||
        m.end <= m.start ||
        (i > 0 && sorted[i - 1].end > m.start)
      )
        ctx.addIssue({
          code: "custom",
          message: "时间映射存在无效页面、重叠或无效区间",
        });
    });
  });
export const placementSchema = z
  .object({
    lesson_id: id,
    chapter_id: id.nullable(),
    stage_id: id.nullable(),
    is_preview: z.boolean(),
    sort_order: z.number().int().min(0),
    status,
    materials: z
      .array(
        z.object({
          library_id: id,
          role: z.enum(["article", "code", "prompt", "file", "transcript"]),
        }),
      )
      .max(100),
  })
  .strict()
  .refine(
    (p) => Boolean(p.chapter_id) !== Boolean(p.stage_id),
    "请选择课程章节或项目阶段之一",
  )
  .refine(
    (p) =>
      new Set(p.materials.map((m) => m.library_id)).size === p.materials.length,
    "资料不能重复",
  );
export function manager(user) {
  return Boolean(user && ["admin", "editor"].includes(user.role));
}
export function courseLessonStats(packId, userId = 0) {
  return row(
    `SELECT COUNT(p.id) total,COUNT(pr.placement_id) started,SUM(CASE WHEN pr.completed_at IS NOT NULL THEN 1 ELSE 0 END) completed,MAX(julianday(pr.updated_at)) last
    FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id AND l.status='published'
    JOIN project_steps s ON s.id=p.chapter_id AND s.status='published'
    LEFT JOIN learning_progress pr ON pr.placement_id=p.id AND pr.user_id=?
    WHERE s.pack_id=? AND p.status='published'`,
    [userId, packId],
  );
}
export function courseAccess(user, packId) {
  return (
    manager(user) ||
    Boolean(
      user &&
      row(
        `SELECT id FROM entitlements WHERE user_id=? AND pack_id=? AND status='active'
  AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`,
        [user.id, packId],
      ),
    )
  );
}
export function projectAccess(user, projectId) {
  const project = row(
    "SELECT p.id,s.access_type FROM practice_projects p LEFT JOIN practice_project_settings s ON s.project_id=p.id WHERE p.id=? AND p.status='published'",
    [projectId],
  );
  // Course ownership is deliberately not a project entitlement.
  return Boolean(
    project &&
    (manager(user) ||
      project.access_type === "free" ||
      Boolean(
        user &&
        row(
          `SELECT id FROM project_entitlements WHERE user_id=? AND project_id=? AND status='active' AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`,
          [user.id, projectId],
        ),
      )),
  );
}
export function placement(id) {
  const p = row(
    `SELECT p.*,l.title,l.subtitle,l.config,l.version lesson_version,l.status lesson_status FROM lesson_placements p JOIN learning_lessons l ON l.id=p.lesson_id WHERE p.id=?`,
    [id],
  );
  if (!p || p.status !== "published" || p.lesson_status !== "published")
    return null;
  if (p.chapter_id) {
    const parent = row(
      `SELECT ps.title chapter_title,pp.id owner_id,pp.slug owner_slug,pp.title owner_title FROM project_steps ps JOIN project_packs pp ON pp.id=ps.pack_id JOIN learning_paths lp ON lp.id=pp.path_id WHERE ps.id=? AND ps.status='published' AND pp.status='published' AND lp.status='published'`,
      [p.chapter_id],
    );
    if (!parent) return null;
    Object.assign(p, parent, { kind: "course" });
  } else {
    const parent = row(
      `SELECT s.title chapter_title,p.id owner_id,p.slug owner_slug,p.title owner_title FROM practice_project_stages s JOIN practice_projects p ON p.id=s.project_id WHERE s.id=? AND s.status='published' AND p.status='published'`,
      [p.stage_id],
    );
    if (!parent) return null;
    Object.assign(p, parent, { kind: "project" });
  }
  p.config = JSON.parse(p.config);
  return p;
}
export function canReadPlacement(user, p) {
  return Boolean(
    p &&
    (p.is_preview ||
      (p.kind === "course"
        ? courseAccess(user, p.owner_id)
        : projectAccess(user, p.owner_id))),
  );
}
export function stageAccessIssue(user, p) {
  if (!p || p.kind !== "project" || p.is_preview || manager(user)) return null;
  const own = row(
    "SELECT id FROM project_runs WHERE user_id=? AND project_id=?",
    [user?.id || 0, p.owner_id],
  );
  if (!own) return { status: 409, message: "请先从项目详情开始项目" };
  for (const stage of rows(
    "SELECT id,version FROM practice_project_stages WHERE project_id=? AND status='published' ORDER BY sort_order,id",
    [p.owner_id],
  )) {
    if (stage.id === p.stage_id) break;
    if (
      !row(
        "SELECT 1 FROM project_stage_acceptances WHERE run_id=? AND stage_id=? AND stage_version=?",
        [own.id, stage.id, stage.version],
      )
    )
      return { status: 403, message: "请先完成前一阶段验收" };
  }
  return null;
}
export function lessonAssets(config) {
  return [
    ...new Set(
      [
        config.videoAssetId,
        config.pptAssetId,
        config.subtitleAssetId,
        config.resultAssetId,
        ...config.slides.map((s) => s.assetId),
      ].filter(Boolean),
    ),
  ];
}
export function learningAssetAllowed(assetId, user) {
  for (const candidate of rows(
    "SELECT id FROM lesson_placements WHERE status='published'",
  )) {
    const p = placement(candidate.id);
    if (!canReadPlacement(user, p) || stageAccessIssue(user, p)) continue;
    if (lessonAssets(p.config).includes(assetId)) return true;
    if (
      row(
        `SELECT 1 FROM lesson_materials m JOIN content_library l ON l.id=m.library_id WHERE m.placement_id=? AND l.status='published' AND l.resource_url=?`,
        [p.id, `/api/materials/${assetId}`],
      )
    )
      return true;
  }
  return false;
}
export function progressFor(userId, placementId) {
  const p = userId
    ? row(
        "SELECT * FROM learning_progress WHERE user_id=? AND placement_id=?",
        [userId, placementId],
      )
    : null;
  return p
    ? { ...p, tasks: JSON.parse(p.tasks) }
    : {
        version: 0,
        video_time: 0,
        video_duration: 0,
        current_prompt_id: null,
        slide_id: null,
        tasks: [],
        completed_at: null,
        follow_video: 1,
      };
}
export function lessonMetadata(p, user) {
  return {
    id: p.id,
    title: p.title,
    duration_seconds: p.config.durationSeconds || 0,
    subtitle: p.subtitle,
    chapter: p.chapter_title,
    chapter_id: p.chapter_id,
    stage_id: p.stage_id,
    owner_id: p.owner_id,
    owner_slug: p.owner_slug,
    owner_title: p.owner_title,
    kind: p.kind,
    locked: !canReadPlacement(user, p),
    is_preview: Boolean(p.is_preview),
    progress: progressFor(user?.id, p.id),
  };
}
