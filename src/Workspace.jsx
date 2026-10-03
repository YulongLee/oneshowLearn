import {BrandIdentity} from './BrandIdentity.jsx';
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BookOpenText, Books, CalendarBlank, CaretDown, CaretLeft, CaretRight, ChartBar, Check, CheckCircle, Clock, Crown, Cube, FileText, FolderSimple, Gauge, GearSix, House, List, MagnifyingGlass, MapTrifold, NotePencil, Play, Plus, Robot, SealCheck, Sparkle, SquaresFour, Star, Trophy, UsersThree, X } from "@phosphor-icons/react";
import { api, getToken, subscribeToSession } from "./api.js";
import { canManage } from "./platforms.js";
import { activeWorkspaceNav } from "./workspace-navigation.js";
import {useSidebarLayout} from './useSidebarLayout.js';
import {LearningLayoutContext} from './learning-layout-context.js';
import {SidebarCourseOffer} from './SidebarCourseOffer.jsx';
import "./workspace.css";

const emptyState = () => ({ tasks: [], notes: [], favorites: [], checkIns: [] });
const emptyData = () => ({ user: null, library: [], recommendations: [], recent: null, version: null, state: emptyState(), stats: { completedItems: 0, completedPacks: 0, studyMinutes: null, streakDays: 0 } });
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shortName = (name) => name?.trim() || "学习者";
const artByPath = { "ai-product": "opc", "ai-coding": "codex", "ai-growth": "growth", "ai-tools": "case", "ai-agent": "case", "ai-workflow": "growth" };
export const courseArt = (pack) => `/assets/course-${artByPath[pack?.path_slug] || "case"}-v2.webp`;

export function useWorkspaceModel(notify) {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const saving = useRef(false);
  const refresh = async ({ preserve = false } = {}) => {
    const request = ++revision.current;
    setLoading(true); setError(""); if (!preserve) setData(emptyData());
    try {
      if (getToken()) {
        const [account, workspace] = await Promise.all([api("/auth/me"), api("/me/workspace")]);
        if (request === revision.current) setData({ ...emptyData(), ...workspace, user: account.user });
      } else {
        const catalog = await api("/catalog/workspace");
        if (request === revision.current) setData({ ...emptyData(), recommendations: catalog.items || [] });
      }
    } catch (e) { if (request === revision.current) setError(e.status === 401 ? "登录已过期，请重新登录后查看工作空间。" : "暂时无法加载学习数据，请稍后重试。"); }
    finally { if (request === revision.current) setLoading(false); }
  };
  useEffect(() => { refresh(); const unsubscribe = subscribeToSession(refresh); return () => { revision.current++; unsubscribe(); }; }, []);
  const saveState = async (next) => {
    if (!data.user) { notify("请先登录，学习记录将保存到你的账号。"); return false; }
    if (saving.current) return false;
    const request = revision.current;
    saving.current = true; setBusy(true);
    try {
      const saved = await api("/me/workspace/state", { method: "PUT", headers: data.version ? { "If-Match": data.version } : {}, body: JSON.stringify(next) });
      if (request !== revision.current) return false;
      setData(value => ({ ...value, state: saved.state || next, stats: saved.stats || value.stats, version: saved.version || value.version }));
      return true;
    } catch (e) {
      if (e.status === 409) {
        try {
          const latest = await api("/me/workspace");
          if (request === revision.current) setData(value => ({ ...value, ...latest }));
          notify("其他窗口已更新记录，已同步最新数据。当前输入已保留，请再次保存。");
        } catch { notify("记录已在其他窗口更新，请保留当前输入并刷新后重试。"); }
      } else notify(e.message || "保存失败，请重试。");
      return false;
    }
    finally { saving.current = false; setBusy(false); }
  };
  return { ...data, loading, error, busy, refresh, saveState };
}

