import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowRight, BookOpenText, BracketsCurly, CalendarBlank, CaretDown, ChartBar, ChartLineUp, CheckCircle, Code, Crown, Cube, FileText, Gauge, Lightbulb, List, MagnifyingGlass, Money, NotePencil, RocketLaunch, ShieldCheck, Sparkle, Star, Target, X } from "@phosphor-icons/react";
import { localDay, useWorkspaceModel } from "./Workspace.jsx";
import { canManage } from "./platforms.js";
import heroImage from "./assets/opc-home-hero-v1.webp";
import "./opc-homepage.css";

const capabilities = [
  { title: "AI 工具应用", detail: "Prompt / 工具 / 方法", icon: Sparkle, tone: "blue", path: "ai-tools" },
  { title: "AI 编程开发", detail: "Codex / Cursor", icon: BracketsCurly, tone: "sky", path: "ai-coding" },
  { title: "AI 产品开发", detail: "Web / App / 小程序", icon: Cube, tone: "orange", path: "ai-product" },
  { title: "上线与合规", detail: "部署 / 备案 / 支付", icon: ShieldCheck, tone: "violet", path: "ai-product" },
  { title: "运营与增长", detail: "SEO / 内容 / 社媒", icon: ChartLineUp, tone: "green", path: "ai-growth" },
  { title: "实战项目", detail: "从想法到可交付作品", icon: Target, tone: "purple", path: null },
];
const milestones = [
  { title: "产品思路", lines: ["找到好想法", "验证真实需求"], icon: Lightbulb, tone: "violet" },
  { title: "AI 开发", lines: ["用 AI 辅助编程", "快速构建产品"], icon: Code, tone: "blue" },
  { title: "上线发布", lines: ["域名 · 服务器", "部署 · 备案"], icon: RocketLaunch, tone: "coral" },
  { title: "收款变现", lines: ["支付 · 订阅", "设计商业模式"], icon: Money, tone: "green" },
  { title: "推广增长", lines: ["SEO · 内容", "社媒 · 迭代"], icon: ChartBar, tone: "purple" },
];

// These miniature interfaces are visual illustrations, not product screenshots or performance claims.
function ProjectPreview({ kind }) {
  return <div className={`opc-project-scene scene-${kind}`} aria-label="项目界面示意" role="img">
    <div className="opc-mini-window"><div className="opc-mini-chrome"><i /><i /><i /><span>OneShow · {kind === "growth" ? "Analytics" : kind === "tools" ? "Workspace" : kind === "agent" ? "Assistant" : "Product"}</span><b>✧</b></div><div className="opc-mini-layout"><aside><span>✦</span>{["概览", "项目", "资源", "设置"].map(t => <small key={t}>{t}</small>)}</aside><div className="opc-mini-main"><span className="opc-mini-eyebrow">LET'S BUILD SOMETHING</span><strong>{kind === "growth" ? "让好产品，被更多人看见" : kind === "tools" ? "让每一个想法，更进一步" : kind === "agent" ? "你好，今天想一起完成什么？" : "从想法，到你的第一个作品"}</strong>{kind === "growth" ? <><div className="opc-mini-metrics"><span>内容表现<b>Overview</b></span><span>增长趋势<b>Insights</b></span></div><svg className="opc-mini-chart" viewBox="0 0 280 80" aria-hidden="true"><path d="M0 64H280M0 36H280M0 8H280" stroke="#eae6f5" fill="none"/><path d="M0 70L35 52L67 60L106 31L148 40L193 16L233 22L280 4" stroke="#9673f5" strokeWidth="3" fill="none"/><path d="M0 70L35 52L67 60L106 31L148 40L193 16L233 22L280 4V80H0Z" fill="#a988ef" opacity=".12"/></svg></> : <><div className="opc-mini-tiles">{[Sparkle, FileText, Cube].map((Icon,i) => <div key={i}><Icon weight="duotone"/><span>{["开始创作", "整理灵感", "构建产品"][i]}</span><small>EXPLORE →</small></div>)}</div><div className="opc-mini-input">{kind === "agent" ? "描述你的问题或想法…" : "你的下一步，从这里开始"}<ArrowRight /></div></>}</div></div></div>
    <span className="opc-scene-label">界面示意</span>
  </div>;
}

