import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Article,
  Bell,
  BookOpenText,
  Books,
  BracketsCurly,
  CaretDown,
  CaretRight,
  ChartLineUp,
  ChatCircleDots,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Code,
  Compass,
  CopySimple,
  Cube,
  DownloadSimple,
  FileText,
  Folder,
  Gauge,
  House,
  Lightning,
  LinkSimple,
  List,
  MagnifyingGlass,
  MapTrifold,
  NotePencil,
  PaperPlaneTilt,
  Package,
  Path,
  Play,
  Plus,
  Robot,
  Rocket,
  SlidersHorizontal,
  Sparkle,
  Target,
  TerminalWindow,
  Trophy,
  UserCircle,
  VideoCamera,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { AdminCatalog, AdminContent, AdminDashboard, AdminLogin, AdminOrders, AdminShell, AdminUsers } from "./Admin.jsx";
import { api, getToken, money } from "./api.js";
import { AuthPage, UserAuthCard } from "./Auth.jsx";

const learningPaths = [
  { icon: Sparkle, title: "AI 工具入门", desc: "掌握主流 AI 工具，建立高效工作方式", level: "入门", lessons: 12, progress: 80, color: "violet" },
  { icon: BracketsCurly, title: "AI 编程实战", desc: "用 Cursor 与 Claude Code 完成真实项目", level: "进阶", lessons: 18, progress: 35, color: "blue" },
  { icon: Robot, title: "AI 智能体开发", desc: "从零构建能思考、调用工具的智能体", level: "进阶", lessons: 16, progress: 65, color: "orange" },
  { icon: Path, title: "AI 工作流自动化", desc: "连接工具与数据，自动化重复工作", level: "实战", lessons: 10, progress: 10, color: "green" },
  { icon: Cube, title: "AI 产品从 0 到 1", desc: "从想法、原型到发布你的 AI 产品", level: "实战", lessons: 24, progress: 0, color: "coral" },
  { icon: ChartLineUp, title: "AI 产品增长", desc: "用 AI、内容与数据获得持续增长", level: "商业化", lessons: 14, progress: 0, color: "purple" },
];

const projects = [
  { title: "个人 AI 助手", desc: "可对话、可调用工具的智能助手", progress: 70, status: "进行中", icon: Robot, color: "violet" },
  { title: "智能文档助手", desc: "上传文档，自动分析和总结", progress: 45, status: "进行中", icon: FileText, color: "blue" },
  { title: "AI 写作助手", desc: "一键生成高质量文章和内容", progress: 100, status: "已完成", icon: NotePencil, color: "green" },
];

const resources = [
  { type: "模板", title: "AI 产品需求文档模板", desc: "从用户问题到 MVP 范围的完整模板", icon: FileText, color: "violet" },
  { type: "代码", title: "RAG 项目起步仓库", desc: "包含向量检索、引用和评估的基础代码", icon: Code, color: "blue" },
  { type: "工作流", title: "内容自动化工作流", desc: "从选题、创作到分发的一站式流程", icon: Path, color: "green" },
  { type: "Prompt", title: "AI 编程提示词手册", desc: "需求分析、调试与重构的常用提示词", icon: Sparkle, color: "orange" },
  { type: "指南", title: "AI 产品发布检查清单", desc: "上线前必须确认的产品、数据和增长事项", icon: Rocket, color: "coral" },
  { type: "案例", title: "独立开发者 AI SaaS 案例", desc: "从想法验证到首批付费用户的真实拆解", icon: ChartLineUp, color: "purple" },
];

function BrandMark() {
  return <img className="brand-mark" src="/assets/oneshowlearn-brandmark.png" alt="" aria-hidden="true" />;
}

function ProgressBar({ value, dark = false }) {
  return <span className={dark ? "ui-progress dark" : "ui-progress"}><i style={{ width: `${value}%` }} /></span>;
}

function IconBadge({ icon: Icon, color = "violet", size = 22 }) {
  return <span className={`feature-icon ${color}`}><Icon size={size} weight="duotone" /></span>;
}

function useRoute() {
  const [route, setRoute] = useState(window.location.pathname || "/");
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || "/");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next) => {
    if (next !== window.location.pathname) window.history.pushState({}, "", next);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [route, navigate];
}

function Toast({ text }) {
  if (!text) return null;
  return <div className="toast"><Check size={16} weight="bold" /> {text}</div>;
}

const sidebarItems = [
  { path: "/app", label: "学习首页", icon: House },
  { path: "/paths", label: "学习路径", icon: MapTrifold },
  { path: "/projects", label: "我的项目", icon: Folder },
  { path: "/tutor", label: "AI 导师", icon: Robot },
  { path: "/resources", label: "资源中心", icon: Books },
];