export function WorkspaceShell({ route, navigate, notify, children, resourceSearch }) {
  const [learningFocused,setLearningFocused]=useState(false),[learningHost,setLearningHost]=useState(null);
  const model = useWorkspaceModel(notify);
  const [menu, setMenu] = useState(false);
  const sidebar=useSidebarLayout();
  const sidebarToggle=useRef(null);
  useEffect(()=>{setMenu(false);},[sidebar.mobile]);
  const [popover, setPopover] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const topbarRef = useRef(null);
  useEffect(() => { setMenu(false); setPopover(""); }, [route]);
  useEffect(() => {
    const closeOnEscape = e => {
      if (e.key === "Escape") { setMenu(false); setPopover(""); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); if (!resourceSearch) setPopover("search"); }
    };
    const closeOutside = e => { if (!topbarRef.current?.contains(e.target)) setPopover(""); };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => { document.removeEventListener("keydown", closeOnEscape); document.removeEventListener("pointerdown", closeOutside); };
  }, [Boolean(resourceSearch)]);
  const go = (path) => { setMenu(false); setPopover(""); navigate(path); };
  const selected = (path) => activeWorkspaceNav(route) === path;
  const searchablePacks = [...new Map([...model.recommendations, ...model.library].map(p => [p.id, p])).values()];
  const searchResults = [...searchablePacks.map(p => ({ title: p.title, kind: "课程 / 项目包", path: `/packs/${p.slug}` })), ...model.state.notes.filter(n=>!n.deletedAt).map(n => ({ title: n.title, kind: "学习笔记", path: "/notes" }))].filter(item => query.trim() && item.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  const groups = [
    ["学习", [["/opc", "学习课程", BookOpenText], ["/projects", "实战项目", Cube]]],
    ["AI", [["/tutor", "AI 导师", Robot], ["/resources", "资源中心", FolderSimple]]],
    ["社区", [["/community", "学习社区", UsersThree]]],
    ["我的", [["/notes", "学习笔记", NotePencil], ["/favorites", "我的收藏", Star], ["/achievements", "我的成果", Trophy], ["/account", "设置中心", GearSix]]],
  ];
  const navItem = ([path, title, Icon]) => <button key={`${path}-${title}`} title={title} aria-label={title} className={selected(path) ? "is-active" : ""} aria-current={selected(path) ? "page" : undefined} onClick={() => go(path)}><Icon size={21} weight={selected(path) ? "fill" : "regular"} /><span>{title}</span></button>;
  return <LearningLayoutContext.Provider value={{host:learningHost,setFocused:setLearningFocused}}><div className="ws-layout ws-reference-layout ws-unified-layout" data-learning-focused={learningFocused||undefined} data-sidebar={sidebar.mode} data-resizing={sidebar.resizing||undefined} style={{'--sidebar-width':`${sidebar.width}px`}}>
    {menu && <button className="ws-scrim" aria-label="关闭侧边导航" onClick={() => setMenu(false)} />}
    <div className="ws-sidebar-frame">
    <aside id="workspace-sidebar" className={`ws-sidebar ${menu ? "is-open" : ""}`}>
      {menu && <button className="ws-drawer-close" aria-label="关闭侧边导航" onClick={() => setMenu(false)}><X size={17} /></button>}
      <button className="ws-brand" onClick={() => go("/app")} aria-label="OneShowLearn 工作台"><BrandIdentity/></button>
      {learningFocused&&<div className="ws-learning-directory-slot" ref={setLearningHost}/>}
      <nav hidden={learningFocused} aria-label="学习工作空间导航">{navItem(["/app", "工作台", House])}{groups.map(([name, items]) => <div className="wb-nav-group" key={name}><span>{name}</span>{items.map(navItem)}</div>)}</nav>
      <div hidden={learningFocused} className="ws-sidebar-bottom">
        <SidebarCourseOffer route={route} navigate={go}/><button className="ws-compact-access" aria-label="购买课程" title="购买课程" onClick={()=>go('/membership')}><Crown size={23}/></button>
      </div>
    </aside>
    {!sidebar.mobile&&sidebar.mode==='expanded'&&<div className="ws-sidebar-resize" {...sidebar.separator} aria-controls="workspace-sidebar"/>}
    </div>
    <div className="ws-main">
      <header className="ws-topbar" ref={topbarRef}>
        <div className="ws-desktop-nav-controls"><button ref={sidebarToggle} className="ws-icon-button" aria-controls="workspace-sidebar" aria-expanded={sidebar.mode==='expanded'} aria-label={sidebar.mode==='expanded'?'折叠侧栏为图标':sidebar.mode==='icons'?'展开侧栏':'显示侧栏'} title={sidebar.mode==='expanded'?'折叠侧栏为图标':'展开侧栏'} onClick={()=>sidebar.setMode(sidebar.mode==='expanded'?'icons':'expanded')}>{sidebar.mode==='expanded'?<CaretLeft size={20}/>:<List size={21}/>}</button>{sidebar.mode!=='hidden'&&<button className="ws-icon-button" aria-label="隐藏侧栏" title="隐藏侧栏" onClick={()=>{sidebar.setMode('hidden');sidebarToggle.current?.focus();}}><X size={18}/></button>}</div>
        <button className="ws-mobile-menu ws-icon-button" aria-label={menu ? "关闭工作空间导航" : "打开工作空间导航"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <List size={22} />}</button>
        <form className="ws-search" onSubmit={e => { e.preventDefault(); resourceSearch ? resourceSearch.onSubmit() : setPopover("search"); }}><MagnifyingGlass size={20} /><input ref={searchRef} value={resourceSearch ? resourceSearch.value : query} onChange={e => { if(resourceSearch) resourceSearch.onChange(e.target.value); else {setQuery(e.target.value); setPopover("search");} }} onFocus={() => !resourceSearch && query.trim() && setPopover("search")} onKeyDown={e => e.key === "Escape" && setPopover("")} placeholder={resourceSearch ? (resourceSearch.placeholder || "搜索资源（例如：PRD 模板、Codex 指令、支付接入…）") : "搜索课程、项目、学习笔记…"} aria-label={resourceSearch ? (resourceSearch.label || "搜索资源") : "搜索课程、项目、学习笔记"} />{(resourceSearch ? resourceSearch.value : query) ? <button type="button" aria-label="清空搜索" onClick={() => { resourceSearch ? resourceSearch.onChange("") : setQuery(""); setPopover(""); searchRef.current?.focus(); }}><X size={16} /></button> : <kbd>⌘ K</kbd>}</form>
        <div className="ws-user-actions"><button className="ws-icon-button" aria-label="查看通知" aria-expanded={popover === "notifications"} onClick={() => setPopover(popover === "notifications" ? "" : "notifications")}><Bell size={22} /></button><button className="ws-profile" aria-label={model.user ? `账号菜单：${shortName(model.user.name)}` : "登录与账号菜单"} aria-expanded={popover === "account"} onClick={() => setPopover(popover === "account" ? "" : "account")}><span className="ws-avatar">{model.user?.avatar?<img src={model.user.avatar} alt=""/>:model.user ? shortName(model.user.name).slice(0, 1) : "访"}</span><span><strong>{model.user ? `你好，${shortName(model.user.name)}` : "欢迎，学习者"}</strong><small>{model.user ? "个人学习空间" : "登录后保存学习记录"}</small></span><CaretDown size={14} /></button></div>
        {popover === "search" && <section className="ws-popover ws-search-results" aria-label="搜索结果"><div><strong>搜索结果</strong><button className="ws-icon-button" aria-label="关闭搜索结果" onClick={() => setPopover("")}><X size={18} /></button></div>{!query.trim() ? <p>输入关键词，搜索课程与自己的笔记。</p> : searchResults.length ? searchResults.map((r, i) => <button key={`${r.path}-${i}`} onClick={() => go(r.path)}><span>{r.title}<small>{r.kind}</small></span><ArrowRight size={16} /></button>) : <p>没有找到相关内容，试试其他关键词。</p>}</section>}
        {popover === "notifications" && <section className="ws-popover ws-account-menu" aria-label="通知"><strong>学习通知</strong><p>暂无新通知。学习任务可在学习计划中管理。</p><button onClick={() => go("/plan")}>查看学习计划<ArrowRight size={15} /></button></section>}
        {popover === "account" && <section className="ws-popover ws-account-menu" aria-label="账号菜单"><button onClick={() => go(model.user ? "/account" : "/login")}>{model.user ? "账号设置与退出" : "登录 / 注册"}<ArrowRight size={15} /></button><button onClick={() => go("/courses")}>我的课程<BookOpenText size={15} /></button><button onClick={() => go("/plan")}>我的学习计划<CalendarBlank size={15} /></button>{canManage(model.user) && <button onClick={() => go("/admin")}>进入管理平台<Gauge size={15} /></button>}<button onClick={() => go("/")}>返回官网<House size={15} /></button></section>}
      </header>
      <main className="ws-content">
        {model.error && <div className="ws-status ws-status-error" role="alert">{model.error}<button onClick={model.refresh}>重试</button><button onClick={() => go("/login")}>登录</button></div>}
        {!model.loading && !model.user && !model.error && <div className="ws-status">当前为访客浏览；登录后可保存学习计划、笔记和收藏。<button onClick={() => go("/login")}>立即登录<ArrowRight size={14} /></button></div>}
        {children({...model,sidebar})}
      </main>
    </div>
  </div></LearningLayoutContext.Provider>;
}

