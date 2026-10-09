import { lazy, useEffect, useMemo, useState } from "react";
import {FavoriteButton} from './FavoriteButton.jsx';
import {courseLearningPath,courseOfferPath} from './course-reader-model.js';
import { ArrowRight, BookOpenText, CalendarCheck, Check, Crown, FileText, FolderOpen, MagnifyingGlass, NotePencil, Plus, Robot, Sparkle, Star, Trash, Trophy, UsersThree, X } from "@phosphor-icons/react";
import "./workspace-pages.css";
const CourseOffer=lazy(()=>import('./CourseOffer.jsx'));
const CourseCertificates=lazy(()=>import('./CourseCertificates.jsx').then(m=>({default:m.CourseCertificates})));

function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const routeInfo = {
  "/courses": [BookOpenText, "我的课程", "每一次学习，都离自己的 AI 产品更近一步。"],
  "/projects": [FolderOpen, "实战项目", "从一个真实问题出发，完成一个可以交付的作品。"],
  "/resources": [FileText, "学习资源", "沿着正在学习的课程，找到对应文档、模板与实践材料。"],
  "/favorites": [Star, "收藏夹", "收藏值得实践的内容，让好想法随时可见。"],
  "/notes": [NotePencil, "学习笔记", "把学到的方法，写成你自己的产品经验。"],
  "/plan": [CalendarCheck, "学习计划", "把大目标拆成今天可以完成的一小步。"],
  "/tools": [Sparkle, "AI 工具箱", "让工具服务于实践，把想法变成具体行动。"],
  "/community": [UsersThree, "学习社区", "与做产品的人交流，从独自学习到共同成长。"],
  "/certificates": [Trophy, "我的证书", "查看课程完课要求与个人结业证书。"],
  "/membership": [Crown, "课程与学习权益", "选择适合自己的实战内容，按自己的节奏开始。"],
};

function EmptyState({ icon: Icon = FolderOpen, title, children, action, onAction }) {
  return <section className="wsp-empty"><span className="wsp-empty-icon"><Icon size={32} weight="duotone" /></span><h2>{title}</h2><p>{children}</p>{action && <button className="wsp-button wsp-button-primary" onClick={onAction}>{action}<ArrowRight size={17} /></button>}</section>;
}

function LoginPrompt({ navigate }) {
  return <EmptyState icon={BookOpenText} title="登录后，开始记录你的学习">课程、笔记和计划会保存到你的账号，换一个设备也能接着学。<span className="wsp-login-action"><button className="wsp-button wsp-button-primary" onClick={() => navigate("/login")}>登录学习账号<ArrowRight size={17} /></button></span></EmptyState>;
}