function AppShell({ route, navigate, children, onSearch }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => { if (getToken()) api("/auth/me").then(({ user }) => setCurrentUser(user)).catch(() => {}); }, []);
  const userName = currentUser?.name || "学习者";
  return (
    <div className="app-layout">
      <aside className={mobileNav ? "app-sidebar open" : "app-sidebar"}>
        <button className="app-brand" onClick={() => navigate("/")}><BrandMark /><span>OneShowLearn</span></button>
        <nav className="side-nav" aria-label="学习中心导航">
          {sidebarItems.map(({ path, label, icon: Icon }) => (
            <button key={path} className={route === path || (path === "/paths" && route.startsWith("/paths/")) ? "active" : ""} onClick={() => { navigate(path); setMobileNav(false); }}>
              <Icon size={20} weight="duotone" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-summary">
          <small>本周学习</small>
          <strong>4 小时 25 分</strong>
          <ProgressBar value={72} />
          <span>已完成 5 / 7 个任务</span>
        </div>
        <button className="side-profile" onClick={() => navigate("/app")}><img src="/assets/oneshowlearn-brandmark.png" alt="用户头像" /><span><strong>{userName}</strong><small>{currentUser ? "邮箱已验证" : "登录后保存学习进度"}</small></span><CaretRight size={16} /></button>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <button className="app-menu" aria-label={mobileNav ? "关闭学习中心导航" : "打开学习中心导航"} onClick={() => setMobileNav((value) => !value)}>{mobileNav ? <X size={22} /> : <List size={22} />}</button>
          <label className="global-search"><MagnifyingGlass size={18} /><input aria-label="搜索" placeholder="搜索学习路径、项目、资源…" onKeyDown={(event) => { if (event.key === "Enter") onSearch(event.currentTarget.value); }} /></label>
          <div className="top-actions"><button aria-label="通知"><Bell size={20} /></button><button className="user-chip" onClick={() => navigate(currentUser ? "/app" : "/login")}><img src="/assets/oneshowlearn-brandmark.png" alt="" /><span>{userName}</span><CaretDown size={14} /></button></div>
        </header>
        <div className="app-content">{children}</div>
      </section>
    </div>
  );
}

function LandingPage({ navigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main className="marketing-page">
      <section className="marketing-frame" aria-label="OneShowLearn 首页">
        <header className="marketing-nav">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><BrandMark /><span>OneShowLearn</span></button>
          <nav className={menuOpen ? "marketing-links open" : "marketing-links"} aria-label="主要导航">
            <button onClick={() => navigate("/paths")}>学习路径</button><button onClick={() => navigate("/projects")}>实战项目</button><button onClick={() => navigate("/tutor")}>AI 导师</button><button onClick={() => navigate("/resources")}>资源中心</button>
          </nav>
          <div className="marketing-actions"><button className="login" onClick={() => navigate("/login")}>登录</button><button className="start-small" onClick={() => navigate("/login")}>免费注册</button><button className="menu-button" aria-label={menuOpen ? "关闭导航" : "打开导航"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={22} /> : <List size={22} />}</button></div>
        </header>
        <section className="marketing-hero">
          <img className="marketing-hero-scene" src="/assets/oneshowlearn-hero.png" alt="学习者正在使用电脑实践 AI 项目" />
          <div className="marketing-hero-wash" aria-hidden="true" />
          <div className="marketing-copy">
            <span className="eyebrow"><Sparkle weight="fill" size={15} /> AI 应用学习平台</span>
            <h1><span>学会 AI。</span><span>用好 AI。</span><span>做出你的 AI 产品。</span></h1>
            <p>从工具到产品，用清晰的学习路径和真实项目，快速建立可以真正用在工作和产品中的 AI 能力。</p>
            <div className="hero-actions"><button className="primary-button" onClick={() => navigate("/paths")}>免费开始学习 <ArrowRight size={18} weight="bold" /></button><button className="secondary-button" onClick={() => navigate("/projects")}>看看能做什么</button></div>
            <div className="audience-line"><span><CheckCircle size={17} weight="fill" /> 适合零基础</span><span><CheckCircle size={17} weight="fill" /> 围绕真实项目</span><span><CheckCircle size={17} weight="fill" /> 学完即可展示</span></div>
          </div>
          <div className="marketing-scene-label"><IconBadge icon={Rocket} color="violet" size={19} /><span><small>项目式学习</small><strong>从第一个作品开始掌握 AI</strong></span></div>
        </section>

        <section className="marketing-values" aria-label="平台特色">
          <article><IconBadge icon={MapTrifold} color="violet" size={20} /><div><strong>清晰学习路径</strong><p>知道先学什么、接着做什么。</p></div></article>
          <article><IconBadge icon={TerminalWindow} color="blue" size={20} /><div><strong>真实项目实践</strong><p>每条路径都以可交付作品为目标。</p></div></article>
          <article><IconBadge icon={Robot} color="orange" size={20} /><div><strong>AI 导师陪练</strong><p>遇到问题时获得贴合当前任务的帮助。</p></div></article>
        </section>

        <section className="marketing-paths" id="paths">
          <div className="marketing-section-heading"><div><span className="section-kicker"><BookOpenText size={16} /> 从这里开始</span><h2>选择一条路径，做出一个作品</h2><p>不必一次学完所有 AI 知识，先从与你目标最接近的方向开始。</p></div><button onClick={() => navigate("/paths")}>查看全部路径 <ArrowRight size={17} /></button></div>
          <div className="marketing-path-grid">{learningPaths.map(({ icon, title, desc, lessons, level, color }) => <button className="marketing-path-card" key={title} onClick={() => navigate(title === "AI 编程实战" ? "/paths/ai-coding" : "/paths")}><div><IconBadge icon={icon} color={color} /><span>{level}</span></div><strong>{title}</strong><p>{desc}</p><small>{lessons} 节内容 · 项目实战</small><ArrowRight size={18} /></button>)}</div>
        </section>

        <section className="marketing-final-cta"><span className="section-kicker">Practice First</span><h2>别只看课程，开始做你的第一个 AI 项目。</h2><button className="primary-button" onClick={() => navigate("/paths")}>选择学习路径 <ArrowRight size={18} /></button></section>
      </section>
    </main>
  );
}

function Dashboard({ navigate }) {
  return (
    <>
      <div className="dashboard-heading"><div><span className="page-kicker">项目工作台</span><h2>继续你的 AI 项目</h2><p>每次完成一个清晰步骤，最终交付一个真正可用的作品。</p></div><div className="streak-card"><Rocket size={20} weight="fill" /><span><strong>目标：发布第一个 AI 网站</strong><small>当前已完成 4 / 12 个实践步骤</small></span></div></div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="surface continue-surface"><div className="section-row"><h3>当前项目包</h3><button onClick={() => navigate("/paths/ai-coding")}>查看项目路线 <CaretRight size={15} /></button></div><div className="continue-layout"><div className="current-course"><span className="course-label">AI 编程实战 · 项目 01</span><h3>用 Cursor 发布第一个网站</h3><p>最终成果：一个可公开访问的响应式网站</p><ProgressBar value={35} dark /><div><span>项目进度 35%</span><button onClick={() => navigate("/learn/cursor")}>继续实践 <ArrowRight size={16} /></button></div></div><div className="lesson-list"><small>下一步只做这 4 件事</small>{[[Article,"阅读：理解页面结构","8 分钟"],[Code,"复制 Prompt 生成首屏","15 分钟"],[CheckCircle,"完成响应式检查清单","10 分钟"],[VideoCamera,"观看关键操作演示","5 分钟"]].map(([Icon,label,time], index) => <button key={label} onClick={() => navigate("/learn/cursor")}><span><Icon size={15} weight="duotone" /> {String(index + 1).padStart(2, "0")} · {label}</span><small>{time}</small></button>)}</div></div></section>
          <section className="surface"><div className="section-row"><h3>我的实战路径</h3><button onClick={() => navigate("/paths")}>探索全部 <CaretRight size={15} /></button></div><div className="mini-path-grid">{learningPaths.slice(0, 4).map(({ icon, title, level, progress, color }, index) => <button key={title} className="mini-path" onClick={() => navigate(title === "AI 编程实战" ? "/paths/ai-coding" : "/paths")}><IconBadge icon={icon} color={color} size={20} /><strong>{title}</strong><small>{level} · {index === 0 ? 2 : 3} 个项目包</small><div><ProgressBar value={progress} /><span>{progress}%</span></div></button>)}</div></section>
          <section className="surface"><div className="section-row"><h3>最近项目</h3><button onClick={() => navigate("/projects")}>管理项目 <CaretRight size={15} /></button></div><div className="project-grid">{projects.map(({ title, desc, progress, status, icon, color }) => <button className="project-card" key={title} onClick={() => navigate("/projects")}><IconBadge icon={icon} color={color} /><span><strong>{title}</strong><small>{desc}</small></span><em className={status === "已完成" ? "done" : ""}>{status}</em><div><ProgressBar value={progress} /><b>{progress}%</b></div></button>)}</div></section>
        </div>
        <aside className="dashboard-aside"><section className="surface aside-card"><div className="aside-title"><IconBadge icon={Robot} size={19} /><div><strong>AI 项目导师</strong><small>基于当前步骤提供指导</small></div></div><button className="soft-action" onClick={() => navigate("/tutor")}>带着问题去提问 <ArrowRight size={15} /></button></section><section className="surface aside-card"><h3>下一步任务</h3><p className="next-task-copy">使用准备好的 Prompt，让 Cursor 生成网站首屏结构。</p><button className="black-button wide" onClick={() => navigate("/learn/cursor")}>进入实践 <ArrowRight size={15} /></button></section><section className="surface aside-card next-milestone"><Target size={24} /><strong>本项目交付成果</strong><p>一个可公开访问、适配手机的个人网站</p><ProgressBar value={35} /></section></aside>
      </div>
    </>
  );
}

const pathIconMap = { "ai-tools": Sparkle, "ai-coding": BracketsCurly, "ai-agent": Robot, "ai-workflow": Path, "ai-product": Cube, "ai-growth": ChartLineUp };
const pathColorMap = { "ai-tools": "violet", "ai-coding": "blue", "ai-agent": "orange", "ai-workflow": "green", "ai-product": "coral", "ai-growth": "purple" };

function PathsPage({ navigate }) {
  const [filter, setFilter] = useState("全部");
  const [catalog, setCatalog] = useState(null);
  useEffect(() => { api("/catalog/paths").then(({ items }) => setCatalog(items)).catch(() => {}); }, []);
  const source = catalog ? catalog.map((item, index) => ({ ...item, icon: pathIconMap[item.slug] || Sparkle, desc: item.description, progress: learningPaths[index]?.progress || 0, color: pathColorMap[item.slug] || "violet" })) : learningPaths;
  const visible = filter === "全部" ? source : source.filter((item) => item.level === filter);
  return <><div className="page-heading"><div><span className="page-kicker">从目标出发完成真实作品</span><h2>实战路径</h2><p>每条路径由多个项目包组成，文档、工具和任务共同帮助你交付成果。</p></div><button className="black-button" onClick={() => navigate("/paths/ai-coding")}>继续当前项目 <ArrowRight size={16} /></button></div><div className="filter-row"><SlidersHorizontal size={18} />{["全部", "入门", "进阶", "实战", "商业化"].map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="catalog-grid">{visible.map(({ icon, title, desc, level, progress, color, slug, pack_count, starting_price_cents }, index) => <button className="catalog-card" key={title} onClick={() => navigate(slug ? `/paths/${slug}` : title === "AI 编程实战" ? "/paths/ai-coding" : "/paths")}><div className="catalog-top"><IconBadge icon={icon} color={color} /><span>{level}</span></div><h3>{title}</h3><p>{desc}</p><small>{pack_count || (index === 0 ? "2" : "3")} 个项目包 · {starting_price_cents ? `${money(starting_price_cents)} 起` : "可免费预览"}</small><div className="catalog-progress"><ProgressBar value={progress} /><span>{progress ? `${progress}%` : "未开始"}</span></div><span className="catalog-cta">查看项目包 <ArrowRight size={16} /></span></button>)}</div></>;
}

function ProductPackPage({ slug, navigate, notify }) {
  const [pack, setPack] = useState(null); const [error, setError] = useState(""); const [authOpen, setAuthOpen] = useState(false); const [busy, setBusy] = useState(false);
  const load = () => api(`/project-packs/${slug}`).then(setPack).catch((e) => setError(e.message)); useEffect(() => { load(); }, [slug]);
  const buy = async () => { if (!getToken()) return setAuthOpen(true); setBusy(true); try { const order = await api("/orders", { method: "POST", body: JSON.stringify({ productId: pack.product_id }) }); notify(`订单 ${order.orderNo} 已创建，请完成支付`); navigate("/app"); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  if (error && !pack) return <div className="empty-state"><h3>{error}</h3><button className="black-button" onClick={() => navigate("/paths")}>返回学习路径</button></div>;
  if (!pack) return <div className="empty-state"><p>正在加载项目包…</p></div>;
  const previewCount = pack.steps.reduce((sum, step) => sum + step.contents.filter((item) => item.is_preview).length, 0);
  return <><button className="back-link" onClick={() => navigate(`/paths/${pack.path_slug}`)}><ArrowLeft size={16}/> 返回{pack.path_title}</button><div className="pack-sales"><section><span className="page-kicker">{pack.path_title} · 项目包</span><h2>{pack.title}</h2><p className="pack-subtitle">{pack.subtitle}</p><p>{pack.description}</p><div className="project-content-mix"><span>60% 实战文档</span><span>20% Prompt / 代码 / 模板</span><span>10% 任务清单</span><span>10% 短视频</span></div><div className="pack-outcome"><Target size={22}/><span><small>完成后你将得到</small><strong>{pack.deliverable}</strong></span></div><h3>项目步骤与资料</h3><div className="pack-steps">{pack.steps.map((step,index)=><article key={step.id}><span>{index+1}</span><div><strong>{step.title}</strong><small>{step.summary}</small><p>{step.contents.map(item=>item.title).join(" · ")}</p></div><em>{step.contents.some(item=>item.locked)?"购买后解锁":step.contents.length?"可预览":"待更新"}</em></article>)}</div></section><aside className="surface pack-buy"><img src={pack.cover_url||"/assets/cursor-practice-preview.png"} alt="项目成果预览"/><span>{pack.entitled?"你已拥有此项目包":`${previewCount} 份资料可免费预览`}</span><strong>{pack.entitled?"已解锁":money(pack.product_price_cents||pack.price_cents)}</strong><p>一次购买，永久访问当前版本及后续内容更新。</p><button className="black-button wide" disabled={busy} onClick={()=>pack.entitled?navigate("/learn/cursor"):buy()}>{pack.entitled?"进入项目学习":"立即购买"}<ArrowRight size={16}/></button><small>安全订单 · 支付成功后自动开通学习权限</small></aside></div>{authOpen&&<div className="modal-backdrop auth-modal-backdrop" onMouseDown={()=>setAuthOpen(false)}><div onMouseDown={e=>e.stopPropagation()}><UserAuthCard initialMode="login" onClose={()=>setAuthOpen(false)} onSuccess={()=>{setAuthOpen(false);load();notify("登录成功，可以继续购买");}}/></div></div>}</>;
}

function PathDetail({ navigate }) {
  const milestones = [
    { title: "用 Cursor 发布第一个网站", desc: "从空文件夹开始，用 AI 完成页面、响应式优化与上线。", deliverable: "可公开访问的响应式网站", skills: "Cursor · Prompt · 前端基础", status: "4 / 12 步完成", icon: BracketsCurly },
    { title: "做出个人 AI 助手", desc: "完成对话界面、模型接入和基础工具调用。", deliverable: "可对话的 AI 助手（Web）", skills: "接口调用 · 对话 UI · Function Calling", status: "未开始", icon: ChatCircleDots },
    { title: "发布一个 AI 产品", desc: "补齐部署、产品说明和发布检查，让真实用户可以使用。", deliverable: "已发布的 AI 应用", skills: "部署上线 · 产品打磨 · 数据反馈", status: "未开始", icon: Rocket },
  ];
  return <><button className="back-link" onClick={() => navigate("/paths")}><ArrowLeft size={16} /> 返回实战路径</button><div className="path-detail-header"><div className="path-title"><IconBadge icon={BracketsCurly} color="violet" size={28} /><div><span className="page-kicker">项目驱动实战路径</span><h2>AI 编程实战</h2><p>不从知识点开始，从要做出的作品开始。</p></div></div><div className="path-promise"><p>通过 3 个递进项目包，完成从 AI 编程入门到产品发布的完整实践。</p><span><Target size={18} /> 完成后获得 3 个可展示成果</span></div></div><div className="path-detail-grid"><section className="surface milestone-list">{milestones.map(({ title, desc, deliverable, skills, status, icon: Icon }, index) => <button className="milestone" key={title} onClick={() => index === 0 && navigate("/learn/cursor")}><span className="milestone-number">{index + 1}</span><IconBadge icon={Icon} color={index === 0 ? "violet" : index === 1 ? "blue" : "coral"} /><div className="milestone-copy"><h3>{title}</h3><p>{desc}</p><div><span><Cube size={15} /> <small>交付成果</small><b>{deliverable}</b></span><span><Code size={15} /> <small>包含内容</small><b>文档 · Prompt · 代码 · 视频</b></span><span><CheckCircle size={15} /> <small>项目状态</small><b>{status}</b></span></div></div><CaretRight size={20} /></button>)}</section><aside className="path-current"><section className="surface current-project"><div className="section-row"><span className="page-kicker">当前项目包</span><em>已解锁</em></div><h3>用 Cursor 发布第一个网站</h3><img src="/assets/cursor-practice-preview.png" alt="Cursor 网站项目成果预览" /><div className="project-content-mix"><span>60% 文档</span><span>20% 工具</span><span>10% 任务</span><span>10% 视频</span></div><div className="project-progress-label"><span>项目进度</span><b>35%</b></div><ProgressBar value={35} /><h4>下一步：生成网站首屏</h4><p>阅读操作步骤，复制 Prompt，并在检查清单中确认结果。</p><button className="black-button wide" onClick={() => navigate("/learn/cursor")}>继续实践 <ArrowRight size={16} /></button></section><section className="surface tutor-promo"><IconBadge icon={Robot} size={18} /><div><strong>AI 项目导师</strong><p>根据当前步骤、代码和问题提供帮助。</p></div><button onClick={() => navigate("/tutor")}>带着问题去提问 <CaretRight size={16} /></button></section></aside></div></>;
}

function GenericPathDetail({ slug, navigate }) {
  const [path, setPath] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/catalog/paths/${slug}`).then(setPath).catch((e) => setError(e.message)); }, [slug]);
  if (error) return <div className="empty-state"><h3>{error}</h3><button className="black-button" onClick={() => navigate("/paths")}>返回实战路径</button></div>;
  if (!path) return <div className="empty-state"><p>正在加载学习路径…</p></div>;
  const Icon = pathIconMap[path.slug] || Sparkle;
  return <><button className="back-link" onClick={() => navigate("/paths")}><ArrowLeft size={16}/> 返回实战路径</button><div className="path-detail-header"><div className="path-title"><IconBadge icon={Icon} color={pathColorMap[path.slug]} size={28}/><div><span className="page-kicker">项目驱动实战路径</span><h2>{path.title}</h2><p>{path.description}</p></div></div><div className="path-promise"><p>选择一个可交付成果明确的项目包，从实践开始掌握能力。</p><span><Target size={18}/> 文档为主，配套工具、任务与短视频</span></div></div><section className="surface path-pack-catalog"><div className="section-row"><h3>项目包</h3><small>{path.packs.length} 个可选项目</small></div>{path.packs.map((pack,index)=><button className="milestone" key={pack.id} onClick={()=>navigate(`/packs/${pack.slug}`)}><span className="milestone-number">{index+1}</span><IconBadge icon={Cube} color={pathColorMap[path.slug]}/><div className="milestone-copy"><h3>{pack.title}</h3><p>{pack.description}</p><div><span><Target size={15}/><small>交付成果</small><b>{pack.deliverable}</b></span><span><Clock size={15}/><small>预计投入</small><b>{Math.ceil(pack.estimated_minutes/60)} 小时</b></span><span><Package size={15}/><small>项目包价格</small><b>{money(pack.product_price_cents||pack.price_cents)}</b></span></div></div><CaretRight size={20}/></button>)}</section></>;
}

function LearningWorkspace({ navigate, notify }) {
  const [tasks, setTasks] = useState([false, false, false]);
  const [configuredPack, setConfiguredPack] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [activeContent, setActiveContent] = useState("document");
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => { api("/project-packs/cursor-first-site").then(setConfiguredPack).catch(() => {}); }, []);
  const configuredStep = configuredPack?.steps?.[1];
  const configuredContents = configuredStep?.contents || [];
  const configured = (type) => configuredContents.find((item) => item.type === type && !item.locked);
  const documentItem = configured("document"); const promptItem = configured("prompt"); const checklistItem = configured("checklist"); const videoItem = configured("video");
  const checklistLines = checklistItem?.body?.split("\n").filter(Boolean) || ["浏览器中能正常打开页面", "首屏包含主标题与主要按钮", "手机宽度下没有横向滚动"];
  useEffect(() => { setTasks(checklistLines.map(() => false)); }, [checklistItem?.id]);
  const completed = tasks.filter(Boolean).length;
  const toggle = (index) => setTasks((current) => current.map((value, idx) => idx === index ? !value : value));
  const sendQuestion = () => { if (!question.trim()) return; setAnswer("先把首屏拆成导航、主标题、行动按钮和成果预览四部分，再把下方 Prompt 复制给 Cursor。生成后用检查清单确认移动端宽度、按钮尺寸和文字层级。"); setQuestion(""); };
  const contentTabs = [["document", Article, "实战文档", "60%"], ["toolkit", Code, "Prompt 与代码", "20%"], ["tasks", CheckCircle, "任务清单", "10%"], ["video", VideoCamera, "短视频", "10%"]];
  return <div className="learning-shell"><header className="learning-topbar"><button className="app-brand" onClick={() => navigate("/")}><BrandMark /><span>OneShowLearn</span></button><div><span><strong>{configuredPack?.title || "用 Cursor 发布第一个网站"}</strong><small>项目进度 {35 + completed * 5}%</small></span><ProgressBar value={35 + completed * 5} /></div><button className="outline-button" onClick={() => navigate("/paths/ai-coding")}>退出项目</button></header><div className="learning-layout"><aside className="module-sidebar"><span className="page-kicker">项目步骤</span>{(configuredPack?.steps?.map((item)=>item.title) || ["准备项目与目标", "生成网站首屏", "完成响应式优化", "发布到线上", "成果验收"]).map((item, index) => <button className={index === 1 ? "active" : ""} key={item}><span>{index + 1}</span><div><strong>{item}</strong><small>{index === 0 ? "已完成" : index === 1 ? `进行中 · ${configuredContents.length || 4} 个内容` : "未开始"}</small></div>{index === 1 && <Circle size={8} weight="fill" />}</button>)}<button className="outline-button module-map" onClick={() => navigate("/paths/ai-coding")}><MapTrifold size={17} /> 查看完整项目包</button></aside><main className="lesson-main"><span className="lesson-current">项目 01 · 步骤 02</span><h2>{configuredStep?.title || "生成网站首屏"}</h2><p className="lesson-lead">{configuredStep?.summary || "完成这一阶段后，你将得到一个包含导航、主标题、行动按钮和成果展示的可预览首屏。"}</p><div className="content-mix-tabs" role="tablist" aria-label="项目内容类型">{contentTabs.map(([id, Icon, label, percent]) => <button role="tab" aria-selected={activeContent === id} className={activeContent === id ? "active" : ""} key={id} onClick={() => setActiveContent(id)}><Icon size={18} weight="duotone" /><span><strong>{label}</strong><small>{percent}</small></span></button>)}</div><section className="project-content-panel">
    {activeContent === "document" && <article className="document-content"><span className="content-label">实战文档 · 预计 8 分钟</span><h3>{documentItem?.title || "先让 AI 理解你要做的页面"}</h3>{(documentItem?.body || "不要一上来就让 Cursor 随便生成网站。先写清楚页面目标、目标用户、核心动作和必须包含的模块。\n\n1. 建立项目文件夹\n2. 描述最终成果\n3. 生成第一版首屏").split("\n\n").map((paragraph)=><p key={paragraph}>{paragraph}</p>)}<div className="document-note"><Target size={20} /><span><strong>完成标准</strong><small>页面包含导航、清晰主标题、一个主要按钮，并能在浏览器中正常打开。</small></span></div><button className="black-button" onClick={() => setActiveContent("toolkit")}>下一步：使用项目 Prompt <ArrowRight size={16} /></button></article>}
    {activeContent === "toolkit" && <article className="toolkit-content"><span className="content-label">Prompt、代码与模板 · 拿来就用</span><h3>{promptItem?.title || "把这段需求交给 Cursor"}</h3><div className="copy-block"><div><span>项目 Prompt</span><button onClick={() => { navigator.clipboard?.writeText(promptItem?.body || ""); notify("项目 Prompt 已复制"); }}><CopySimple size={16} /> 复制</button></div><pre>{promptItem?.body || "登录并购买项目包后，可在这里读取后台配置的完整 Prompt。"}</pre></div><div className="tool-downloads"><button onClick={() => notify("起步代码已打开")}><Code size={20} /><span><strong>起步代码</strong><small>后台配置的代码附件</small></span><CaretRight size={16} /></button><button onClick={() => notify("页面结构模板已打开")}><FileText size={20} /><span><strong>页面结构模板</strong><small>后台配置的项目模板</small></span><CaretRight size={16} /></button></div><button className="black-button" onClick={() => setActiveContent("tasks")}>代码生成后，开始检查 <ArrowRight size={16} /></button></article>}
    {activeContent === "tasks" && <article className="checklist-content"><div className="practice-title"><div><span className="content-label">实践任务 · 完成后推进项目</span><h3>{checklistItem?.title || "检查你的首屏成果"}</h3></div><span>已完成 {completed} / {checklistLines.length}</span></div>{checklistLines.map((task, index) => <button className={tasks[index] ? "practice-task done" : "practice-task"} key={task} onClick={() => toggle(index)}><span>{tasks[index] ? <CheckCircle size={22} weight="fill" /> : <span className="task-index">{index + 1}</span>}</span><div><strong>{task}</strong><small>完成后勾选，学习进度会保存到你的账号。</small></div></button>)}<button className="black-button practice-start" disabled={completed < checklistLines.length} onClick={() => { notify("步骤 02 已完成，可以进入响应式优化"); }}>完成本步骤 <ArrowRight size={16} /></button></article>}
    {activeContent === "video" && <article className="video-content"><span className="content-label">关键操作短视频 · {videoItem?.duration_seconds ? `${Math.ceil(videoItem.duration_seconds/60)} 分钟` : "04:32"}</span><h3>{videoItem?.title || "看一次完整的首屏生成过程"}</h3><button className={videoPlaying ? "video-card playing" : "video-card"} onClick={() => setVideoPlaying((value) => !value)}><img src="/assets/cursor-practice-preview.png" alt="Cursor 生成网站首屏操作演示" /><span><Play size={24} weight="fill" /> {videoPlaying ? "演示播放中 · 点击暂停" : "播放关键操作演示"}</span></button><p>{videoItem?.body || "视频只演示容易卡住的操作。具体 Prompt、代码和检查项仍以可复制文档为准。"}</p><button className="black-button" onClick={() => setActiveContent("tasks")}>看完后检查成果 <ArrowRight size={16} /></button></article>}
  </section></main><aside className="lesson-aside"><section><div className="aside-title"><IconBadge icon={Robot} size={18} /><div><strong>AI 项目导师</strong><small>已了解：步骤 02 · 生成网站首屏</small></div></div>{answer && <div className="inline-tutor-answer"><Robot size={17} /><p>{answer}</p></div>}<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="描述你遇到的问题…" aria-label="向 AI 导师提问" /><button aria-label="发送问题" onClick={sendQuestion}><PaperPlaneTilt size={17} /></button><small className="suggest-label">基于当前步骤提问</small>{["Cursor 生成的页面太普通怎么办？", "如何检查手机端有没有溢出？", "帮我优化这段首页 Prompt"].map((item) => <button className="suggestion" key={item} onClick={() => setQuestion(item)}>{item}<ArrowRight size={14} /></button>)}</section><section className="lesson-resources"><h3>项目包资源</h3>{[[Code, "起步代码"], [FileText, "项目需求模板"], [Article, "成果检查清单"], [DownloadSimple, "下载全部资料"]].map(([Icon, label]) => <button key={label} onClick={() => notify(`已打开「${label}」`)}><Icon size={17} /> {label}<CaretRight size={14} /></button>)}</section></aside></div></div>;
}

function ProjectsPage({ navigate, notify }) {
  const [creating, setCreating] = useState(false);
  return <><div className="page-heading"><div><span className="page-kicker">用作品证明能力</span><h2>我的项目</h2><p>管理正在构建和已经发布的 AI 产品。</p></div><button className="black-button" onClick={() => setCreating(true)}><Plus size={17} /> 创建新项目</button></div><div className="projects-board">{projects.map(({ title, desc, progress, status, icon, color }, index) => <article className="big-project-card" key={title}><div className="project-card-top"><IconBadge icon={icon} color={color} /><em className={status === "已完成" ? "done" : ""}>{status}</em></div><h3>{title}</h3><p>{desc}</p><div className="project-tags"><span>{["对话 UI", "文档解析", "内容生成"][index]}</span><span>{["API 调用", "RAG", "Prompt 工程"][index]}</span></div><div className="project-progress-label"><span>项目进度</span><b>{progress}%</b></div><ProgressBar value={progress} /><button onClick={() => index === 0 ? navigate("/learn/cursor") : notify(`已打开「${title}」`)}>{progress === 100 ? "查看成果" : "继续开发"}<ArrowRight size={16} /></button></article>)}<button className="new-project-card" onClick={() => setCreating(true)}><Plus size={26} /><strong>创建新项目</strong><span>从一个真实问题开始</span></button></div>{creating && <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreating(false)}><section className="create-modal" role="dialog" aria-modal="true" aria-label="创建新项目" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setCreating(false)}><X size={20} /></button><IconBadge icon={Rocket} color="violet" /><h3>创建新项目</h3><p>用一句话描述你想解决的问题。</p><label>项目名称<input placeholder="例如：我的 AI 面试教练" /></label><label>项目目标<textarea placeholder="我希望帮助……" /></label><button className="black-button wide" onClick={() => { setCreating(false); notify("项目已创建，可以开始规划了"); }}>创建并开始规划</button></section></div>}</>;
}

function TutorPage({ notify }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: "你好，我是 OneShowLearn AI 导师。告诉我你正在做什么项目，或遇到了什么问题。" }]);
  const [value, setValue] = useState("");
  const send = (text = value) => { if (!text.trim()) return; setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: "建议你先把目标拆成一个最小可验证任务。我已经为你整理了下一步：完成页面结构、预览效果，再用自然语言迭代。" }]); setValue(""); notify("AI 导师已生成项目建议"); };
  return <div className="tutor-page"><aside className="tutor-context"><span className="page-kicker">当前学习上下文</span><h3>AI 编程实战</h3><p>项目 1 · 个人 AI 助手</p><ProgressBar value={35} /><div className="context-list"><button className="active"><ChatCircleDots size={18} /> 当前对话</button><button><BookOpenText size={18} /> 学习计划</button><button><Target size={18} /> 项目里程碑</button></div></aside><main className="tutor-chat"><div className="tutor-heading"><IconBadge icon={Robot} size={24} /><div><h2>AI 导师</h2><p>基于你的学习路径和项目进度提供建议</p></div></div><div className="messages">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`message ${message.role}`}><span>{message.role === "assistant" ? <Robot size={18} /> : <UserCircle size={18} />}</span><p>{message.text}</p></div>)}</div><div className="quick-prompts">{["帮我拆解当前任务", "检查我的项目思路", "解释 Cursor 的工作方式"].map((item) => <button key={item} onClick={() => send(item)}>{item}</button>)}</div><div className="composer"><textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="输入你的问题，按 Enter 发送…" /><button aria-label="发送" onClick={() => send()}><PaperPlaneTilt size={20} /></button></div></main></div>;
}

function ResourcesPage({ notify }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("全部");
  const visible = useMemo(() => resources.filter((item) => (type === "全部" || item.type === type) && `${item.title}${item.desc}`.includes(query)), [query, type]);
  return <><div className="page-heading"><div><span className="page-kicker">拿来就用的实践资料</span><h2>资源中心</h2><p>Prompt、模板、代码与工作流，帮助你更快完成项目。</p></div></div><div className="resource-tools"><label><MagnifyingGlass size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资源…" /></label><div>{["全部", "模板", "代码", "工作流", "Prompt", "指南", "案例"].map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{item}</button>)}</div></div><div className="resource-grid">{visible.map(({ type: resourceType, title, desc, icon, color }) => <article className="resource-card" key={title}><IconBadge icon={icon} color={color} /><span className="resource-type">{resourceType}</span><h3>{title}</h3><p>{desc}</p><div><button onClick={() => notify(`正在预览「${title}」`)}>预览</button><button aria-label={`下载${title}`} onClick={() => notify(`「${title}」已加入下载队列`)}><DownloadSimple size={18} /></button></div></article>)}</div>{visible.length === 0 && <div className="empty-state"><MagnifyingGlass size={30} /><h3>没有找到相关资源</h3><p>试试更短的关键词或切换资源类型。</p></div>}</>;
}

export function App() {
  const [route, navigate] = useRoute();
  const [toast, setToast] = useState("");
  const notify = (text) => setToast(text);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(timer); }, [toast]);

  let content;
  if (route === "/") content = <LandingPage navigate={navigate} notify={notify} />;
  else if (route === "/login" || route === "/register" || route === "/forgot-password") content = <AuthPage navigate={navigate} initialMode={route === "/register" ? "register" : route === "/forgot-password" ? "forgot" : "login"} />;
  else if (route === "/admin/login") content = <AdminLogin navigate={navigate} />;
  else if (route.startsWith("/admin")) {
    if (!getToken()) content = <AdminLogin navigate={navigate} />;
    else {
      const adminPage = route === "/admin/catalog" ? <AdminCatalog /> : route === "/admin/content" ? <AdminContent /> : route === "/admin/orders" ? <AdminOrders /> : route === "/admin/users" ? <AdminUsers /> : <AdminDashboard />;
      content = <AdminShell route={route} navigate={navigate}>{adminPage}</AdminShell>;
    }
  }
  else if (route === "/learn/cursor") content = <LearningWorkspace navigate={navigate} notify={notify} />;
  else {
    const page = route === "/app" ? <Dashboard navigate={navigate} /> : route === "/paths" ? <PathsPage navigate={navigate} /> : route === "/paths/ai-coding" ? <PathDetail navigate={navigate} /> : route.startsWith("/paths/") ? <GenericPathDetail slug={route.split("/")[2]} navigate={navigate} /> : route.startsWith("/packs/") ? <ProductPackPage slug={route.split("/")[2]} navigate={navigate} notify={notify} /> : route === "/projects" ? <ProjectsPage navigate={navigate} notify={notify} /> : route === "/tutor" ? <TutorPage notify={notify} /> : route === "/resources" ? <ResourcesPage notify={notify} /> : <Dashboard navigate={navigate} />;
    content = <AppShell route={route} navigate={navigate} onSearch={(query) => { if (query.trim()) { notify(`正在搜索“${query}”`); navigate("/resources"); } }}>{page}</AppShell>;
  }
  return <>{content}<Toast text={toast} /></>;
}