function SectionHeading({ title, action = "查看更多", onClick }) { return <div className="ws-section-heading"><h2>{title}</h2>{onClick && <button onClick={onClick}>{action}<ArrowRight size={14} /></button>}</div>; }

export function StudyCalendar({ model, selectedDay, setSelectedDay, notify, navigate }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const todayKey = localDay(today);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7 + weekOffset * 7, 12);
  const days = Array.from({ length: 7 }, (_, i) => { const day = new Date(monday); day.setDate(day.getDate() + i); return day; });
  const checkedIn = model.state.checkIns.includes(todayKey);
  const checkIn = async () => {
    if (!model.user) { navigate("/login"); return; }
    if (await model.saveState({ ...model.state, checkIns: [...new Set([...model.state.checkIns, todayKey])] })) notify("今日学习打卡已保存");
  };
  return <section className="ws-panel ws-calendar"><div className="ws-panel-heading"><h2>学习日历</h2><div><button aria-label="上一周" onClick={() => setWeekOffset(v => v - 1)}><CaretLeft size={15} /></button><button aria-label="下一周" onClick={() => setWeekOffset(v => v + 1)}><CaretRight size={15} /></button></div></div><div className="ws-calendar-month"><strong>{days[3].getFullYear()}年{days[3].getMonth() + 1}月</strong>{weekOffset !== 0 && <button onClick={() => { setWeekOffset(0); setSelectedDay(todayKey); }}>回到本周</button>}</div><div className="ws-calendar-grid">{["一", "二", "三", "四", "五", "六", "日"].map(d => <span key={d}>{d}</span>)}{days.map(day => <button key={localDay(day)} aria-label={`${localDay(day)} 学习记录`} aria-pressed={selectedDay === localDay(day)} className={selectedDay === localDay(day) ? "selected" : localDay(day) === todayKey ? "today" : ""} onClick={() => setSelectedDay(localDay(day))}>{day.getDate()}</button>)}{days.map(day => <span className="ws-calendar-mark" key={`mark-${localDay(day)}`}>{model.state.checkIns.includes(localDay(day)) ? <CheckCircle size={15} weight="fill" /> : <i />}</span>)}</div><button className="ws-checkin" disabled={checkedIn || model.busy || model.loading} onClick={checkIn}>{checkedIn ? <Check size={16} /> : <CalendarBlank size={16} />}{checkedIn ? "今天已打卡" : "完成今日学习打卡"}</button><blockquote>持续学习，让想法变成现实。<span>— OneShowLearn</span></blockquote></section>;
}