function CourseCard({ pack, navigate, remove, busy, model, showProgress = true }) {
  const destination=showProgress?courseLearningPath(pack.slug):courseOfferPath(pack.slug);
  const progress = Math.max(0, Math.min(100, Number(pack.progressPercent) || 0));
  const art = /growth/.test(pack.path_slug || "") ? "growth" : /coding/.test(pack.path_slug || "") ? "codex" : /agent|workflow/.test(pack.path_slug || "") ? "case" : "opc";
  return <article className="wsp-course">
    <button className={`wsp-course-cover wsp-cover-${art}`} onClick={() => navigate(destination)} aria-label={`打开课程：${pack.title}`}><img src={pack.cover_url || `/assets/course-${art}-v2.webp`} alt="" loading="lazy" /><span>{pack.path_title || "课程"}</span></button>
    <div className="wsp-course-body"><h2><button onClick={() => navigate(destination)}>{pack.title}</button></h2><p>{pack.subtitle || pack.description || "围绕真实项目，学习、实践与交付。"}</p><div className="wsp-course-meta">{Number(pack.contentCount) > 0 && <span>{pack.contentCount} 个内容单元</span>}{Number(pack.estimated_minutes) > 0 && <span>预计 {pack.estimated_minutes} 分钟</span>}</div>{showProgress ? <><div className="wsp-progress-label"><span>学习进度</span><strong>{progress}%</strong></div><div className="wsp-progress" role="progressbar" aria-label={`${pack.title}学习进度`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div></> : pack.deliverable ? <div className="wsp-deliverable"><span>项目交付成果</span><p>{pack.deliverable}</p></div> : null}<div className="wsp-course-actions"><button className="wsp-text-button" onClick={() => navigate(destination)}>{showProgress ? progress > 0 ? "继续学习" : "查看课程" : "查看项目详情"}<ArrowRight size={16} /></button>{!remove&&model&&<FavoriteButton model={model} navigate={navigate} reference={{kind:'course',id:pack.id}} title={pack.title} compact/>}{remove && <button className="wsp-icon-button" disabled={busy} onClick={remove} title="取消收藏" aria-label={`取消收藏：${pack.title}`}><Star size={19} weight="fill" /></button>}</div></div>
  </article>;
}

function ProjectsPage({ model, navigate }) {
  const [query, setQuery] = useState("");
  const projects = model.recommendations || [];
  const matches = projects.filter(pack => `${pack.title} ${pack.subtitle || ""} ${pack.deliverable || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="wsp-toolbar"><span className="wsp-catalog-count">已发布项目 <strong>{projects.length}</strong></span><label className="wsp-search"><MagnifyingGlass size={18} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索实战项目" placeholder="搜索项目或交付成果" /></label></div>{matches.length ? <div className="wsp-course-grid">{matches.map(pack => <CourseCard key={pack.id} pack={pack} navigate={navigate} showProgress={false} />)}</div> : <EmptyState icon={FolderOpen} title={query ? "暂时没有匹配的项目" : "实战项目正在准备中"} action={query ? "清空搜索" : "查看学习路径"} onAction={query ? () => setQuery("") : () => navigate("/paths")}>{query ? "换一个关键词，发现可以动手实践的方向。" : "项目发布后会出现在这里。先了解学习路径，找到适合自己的方向。"}</EmptyState>}</>;
}

function ResourcesPage({ model, navigate }) {
  if (!model.user) return <LoginPrompt navigate={navigate} />;
  const packs = model.library || [];
  return <><div className="wsp-resource-explainer"><span className="wsp-note-icon"><FileText size={23} weight="duotone" /></span><div><h2>资料跟着课程走，实践更有方向。</h2><p>打开你已获授权的课程 / 项目包，在对应步骤查看配套文档、Prompt、代码和模板。实际内容、附件与访问权限以课程详情为准。</p></div></div>{packs.length ? <div className="wsp-resource-list">{packs.map(pack => <article className="wsp-resource-row" key={pack.id}><span className="wsp-resource-icon"><FolderOpen size={25} weight="duotone" /></span><div><span className="wsp-kicker">{pack.path_title || "课程配套内容"}</span><h2>{pack.title}</h2><p>{Number(pack.contentCount) > 0 ? `${pack.contentCount} 个内容单元 · ` : ""}进入课程查看已配置的学习材料</p></div><button className="wsp-button" onClick={() => navigate(courseLearningPath(pack.slug))}>查看配套内容<ArrowRight size={16} /></button></article>)}</div> : <EmptyState icon={FileText} title="这里将整理你的课程配套内容" action="探索课程与项目" onAction={() => navigate("/paths")}>你目前还没有可展示的已授权课程。浏览学习路径，了解各项目包含的实战内容；这里不会提供未配置的下载链接。</EmptyState>}</>;
}

function CourseCollection({ model, navigate, favorites = false, notify }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const allPacks = useMemo(() => [...new Map([...(model.library || []), ...(model.recommendations || [])].map(pack => [pack.id, pack])).values()], [model.library, model.recommendations]);
  const source = favorites ? allPacks.filter(pack => (model.state?.favorites || []).includes(pack.id)) : model.library || [];
  const matches = source.filter(pack => `${pack.title} ${pack.subtitle || ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || (filter === "learning" ? pack.progressPercent > 0 && pack.progressPercent < 100 : pack.progressPercent >= 100)));
  async function removeFavorite(id) {
    if (model.busy) return;
    const ok = await model.saveState({ ...model.state, favorites: (model.state?.favorites || []).filter(value => value !== id) });
    if (ok) notify?.("已取消收藏");
  }
  if (!model.user) return <LoginPrompt navigate={navigate} />;
  return <><div className="wsp-toolbar"><div className="wsp-tabs" aria-label="课程筛选"><button className={filter === "all" ? "wsp-selected" : ""} onClick={() => setFilter("all")}>{favorites ? "全部收藏" : "全部课程"}<span>{source.length}</span></button>{!favorites && <><button className={filter === "learning" ? "wsp-selected" : ""} onClick={() => setFilter("learning")}>学习中</button><button className={filter === "completed" ? "wsp-selected" : ""} onClick={() => setFilter("completed")}>已完成</button></>}</div><label className="wsp-search"><MagnifyingGlass size={18} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索我的课程" placeholder="搜索课程名称" /></label></div>{matches.length ? <div className="wsp-course-grid">{matches.map(pack => <CourseCard key={pack.id} pack={pack} model={model} navigate={navigate} busy={model.busy} remove={favorites ? () => removeFavorite(pack.id) : undefined} />)}</div> : <EmptyState icon={favorites ? Star : BookOpenText} title={source.length ? "没有找到符合条件的课程" : favorites ? "值得再看的内容，收藏在这里" : "你的第一门课程，从这里开始"} action={source.length ? "重置筛选" : "探索学习路径"} onAction={source.length ? () => { setQuery(""); setFilter("all"); } : () => navigate("/paths")}>{source.length ? "试试其他关键词，或查看全部课程。" : favorites ? "在首页收藏感兴趣的实战课程，之后就能在这里快速找到。" : "选择一个学习路径，查看项目与内容。已获得访问权限的课程会出现在这里。"}</EmptyState>}</>;
}

function NotesPage({ model, navigate, notify }) {
  const [editing, setEditing] = useState(false);
  const [noteId, setNoteId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [query, setQuery] = useState("");
  const notes = [...(model.state?.notes || [])].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const matches = notes.filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { setEditing(false); setNoteId(null); setTitle(""); setBody(""); setDeleteId(null); }, [model.user?.id]);
  function openNote(note) { setNoteId(note?.id || null); setTitle(note?.title || ""); setBody(note?.body || ""); setFormError(""); setEditing(true); }
  async function saveNote(event) {
    event.preventDefault();
    if (model.busy) return;
    if (!title.trim() || !body.trim()) { setFormError("请填写笔记标题和正文。"); return; }
    const note = { id: noteId || makeId(), title: title.trim(), body: body.trim(), updatedAt: new Date().toISOString() };
    const ok = await model.saveState({ ...model.state, notes: [note, ...notes.filter(item => item.id !== note.id)] });
    if (ok) { setEditing(false); setFormError(""); notify?.("笔记已保存"); }
    else setFormError("保存未成功，内容已保留，请稍后重试。");
  }
  async function deleteNote(id) {
    if (model.busy) return;
    const ok = await model.saveState({ ...model.state, notes: notes.filter(note => note.id !== id) });
    if (ok) { setDeleteId(null); notify?.("笔记已删除"); }
  }
  if (!model.user) return <LoginPrompt navigate={navigate} />;
  if (editing) return <form className="wsp-note-editor" onSubmit={saveNote}><div className="wsp-editor-head"><h2>{noteId ? "编辑笔记" : "写一篇新笔记"}</h2><button type="button" className="wsp-icon-button" aria-label="关闭笔记编辑" disabled={model.busy} onClick={() => setEditing(false)}><X size={20} /></button></div><label>笔记标题<input autoFocus value={title} readOnly={model.busy} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="例如：我的第一个 AI 产品，如何缩小范围" required /></label><label>正文<textarea value={body} readOnly={model.busy} maxLength={20000} onChange={event => setBody(event.target.value)} placeholder="记录关键方法、实践中的问题，以及下一步要做的事……" rows={14} required /></label><small className="wsp-field-hint">{body.length.toLocaleString()} / 20,000 字 · 手动保存到账号</small>{formError && <p className="wsp-inline-error" role="alert">{formError}</p>}<div className="wsp-editor-actions"><button type="button" className="wsp-button" disabled={model.busy} onClick={() => setEditing(false)}>取消</button><button className="wsp-button wsp-button-primary" disabled={model.busy}>{model.busy ? "保存中…" : "保存笔记"}<Check size={17} /></button></div></form>;
  return <><div className="wsp-toolbar"><label className="wsp-search"><MagnifyingGlass size={18} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索学习笔记" placeholder="搜索笔记标题或正文" /></label><button className="wsp-button wsp-button-primary" onClick={() => openNote()}><Plus size={18} />新建笔记</button></div>{matches.length ? <div className="wsp-note-grid">{matches.map(note => <article className="wsp-note" key={note.id}><button className="wsp-note-open" onClick={() => openNote(note)}><span className="wsp-note-icon"><FileText size={20} weight="duotone" /></span><h2>{note.title}</h2><p>{note.body}</p></button><div className="wsp-note-footer"><span>{new Date(note.updatedAt).toLocaleDateString("zh-CN")} 更新</span>{deleteId === note.id ? <span className="wsp-delete-confirm"><button disabled={model.busy} onClick={() => deleteNote(note.id)}>确认删除</button><button disabled={model.busy} onClick={() => setDeleteId(null)}>取消</button></span> : <button className="wsp-icon-button" aria-label={`删除笔记：${note.title}`} onClick={() => setDeleteId(note.id)} disabled={model.busy}><Trash size={17} /></button>}</div></article>)}</div> : <EmptyState icon={NotePencil} title={query ? "没有找到这篇笔记" : "从一个值得记住的想法开始"} action={query ? "清空搜索" : "写第一篇笔记"} onAction={query ? () => setQuery("") : () => openNote()}>{query ? "换一个关键词试试。" : "不必长篇大论。记录一个提示词、一个问题，或一次实践的收获。"}</EmptyState>}</>;
}

function PlanPage({ model, navigate, notify }) {
  const [date, setDate] = useState(localDate());
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");
  const tasks = model.state?.tasks || [];
  const shownTasks = tasks.filter(task => task.date === date);
  const doneCount = shownTasks.filter(task => task.done).length;
  async function addTask(event) {
    event.preventDefault();
    if (model.busy) return;
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFormError("请填写任务内容并选择日期。"); return; }
    const ok = await model.saveState({ ...model.state, tasks: [...tasks, { id: makeId(), title: title.trim(), date, done: false }] });
    if (ok) { setTitle(""); setFormError(""); notify?.("学习任务已添加"); }
    else setFormError("任务未保存，请稍后重试。");
  }
  async function changeTask(id, remove = false) {
    if (model.busy) return;
    const nextTasks = remove ? tasks.filter(task => task.id !== id) : tasks.map(task => task.id === id ? { ...task, done: !task.done } : task);
    const ok = await model.saveState({ ...model.state, tasks: nextTasks });
    if (ok && remove) notify?.("任务已删除");
  }
  if (!model.user) return <LoginPrompt navigate={navigate} />;
  return <div className="wsp-plan"><section className="wsp-plan-card"><div className="wsp-plan-heading"><div><span className="wsp-kicker">一步一步，走向完成</span><h2>{date === localDate() ? "今天的学习计划" : "这一天的学习计划"}</h2><p>{shownTasks.length ? `已完成 ${doneCount} / ${shownTasks.length} 个任务` : "给自己定一个小目标吧"}</p></div><label className="wsp-date-picker"><span>选择日期</span><input aria-label="学习计划日期" type="date" value={date} disabled={model.busy} onChange={event => setDate(event.target.value)} required /></label></div><div className="wsp-plan-progress"><i style={{ width: `${shownTasks.length ? doneCount / shownTasks.length * 100 : 0}%` }} /></div><form className="wsp-task-form" onSubmit={addTask}><input aria-label="新任务内容" placeholder="例如：完成 AI OPC 第一章，并记录一个产品想法" value={title} readOnly={model.busy} onChange={event => setTitle(event.target.value)} maxLength={160} required /><button className="wsp-button wsp-button-primary" disabled={model.busy || !date}><Plus size={18} />{model.busy ? "保存中…" : "添加任务"}</button></form>{formError && <p className="wsp-inline-error" role="alert">{formError}</p>}<ul className="wsp-task-list">{shownTasks.map(task => <li key={task.id} className={task.done ? "wsp-task-done" : ""}><label><input type="checkbox" checked={Boolean(task.done)} disabled={model.busy} onChange={() => changeTask(task.id)} /><span>{task.title}</span></label><button className="wsp-icon-button" aria-label={`删除任务：${task.title}`} disabled={model.busy} onClick={() => changeTask(task.id, true)}><Trash size={18} /></button></li>)}</ul>{!shownTasks.length && <div className="wsp-plan-empty"><CalendarCheck size={32} weight="duotone" /><p>这一天还没有任务</p><span>一次只安排几件重要的事，学习会更有方向。</span></div>}</section><aside className="wsp-plan-tip"><Sparkle size={24} weight="duotone" /><h3>计划不需要很满，<br />每次有一点进步就好。</h3><p>读一份实战文档，试一个 Prompt，完成一个小功能。把今天学到的，变成可以交付的成果。</p><button className="wsp-text-button" onClick={() => navigate("/courses")}>去我的课程找灵感<ArrowRight size={16} /></button></aside></div>;
}

