import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  Briefcase,
  CaretRight,
  ChartLineUp,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  Code,
  FileText,
  FolderOpen,
  GithubLogo,
  Lightbulb,
  LockKey,
  Money,
  PencilSimple,
  Play,
  Robot,
  Rocket,
  Sparkle,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { api } from "./api.js";
import { canManage } from "./platforms.js";
import {
  OPC_PHASES,
  PRODUCT_MILESTONES,
  CONTENT_TYPES,
  emptyProduct,
  phaseProgress,
  safeResourceUrl,
} from "./opc-model.js";
import {routeOverview,coursePhasePath} from "./learning-route-model.js";
import {LearningRoutes} from "./LearningRoutes.jsx";
import "./opc-learning.css";

const phaseIcons = [Lightbulb, BracketsCurly, Rocket, Money, ChartLineUp];
const typeIcons = {
  document: FileText,
  prompt: Sparkle,
  code: Code,
  template: ClipboardText,
  task: CheckCircle,
  checklist: ClipboardText,
  video: Play,
  download: FolderOpen,
};
const suggestions = [
  "如何用 Codex 开发一个 SaaS？",
  "这个项目的数据库应该如何设计？",
  "帮我梳理一份产品需求文档（PRD）",
  "部署到服务器需要准备什么？",
];
const goalDescriptions = [
  "完成一个可用的产品",
  "保存与管理项目代码",
  "记录你的实践过程",
  "沉淀这次实践的经验",
];