function projectKind(pack) { return ({ "ai-agent": "agent", "ai-tools": "tools", "ai-growth": "growth" })[pack.path_slug] || "product"; }

export function WorkspaceLanding({ navigate, notify }) {
  const model = useWorkspaceModel(notify);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const accountRef = useRef(null);
  const catalog = model.recommendations;
  const catalogStatus = model.loading ? "loading" : model.error ? "error" : "ready";
  const current = model.recent || model.library[0];
  const learnerName = model.user?.name?.trim() || "学习者";
  const studyLabel = model.recent ? "继续上次学习" : current ? "进入我的课程" : "探索学习路线";
  const today = localDay();
  const checkedIn = model.state.checkIns.includes(today);
  const personalTools = [
    { title: "学习笔记", subtitle: model.loading ? "正在读取…" : `${model.state.notes.length} 篇笔记`, icon: NotePencil, text: "把学习中的理解与灵感记下来，逐步建立自己的知识库。", tone: "violet", path: "/notes" },
    { title: "我的收藏", subtitle: model.loading ? "正在读取…" : `${model.state.favorites.length} 个收藏`, icon: Star, text: "收藏感兴趣的课程与项目，让值得实践的内容随时可见。", tone: "blue", path: "/favorites" },
    { title: "学习计划", subtitle: model.loading ? "正在读取…" : `${model.state.tasks.filter(t => !t.done).length} 项待完成任务`, icon: CalendarBlank, text: "将大目标拆成小任务，按自己的节奏，每天向前一点。", tone: "green", path: "/plan" },
  ];
  useEffect(() => {
    const onKey = event => { if (event.key === "Escape") { setMenuOpen(false); setSearchOpen(false); setAccountOpen(false); } };
    const outside = event => { if (!searchRef.current?.contains(event.target)) setSearchOpen(false); if (!accountRef.current?.contains(event.target)) setAccountOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", outside); };
  }, []);
  const go = path => { setMenuOpen(false); setSearchOpen(false); setAccountOpen(false); navigate(path); };
  const scroll = id => { setMenuOpen(false); setSearchOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  const startLearning = () => go(current ? current.slug === "cursor-first-site" ? "/learn/cursor" : `/packs/${current.slug}` : "/paths/ai-product");
  const toggleFavorite = async pack => {
    if (model.loading || model.busy) return;
    if (!model.user) { go("/login"); return; }
    const saved = model.state.favorites.includes(pack.id);
    const favorites = saved ? model.state.favorites.filter(id => id !== pack.id) : [...model.state.favorites, pack.id];
    if (await model.saveState({ ...model.state, favorites })) notify(saved ? "已取消收藏" : "已加入收藏夹");
  };
  const checkIn = async () => {
    if (model.loading || model.busy || checkedIn) return;
    if (!model.user) { go("/login"); return; }
    if (await model.saveState({ ...model.state, checkIns: [...new Set([...model.state.checkIns, today])] })) notify("今日学习打卡已保存");
  };
  const projectOrder = ["ai-agent", "ai-tools", "ai-growth", "ai-product", "ai-coding", "ai-workflow"];
  const projectRank = pack => { const rank = projectOrder.indexOf(pack.path_slug); return rank < 0 ? projectOrder.length : rank; };
  const projects = [...catalog].sort((a,b) => projectRank(a) - projectRank(b)).slice(0,4);
  const needle = query.trim().toLowerCase();
  const searchItems = [
    { id: "flagship", title: "AI OPC：一个人的产品公司", subtitle: "旗舰课程介绍", action: () => scroll("opc-flagship") },
    ...catalog.map(p => ({ id: p.id, title: p.title, subtitle: p.path_title, action: () => go(`/packs/${p.slug}`) })),
  ].filter(item => needle && `${item.title} ${item.subtitle}`.toLowerCase().includes(needle)).slice(0,5);
  return <main className="opc-home opc-workspace-home" id="opc-top">
    <header className="opc-header"><div className="opc-container opc-nav">
      <button className="opc-brand" onClick={() => scroll("opc-top")} aria-label="OneShowLearn 首页"><img src="/assets/oneshowlearn-brandmark.png" alt="" /><span><strong>OneShowLearn</strong><small>Learn · Build · Grow</small></span></button>
      <nav id="opc-main-navigation" className={menuOpen ? "opc-links is-open" : "opc-links"} aria-label="首页导航">
        <button className="active" aria-current="page" onClick={() => scroll("opc-top")}>首页</button>
        <button onClick={() => go("/paths")}>学习路线</button><button onClick={() => scroll("opc-projects")}>实战项目</button><button onClick={() => go("/resources")}>资源中心</button><button onClick={() => go("/tools")}>AI 导师</button><button onClick={() => go("/community")}>社区</button><button onClick={() => go("/membership")}>定价</button>
        <button className="opc-mobile-login" onClick={() => go("/courses")}>我的课程</button>
      </nav>
      <div className="opc-nav-actions">
        <div className="opc-search-wrap" ref={searchRef}><form className="opc-search" onSubmit={e => { e.preventDefault(); setSearchOpen(true); }}><MagnifyingGlass size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setSearchOpen(true); }} onFocus={() => needle && setSearchOpen(true)} aria-label="搜索课程和项目" placeholder="搜索课程、项目…" /></form>{searchOpen && <section className="opc-search-results" aria-label="搜索结果"><div><strong>课程与项目</strong><button onClick={() => setSearchOpen(false)} aria-label="关闭搜索"><X size={18}/></button></div>{searchItems.length ? searchItems.map(item => <button key={item.id} onClick={item.action}><span>{item.title}<small>{item.subtitle}</small></span><ArrowRight size={15}/></button>) : <p>{needle ? "暂无相关内容，试试 AI OPC 或产品。" : "输入课程或项目关键词。"}</p>}</section>}</div>
        <button className="opc-button opc-nav-start" onClick={() => go("/courses")}>我的课程</button>
        <div className="opc-account-wrap" ref={accountRef}><button className="opc-profile-button" aria-label="打开个人中心" aria-expanded={accountOpen} onClick={() => { setAccountOpen(!accountOpen); setSearchOpen(false); }}><span className="opc-account-avatar">{model.loading ? "…" : learnerName.slice(0,1)}</span><span className="opc-profile-name"><strong>{model.loading ? "正在加载…" : model.user ? learnerName : "访客浏览"}</strong><small>个人学习空间</small></span><CaretDown size={14}/></button>{accountOpen && <section className="opc-account-menu" aria-label="个人中心"><div><strong>{model.user ? `你好，${learnerName}` : "欢迎来到学习空间"}</strong><small>{model.user ? "学习与创作，从这里继续" : "登录后可同步你的学习记录"}</small></div>{[["/courses","我的课程",BookOpenText],["/plan","学习计划",CalendarBlank],["/notes","学习笔记",NotePencil],["/favorites","收藏夹",Star],["/certificates","我的证书",ShieldCheck],[model.user ? "/account" : "/login",model.user ? "账号设置与退出" : "登录账号",Target],["/","返回官网",ArrowRight]].map(([path,label,Icon])=><button key={path} onClick={()=>go(path)}><Icon size={17}/>{label}</button>)}{canManage(model.user) && <button className="opc-manage-link" onClick={()=>go("/admin")}><Gauge size={17}/>切换到管理平台</button>}</section>}</div>
        <button className="opc-menu" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} aria-controls="opc-main-navigation" onClick={() => { setMenuOpen(!menuOpen); setAccountOpen(false); }}>{menuOpen ? <X size={22}/> : <List size={22}/>}</button>
      </div>
    </div></header>

    <section className="opc-hero" aria-labelledby="opc-hero-title">
      <img className="opc-hero-image" src={heroImage} alt="独立创作者在明亮的工作室中用电脑构建 AI 产品" fetchPriority="high"/>
      <div className="opc-hero-wash" aria-hidden="true"/>
      <div className="opc-container opc-hero-inner"><div className="opc-hero-copy">
        <span className="opc-pill"><RocketLaunch size={14} weight="fill"/> AI OPC 旗舰课程</span>
        <h1 id="opc-hero-title"><span>AI <em>OPC</em></span><span>一个人的产品公司</span></h1>
        <p className="opc-hero-description">从 0 到 1，手把手教你用 AI 做出真实的产品，<br className="opc-desktop-break"/>并完成上线、收款、推广和持续增长。</p>
        <div className="opc-hero-benefits">{[[ShieldCheck,"实战导向","围绕真实项目"],[Target,"全流程覆盖","从想法到发布"],[ArrowClockwise,"持续迭代","跟上 AI 的变化"]].map(([Icon,title,detail]) => <div key={title}><span><Icon size={22} weight="duotone"/></span><p><strong>{title}</strong><small>{detail}</small></p></div>)}</div>
        <div className="opc-hero-actions"><button className="opc-button" disabled={model.loading} onClick={startLearning}>{studyLabel}<ArrowRight size={17}/></button><button className="opc-button opc-button-light" onClick={() => go("/courses")}><BookOpenText size={19}/>我的课程</button></div>
        <div className="opc-hero-footnote"><span><BookOpenText size={17}/><Code size={17}/><RocketLaunch size={17}/></span><p>{model.loading ? "正在读取你的学习记录…" : model.recent ? `上次学到：${model.recent.title} · 已完成 ${model.recent.progressPercent || 0}%` : current ? `已解锁：${current.title}，从第一个实践任务开始。` : "从一条学习路线开始，逐步做出属于你的第一个作品。"}</p></div>
      </div></div>
      <div className="opc-handwritten" aria-hidden="true">用 AI<br/>把想法变成产品<br/>让一个人也能<br/>创造更大的价值！<svg viewBox="0 0 180 25"><path d="M3 22Q71 2 177 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
      <button className="opc-hero-float" onClick={() => scroll("opc-flagship")}><span className="opc-float-spark"><Sparkle size={27} weight="fill"/><small>Spark</small></span><span><strong>从学习到实践，</strong><small>开启你的 AI 产品之旅</small></span><i><ArrowRight size={15}/></i></button>
    </section>

    <div className="opc-container opc-body">
      {model.error && <div className="opc-status opc-status-error" role="alert"><span>{model.error}</span><button onClick={model.refresh}>重试</button><button onClick={() => go("/login")}>重新登录</button></div>}
      {!model.loading && !model.user && !model.error && <div className="opc-status"><span>当前为访客预览，登录后可同步课程与学习记录。</span><button onClick={() => go("/login")}>登录账号<ArrowRight size={15}/></button></div>}
      <section className="opc-capabilities" aria-label="六大学习方向">{capabilities.map(({title,detail,icon:Icon,tone,path}) => <button key={title} onClick={() => path ? go(`/paths/${path}`) : scroll("opc-projects")}><span className={`opc-icon-box ${tone}`}><Icon size={23} weight="duotone"/></span><span><strong>{title}</strong><small>{detail}</small></span></button>)}</section>

      <section className="opc-panel opc-flagship" id="opc-flagship" aria-labelledby="opc-course-title"><div className="opc-flagship-copy"><span className="opc-kicker">旗舰课程</span><h2 id="opc-course-title">AI OPC：一个人的产品公司<Crown size={25} weight="duotone"/></h2><p>围绕一个真实产品，走完从 0 到 1 的全流程实践。</p><ul>{["实战文档，边学边做", "覆盖上线、支付与增长", "配套 Prompt、代码与模板", "用任务清单检验成果"].map(t => <li key={t}><CheckCircle size={16} weight="fill"/>{t}</li>)}</ul><button className="opc-button" onClick={() => go("/paths/ai-product")}>查看学习路线<ArrowRight size={16}/></button></div><ol className="opc-milestones" aria-label="从产品思路到推广增长的五个阶段">{milestones.map(({title,lines,icon:Icon,tone},i) => <li key={title}><span className={`opc-stage-icon ${tone}`}><Icon size={32} weight="duotone"/></span><b>0{i+1}</b><h3>{title}</h3><p>{lines[0]}<br/>{lines[1]}</p>{i<4 && <span className="opc-stage-arrow" aria-hidden="true">›</span>}</li>)}</ol></section>

      <section className="opc-panel opc-projects" id="opc-projects" aria-labelledby="opc-projects-title"><div className="opc-section-heading"><div><h2 id="opc-projects-title">精选实战项目</h2><p>通过项目实践，掌握 AI 在不同场景的应用。</p></div><button className="opc-small-button" onClick={() => go("/projects")}>查看全部项目<ArrowRight size={15}/></button></div>
        <div className="opc-project-grid">{projects.map(pack => <article className="opc-project-card" key={pack.id}><button className="opc-project-main" onClick={() => go(`/packs/${pack.slug}`)} aria-label={`查看项目：${pack.title}`}><ProjectPreview kind={projectKind(pack)}/><div className="opc-project-copy"><h3>{pack.title}</h3><p>{pack.subtitle || pack.deliverable || pack.path_title}</p><div><span>{pack.path_title}</span><span>项目实践</span><ArrowRight size={18}/></div></div></button><button className="opc-project-favorite" aria-label={`${model.state.favorites.includes(pack.id) ? "取消收藏" : "收藏"}：${pack.title}`} aria-pressed={model.state.favorites.includes(pack.id)} disabled={model.loading || model.busy} onClick={() => toggleFavorite(pack)}><Star size={18} weight={model.state.favorites.includes(pack.id) ? "fill" : "regular"}/></button></article>)}</div>
        {!projects.length && <div className="opc-catalog-empty" role="status"><BookOpenText size={24}/><p>{catalogStatus === "loading" ? "正在加载实战项目…" : catalogStatus === "error" ? "暂时无法加载项目，稍后可在学习路径中查看。" : "项目内容正在准备中，发布后会出现在这里。"}</p><button onClick={() => go("/paths")}>浏览学习路径<ArrowRight size={15}/></button></div>}
      </section>

      <section className="opc-format-band" aria-label="课程内容形式"><h2>用 AI，让一个人<br/>也能创造更大的价值</h2><div className="opc-format-metrics">{[["60%","实战文档"],["20%","Prompt / 代码 / 模板"],["10%","任务与检查清单"],["10%","短视频演示"]].map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><p>“少一点只看不做，<br/>多一个真实作品。”<span>— OneShowLearn</span></p></section>

      <section className="opc-bottom-grid"><div className="opc-audiences"><header className="opc-learning-tools-heading"><h2>我的学习工具</h2><button className="opc-checkin-button" aria-label={checkedIn ? "今日学习已打卡" : "完成今日学习打卡"} aria-pressed={checkedIn} disabled={checkedIn || model.busy || model.loading} onClick={checkIn}>{checkedIn ? <CheckCircle size={17} weight="fill"/> : <CalendarBlank size={17}/>}<span>{checkedIn ? "今日已打卡" : "今日学习打卡"}</span></button></header><div>{personalTools.map(({title,subtitle,icon:Icon,text,tone,path}) => <article key={title}><header><span className={`opc-icon-box ${tone}`}><Icon size={22} weight="duotone"/></span><div><h3>{title}</h3><small>{subtitle}</small></div></header><p>{text}</p><button className="opc-audience-action" onClick={()=>go(path)}>打开{title}<ArrowRight size={15}/></button></article>)}</div></div><aside className="opc-final-cta"><span className="opc-cta-glow" aria-hidden="true"/><span className="opc-kicker">YOUR NEXT CHAPTER</span><h2>下一步，让想法<br/>变成真实的作品</h2><p>选定一个目标，安排一次实践。<br/>每一个小进步，都值得记录。</p><button className="opc-button opc-button-light" onClick={()=>go("/plan")}>安排学习计划<ArrowRight size={16}/></button></aside></section>
      <footer className="opc-footer"><span>© {new Date().getFullYear()} OneShowLearn · OneShowLab</span><span>学会 AI · 用好 AI · 做出你的 AI 产品</span><button onClick={() => go("/")}>返回官网</button></footer>
    </div>
  </main>;
}
