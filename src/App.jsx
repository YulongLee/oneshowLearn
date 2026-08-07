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
        <button className="side-profile" onClick={() => navigate("/app")}><img src="/assets/oneshowlearn-brandmark.png" alt="用户头像" /><span><strong>Yulong</strong><small>持续学习第 12 天</small></span><CaretRight size={16} /></button>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <button className="app-menu" aria-label={mobileNav ? "关闭学习中心导航" : "打开学习中心导航"} onClick={() => setMobileNav((value) => !value)}>{mobileNav ? <X size={22} /> : <List size={22} />}</button>
          <label className="global-search"><MagnifyingGlass size={18} /><input aria-label="搜索" placeholder="搜索学习路径、项目、资源…" onKeyDown={(event) => { if (event.key === "Enter") onSearch(event.currentTarget.value); }} /></label>
          <div className="top-actions"><button aria-label="通知"><Bell size={20} /></button><button className="user-chip" onClick={() => navigate("/app")}><img src="/assets/oneshowlearn-brandmark.png" alt="" /><span>Yulong</span><CaretDown size={14} /></button></div>
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
          <div className="marketing-actions"><button className="login" onClick={() => navigate("/app")}>登录</button><button className="start-small" onClick={() => navigate("/paths")}>免费开始</button><button className="menu-button" aria-label={menuOpen ? "关闭导航" : "打开导航"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={22} /> : <List size={22} />}</button></div>
        </header>
        <section className="marketing-hero">
          <div className="marketing-copy">
            <span className="eyebrow"><Sparkle weight="fill" size={15} /> AI 应用学习平台</span>
            <h1><span>学会 AI。</span><span>用好 AI。</span><span>做出你的 AI 产品。</span></h1>
            <p>从工具到产品，用清晰的学习路径和真实项目，快速建立可以真正用在工作和产品中的 AI 能力。</p>
            <div className="hero-actions"><button className="primary-button" onClick={() => navigate("/paths")}>免费开始学习 <ArrowRight size={18} weight="bold" /></button><button className="secondary-button" onClick={() => navigate("/projects")}>看看能做什么</button></div>
            <div className="audience-line"><span><CheckCircle size={17} weight="fill" /> 适合零基础</span><span><CheckCircle size={17} weight="fill" /> 围绕真实项目</span><span><CheckCircle size={17} weight="fill" /> 学完即可展示</span></div>
          </div>
          <figure className="marketing-visual">
            <img src="/assets/oneshowlearn-person-cutout-v2-clean.png" alt="学习者正在使用电脑实践 AI 项目" />
            <figcaption><IconBadge icon={Rocket} color="violet" size={19} /><span><small>项目式学习</small><strong>从第一个作品开始掌握 AI</strong></span></figcaption>
          </figure>
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
      <div className="dashboard-heading"><div><span className="page-kicker">欢迎回来</span><h2>嗨，Yulong</h2><p>今天继续向你的第一个 AI 产品前进。</p></div><div className="streak-card"><Lightning size={20} weight="fill" /><span><strong>连续学习 12 天</strong><small>本周已完成 5 / 7 个任务</small></span></div></div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="surface continue-surface"><div className="section-row"><h3>继续学习</h3><button onClick={() => navigate("/paths/ai-coding")}>查看完整路径 <CaretRight size={15} /></button></div><div className="continue-layout"><div className="current-course"><span className="course-label">当前路径</span><h3>AI 编程实战</h3><p>项目 1 · 个人 AI 助手</p><ProgressBar value={35} dark /><div><span>整体进度 35%</span><button onClick={() => navigate("/learn/cursor")}>继续学习 <ArrowRight size={16} /></button></div></div><div className="lesson-list"><small>上次学到</small>{["认识 Cursor 与核心能力", "生成页面结构与样式", "预览并调整效果", "保存并发布到本地"].map((lesson, index) => <button key={lesson} onClick={() => navigate("/learn/cursor")}><span><Play size={14} weight="fill" /> {String(index + 1).padStart(2, "0")} · {lesson}</span><small>{["15", "30", "20", "15"][index]} 分钟</small></button>)}</div></div></section>
          <section className="surface"><div className="section-row"><h3>我的学习路径</h3><button onClick={() => navigate("/paths")}>查看全部 <CaretRight size={15} /></button></div><div className="mini-path-grid">{learningPaths.slice(0, 4).map(({ icon, title, level, lessons, progress, color }) => <button key={title} className="mini-path" onClick={() => navigate(title === "AI 编程实战" ? "/paths/ai-coding" : "/paths")}><IconBadge icon={icon} color={color} size={20} /><strong>{title}</strong><small>{level} · {lessons} 节</small><div><ProgressBar value={progress} /><span>{progress}%</span></div></button>)}</div></section>
          <section className="surface"><div className="section-row"><h3>最近项目</h3><button onClick={() => navigate("/projects")}>管理项目 <CaretRight size={15} /></button></div><div className="project-grid">{projects.map(({ title, desc, progress, status, icon, color }) => <button className="project-card" key={title} onClick={() => navigate("/projects")}><IconBadge icon={icon} color={color} /><span><strong>{title}</strong><small>{desc}</small></span><em className={status === "已完成" ? "done" : ""}>{status}</em><div><ProgressBar value={progress} /><b>{progress}%</b></div></button>)}</div></section>
        </div>
        <aside className="dashboard-aside"><section className="surface aside-card"><div className="aside-title"><IconBadge icon={Robot} size={19} /><div><strong>AI 导师</strong><small>获得项目级学习指导</small></div></div><button className="soft-action" onClick={() => navigate("/tutor")}>开始对话 <ArrowRight size={15} /></button></section><section className="surface aside-card"><h3>今日任务</h3>{["完成网页首屏结构", "用 AI 优化页面文案", "预览并记录问题"].map((task, index) => <label className="task-check" key={task}><input type="checkbox" defaultChecked={index < 1} /><span>{task}</span></label>)}<button className="text-action" onClick={() => navigate("/learn/cursor")}>进入实践任务</button></section><section className="surface aside-card next-milestone"><Target size={24} /><strong>本周里程碑</strong><p>发布你的第一个响应式网页</p><ProgressBar value={60} /></section></aside>
      </div>
    </>
  );
}