function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`opc-dialog ${wide ? "wide" : ""}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="opc-dialog-title"
    >
      <div className="opc-dialog-inner">
        <header>
          <h2 id="opc-dialog-title">{title}</h2>
          <button
            className="opc-icon-button"
            aria-label="关闭窗口"
            onClick={close}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function OpcLearning({ model, navigate, notify, initialPhase = 0, showRoadmap = false }) {
  const [roadmapOpen,setRoadmapOpen]=useState(showRoadmap);
  useEffect(()=>{setRoadmapOpen(showRoadmap);},[showRoadmap,initialPhase]);
  const [phases, setPhases] = useState(
    OPC_PHASES.map((p) => ({ ...p, items: [] })),
  );
  const [phaseId, setPhaseId] = useState(initialPhase || 1);
  const requestedPhase=useRef(initialPhase);
  requestedPhase.current=initialPhase;
  useEffect(() => { setPhaseId(initialPhase || routeOverview(phases).current); setActiveId(null); setModal(null); }, [initialPhase]);
  const accountPending=model.loading&&!model.user;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState({
    product: emptyProduct(),
    version: null,
  });
  const [productError, setProductError] = useState("");
  const [modal, setModal] = useState(null);
  const [reader, setReader] = useState({
    loading: false,
    item: null,
    error: "",
  });
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [activeId, setActiveId] = useState(null);
  const revision = useRef(0);
  const readerRevision = useRef(0);
  const saving = useRef(false);
  const lessonRef = useRef(null);
  const phase = phases.find((p) => p.id === phaseId) || phases[0];
  const progress = phaseProgress(phase.items);
  const product = snapshot.product;
  const allItems = phases.flatMap((p) => p.items);
  const resources = phase.items
    .filter((item) =>
      [
        "prompt",
        "code",
        "template",
        "download",
        "checklist",
        "document",
      ].includes(item.type),
    )
    .slice(0, 5);
  const nextItem =
    phase.items.find((item) => !item.locked && item.progress === "started") ||
    phase.items.find((item) => !item.locked && item.progress !== "completed") ||
    phase.items.find((item) => !item.locked);

  const load = async () => {
    const request = ++revision.current;
    setLoading(true);
    setError("");
    setProductError("");
    try {
      const data = await api("/opc/curriculum");
      if (request === revision.current) { setPhases(data.phases); setPhaseId(requestedPhase.current || routeOverview(data.phases).current); }
    } catch (e) {
      if (request === revision.current) setError(e.message);
    }
    if (model.user) {
      try {
        const data = await api("/me/opc/product");
        if (request === revision.current) setSnapshot(data);
      } catch (e) {
        if (request === revision.current) setProductError(e.message);
      }
    }
    if (request === revision.current) setLoading(false);
  };
  useEffect(() => {
    setSnapshot({ product: emptyProduct(), version: null });
    setModal(null);
    setActiveId(null);
    setPhases(OPC_PHASES.map((p) => ({ ...p, items: [] })));
    if (!accountPending) load();
    return () => {
      revision.current++;
    };
  }, [model.user?.id, accountPending]);

  const saveProduct = async (next) => {
    if (!model.user) {
      navigate("/login");
      return false;
    }
    if (saving.current || !snapshot.version) return false;
    saving.current = true;
    setBusy(true);
    const request = revision.current;
    try {
      const saved = await api("/me/opc/product", {
        method: "PUT",
        headers: { "If-Match": snapshot.version },
        body: JSON.stringify(next),
      });
      if (request !== revision.current) return false;
      setSnapshot(saved);
      notify("已保存到你的账号");
      return true;
    } catch (e) {
      if (e.status === 409) {
        try {
          const latest = await api("/me/opc/product");
          if (request === revision.current) setSnapshot(latest);
        } catch {}
      }
      notify(e.message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const markProgress = async (item, status) => {
    const request = revision.current;
    await api(`/me/progress/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    if (request !== revision.current) return;
    setPhases((current) =>
      current.map((p) => ({
        ...p,
        items: p.items.map((i) =>
          i.id === item.id ? { ...i, progress: status } : i,
        ),
      })),
    );
    // The shared shell now survives navigation: keep its account progress fresh.
    await model.refresh({ preserve: true });
  };
  const openItem = async (item) => {
    const reading = ++readerRevision.current;
    if (item.locked) {
      setModal({ type: "locked", item });
      return;
    }
    if(item.learning_url){navigate(item.learning_url);return;}
    const request = revision.current;
    setActiveId(item.id);
    setModal({ type: "reader", item });
    setReader({ loading: true, item: null, error: "" });
    try {
      const data = await api(`/opc/content/${item.id}`);
      if (request !== revision.current || reading !== readerRevision.current) return;
      setReader({ loading: false, item: data.item, error: "" });
      if (model.user && item.progress !== "completed") {
        try {
          await markProgress(item, "started");
        } catch (e) {
          notify(`内容已打开，进度未保存：${e.message}`);
        }
      }
    } catch (e) {
      if (request === revision.current && reading === readerRevision.current)
        setReader({ loading: false, item: null, error: e.message });
    }
  };
  const start = () => {
    if (nextItem) openItem(nextItem);
    else {
      lessonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      notify(
        phase.items.length
          ? "可在内容列表中查看课程学习权限"
          : "本阶段内容正在准备中，发布后可在这里学习",
      );
    }
  };
  const editProduct = () => {
    if (!model.user) return navigate("/login");
    if (productError || !snapshot.version)
      return notify("产品资料尚未加载，请重试后再编辑");
    setModal({
      type: "product",
      draft: {
        name: product.name,
        type: product.type,
        description: product.description,
        phase: product.phase,
      },
    });
  };
  const editOutcome = () => {
    if (!product.name) {
      notify("先创建你的产品，再保存阶段成果");
      editProduct();
      return;
    }
    const saved = product.outcomes.find((o) => o.phase === phaseId);
    setModal({
      type: "outcome",
      phase: phaseId,
      summary: saved?.summary || "",
      url: saved?.url || "",
    });
  };
  const ask = (value) => {
    if (!value.trim()) return;
    setModal({ type: "tutor", question: value.trim() });
  };
  const remaining = product.milestones.filter(
    (value) => value === "done",
  ).length;
  const close = () => { readerRevision.current++; setModal(null); };
  const completedInReader =
    allItems.find((item) => item.id === modal?.item?.id)?.progress ===
    "completed";

  return (
    <div className="opc-space">
      <nav className="opc-breadcrumb" aria-label="当前位置">
        <button className="opc-text-button" onClick={()=>navigate("/app")}>工作台</button>
        <CaretRight size={13} />
        <span>学习课程</span>
      </nav>
      <div className="opc-grid">
        <div className="opc-primary">
          <header className="opc-course-header"><div><span>从学习到实践 · 持续做出你的产品</span><h1>学习课程</h1><p><strong>AI OPC · 一个人的产品公司</strong><br/>阅读章节、使用配套资料，完成你的阶段实践。</p></div><div><button className="opc-button light" onClick={()=>navigate('/courses')}>我的课程<ArrowRight size={16}/></button><button className="opc-text-button" onClick={()=>setModal({type:'intro'})}>课程说明</button></div></header>
          {error && (
            <div className="opc-error" role="alert">
              {error}
              <button onClick={load}>重新加载</button>
            </div>
          )}
          <details className="opc-roadmap-disclosure" open={roadmapOpen} onToggle={event=>setRoadmapOpen(event.currentTarget.open)}><summary><span><BookOpenText size={20}/><strong>{roadmapOpen?'收起完整学习路线':'查看完整学习路线'}</strong></span><small>5 个阶段 · 目标与产出</small></summary>{roadmapOpen&&<LearningRoutes curriculum={phases} loading={loading} error={error} onRetry={load} navigate={path=>{setRoadmapOpen(false);navigate(path);}}/>}</details>
          <nav className="opc-stage-tabs" aria-label="课程阶段切换">{phases.map(p=><button key={p.id} aria-current={phaseId===p.id?'step':undefined} onClick={()=>navigate(coursePhasePath(p.id))}><span>0{p.id}</span>{p.title}</button>)}</nav>
          <section
            className="opc-panel opc-lessons"
            ref={lessonRef}
            aria-busy={loading}
          >
            <div className="opc-stage-heading">
              <div>
                <div className="opc-stage-title">
                  <span className="opc-robot">
                    <Robot size={22} weight="fill" />
                  </span>
                  <h2>
                    {String(phase.id).padStart(2, "0")}{" "}
                    <span>{phase.title}</span>
                  </h2>
                </div>
                <p>{phase.description}</p>
              </div>
              <div className="opc-stage-progress">
                <span>
                  阶段进度 <b>{loading ? "—" : `${progress.percent}%`}</b>
                </span>
                <progress max="100" value={progress.percent} />
                <small>
                  已学 {progress.completed} / {progress.total} 项
                </small>
              </div>
              <button
                className="opc-button light small"
                onClick={() => setModal({ type: "stage", phase })}
              >
                阶段介绍
              </button>
            </div>
            {!loading&&!error&&nextItem&&<div className="opc-next-lesson"><div><small>{nextItem.progress==='completed'?'回顾本阶段':'接下来学习'}</small><strong>{nextItem.title}</strong><span>{CONTENT_TYPES[nextItem.type]} · {nextItem.step_title}</span></div><button className="opc-button purple" onClick={start}>{nextItem.progress==='completed'?'回顾内容':nextItem.progress?'继续学习':'开始学习'}<ArrowRight size={16}/></button></div>}
            {loading ? (
              <div className="opc-empty">
                <SpinnerGap size={29} />
                <h3>正在读取课程内容</h3>
                <p>课程与学习进度将同步到这里。</p>
              </div>
            ) : phase.items.length ? (
              <div className="opc-lesson-list">
                {phase.items.map((item, index) => {
                  const TypeIcon = typeIcons[item.type];
                  const done = item.progress === "completed";
                  const active =
                    activeId === item.id ||
                    (!activeId &&
                      nextItem?.id === item.id &&
                      item.progress === "started");
                  return (
                    <button
                      key={item.id}
                      className={`opc-lesson ${active ? "current" : ""} ${done ? "done" : ""}`}
                      onClick={() => openItem(item)}
                    >
                      <span className="opc-play">
                        {item.locked ? (
                          <LockKey size={14} weight="fill" />
                        ) : done ? (
                          <Check size={14} weight="bold" />
                        ) : (
                          <Play size={13} weight="fill" />
                        )}
                      </span>
                      <span className="opc-lesson-number">
                        {phase.id}.{index + 1}
                      </span>
                      <span className="opc-lesson-copy">
                        <strong>{item.title}</strong>
                        <small>{item.summary || item.step_title}</small>
                      </span>
                      <span className="opc-duration">
                        <Clock size={13} />
                        {item.duration_seconds
                          ? `${Math.ceil(item.duration_seconds / 60)} min`
                          : "按需阅读"}
                      </span>
                      <span className="opc-type">
                        <TypeIcon size={14} />
                        {CONTENT_TYPES[item.type]}
                      </span>
                      <span className="opc-lesson-state">
                        {item.locked ? (
                          "待解锁"
                        ) : done ? (
                          <>
                            <CheckCircle weight="fill" size={14} />
                            已完成
                          </>
                        ) : active ? (
                          "正在学习"
                        ) : item.progress ? (
                          "已开始"
                        ) : (
                          "未开始"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="opc-empty">
                <BookOpenText size={32} weight="duotone" />
                <h3>{error ? "课程暂时无法加载" : "本阶段内容正在准备中"}</h3>
                <p>
                  发布后的实战文档、Prompt、代码与短视频会出现在这里。
                  <br />
                  你的学习进度将随实践自动记录。
                </p>
                {canManage(model.user) ? (
                  <button
                    className="opc-button light small"
                    onClick={() => navigate("/admin/opc")}
                  >
                    配置本阶段内容
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    className="opc-text-button"
                    onClick={() => setRoadmapOpen(true)}
                  >
                    查看学习路线与其他方向
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            {phase.items.length > 0 && (
              <footer className="opc-content-note">
                内容来自课程后台 · 文档优先，配合模板、实践任务与短视频
              </footer>
            )}
          </section>
          <section className="opc-panel opc-goals">
            <header>
              <h2>本阶段目标与成果</h2>
              <button
                className="opc-text-button"
                onClick={() => navigate("/projects")}
              >
                探索实战项目
                <ArrowRight size={14} />
              </button>
            </header>
            <div className="opc-goal-grid">
              {phase.goals.map((goal, index) => {
                const Icon = [Code, GithubLogo, Play, FileText][index];
                return (
                  <div className="opc-goal" key={goal}>
                    <span>
                      <Icon size={23} />
                    </span>
                    <div>
                      <strong>{goal}</strong>
                      <small>
                        {phaseId === 2
                          ? goalDescriptions[index]
                          : "用实践记录你的成长"}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="opc-outcome-action">
              <button
                className="opc-button purple"
                disabled={busy || loading}
                onClick={editOutcome}
              >
                {product.outcomes.some((o) => o.phase === phaseId)
                  ? "查看 / 更新阶段成果"
                  : "保存阶段成果"}
                <ArrowRight size={16} />
              </button>
              <p>成果保存到个人产品档案，方便持续完善与复盘。</p>
            </div>
            {product.outcomes.find((o) => o.phase === phaseId) && (
              <p className="opc-saved-note">
                <CheckCircle size={14} weight="fill" />
                本阶段成果已保存 · 仅自己可见，尚未接入 AI 评审
              </p>
            )}
          </section>
        </div>
        <aside className="opc-rail">
          <details className="opc-panel opc-tutor opc-tutor-fold"><summary>学习中遇到问题？<small>AI 导师预览 · 可保存问题为笔记</small></summary>
            <header>
              <span className="opc-robot">
                <Robot size={26} weight="fill" />
              </span>
              <div>
                <h2>
                  AI OPC 导师 <small>预览</small>
                </h2>
                <p>围绕当前阶段，整理实践中的问题</p>
              </div>
            </header>
            <div className="opc-tutor-context">
              我正在学习「{phase.title}」。
              <br />
              记录问题，让下一次实践更有方向。
            </div>
            <div className="opc-suggestions">
              {suggestions.map((value) => (
                <button key={value} onClick={() => ask(value)}>
                  {value}
                  <CaretRight size={14} />
                </button>
              ))}
            </div>
            <form
              className="opc-question"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <input
                aria-label="向 AI OPC 导师提问"
                placeholder="输入你的问题…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
              />
              <button
                type="submit"
                aria-label="整理这个问题"
                disabled={!question.trim()}
              >
                <ArrowRight size={23} />
              </button>
            </form>
            <small className="opc-tutor-disclaimer">
              AI 对话尚未接入；目前可将问题保存为笔记。
            </small>
          </details>
          <section className="opc-panel opc-product">
            <header>
              <h2>
                <Briefcase size={20} />
                我的产品
              </h2>
              <button
                className="opc-text-button"
                disabled={loading || busy}
                onClick={editProduct}
              >
                <PencilSimple size={14} />
                {product.name ? "编辑" : "创建"}
              </button>
            </header>
            {productError ? (
              <div className="opc-error" role="alert">
                {productError}
                <button onClick={load}>重试</button>
              </div>
            ) : (
              <>
                <dl>
                  <div>
                    <dt>产品名称</dt>
                    <dd>{product.name || "尚未创建产品"}</dd>
                  </div>
                  <div>
                    <dt>产品类型</dt>
                    <dd>{product.type || "待填写"}</dd>
                  </div>
                  <div>
                    <dt>当前阶段</dt>
                    <dd>
                      <span className="opc-product-badge">
                        {product.name
                          ? OPC_PHASES[product.phase - 1].title
                          : "从一个想法开始"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>产品描述</dt>
                    <dd>
                      {product.description ||
                        "创建你的产品档案，跟随课程一步步实现它。"}
                    </dd>
                  </div>
                </dl>
                <div className="opc-product-metrics">
                  <span>实践里程碑</span>
                  <b>
                    {remaining} / {PRODUCT_MILESTONES.length} 已完成
                  </b>
                </div>
                <div className="opc-checklist">
                  {PRODUCT_MILESTONES.map((label, index) => {
                    const status = product.milestones[index];
                    const Icon =
                      status === "done"
                        ? CheckCircle
                        : status === "doing"
                          ? Play
                          : null;
                    return (
                      <button
                        key={label}
                        className={status}
                        disabled={busy || loading || !product.name}
                        onClick={() =>
                          saveProduct({
                            ...product,
                            milestones: product.milestones.map((value, i) =>
                              i === index
                                ? {
                                    todo: "doing",
                                    doing: "done",
                                    done: "todo",
                                  }[value]
                                : value,
                            ),
                          })
                        }
                        aria-label={`${label}，${{ todo: "未开始", doing: "进行中", done: "已完成" }[status]}，点击切换状态`}
                      >
                        <span className="opc-check-icon">
                          {Icon ? <Icon size={18} weight="fill" /> : <span />}
                        </span>
                        <span>{label}</span>
                        <small>
                          {
                            { todo: "未开始", doing: "进行中", done: "已完成" }[
                              status
                            ]
                          }
                        </small>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="opc-product-details"
                  onClick={() =>
                    product.name ? setModal({ type: "details" }) : editProduct()
                  }
                >
                  {product.name ? "查看产品档案" : "创建我的产品"}
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
          <section className="opc-panel opc-resources">
            <header>
              <h2>
                <FolderOpen size={21} />
                学习资源
              </h2>
              <button
                className="opc-text-button"
                onClick={() => navigate("/resources")}
              >
                更多
                <ArrowRight size={14} />
              </button>
            </header>
            {resources.length ? (
              resources.map((item) => (
                <button key={item.id} onClick={() => openItem(item)}>
                  <FileText size={17} />
                  <span>{item.title}</span>
                  {item.locked ? (
                    <LockKey size={13} />
                  ) : (
                    <CaretRight size={13} />
                  )}
                </button>
              ))
            ) : (
              <div className="opc-resource-empty">
                <FileText size={24} />
                <p>本阶段资料准备中</p>
                <small>文档、模板与代码随内容同步发布。</small>
              </div>
            )}
          </section>
        </aside>
      </div>
      {modal && (
        <Modal
          title={
            {
              intro: "AI OPC：一个人的产品公司",
              stage: `${modal.phase?.title || ""} · 阶段介绍`,
              product: "我的产品",
              outcome: "保存阶段成果",
              tutor: "AI OPC 导师 · 功能预览",
              reader: modal.item?.title,
              locked: "课程学习权限",
              details: "我的产品档案",
            }[modal.type]
          }
          close={close}
          wide={modal.type === "reader"}
        >
          {modal.type === "intro" && (
            <>
              <p className="opc-dialog-lead">
                从想法到产品，再到上线、收款与持续增长。围绕自己的项目，一边学，一边做。
              </p>
              <div className="opc-format-grid">
                {[
                  ["60%", "实战文档"],
                  ["20%", "Prompt · 代码 · 模板"],
                  ["10%", "实践任务与清单"],
                  ["10%", "短视频演示"],
                ].map(([n, title]) => (
                  <div key={n + title}>
                    <b>{n}</b>
                    <span>{title}</span>
                  </div>
                ))}
              </div>
              <p>
                五个阶段可以自由查看，具体学习权限按课程项目包确定。内容与资源以后台实际发布为准。
              </p>
              <button
                className="opc-button purple"
                onClick={() => {
                  close();
                  start();
                }}
              >
                开始我的实践
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {modal.type === "stage" && (
            <>
              <p className="opc-dialog-lead">{modal.phase.description}</p>
              <h3>这一阶段，你将围绕这些成果展开实践</h3>
              <ul>
                {modal.phase.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p>
                当前已发布 {modal.phase.items.length}{" "}
                项学习内容。完成后可在页面底部记录作品链接与实践总结。
              </p>
              <button className="opc-button purple" onClick={close}>
                了解了
              </button>
            </>
          )}
          {modal.type === "product" && (
            <form
              className="opc-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await saveProduct({ ...product, ...modal.draft })) close();
              }}
            >
              <label>
                产品名称
                <input
                  autoFocus
                  required
                  maxLength={80}
                  placeholder="给正在做的产品起个名字"
                  value={modal.draft.name}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      draft: { ...modal.draft, name: e.target.value },
                    })
                  }
                />
              </label>
              <div className="opc-form-row">
                <label>
                  产品类型
                  <input
                    maxLength={80}
                    placeholder="例如：AI 工具网站"
                    value={modal.draft.type}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        draft: { ...modal.draft, type: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  当前阶段
                  <select
                    value={modal.draft.phase}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        draft: {
                          ...modal.draft,
                          phase: Number(e.target.value),
                        },
                      })
                    }
                  >
                    {OPC_PHASES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                产品描述
                <textarea
                  maxLength={1000}
                  rows={4}
                  placeholder="为谁，解决什么问题？"
                  value={modal.draft.description}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      draft: { ...modal.draft, description: e.target.value },
                    })
                  }
                />
              </label>
              <small>仅保存到你的个人账号，不会对外发布。</small>
              <button className="opc-button purple" disabled={busy}>
                {busy ? "保存中…" : "保存产品"}
              </button>
            </form>
          )}
          {modal.type === "outcome" && (
            <form
              className="opc-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const outcome = {
                  phase: modal.phase,
                  summary: modal.summary,
                  url: modal.url,
                  updatedAt: new Date().toISOString(),
                };
                if (
                  await saveProduct({
                    ...product,
                    outcomes: [
                      ...product.outcomes.filter(
                        (o) => o.phase !== modal.phase,
                      ),
                      outcome,
                    ],
                  })
                )
                  close();
              }}
            >
              <p>
                {OPC_PHASES[modal.phase - 1].title} · {product.name}
              </p>
              <label>
                作品 / 代码仓库链接（选填）
                <input
                  type="url"
                  pattern="https?://.*"
                  placeholder="https://…"
                  maxLength={2000}
                  value={modal.url}
                  onChange={(e) => setModal({ ...modal, url: e.target.value })}
                />
              </label>
              <label>
                实践成果与总结
                <textarea
                  required
                  rows={7}
                  maxLength={5000}
                  placeholder="完成了什么？遇到哪些问题？下一步打算怎么做？"
                  value={modal.summary}
                  onChange={(e) =>
                    setModal({ ...modal, summary: e.target.value })
                  }
                />
              </label>
              <small>
                仅自己可见。当前保存个人成果，尚不提供自动 AI 评审。
              </small>
              <button className="opc-button purple" disabled={busy}>
                {busy ? "保存中…" : "保存成果"}
              </button>
            </form>
          )}
          {modal.type === "details" && (
            <div className="opc-product-summary">
              <h3>{product.name}</h3>
              <p>{product.description || "暂未填写产品描述"}</p>
              <p>
                {OPC_PHASES[product.phase - 1].title} · {remaining}{" "}
                项里程碑已完成
              </p>
              <h3>阶段成果</h3>
              {product.outcomes.length ? (
                [...product.outcomes]
                  .sort((a, b) => a.phase - b.phase)
                  .map((o) => (
                    <article key={o.phase}>
                      <h4>{OPC_PHASES[o.phase - 1].title}</h4>
                      <p>{o.summary}</p>
                      {safeResourceUrl(o.url) && (
                        <a
                          href={safeResourceUrl(o.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看作品
                          <ArrowRight size={14} />
                        </a>
                      )}
                    </article>
                  ))
              ) : (
                <p>完成一次实践后，在页面底部保存你的第一份阶段成果。</p>
              )}
            </div>
          )}
          {modal.type === "tutor" && (
            <>
              <p className="opc-dialog-lead">{modal.question}</p>
              <p>
                AI
                导师尚未接入实时模型。目前可以把问题与当前阶段保存为学习笔记，方便后续整理和答疑。
              </p>
              <button
                className="opc-button purple"
                disabled={model.busy}
                onClick={async () => {
                  if (!model.user) return navigate("/login");
                  if (
                    await model.saveState({
                      ...model.state,
                      notes: [
                        {
                          id: crypto.randomUUID(),
                          title: `AI OPC · ${modal.question}`.slice(0, 120),
                          body: `学习阶段：${phase.title}\n\n${modal.question}`,
                          updatedAt: new Date().toISOString(),
                        },
                        ...model.state.notes,
                      ],
                    })
                  ) {
                    close();
                    notify("问题已保存到学习笔记");
                  }
                }}
              >
                保存为我的笔记
                <ArrowRight size={15} />
              </button>
            </>
          )}
          {modal.type === "locked" && (
            <>
              <p>
                「{modal.item.title}」属于「{modal.item.pack_title}
                」，当前账号尚未解锁。阶段可以自由浏览，学习权限由所属课程决定。
              </p>
              <button
                className="opc-button purple"
                onClick={() =>
                  navigate(
                    model.user ? `/packs/${modal.item.pack_slug}` : "/login",
                  )
                }
              >
                {model.user ? "查看课程与权限" : "登录后查看权限"}
                <ArrowRight size={15} />
              </button>
            </>
          )}
          {modal.type === "reader" && (
            <>
              {reader.loading ? (
                <p role="status">正在读取课程资料…</p>
              ) : reader.error ? (
                <div className="opc-error" role="alert">
                  {reader.error}
                  <button onClick={() => openItem(modal.item)}>重试</button>
                </div>
              ) : (
                reader.item && (
                  <>
                    <span className="opc-reader-type">
                      {CONTENT_TYPES[reader.item.type]} ·{" "}
                      {modal.item.step_title}
                    </span>
                    {reader.item.body ? (
                      <div
                        className={`opc-reader-body ${reader.item.type === "code" || reader.item.type === "prompt" ? "monospace" : ""}`}
                      >
                        {reader.item.body}
                      </div>
                    ) : (
                      <p>请查看本节配套资源。</p>
                    )}
                    {safeResourceUrl(reader.item.resource_url) && (
                      <div className="opc-reader-resource">
                        {reader.item.type === "video" &&
                          /\.(mp4|webm|mov)(\?|$)/i.test(
                            reader.item.resource_url,
                          ) && (
                            <video
                              controls
                              preload="metadata"
                              src={safeResourceUrl(reader.item.resource_url)}
                            />
                          )}
                        <a
                          className="opc-button light"
                          href={safeResourceUrl(reader.item.resource_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          打开配套资源
                          <ArrowRight size={16} />
                        </a>
                      </div>
                    )}
                  </>
                )
              )}
              <footer className="opc-reader-footer">
                <span>
                  {model.user
                    ? "完成实践后，主动标记本节内容。"
                    : "当前为预览；登录后才能保存学习进度。"}
                </span>
                <button
                  className="opc-button purple"
                  disabled={
                    busy || reader.loading || !reader.item || completedInReader
                  }
                  onClick={async () => {
                    if (!model.user) return navigate("/login");
                    setBusy(true);
                    try {
                      await markProgress(modal.item, "completed");
                      notify("学习进度已保存");
                    } catch (e) {
                      notify(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {completedInReader ? "已完成" : "标记为已完成"}
                  <Check size={16} />
                </button>
              </footer>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
