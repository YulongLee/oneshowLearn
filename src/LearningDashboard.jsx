import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, CalendarBlank, CheckCircle, FileText, FolderSimple, Lightning, NotePencil, Plus, Star, Target, Trophy } from "@phosphor-icons/react";
import { StudyCalendar, courseArt, localDay } from "./Workspace.jsx";
import { courseProgress, courseStatus, dashboardCourses } from "./dashboard-model.js";
import "./learning-dashboard.css";

const statusLabels = { new: "未开始", learning: "学习中", completed: "已完成" };
const filters = [["all", "全部"], ["learning", "学习中"], ["new", "未开始"], ["completed", "已完成"]];

function Progress({ pack }) {
  const value = courseProgress(pack);
  if (!pack.contentCount) return <p className="ld-content-pending">课程内容准备中，发布后可开始学习。</p>;
  return <div className="ld-progress-group"><div><span>已完成 {pack.completedCount || 0} / {pack.contentCount || 0} 项内容</span><strong>{value}%</strong></div><div className="ld-progress" role="progressbar" aria-label={`${pack.title}学习进度`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div></div>;
}

function Cover({ pack, ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [pack.cover_url]);
  return <img src={!failed && pack.cover_url || courseArt(pack)} onError={() => setFailed(true)} alt="" {...props} />;
}

function SectionTitle({ title, action, onAction, children }) {
  return <header className="ld-section-title"><div><h2>{title}</h2>{children}</div>{action && <button className="ld-text-button" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</header>;
}

export function LearningDashboard({ model, navigate, notify }) {
  const [filter, setFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(localDay);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskError, setTaskError] = useState("");
  useEffect(() => { setFilter("all"); setTaskTitle(""); setTaskError(""); }, [model.user?.id]);
  const { current, items, counts } = dashboardCourses(model.library, model.recent, filter);
  const tasks = model.state.tasks.filter(task => task.date === selectedDay);
  const done = tasks.filter(task => task.done).length;
  const today = localDay();
  const notes = [...model.state.notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 2);
  const recommended = model.recommendations.filter(pack => !model.library.some(owned => owned.id === pack.id)).slice(0, 3);
  const openCourse = pack => navigate(`/packs/${pack.slug}`);
  const favorite = async pack => {
    const saved = model.state.favorites.includes(pack.id);
    if (await model.saveState({ ...model.state, favorites: saved ? model.state.favorites.filter(id => id !== pack.id) : [...model.state.favorites, pack.id] })) notify(saved ? "已取消收藏" : "已加入收藏夹");
  };
  const addTask = async e => {
    e.preventDefault();
    if (model.busy) return;
    if (!taskTitle.trim()) { setTaskError("请先写下一个学习目标。"); return; }
    const ok = await model.saveState({ ...model.state, tasks: [...model.state.tasks, { id: crypto.randomUUID(), title: taskTitle.trim(), date: selectedDay, done: false }] });
    if (ok) { setTaskTitle(""); setTaskError(""); notify("学习任务已添加"); }
    else setTaskError("未能保存，输入已保留，请重试。");
  };

  if (model.loading) return <section className="ld-message" role="status"><BookOpenText size={32} /><h1>正在打开你的学习空间</h1><p>读取课程、学习进度和今天的计划…</p></section>;
  if (model.error) return <section className="ld-message"><BookOpenText size={32} /><h1>学习记录暂时不可用</h1><p>请使用上方入口重试或重新登录，你的记录不会被清空。</p></section>;
  if (!model.user) return <section className="ld-message"><BookOpenText size={36} /><h1>登录，回到你的学习空间</h1><p>这里为你整理已解锁课程、实践任务和学习笔记。</p><button className="ws-dark-button" onClick={() => navigate("/login")}>登录学习账号<ArrowRight size={17} /></button></section>;

  const metrics = [[BookOpenText, model.library.length, "可学课程", "/courses", "violet"], [CheckCircle, model.stats.completedItems, "已完成内容", "/courses", "blue"], [Trophy, model.stats.completedPacks, "已完成项目包", "/projects", "amber"], [Lightning, model.stats.streakDays, "连续打卡 / 天", "/plan", "green"]];
  return <div className="ld-home">
    <header className="ld-page-heading"><div><span className="ld-eyebrow">我的学习空间</span><h1>欢迎回来，{model.user.name?.trim() || "学习者"}</h1><p>从上次停下的地方继续，把学到的变成自己的作品。</p></div><button className="ws-outline-button" onClick={() => navigate("/plan")}><CalendarBlank size={18} />我的学习计划</button></header>

    <section className="ld-metrics" aria-label="个人学习概览">{metrics.map(([Icon, value, title, path, tone]) => <button key={title} onClick={() => navigate(path)}><span className={`ld-icon ${tone}`}><Icon size={23} weight="duotone" /></span><span><strong>{value ?? 0}</strong><small>{title}</small></span><ArrowRight size={16} /></button>)}</section>

    <div className="ld-columns"><div className="ld-primary">
      <section className="ld-focus" aria-labelledby="ld-focus-title">
        {current ? <><div className="ld-focus-copy"><span className="ld-eyebrow"><span className="ld-live-dot" />{model.recent?.id === current.id ? "接着上次的进度" : courseStatus(current) === "completed" ? "温故知新" : "下一步 · 开始实践"}</span><h2 id="ld-focus-title">{current.title}</h2><p>{current.subtitle || current.path_title || "用一份文档、一次实践，完成今天的小目标。"}</p><Progress pack={current} /><div className="ld-focus-actions"><button className="ws-dark-button" onClick={() => openCourse(current)}>{courseStatus(current) === "completed" ? "回顾课程" : courseStatus(current) === "learning" ? "继续学习" : "开始学习"}<ArrowRight size={17} /></button><button className="ld-text-button" onClick={() => navigate("/resources")}><FileText size={17} />配套资料</button></div></div><div className="ld-focus-cover"><Cover pack={current} /><span><BookOpenText size={15} />{current.path_title || "我的课程"}</span></div></> : <div className="ld-first-course"><span className="ld-icon violet"><BookOpenText size={30} weight="duotone" /></span><div><span className="ld-eyebrow">从一个小目标开始</span><h2 id="ld-focus-title">选择你的第一条学习路径</h2><p>你还没有已解锁课程。可以先了解课程，也可以创建自己的学习计划。</p><button className="ws-dark-button" onClick={() => navigate("/paths")}>浏览学习路径<ArrowRight size={17} /></button></div></div>}
      </section>

      <nav className="ld-shortcuts" aria-label="常用学习工具">{[[FileText, "课程资料", "文档与模板", "/resources", "blue"], [NotePencil, "学习笔记", `${model.state.notes.length} 篇记录`, "/notes", "violet"], [Star, "我的收藏", `${model.state.favorites.length} 个收藏`, "/favorites", "amber"], [FolderSimple, "实战项目", "把方法用起来", "/projects", "green"]].map(([Icon, title, sub, path, tone]) => <button key={path} onClick={() => navigate(path)}><span className={`ld-icon ${tone}`}><Icon size={21} weight="duotone" /></span><span><strong>{title}</strong><small>{sub}</small></span></button>)}</nav>

      <section className="ld-library" aria-labelledby="ld-library-title"><SectionTitle title={<span id="ld-library-title">我的课程</span>} action="查看全部" onAction={() => navigate("/courses")}><p>已解锁的内容，按自己的节奏学习。</p></SectionTitle><div className="ld-filters" role="group" aria-label="我的课程筛选">{filters.map(([key, label]) => <button key={key} className={filter === key ? "is-active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div>
        <div className="ld-course-grid">{items.slice(0, 3).map(pack => <article className="ld-course" key={pack.id}><button className="ld-course-cover" aria-label={`打开课程：${pack.title}`} onClick={() => openCourse(pack)}><Cover pack={pack} loading="lazy" /><span>{pack.path_title || "实战课程"}</span></button><div className="ld-course-body"><div className="ld-course-status"><span className={courseStatus(pack)}>{statusLabels[courseStatus(pack)]}</span><button className="ld-star" aria-label={`${model.state.favorites.includes(pack.id) ? "取消收藏" : "收藏"}：${pack.title}`} aria-pressed={model.state.favorites.includes(pack.id)} disabled={model.busy} onClick={() => favorite(pack)}><Star size={19} weight={model.state.favorites.includes(pack.id) ? "fill" : "regular"} /></button></div><h3><button onClick={() => openCourse(pack)}>{pack.title}</button></h3><Progress pack={pack} /><button className="ld-course-action" onClick={() => openCourse(pack)}>{courseStatus(pack) === "completed" ? "回顾内容" : "进入课程"}<ArrowRight size={16} /></button></div></article>)}</div>
        {!items.length && <div className="ld-empty"><BookOpenText size={28} weight="duotone" /><h3>{model.library.length ? `暂无${statusLabels[filter] || "符合条件的"}课程` : "还没有已解锁课程"}</h3><p>{model.library.length ? "切换筛选，查看其他课程与当前进度。" : "课程获得授权后，会自动出现在这里。"}</p><button className="ld-text-button" onClick={() => model.library.length ? setFilter("all") : navigate("/paths")}>{model.library.length ? "查看全部课程" : "探索学习路径"}<ArrowRight size={15} /></button></div>}
      </section>

      <section className="ld-notes"><SectionTitle title="最近笔记" action="管理笔记" onAction={() => navigate("/notes")} />{notes.length ? <div className="ld-note-grid">{notes.map(note => <button key={note.id} onClick={() => navigate("/notes")}><NotePencil size={22} /><div><strong>{note.title}</strong><p>{note.body}</p><small>{new Date(note.updatedAt).toLocaleDateString("zh-CN")} 更新</small></div><ArrowRight size={15} /></button>)}</div> : <button className="ld-note-empty" onClick={() => navigate("/notes")}><span className="ld-icon violet"><NotePencil size={24} weight="duotone" /></span><span><strong>记录今天的第一个收获</strong><small>一个提示词、一次实践，或一个待解决的问题。</small></span><Plus size={21} /></button>}</section>

      {recommended.length > 0 && <section className="ld-discover"><SectionTitle title="探索更多内容" action="全部学习路径" onAction={() => navigate("/paths")} /><div>{recommended.map(pack => <button key={pack.id} onClick={() => openCourse(pack)}><Cover pack={pack} loading="lazy" /><span><strong>{pack.title}</strong><small>{pack.path_title} · 查看课程详情</small></span><ArrowRight size={16} /></button>)}</div></section>}
    </div>

    <aside className="ld-aside"><StudyCalendar model={model} selectedDay={selectedDay} setSelectedDay={setSelectedDay} navigate={navigate} notify={notify} />
      <section className="ld-tasks"><SectionTitle title={selectedDay === today ? "今日任务" : `${selectedDay.slice(5).replace("-", "月")}日任务`} action="管理" onAction={() => navigate("/plan")} /><div className="ld-task-summary"><span>完成今天的一小步</span><strong>{done}<small> / {tasks.length}</small></strong></div>{tasks.length > 0 ? <div className="ld-task-list">{tasks.slice(0, 5).map(task => <label key={task.id} className={task.done ? "is-done" : ""}><input type="checkbox" checked={task.done} disabled={model.busy} onChange={() => model.saveState({ ...model.state, tasks: model.state.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item) })} /><span>{task.title}</span></label>)}{tasks.length > 5 && <button className="ld-text-button" onClick={() => navigate("/plan")}>还有 {tasks.length - 5} 项任务<ArrowRight size={14} /></button>}</div> : <div className="ld-task-empty"><Target size={28} weight="duotone" /><p>还没有安排任务，<br />先定一个容易完成的小目标。</p></div>}
        <form className="ld-task-form" onSubmit={addTask}><label className="ld-sr-only" htmlFor="ld-new-task">添加学习任务</label><input id="ld-new-task" placeholder="添加一个学习目标…" value={taskTitle} maxLength={160} readOnly={model.busy} onChange={e => { setTaskTitle(e.target.value); setTaskError(""); }} /><button aria-label="保存学习任务" disabled={model.busy || !taskTitle.trim()}><Plus size={19} /></button></form>{taskError && <p className="ld-error" role="alert">{taskError}</p>}
      </section>

      <section className="ld-method"><span className="ld-eyebrow">实践小提示</span><h2>学一点，做一点，<br />留下一个小成果。</h2><p>读完文档后，试着运行一个模板、完成一项任务，再用笔记记录遇到的问题。</p><button className="ld-text-button" onClick={() => navigate("/resources")}>打开我的学习资料<ArrowRight size={16} /></button></section>
    </aside></div>
    <footer className="ld-footer">OneShowLearn · 学会 AI，用实践做出自己的产品。</footer>
  </div>;
}
