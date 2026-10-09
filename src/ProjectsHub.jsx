import { useEffect, useRef, useState } from "react";
import { api, money } from "./api.js";
import { safeResourceUrl } from "./opc-model.js";
import { LessonWorkspace, lessonLink } from "./LessonWorkspace.jsx";
import { Dialog } from "./AdminDialog.jsx";
import { ProjectDiscovery } from "./ProjectDiscovery.jsx";
import {FavoriteButton} from './FavoriteButton.jsx';
import { projectStudyEntry } from "./project-study-model.js";
import "./learning-system.css";

function ProjectRail({ items, navigate }) {
  return (
    <aside className="ls-project-rail">
      <section className="ls-panel">
        <h2>我的项目进度</h2>
        <div className="ls-project-counts">
          <div>
            <b>{items.filter((p) => p.progress.percent < 100).length}</b>
            <small>进行中</small>
          </div>
          <div>
            <b>{items.filter((p) => p.progress.percent === 100).length}</b>
            <small>教程已完成</small>
          </div>
        </div>
        {items.slice(0, 3).map((p) => (
          <article className="ls-material" key={p.id}>
            <strong>{p.title}</strong>
            <p>
              <progress max="100" value={p.progress.percent} />{" "}
              {p.progress.percent}%
            </p>
            <button
              className="ls-btn"
              onClick={() => navigate(`/projects/${p.slug}/workspace`)}
            >
              继续项目 →
            </button>
          </article>
        ))}
        {!items.length && (
          <p className="ls-muted">
            开始一个项目后，阶段与实践进度会显示在这里。
          </p>
        )}
      </section>
      <section className="ls-panel">
        <h2>AI 导师</h2>
        <p className="ls-muted">
          进入项目课时后，可查看与当前阶段关联的指导上下文。未配置 AI
          服务时不会生成模拟回答。
        </p>
        <button className="ls-btn" onClick={() => navigate("/tutor")}>
          查看 AI 导师 →
        </button>
      </section>
      <section className="ls-panel">
        <h2>项目学习路径</h2>
        <ol className="ls-project-guide">
          {[
            ["选择项目", "匹配自己的需求和基础"],
            ["学习教程", "阅读课件与开发说明"],
            ["动手开发", "使用 Prompt，完成清单"],
            ["记录成果", "整理作品与实践心得"],
            ["发布上线", "部署并验证自己的产品"],
            ["持续运营", "获取反馈，迭代产品"],
          ].map(([title, desc]) => (
            <li key={title}>
              <strong>{title}</strong>
              <small>{desc}</small>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function StageAcceptance({ project, stage, reload }) {
  const [checked, setChecked] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await api(
        `/learning/projects/${project.slug}/stages/${stage.id}/accept`,
        {
          method: "POST",
          headers: { "If-Match": String(stage.version) },
          body: JSON.stringify({ checked }),
        },
      );
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ls-panel">
      <h3>{stage.title} · 阶段验收</h3>
      <p className="ls-muted">
        完成课时和必需验收项后，解锁下一阶段。请根据自己的实际实践情况逐项确认。
      </p>
      {stage.checklist.map((task) => (
        <label className="ls-task" key={task.id}>
          <input
            type="checkbox"
            disabled={stage.accepted}
            checked={stage.accepted || checked.includes(task.id)}
            onChange={(e) =>
              setChecked((v) =>
                e.target.checked
                  ? [...v, task.id]
                  : v.filter((id) => id !== task.id),
              )
            }
          />
          <span>
            {task.title}
            {task.required ? "（必需）" : ""}
          </span>
        </label>
      ))}
      <button
        className="ls-btn ls-primary"
        onClick={accept}
        disabled={
          busy ||
          stage.accepted ||
          !stage.lessons.every((l) => l.progress.completed_at) ||
          stage.checklist.some((t) => t.required && !checked.includes(t.id))
        }
      >
        {stage.accepted ? "已完成阶段验收" : "提交阶段验收"}
      </button>
      {error && (
        <p role="alert" className="ls-error">
          {error}
        </p>
      )}
    </section>
  );
}

function ProjectOutcome({ project, model, navigate }) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState({
      title: project.title,
      description: "",
      url: "",
      githubUrl: "",
      screenshotUrl: "",
      stage: "building",
    }),
    [error, setError] = useState("");
  const existing = (model.state.achievements || []).find(
    (a) => a.sourceProjectId === project.id && !a.deletedAt,
  );
  const save = async (e) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const item = {
      ...draft,
      id: crypto.randomUUID(),
      type: "product",
      sourceProjectId: project.id,
      tags: (project.settings?.tech_stack || [])
        .slice(0, 8)
        .map((t) => t.slice(0, 24)),
      createdAt: now,
      updatedAt: now,
    };
    if (
      await model.saveState({
        ...model.state,
        achievements: [item, ...(model.state.achievements || [])],
      })
    ) {
      setOpen(false);
      navigate("/achievements");
    } else setError("未能保存，请检查链接或刷新账号数据后重试。");
  };
  return (
    <section className="ls-panel">
      <h3>已完成项目教程与阶段验收</h3>
      <p>记录自己的作品，不会自动标记上线或发放证书；成果仅当前账号可见。</p>
      <button
        className="ls-btn ls-primary"
        onClick={() => (existing ? navigate("/achievements") : setOpen(true))}
      >
        {existing ? "查看我的成果" : "记录项目成果 →"}
      </button>
      {open && (
        <Dialog
          title="记录项目成果"
          close={() => {
            if (window.confirm("关闭成果编辑？未保存内容会保留在当前页面。"))
              setOpen(false);
          }}
        >
          <form className="ls-form" onSubmit={save}>
            <fieldset>
              <label>
                成果名称
                <input
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                成果介绍
                <textarea
                  required
                  maxLength={5000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              {[
                ["url", "产品 URL"],
                ["githubUrl", "代码仓库 URL"],
                ["screenshotUrl", "作品截图 URL"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}（可选）
                  <input
                    type="url"
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                真实状态
                <select
                  value={draft.stage}
                  onChange={(e) =>
                    setDraft({ ...draft, stage: e.target.value })
                  }
                >
                  <option value="building">仍在开发</option>
                  <option value="launched">我已完成部署并验证上线</option>
                </select>
              </label>
              {error && <p role="alert">{error}</p>}
              <button className="ls-btn ls-primary" disabled={model.busy}>
                保存到我的成果
              </button>
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
function ProjectDetail({ slug, workspace, placementId, model, navigate }) {
  const starting=useRef(false);
  const [project, setProject] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setProject(null);
    api(`/learning/projects/${encodeURIComponent(slug)}`)
      .then((p) => {
        if (active) setProject(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug, model.user?.id, revision]);
  const reload = async () => {
    setProject(await api(`/learning/projects/${encodeURIComponent(slug)}`));
  };
  const start = async () => {
    if (!model.user) return navigate("/login");
    if (starting.current) return;
    starting.current=true;
    setBusy(true);
    try {
      const p = await api(
        `/learning/projects/${encodeURIComponent(slug)}/start`,
        { method: "POST" },
      );
      setProject(p);
      navigate(`/projects/${slug}/workspace`);
    } catch (e) {
      setError(e.message);
    } finally {
      starting.current=false;
      setBusy(false);
    }
  };
  const purchase = async () => {
    if(project.bundleIncluded)return navigate('/course-offer');
    if (!model.user) return navigate("/login");
    if (
      !window.confirm(
        `创建 ${money(project.product.price_cents)} 的项目订单？目前仅支持联系管理员线下收款确认，不会自动扣款。`,
      )
    )
      return;
    setBusy(true);
    try {
      const order = await api("/orders", {
        method: "POST",
        body: JSON.stringify({ productId: project.product.id }),
      });
      setError(
        `订单 ${order.orderNo} 已创建，待管理员确认实际收款后开通。请勿重复下单。`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!project)
    return (
      <div className="ls-empty" role={error ? "alert" : "status"}>
        {error || "正在加载项目…"}
        {error && (
          <button className="ls-btn" onClick={() => setRevision((v) => v + 1)}>
            重试
          </button>
        )}
      </div>
    );
  const lessons = project.stages.flatMap((s) => s.lessons),
    unaccepted = project.stages.find((s) => !s.accepted);
  const current = placementId
    ? lessons.find((l) => l.id === placementId)
    : lessons.find((l) => l.id === project.run?.current_placement_id) ||
      unaccepted?.lessons.find((l) => !l.progress.completed_at) ||
      unaccepted?.lessons[0] ||
      lessons[0];
  const stage =
    current && project.stages.find((s) => s.id === current.stage_id);
  const onProgress = (id, progress) =>
    setProject((p) => ({
      ...p,
      stages: p.stages.map((s) => ({
        ...s,
        lessons: s.lessons.map((l) => (l.id === id ? { ...l, progress } : l)),
      })),
    }));
  if (workspace && current && (project.run || current.is_preview))
    return (
      <LessonWorkspace
        key={slug}
        id={current.id}
        lessons={lessons}
        model={model}
        navigate={navigate}
        onProgress={onProgress}
        footer={
          <>
            {project.run && <StageAcceptance
              key={stage.id}
              project={project}
              stage={stage}
              reload={reload}
            />}
            {project.run && project.stages.every((s) => s.accepted) && (
              <ProjectOutcome
                project={project}
                model={model}
                navigate={navigate}
              />
            )}
          </>
        }
      />
    );
  return (
    <section className="ls-page">
      <div className="ls-actions">
        <button onClick={() => navigate("/projects")}>← 返回实战项目</button>
      </div>
      <section className="ls-project-hero">
        <h1>{project.title}</h1>
        <p>{project.description}</p>
        <div className="ls-badges">
          {project.settings?.tech_stack.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="ls-actions">
          <FavoriteButton model={model} navigate={navigate} reference={{kind:'project',id:project.id}} title={project.title}/>
          <button
            className="ls-primary"
            disabled={busy || !lessons.length || !project.entitled}
            onClick={start}
          >
            {project.run
              ? "继续项目"
              : project.entitled
                ? model.user ? "开始学习" : "登录后开始学习"
                : "需要项目权益"}
          </button>
          {!project.run&&lessons.some(l=>l.is_preview)&&<button onClick={()=>navigate(`/projects/${encodeURIComponent(slug)}/preview/${lessons.find(l=>l.is_preview).id}`)}>预览课程</button>}
          {!project.entitled &&
            project.settings?.access_type === "paid" &&
            project.product && (
              <button disabled={busy} onClick={purchase}>
                {project.bundleIncluded?'完整课程已包含此项目':`购买项目 · ${money(project.product.price_cents)}`}
              </button>
            )}
          <small>
            {!lessons.length
              ? "教程尚未发布"
              : !project.entitled
                ? project.bundleIncluded
                  ? "完整课程包含此项目；购买后可通过同一账号学习。"
                  : "请查看项目学习权益说明，或联系管理员确认开通方式。"
                : `${lessons.length} 节教程 · ${project.promptCount} 个 Prompt`}
          </small>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      <div className="ls-project-layout">
        <div>
          <section className="ls-panel">
            <h2>你将完成什么</h2>
            <p>{project.deliverable || "项目成果说明待管理员完善。"}</p>
            {project.settings?.audience && (
              <>
                <h3>适合人群</h3>
                <p>{project.settings.audience}</p>
              </>
            )}
            {project.settings?.prerequisites && (
              <>
                <h3>前置要求</h3>
                <p>{project.settings.prerequisites}</p>
              </>
            )}
          </section>
          <h2>项目阶段与目录</h2>
          {project.stages.map((s, i) => (
            <section className="ls-panel ls-stage" key={s.id}>
              <h3>
                {String(i + 1).padStart(2, "0")}　{s.title}
                {s.accepted ? " ✓" : ""}
              </h3>
              <p className="ls-muted">{s.description}</p>
              {s.lessons.map((l) => (
                <button
                  className="ls-lesson-row"
                  key={l.id}
                  onClick={() =>
                    project.run
                      ? navigate(lessonLink(l))
                      : l.is_preview
                        ? navigate(`/projects/${slug}/preview/${l.id}`)
                        : start()
                  }
                >
                  <span>
                    {l.progress.completed_at ? "✓" : "▷"}　{l.title}
                  </span>
                  <small>
                    {l.is_preview
                      ? "免费试看"
                      : l.locked
                        ? "未解锁"
                        : "进入学习 →"}
                  </small>
                </button>
              ))}
            </section>
          ))}
          {!project.stages.length && (
            <div className="ls-empty">
              独立项目教程待发布。已关联的课程资料仍可从“学习课程”进入。
            </div>
          )}
          {project.relatedCourses?.length > 0 && (
            <section className="ls-panel">
              <h3>关联课程</h3>
              <p className="ls-muted">
                {project.bundleIncluded
                  ? "完整课程包含平台已发布的配套实战项目；课程与项目使用同一购买账号。"
                  : "课程与项目按各自授权范围校验，既有课程资料保持可访问。"}
              </p>
              {project.relatedCourses.map((c) => (
                <button
                  className="ls-lesson-row"
                  key={c.id}
                  onClick={() =>
                    navigate(`/learn/${encodeURIComponent(c.slug)}`)
                  }
                >
                  {c.title} →
                </button>
              ))}
            </section>
          )}
        </div>
        <ProjectRail items={project.run ? [project] : []} navigate={navigate} />
      </div>
    </section>
  );
}

function Preview({ slug, id, model, navigate }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/learning/projects/${encodeURIComponent(slug)}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  if (!data) return <div className="ls-empty">{error || "正在加载项目…"}</div>;
  const lessons = data.stages.flatMap((s) => s.lessons),
    p = lessons.find((l) => l.id === id);
  if (!p?.is_preview) return <div className="ls-empty">此课时未开放试看。</div>;
  return (
    <LessonWorkspace
      id={id}
      lessons={lessons}
      model={model}
      navigate={navigate}
    />
  );
}

export function ProjectsHub({ route, model, navigate }) {
  const parts = route.split("/"),
    slug = parts[2];
  const [data, setData] = useState(null),
    [mine, setMine] = useState([]),
    [mineStatus, setMineStatus] = useState("loading"),
    [mineRevision, setMineRevision] = useState(0),
    [categories, setCategories] = useState([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(0),
    [sort, setSort] = useState("recommended"),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (slug) return;
    let active = true;
    setData(null);
    setError("");
    const timer = setTimeout(
      () =>
        api(
          `/learning/projects?q=${encodeURIComponent(query)}&category=${category}&sort=${sort}&offset=${offset}`,
        )
          .then((d) => {
            if (active) { setData(d); setCategories(d.categories); }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, query, category, sort, offset, revision, model.user?.id]);
  useEffect(() => {
    let active = true;
    setMine([]);
    setMineStatus(model.user ? "loading" : "guest");
    if (model.user)
      api("/learning/me/projects")
        .then((d) => {
          if (active) { setMine(d.items); setMineStatus("ready"); }
        })
        .catch((e) => {
          if (active) setMineStatus("error");
        });
    return () => {
      active = false;
    };
  }, [model.user?.id, slug, mineRevision]);
  if (slug && parts[3] === "preview")
    return (
      <Preview
        key={`${slug}-${parts[4]}`}
        slug={slug}
        id={Number(parts[4])}
        model={model}
        navigate={navigate}
      />
    );
  if (slug)
    return (
      <ProjectDetail
        key={slug}
        slug={slug}
        workspace={parts[3] === "workspace"}
        placementId={Number(parts[4]) || null}
        model={model}
        navigate={navigate}
      />
    );
  return <ProjectDiscovery data={data} categories={categories} mine={mine} mineStatus={mineStatus}
    error={error} query={query} category={category} sort={sort} offset={offset}
    setQuery={value=>{setQuery(value);setOffset(0);}}
    setCategory={value=>{setCategory(value);setOffset(0);}}
    setSort={value=>{setSort(value);setOffset(0);}} setOffset={setOffset}
    retry={()=>setRevision(v=>v+1)} retryMine={()=>setMineRevision(v=>v+1)}
    model={model} navigate={navigate} onOpen={async project=>{
      const entry=projectStudyEntry(project,Boolean(model.user));
      if(entry.start)await api(`/learning/projects/${encodeURIComponent(project.slug)}/start`,{method:'POST'});
      navigate(entry.path);
    }} onDetails={project=>navigate(`/projects/${encodeURIComponent(project.slug)}`)}/>;
}