export function WorkspaceHome({ model, navigate, notify }) {
  const [selectedDay, setSelectedDay] = useState(localDay);
  const current = model.recent || model.library[0] || model.recommendations.find(p => p.path_slug === "ai-product") || model.recommendations[0];
  const available = model.recommendations;
  const recommendedOrder = ["ai-product", "ai-coding", "ai-growth", "ai-agent", "ai-tools", "ai-workflow"];
  const recommended = [...available].sort((a, b) => recommendedOrder.indexOf(a.path_slug) - recommendedOrder.indexOf(b.path_slug)).slice(0, 4);
  const todayTasks = model.state.tasks.filter(t => t.date === selectedDay);
  const finishedTasks = todayTasks.filter(t => t.done).length;
  const metrics = [[Books, model.stats.completedItems, "已完成学习内容", "violet", "/courses"], [NotePencil, model.state.notes.filter(n=>!n.deletedAt).length, "已保存学习笔记", "blue", "/notes"], [Trophy, model.stats.completedPacks, "已完成项目包", "amber", "/courses"], [ChartBar, model.stats.streakDays, "连续学习天数", "blue", "/plan"]];
  const toggleFavorite = async pack => { const ids = model.state.favorites; const next = ids.includes(pack.id) ? ids.filter(id => id !== pack.id) : [...ids, pack.id]; if (await model.saveState({ ...model.state, favorites: next })) notify(ids.includes(pack.id) ? "已取消收藏" : "已加入收藏夹"); };
  return <div className="ws-dashboard">
    <div className="ws-primary">
      <section className="ws-welcome"><img src="/assets/oneshowlearn-person-cutout-v2-clean.png" alt="学习者用电脑实践 AI 项目" /><div className="ws-welcome-copy"><p className="ws-greeting">👋 你好，{shortName(model.user?.name)}</p><h1>继续学习，做出属于你的 <span>AI 产品</span></h1><p>从学到实战，用 AI 打开一个人的无限可能。</p><div className="ws-welcome-actions"><button className="ws-dark-button" disabled={model.loading} onClick={() => navigate(current ? `/packs/${current.slug}` : "/paths")}><Play size={17} weight="fill" />{model.recent ? "继续上次学习" : "开始我的学习"}<ArrowRight size={16} /></button><button className="ws-outline-button" onClick={() => navigate("/plan")}><CalendarBlank size={19} />学习计划</button></div></div><div className="ws-handwriting" aria-hidden="true">Learn<br />Build<br />Launch<br />Grow</div></section>
      <section className="ws-metrics" aria-label="我的真实学习记录">{metrics.map(([Icon, value, label, tone, path]) => <button key={label} onClick={() => navigate(path)}><span className={`ws-metric-icon ${tone}`}><Icon size={25} weight="fill" /></span><span><strong>{model.loading ? "—" : value ?? 0}{label === "连续学习天数" && <small> 天</small>}</strong><small>{label}</small></span><CaretRight size={14} /></button>)}</section>
      <section><SectionHeading title={model.recent ? "继续学习" : "从这里开始"} action="我的课程" onClick={() => navigate("/courses")} />{current ? <article className="ws-continue"><div className="ws-continue-art"><img src={courseArt(current)} alt="" /><span>实践，从一个想法开始</span><strong>{current.title}</strong><div className="ws-progress"><i style={{ width: `${current.progressPercent || 0}%` }} /></div><small>{current.progressPercent || 0}%</small></div><div className="ws-continue-copy"><h3>{current.title}</h3><p>{current.subtitle || current.path_title || "通过文档、模板和任务，完成自己的 AI 作品。"}</p><span><BookOpenText size={15} />已完成 {current.completedCount || 0} / {current.contentCount || 0} 项内容</span></div><button className="ws-dark-button" onClick={() => navigate(`/packs/${current.slug}`)}>{model.recent ? "继续学习" : "查看课程"}<ArrowRight size={15} /></button></article> : <div className="ws-empty-inline">{model.loading ? "正在加载课程…" : "还没有可学习的课程。内容发布后会显示在这里。"}<button onClick={() => navigate("/paths")}>浏览学习路径<ArrowRight size={15} /></button></div>}</section>
      <section><SectionHeading title="推荐学习" onClick={() => navigate("/paths")} /><div className="ws-recommend-grid">{recommended.map((pack, index) => <article className="ws-course" key={pack.id}><button className="ws-course-main" onClick={() => navigate(`/packs/${pack.slug}`)}><div className={`ws-course-art tone-${index}`}><img src={courseArt(pack)} alt="" /><span>{["入门实战", "项目实践", "能力进阶", "精选路径"][index]}</span><h3>{pack.title}</h3></div><div className="ws-course-meta"><BookOpenText size={14} /><span>{pack.contentCount || 0} 项内容</span><span>文档 · 实战</span></div></button><button className={`ws-favorite ${model.state.favorites.includes(pack.id) ? "saved" : ""}`} aria-label={`${model.state.favorites.includes(pack.id) ? "取消收藏" : "收藏"}${pack.title}`} aria-pressed={model.state.favorites.includes(pack.id)} disabled={model.busy} onClick={() => toggleFavorite(pack)}><Star size={17} weight={model.state.favorites.includes(pack.id) ? "fill" : "regular"} /></button></article>)}</div>{!recommended.length && <div className="ws-empty-inline">{model.loading ? "正在读取课程目录…" : "已发布的课程将在这里展示。"}</div>}</section>
      <section><SectionHeading title="实战项目" action="探索项目" onClick={() => navigate("/projects")} /><div className="ws-project-grid">{available.slice(0, 4).map((pack, i) => <button className="ws-project" key={pack.id} onClick={() => navigate(`/packs/${pack.slug}`)}><div className={`ws-project-preview preview-${i}`}><img src={i % 2 ? "/assets/cursor-practice-preview.png" : "/assets/ai-assistant-project.png"} alt="项目实践示意图" /><span>项目实践</span></div><div><h3>{pack.title}</h3><p>{pack.deliverable || pack.subtitle || "跟随清晰步骤，完成自己的项目作品"}</p><span className="ws-project-tags"><i>AI</i><i>{pack.path_title || "实战"}</i><i>作品交付</i></span></div></button>)}</div>{!available.length && <div className="ws-empty-inline">项目包发布后，你可以在这里探索实践方向。</div>}</section>
    </div>
    <aside className="ws-right-rail">
      <StudyCalendar model={model} selectedDay={selectedDay} setSelectedDay={setSelectedDay} notify={notify} navigate={navigate} />
      <section className="ws-panel ws-tasks"><div className="ws-panel-heading"><h2>{selectedDay === localDay() ? "今日任务" : `${selectedDay.slice(5).replace("-", "月")}日任务`}<small>{finishedTasks}/{todayTasks.length}</small></h2><button className="ws-text-button" onClick={() => navigate("/plan")}>查看全部<ArrowRight size={14} /></button></div>{todayTasks.slice(0, 5).map(task => <label key={task.id} className={task.done ? "is-done" : ""}><input type="checkbox" checked={task.done} disabled={model.busy} onChange={() => model.saveState({ ...model.state, tasks: model.state.tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t) })} /><span>{task.title}</span></label>)}{!todayTasks.length && <div className="ws-task-empty"><CheckCircle size={30} /><p>给今天一个小目标，<br />让学习更进一步。</p><button onClick={() => navigate("/plan")}><Plus size={15} />添加学习任务</button></div>}</section>
      <section className="ws-community"><span><UsersThree size={22} /></span><h2>让学习，不再一个人</h2><p>分享实践心得，和同行者一起成长。<br />学习社区正在筹备中。</p><button onClick={() => navigate("/community")}>了解学习社区<ArrowRight size={16} /></button></section>
      <section className="ws-panel ws-resource-links"><div className="ws-panel-heading"><h2>学习资源</h2><button className="ws-text-button" onClick={() => navigate("/courses")}>查看课程<ArrowRight size={14} /></button></div>{[[FileText,"课程配套文档","/resources"],[FolderSimple,"Prompt、代码与模板","/resources"],[NotePencil,"我的实践笔记","/notes"],[Robot,"AI 工具与导师","/tools"]].map(([Icon,title,path]) => <button key={title} onClick={() => navigate(path)}><Icon size={19} />{title}<CaretRight size={14} /></button>)}</section>
    </aside>
  </div>;
}