function ToolsPage({ navigate }) {
  return <><div className="wsp-tool-grid"><button className="wsp-tool" onClick={() => navigate("/tutor")}><span className="wsp-tool-icon"><Robot size={30} weight="duotone" /></span><span className="wsp-tool-type">学习与产品开发助手</span><h2>AI 导师</h2><p>围绕课程、代码和产品规划提问，重要回答可保存至私人笔记。服务状态以导师页面显示为准。</p><span className="wsp-text-button">进入 AI 导师<ArrowRight size={18} /></span></button><button className="wsp-tool" onClick={() => navigate("/resources")}><span className="wsp-tool-icon wsp-tool-blue"><FileText size={30} weight="duotone" /></span><span className="wsp-tool-type">实践工具</span><h2>资源中心</h2><p>从已授权课程进入配套实战文档、Prompt、代码和模板，具体内容以课程实际配置为准。</p><span className="wsp-text-button">浏览学习资源<ArrowRight size={18} /></span></button></div><div className="wsp-info-note"><Sparkle size={20} /><p>工具是起点，做出成果才是目标。建议结合正在学习的项目选择工具，避免为了收集而收集。</p></div></>;
}

function CommunityPage({ navigate }) {
  return <section className="wsp-coming-soon"><span className="wsp-status-label">正在筹备</span><span className="wsp-coming-icon"><UsersThree size={56} weight="duotone" /></span><h2>一个专注于做出产品的学习社区</h2><p>未来你可以在这里分享作品、交流实践问题，找到一起学习的伙伴。<br />社区尚未开放，目前没有群聊或加入入口。</p><div className="wsp-next-grid"><button onClick={() => navigate("/notes")}><NotePencil size={22} /><span><strong>先记录你的实践</strong><small>把问题与经验写进学习笔记</small></span><ArrowRight size={18} /></button><button onClick={() => navigate("/resources")}><FolderOpen size={22} /><span><strong>继续探索学习资源</strong><small>寻找项目需要的方法与工具</small></span><ArrowRight size={18} /></button></div></section>;
}

