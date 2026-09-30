import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Dialog } from "./AdminDialog.jsx";
import "./learning-system.css";

const states = [
  ["draft", "草稿"],
  ["published", "已发布"],
  ["archived", "已归档"],
];
const emptyConfig = () => ({
  videoAssetId: null,
  pptAssetId: null,
  subtitleAssetId: null,
  slides: [],
  mappings: [],
  tasks: [],
  operations: [],
});
const presets = {
  lessons: () => ({
    title: "",
    subtitle: "",
    status: "draft",
    config: emptyConfig(),
  }),
  placements: () => ({
    lesson_id: 0,
    chapter_id: null,
    stage_id: null,
    is_preview: false,
    sort_order: 0,
    status: "draft",
    materials: [],
  }),
  stages: () => ({
    project_id: 0,
    title: "",
    description: "",
    checklist: [],
    sort_order: 0,
    status: "draft",
  }),
  categories: () => ({ name: "", slug: "", sort_order: 0, is_active: true }),
  settings: () => ({
    project_id: 0,
    category_id: null,
    tech_stack: [],
    difficulty: null,
    estimated_minutes: 0,
    audience: "",
    prerequisites: "",
    access_type: "paid",
    price_cents: 0,
    is_recommended: false,
  }),
};
const tabs = [
  ["lessons", "共享课时"],
  ["placements", "课程 / 项目编排"],
  ["stages", "项目阶段"],
  ["categories", "项目分类"],
  ["settings", "项目学习配置"],
];
function ChecklistEditor({ items, onChange }) {
  return (
    <fieldset>
      <legend>实践 / 验收清单</legend>
      {items.map((item, index) => (
        <div className="ls-form-row" key={item.id}>
          <input
            aria-label={`第 ${index + 1} 项任务`}
            value={item.title}
            onChange={(e) =>
              onChange(
                items.map((v, i) =>
                  i === index ? { ...v, title: e.target.value } : v,
                ),
              )
            }
          />
          <label>
            <input
              type="checkbox"
              checked={item.required}
              onChange={(e) =>
                onChange(
                  items.map((v, i) =>
                    i === index ? { ...v, required: e.target.checked } : v,
                  ),
                )
              }
            />
            必需
          </label>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            移除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            { id: crypto.randomUUID(), title: "", required: true },
          ])
        }
      >
        添加清单项
      </button>
    </fieldset>
  );
}
export function AdminLearning() {
  const [data, setData] = useState(null),
    [tab, setTab] = useState("lessons"),
    [draft, setDraft] = useState(null),
    [initial, setInitial] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [relatedIds, setRelatedIds] = useState("");
  const load = () =>
    api("/admin/learning/snapshot")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    const guard = (e) => {
      if (!dirty) return;
      if (e.type === "beforeunload") {
        e.preventDefault();
        e.returnValue = "";
      } else if (!window.confirm("有未保存的课时配置，确定离开？"))
        e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    window.addEventListener("oneshowlearn:before-navigate", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener("oneshowlearn:before-navigate", guard);
    };
  }, [dirty]);
  const edit = (item) => {
    let next = item ? structuredClone(item) : presets[tab]();
    if (tab === "placements") next.is_preview = Boolean(next.is_preview);
    if (tab === "categories") next.is_active = Boolean(next.is_active);
    if (tab === "settings") next.is_recommended = Boolean(next.is_recommended);
    setDraft(next);
    setRelatedIds((next.config?.relatedPlacementIds || []).join(", "));
    setInitial(structuredClone(next));
    setError("");
  };
  const close = () => {
    if (!busy && (!dirty || window.confirm("放弃未保存修改？"))) setDraft(null);
  };
  const set = (key, value) => setDraft((v) => ({ ...v, [key]: value }));
  const config = (key, value) =>
    setDraft((v) => ({ ...v, config: { ...v.config, [key]: value } }));
  const select = (label, key, items, nullable = false, disabled = false) => (
    <label>
      {label}
      <select
        disabled={disabled}
        value={draft[key] ?? ""}
        onChange={(e) =>
          set(
            key,
            e.target.value ? Number(e.target.value) : nullable ? null : 0,
          )
        }
      >
        <option value="">请选择</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            #{i.id} ·{" "}
            {i.project_id
              ? `${data.projects.find((p) => p.id === i.project_id)?.title || "项目"} / `
              : ""}
            {i.course ? `${i.course} / ` : ""}
            {i.title || i.name || i.original_name}
          </option>
        ))}
      </select>
    </label>
  );
  const assetSelect = (label, key, filter) => (
    <label>
      {label}
      <select
        value={draft.config[key] ?? ""}
        onChange={(e) =>
          config(key, e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">不配置</option>
        {data.assets.filter(filter).map((a) => (
          <option key={a.id} value={a.id}>
            {a.original_name}
          </option>
        ))}
      </select>
    </label>
  );
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let body = Object.fromEntries(
        Object.keys(presets[tab]()).map((k) => [k, draft[k]]),
      );
      if (tab === "settings") delete body.project_id;
      if (tab === "lessons") {
        const ids = relatedIds
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number);
        if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
          throw new Error("关联课时 ID 必须为正整数，并使用逗号分隔。");
        body.config = {
          ...body.config,
          relatedPlacementIds: [...new Set(ids)],
        };
      }
      await api(
        `/admin/learning/${tab}/${tab === "settings" ? draft.project_id : draft.id || 0}`,
        {
          method: "PUT",
          headers: { "If-Match": String(draft.version || 0) },
          body: JSON.stringify(body),
        },
      );
      setDraft(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className="admin-state">
        {error || "正在加载课时编排…"}
        {error && <button onClick={load}>重试</button>}
      </div>
    );
  return (
    <section className="ls-admin">
      <div className="admin-page-head">
        <div>
          <h1>课时与项目工作台编排</h1>
          <p>
            复用统一资料库，显式配置课程与项目；未发布的内容不会出现在用户端。
          </p>
        </div>
        <button className="admin-primary" onClick={() => edit()}>
          新增{tabs.find((t) => t[0] === tab)[1]}
        </button>
      </div>
      <div className="ls-tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setDraft(null);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && !draft && <p role="alert">{error}</p>}
      <div className="ls-admin-list">
        {data[tab].map((item) => (
          <button key={item.id || item.project_id} onClick={() => edit(item)}>
            <strong>
              {item.title ||
                item.name ||
                (tab === "placements"
                  ? data.lessons.find((l) => l.id === item.lesson_id)?.title
                  : data.projects.find((p) => p.id === item.project_id)?.title)}
            </strong>
            <small>
              #{item.id || item.project_id} ·{" "}
              {states.find((s) => s[0] === item.status)?.[1] ||
                item.access_type ||
                item.slug}{" "}
              · 版本 {item.version}
              {tab === "placements"
                ? ` · ${item.chapter_id ? "课程章节" : "项目阶段"}`
                : ""}
            </small>
            {tab === "placements" && (
              <small>
                {item.chapter_id
                  ? (() => {
                      const c = data.chapters.find(
                        (c) => c.id === item.chapter_id,
                      );
                      return `${c?.course || "课程"} / ${c?.title || "章节"}`;
                    })()
                  : (() => {
                      const s = data.stages.find((s) => s.id === item.stage_id);
                      return `${data.projects.find((p) => p.id === s?.project_id)?.title || "项目"} / ${s?.title || "阶段"}`;
                    })()}
              </small>
            )}
            {tab === "stages" && (
              <small>
                {data.projects.find((p) => p.id === item.project_id)?.title}
              </small>
            )}
            <span>编辑 →</span>
          </button>
        ))}
        {!data[tab].length && (
          <p>尚未配置。新增记录后保存；不会自动填充示例课程。</p>
        )}
      </div>
      {draft && (
        <Dialog
          title={`编辑${tabs.find((t) => t[0] === tab)[1]}`}
          close={close}
        >
          <form className="ls-form" onSubmit={save}>
            <fieldset disabled={busy}>
              {Object.hasOwn(draft, "title") && (
                <label>
                  标题
                  <input
                    required
                    maxLength={200}
                    value={draft.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </label>
              )}
              {Object.hasOwn(draft, "status") && (
                <label>
                  发布状态
                  <select
                    value={draft.status}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {states.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {Object.hasOwn(draft, "sort_order") && (
                <label>
                  顺序
                  <input
                    type="number"
                    min="0"
                    value={draft.sort_order}
                    onChange={(e) => set("sort_order", Number(e.target.value))}
                  />
                </label>
              )}
              {tab === "lessons" && (
                <>
                  <label>
                    副标题
                    <input
                      value={draft.subtitle}
                      onChange={(e) => set("subtitle", e.target.value)}
                    />
                  </label>
                  <p>
                    视频、PPT
                    原件、字幕与页面图片请先上传到管理平台“附件库”。在线课件使用逐页图片，保留原
                    PPT/PDF 下载。
                  </p>
                  {assetSelect("主视频", "videoAssetId", (a) =>
                    a.mime_type.startsWith("video/"),
                  )}
                  <label>
                    视频时长（秒，用于目录展示）
                    <input
                      type="number"
                      min="0"
                      max="86400"
                      value={draft.config.durationSeconds || 0}
                      onChange={(e) =>
                        config("durationSeconds", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    预期成果（Markdown）
                    <textarea
                      value={draft.config.expectedResult || ""}
                      onChange={(e) => config("expectedResult", e.target.value)}
                    />
                  </label>
                  {assetSelect("预期成果截图", "resultAssetId", (a) =>
                    /^image\//.test(a.mime_type),
                  )}
                  <label>
                    关联课时位置 ID（课程与项目可互相引用，逗号分隔）
                    <input
                      value={relatedIds}
                      onChange={(e) => {
                        setRelatedIds(e.target.value);
                        config(
                          "relatedPlacementIds",
                          e.target.value
                            .split(/[,，]/)
                            .map((v) => v.trim())
                            .filter(Boolean)
                            .map(Number),
                        );
                      }}
                    />
                  </label>
                  {assetSelect("PPT / PDF 原件", "pptAssetId", () => true)}
                  <p className="ls-muted">AI 笔记与问 AI 仅依据当前课时文字资料。上传视频、PPT/PDF 原件或图片不会自动提取内容；请在下方逐页补充课件文字，或在课时位置关联已发布的文字稿/图文资料。</p>
                  {assetSelect("VTT 字幕", "subtitleAssetId", (a) =>
                    a.original_name.endsWith(".vtt"),
                  )}
                  <fieldset>
                    <legend>课件页面 / 跟随视频时间</legend>
                    <p role="status">AI 课件文字：{draft.config.slides.filter(s=>s.text?.trim()).length} / {draft.config.slides.length} 页已填写。空白页不会作为回答依据；资料更新保存后，下次 AI 请求使用最新内容。</p>
                    {draft.config.slides.map((slide, i) => {
                      const m = draft.config.mappings.find(
                        (m) => m.slideId === slide.id,
                      );
                      return (
                        <div className="ls-slide-edit" key={slide.id}>
                          <strong>第 {i + 1} 页</strong>
                          <select
                            aria-label={`第 ${i + 1} 页图片`}
                            value={slide.assetId || ""}
                            onChange={(e) =>
                              config(
                                "slides",
                                draft.config.slides.map((s, n) =>
                                  n === i
                                    ? { ...s, assetId: Number(e.target.value) }
                                    : s,
                                ),
                              )
                            }
                          >
                            <option value="">选择图片</option>
                            {data.assets
                              .filter((a) => a.mime_type.startsWith("image/"))
                              .map((a) => (
                                <option value={a.id} key={a.id}>
                                  {a.original_name}
                                </option>
                              ))}
                          </select>
                          <textarea
                            aria-label={`第 ${i + 1} 页文字`}
                            placeholder="页面文字，用于笔记和 AI 上下文"
                            value={slide.text}
                            onChange={(e) =>
                              config(
                                "slides",
                                draft.config.slides.map((s, n) =>
                                  n === i ? { ...s, text: e.target.value } : s,
                                ),
                              )
                            }
                          />
                          <div className="ls-form-row">
                            <label>
                              开始秒
                              <input
                                type="number"
                                min="0"
                                value={m?.start ?? ""}
                                onChange={(e) =>
                                  config("mappings", [
                                    ...draft.config.mappings.filter(
                                      (v) => v.slideId !== slide.id,
                                    ),
                                    {
                                      slideId: slide.id,
                                      start: Number(e.target.value),
                                      end:
                                        m?.end || Number(e.target.value) + 30,
                                    },
                                  ])
                                }
                              />
                            </label>
                            <label>
                              结束秒
                              <input
                                type="number"
                                min="0"
                                value={m?.end ?? ""}
                                onChange={(e) =>
                                  config("mappings", [
                                    ...draft.config.mappings.filter(
                                      (v) => v.slideId !== slide.id,
                                    ),
                                    {
                                      slideId: slide.id,
                                      start: m?.start || 0,
                                      end: Number(e.target.value),
                                    },
                                  ])
                                }
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((v) => ({
                                  ...v,
                                  config: {
                                    ...v.config,
                                    slides: v.config.slides.filter(
                                      (s) => s.id !== slide.id,
                                    ),
                                    mappings: v.config.mappings.filter(
                                      (m) => m.slideId !== slide.id,
                                    ),
                                  },
                                }))
                              }
                            >
                              移除页面
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        config("slides", [
                          ...draft.config.slides,
                          { id: crypto.randomUUID(), assetId: 0, text: "" },
                        ])
                      }
                    >
                      添加课件页
                    </button>
                  </fieldset>
                  <ChecklistEditor
                    items={draft.config.tasks}
                    onChange={(v) => config("tasks", v)}
                  />
                  <fieldset>
                    <legend>操作步骤</legend>
                    {draft.config.operations.map((op, i) => (
                      <div key={op.id}>
                        <input
                          aria-label={`操作 ${i + 1} 标题`}
                          value={op.title}
                          onChange={(e) =>
                            config(
                              "operations",
                              draft.config.operations.map((v, n) =>
                                n === i ? { ...v, title: e.target.value } : v,
                              ),
                            )
                          }
                        />
                        <textarea
                          aria-label={`操作 ${i + 1} 说明`}
                          value={op.body}
                          onChange={(e) =>
                            config(
                              "operations",
                              draft.config.operations.map((v, n) =>
                                n === i ? { ...v, body: e.target.value } : v,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            config(
                              "operations",
                              draft.config.operations.filter((_, n) => n !== i),
                            )
                          }
                        >
                          移除步骤
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        config("operations", [
                          ...draft.config.operations,
                          { id: crypto.randomUUID(), title: "", body: "" },
                        ])
                      }
                    >
                      添加操作步骤
                    </button>
                  </fieldset>
                </>
              )}
              {tab === "placements" && (
                <>
                  {select(
                    "共享课时",
                    "lesson_id",
                    data.lessons,
                    false,
                    Boolean(draft.id),
                  )}
                  <label>
                    投放到
                    <select
                      disabled={Boolean(draft.id)}
                      value={draft.stage_id !== null ? "project" : "course"}
                      onChange={(e) =>
                        setDraft((v) => ({
                          ...v,
                          chapter_id: e.target.value === "course" ? 0 : null,
                          stage_id: e.target.value === "project" ? 0 : null,
                        }))
                      }
                    >
                      <option value="course">课程章节</option>
                      <option value="project">项目阶段</option>
                    </select>
                  </label>
                  {draft.stage_id !== null
                    ? select(
                        "项目阶段",
                        "stage_id",
                        data.stages,
                        false,
                        Boolean(draft.id),
                      )
                    : select(
                        "课程章节",
                        "chapter_id",
                        data.chapters,
                        false,
                        Boolean(draft.id),
                      )}
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.is_preview}
                      onChange={(e) => set("is_preview", e.target.checked)}
                    />
                    允许免费试看（包括本次投放关联的全部资料）
                  </label>
                  <fieldset>
                    <legend>引用统一资料库</legend>
                    {draft.materials.map((m, i) => (
                      <div className="ls-form-row" key={i}>
                        <select
                          aria-label={`资料 ${i + 1}`}
                          value={m.library_id}
                          onChange={(e) =>
                            set(
                              "materials",
                              draft.materials.map((v, n) =>
                                n === i
                                  ? { ...v, library_id: Number(e.target.value) }
                                  : v,
                              ),
                            )
                          }
                        >
                          <option value={0}>请选择资料</option>
                          {data.library.map((l) => (
                            <option value={l.id} key={l.id}>
                              {l.title} · {l.status}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`资料 ${i + 1} 用途`}
                          value={m.role}
                          onChange={(e) =>
                            set(
                              "materials",
                              draft.materials.map((v, n) =>
                                n === i ? { ...v, role: e.target.value } : v,
                              ),
                            )
                          }
                        >
                          {[
                            ["article", "图文"],
                            ["code", "代码"],
                            ["prompt", "Prompt"],
                            ["file", "文件"],
                            ["transcript", "文字稿"],
                          ].map(([v, t]) => (
                            <option key={v} value={v}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "materials",
                              draft.materials.filter((_, n) => n !== i),
                            )
                          }
                        >
                          移除引用
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        set("materials", [
                          ...draft.materials,
                          { library_id: 0, role: "article" },
                        ])
                      }
                    >
                      添加引用
                    </button>
                  </fieldset>
                  <p>
                    保存时为 Prompt
                    固定当前版本。原资料更新后，需重新保存投放才采用新版；历史版本仍保留。
                  </p>
                </>
              )}
              {tab === "stages" && (
                <>
                  {select(
                    "所属项目",
                    "project_id",
                    data.projects,
                    false,
                    Boolean(draft.id),
                  )}
                  <label>
                    阶段目标
                    <textarea
                      value={draft.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </label>
                  <ChecklistEditor
                    items={draft.checklist}
                    onChange={(v) => set("checklist", v)}
                  />
                </>
              )}
              {tab === "categories" && (
                <>
                  <label>
                    分类名称
                    <input
                      required
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </label>
                  <label>
                    英文标识
                    <input
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      value={draft.slug}
                      onChange={(e) => set("slug", e.target.value)}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(e) => set("is_active", e.target.checked)}
                    />
                    启用分类
                  </label>
                </>
              )}
              {tab === "settings" && (
                <>
                  {select(
                    "项目",
                    "project_id",
                    data.projects,
                    false,
                    Boolean(draft.version),
                  )}
                  {select("分类", "category_id", data.categories, true)}
                  <label>
                    技术栈（逗号分隔）
                    <input
                      value={draft.tech_stack.join(",")}
                      onChange={(e) =>
                        set(
                          "tech_stack",
                          e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                  <label>
                    难度
                    <select
                      value={draft.difficulty ?? ""}
                      onChange={(e) =>
                        set(
                          "difficulty",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">待定</option>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>
                          {v} / 5
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    预计实践分钟
                    <input
                      type="number"
                      min="0"
                      value={draft.estimated_minutes}
                      onChange={(e) =>
                        set("estimated_minutes", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    适合人群
                    <textarea
                      value={draft.audience}
                      onChange={(e) => set("audience", e.target.value)}
                    />
                  </label>
                  <label>
                    前置要求
                    <textarea
                      value={draft.prerequisites}
                      onChange={(e) => set("prerequisites", e.target.value)}
                    />
                  </label>
                  <label>
                    访问类型
                    <select
                      value={draft.access_type}
                      onChange={(e) => set("access_type", e.target.value)}
                    >
                      <option value="free">免费项目</option>
                      <option value="paid">
                        付费（复用订单 / 人工确认收款）
                      </option>
                      <option value="membership">会员（尚未开通）</option>
                    </select>
                  </label>
                  <label>
                    价格（人民币分，100 分 = 1 元）
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.price_cents}
                      onChange={(e) =>
                        set("price_cents", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.is_recommended}
                      onChange={(e) => set("is_recommended", e.target.checked)}
                    />
                    编辑推荐
                  </label>
                </>
              )}
              {error && (
                <p role="alert" className="ls-error">
                  {error}
                </p>
              )}
              <button className="admin-primary" type="submit">
                {busy ? "保存中…" : "保存配置"}
              </button>
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