function PathsPage({ navigate }) {
  const [filter, setFilter] = useState("全部");
  const visible = filter === "全部" ? learningPaths : learningPaths.filter((item) => item.level === filter);
  return <><div className="page-heading"><div><span className="page-kicker">循序渐进地掌握 AI</span><h2>学习路径</h2><p>从能力目标出发，通过真实项目建立可以迁移的 AI 应用能力。</p></div><button className="black-button" onClick={() => navigate("/paths/ai-coding")}>继续当前路径 <ArrowRight size={16} /></button></div><div className="filter-row"><SlidersHorizontal size={18} />{["全部", "入门", "进阶", "实战"].map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="catalog-grid">{visible.map(({ icon, title, desc, level, lessons, progress, color }) => <button className="catalog-card" key={title} onClick={() => navigate(title === "AI 编程实战" ? "/paths/ai-coding" : "/paths")}><div className="catalog-top"><IconBadge icon={icon} color={color} /><span>{level}</span></div><h3>{title}</h3><p>{desc}</p><small>{lessons} 节内容 · {title.includes("工具") ? "2" : "3"} 个项目</small><div className="catalog-progress"><ProgressBar value={progress} /><span>{progress ? `${progress}%` : "未开始"}</span></div><span className="catalog-cta">查看路径 <ArrowRight size={16} /></span></button>)}</div></>;
}

function PathDetail({ navigate }) {
  const milestones = [
    { title: "做出个人 AI 助手", desc: "搭建基础对话能力，让你的 AI 助手能听懂并回应用户。", deliverable: "可对话的 AI 助手（Web）", skills: "Prompt 工程 · 接口调用 · 前端对话 UI", status: "2 / 3 里程碑完成", icon: ChatCircleDots },
    { title: "连接知识库", desc: "让 AI 能从你的知识库中检索信息，给出准确、可溯源的回答。", deliverable: "可检索知识库 + 引用来源", skills: "向量数据库 · 检索增强 · 内容处理", status: "0 / 3 里程碑完成", icon: Books },
    { title: "发布你的 AI 应用", desc: "完成部署与发布，让更多人真正使用你的 AI 产品。", deliverable: "已发布的 AI 应用", skills: "部署上线 · 域名配置 · 监控优化", status: "0 / 3 里程碑完成", icon: Rocket },
  ];
  return <><button className="back-link" onClick={() => navigate("/paths")}><ArrowLeft size={16} /> 返回学习路径</button><div className="path-detail-header"><div className="path-title"><IconBadge icon={BracketsCurly} color="violet" size={28} /><div><span className="page-kicker">项目驱动学习路径</span><h2>AI 编程实战</h2><p>边做项目，边掌握 AI 编程。</p></div></div><div className="path-promise"><p>从 0 到 1 构建并发布属于你的 AI 应用，掌握真实开发流程与实战技能。</p><span><Target size={18} /> 你将完成 3 个可展示项目</span></div></div><div className="path-detail-grid"><section className="surface milestone-list">{milestones.map(({ title, desc, deliverable, skills, status, icon: Icon }, index) => <button className="milestone" key={title} onClick={() => index === 0 && navigate("/learn/cursor")}><span className="milestone-number">{index + 1}</span><IconBadge icon={Icon} color={index === 0 ? "violet" : index === 1 ? "blue" : "coral"} /><div className="milestone-copy"><h3>{title}</h3><p>{desc}</p><div><span><Cube size={15} /> <small>交付成果</small><b>{deliverable}</b></span><span><Code size={15} /> <small>掌握技能</small><b>{skills}</b></span><span><CheckCircle size={15} /> <small>完成状态</small><b>{status}</b></span></div></div><CaretRight size={20} /></button>)}</section><aside className="path-current"><section className="surface current-project"><div className="section-row"><span className="page-kicker">当前项目</span><em>进行中</em></div><h3>个人 AI 助手</h3><img src="/assets/ai-assistant-project.png" alt="个人 AI 助手项目界面预览" /><div className="project-progress-label"><span>整体进度</span><b>35%</b></div><ProgressBar value={35} /><h4>下一步：完成聊天界面</h4><p>完善消息列表、输入框与发送逻辑，让对话体验更流畅。</p><button className="black-button wide" onClick={() => navigate("/learn/cursor")}>进入项目 <ArrowRight size={16} /></button></section><section className="surface tutor-promo"><IconBadge icon={Robot} size={18} /><div><strong>AI 导师</strong><p>遇到问题就提问，获得项目级指导。</p></div><button onClick={() => navigate("/tutor")}>问问 AI 导师 <CaretRight size={16} /></button></section></aside></div></>;
}

function LearningWorkspace({ navigate, notify }) {
  const [tasks, setTasks] = useState([false, false, false]);
  const [question, setQuestion] = useState("");
  const completed = tasks.filter(Boolean).length;
  const toggle = (index) => setTasks((current) => current.map((value, idx) => idx === index ? !value : value));
  return <div className="learning-shell"><header className="learning-topbar"><button className="app-brand" onClick={() => navigate("/")}><BrandMark /><span>OneShowLearn</span></button><div><span><strong>AI 编程实战</strong><small>学习进度 35%</small></span><ProgressBar value={35} /></div><button className="outline-button" onClick={() => navigate("/paths/ai-coding")}>退出学习</button></header><div className="learning-layout"><aside className="module-sidebar"><span className="page-kicker">学习路径</span>{["Cursor 实战入门", "全栈应用开发", "Claude Code 实战", "部署与上线", "项目进阶与优化"].map((item, index) => <button className={index === 0 ? "active" : ""} key={item}><span>{index + 1}</span><div><strong>{item}</strong><small>{index === 0 ? "进行中 · 35%" : "未开始"}</small></div>{index === 0 && <Circle size={8} weight="fill" />}</button>)}<button className="outline-button module-map" onClick={() => navigate("/paths/ai-coding")}><MapTrifold size={17} /> 查看学习路线图</button></aside><main className="lesson-main"><span className="lesson-current">当前学习：Cursor 实战入门</span><h2>用 Cursor 做出第一个网页</h2><p className="lesson-lead">在本节课程中，你将使用 Cursor 从零创建一个响应式个人主页，体验 AI 驱动的完整开发流程。</p><section className="lesson-objective"><Target size={22} weight="duotone" /><div><strong>本节目标</strong><p>掌握使用 Cursor 生成、预览和迭代网页的完整流程。</p></div></section><div className="practice-layout"><div className="practice-copy"><div className="practice-title"><h3>实践任务</h3><span>已完成 {completed} / 3</span></div>{["生成页面结构与样式", "预览并调整页面效果", "保存并发布到本地"].map((task, index) => <button className={tasks[index] ? "practice-task done" : "practice-task"} key={task} onClick={() => toggle(index)}><span>{tasks[index] ? <CheckCircle size={22} weight="fill" /> : <span className="task-index">{index + 1}</span>}</span><div><strong>{task}</strong><small>{["使用 Cursor 生成个人主页的基本结构与样式。", "在内置预览中查看效果，并通过自然语言调整。", "将项目保存到本地，完成你的第一个网页。"][index]}</small></div></button>)}<button className="black-button practice-start" onClick={() => { if (completed === 3) notify("太棒了，本节实践已完成"); else toggle(tasks.findIndex((value) => !value)); }}>{completed === 3 ? "完成本节" : "开始实践"} <ArrowRight size={16} /></button></div><img className="practice-preview" src="/assets/cursor-practice-preview.png" alt="代码编辑器与个人网页实时预览" /></div></main><aside className="lesson-aside"><section><div className="aside-title"><IconBadge icon={Robot} size={18} /><div><strong>AI 导师</strong><small>针对本节内容提供帮助</small></div></div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入你的问题…" aria-label="向 AI 导师提问" /><button aria-label="发送问题" onClick={() => { if (question.trim()) { notify("AI 导师已收到你的问题"); setQuestion(""); } }}><PaperPlaneTilt size={17} /></button><small className="suggest-label">推荐提问</small>{["如何让页面在手机上更好看？", "怎样调整标题的层级？", "如何添加页面切换动画？"].map((item) => <button className="suggestion" key={item} onClick={() => setQuestion(item)}>{item}<ArrowRight size={14} /></button>)}</section><section className="lesson-resources"><h3>本节资源</h3>{[[Code, "示例代码"], [FileText, "项目需求说明"], [Article, "网页开发检查清单"]].map(([Icon, label]) => <button key={label} onClick={() => notify(`已打开「${label}」`)}><Icon size={17} /> {label}<CaretRight size={14} /></button>)}</section></aside></div></div>;
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
  else if (route === "/learn/cursor") content = <LearningWorkspace navigate={navigate} notify={notify} />;
  else {
    const page = route === "/app" ? <Dashboard navigate={navigate} /> : route === "/paths" ? <PathsPage navigate={navigate} /> : route === "/paths/ai-coding" ? <PathDetail navigate={navigate} /> : route === "/projects" ? <ProjectsPage navigate={navigate} notify={notify} /> : route === "/tutor" ? <TutorPage notify={notify} /> : route === "/resources" ? <ResourcesPage notify={notify} /> : <Dashboard navigate={navigate} />;
    content = <AppShell route={route} navigate={navigate} onSearch={(query) => { if (query.trim()) { notify(`正在搜索“${query}”`); navigate("/resources"); } }}>{page}</AppShell>;
  }
  return <>{content}<Toast text={toast} /></>;
}