export function WorkspacePages({ route, model, navigate, notify }) {
  if (route === '/membership') return <CourseOffer model={model} navigate={navigate} embedded/>;
  const [Icon, title, subtitle] = routeInfo[route] || routeInfo["/courses"];
  let content;
  if (model.loading && ["/courses", "/projects", "/resources", "/favorites", "/notes", "/plan", "/certificates"].includes(route)) content = <div className="wsp-loading" role="status">正在载入你的学习空间…</div>;
  else if (route === "/courses" || route === "/favorites") content = <CourseCollection key={route} model={model} navigate={navigate} favorites={route === "/favorites"} notify={notify} />;
  else if (route === "/projects") content = <ProjectsPage model={model} navigate={navigate} />;
  else if (route === "/resources") content = <ResourcesPage model={model} navigate={navigate} />;
  else if (route === "/notes") content = <NotesPage model={model} navigate={navigate} notify={notify} />;
  else if (route === "/plan") content = <PlanPage model={model} navigate={navigate} notify={notify} />;
  else if (route === "/tools") content = <ToolsPage navigate={navigate} />;
  else if (route === "/community") content = <CommunityPage navigate={navigate} />;
  else if (route === "/certificates") content = model.user?<CourseCertificates user={model.user}/>:<EmptyState icon={Trophy} title="查看你的课程结业证书" action="登录学习账号" onAction={() => navigate("/login?next=%2Fcertificates")}>登录后查看正式课程的完课要求与个人结业证书。</EmptyState>;
  return <div className="wsp-page"><header className="wsp-page-header"><span className="wsp-header-icon"><Icon size={26} weight="duotone" /></span><div><h1>{title}</h1><p>{subtitle}</p></div></header>{content}</div>;
}
