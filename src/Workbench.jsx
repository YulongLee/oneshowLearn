import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpenText, CalendarCheck, CaretLeft, CaretRight, Check, CheckCircle, Code, Cube, FileText, HandWaving, Plus, Robot, Trophy, X } from '@phosphor-icons/react';
import { api } from './api.js';
import { useSitePage } from './useSitePage.js';
import { courseArt, localDay } from './Workspace.jsx';
import { courseLearningPath } from './course-reader-model.js';
import { courseProgress, dashboardCourses } from './dashboard-model.js';
import { calendarMonth, currentProject, currentProductAchievement, learningEntries, phaseState, recentStudyItems, watchPercent } from './workbench-model.js';
import { lessonLink } from './LessonWorkspace.jsx';
import { liveAchievements, liveNotes, STAGES } from './personal-model.js';
import { safeResourceUrl } from './opc-model.js';
import welcomeArt from './assets/workbench-welcome-v2.webp';
import robotArt from './assets/tutor-robot-v2.webp';
import projectWebArt from './assets/project-web-cover-v1.webp';
import projectMobileArt from './assets/project-mobile-cover-v1.webp';
import projectAgentArt from './assets/project-agent-cover-v1.webp';
import './workbench-overview.css';
import './workbench-product.css';
import { prepareTutorQuestion, useAiCapabilities } from './useAiCapabilities.js';

const phases = [['产品与机会','找到需求，确定方向','green'],['AI 产品开发','用 AI 做出产品','violet'],['上线与合规','域名 / 服务器 / 上架','blue'],['收款与商业化','支付 / 订阅 / 定价','amber'],['运营与增长','SEO / 内容 / 社区','pink']];
const questions = ['我下一步应该做什么？','帮我检查我的 MVP 功能清单','如何用 Codex 开发支付功能？','帮我整理今天的学习问题'];
function Heading({children,action,onClick}) { return <header className="wd-section-heading"><h2>{children}</h2>{action&&<button className="wd-link" onClick={onClick}>{action}<ArrowRight size={14}/></button>}</header>; }
function Progress({value,label}) { return <div className="wd-progress-row"><div className="wd-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${value}%`}}/></div><span>{value}%</span></div>; }
function Empty({icon:Icon=BookOpenText,title,children,action,onClick}) { return <div className="wd-empty"><span><Icon size={27} weight="duotone"/></span><h3>{title}</h3><p>{children}</p>{action&&<button className="wd-link" onClick={onClick}>{action}<ArrowRight size={14}/></button>}</div>; }
function Cover({item}) { const [failed,setFailed]=useState(false);const source=safeResourceUrl(item.cover_url);const project=item.lessonCount!=null;const fallback=project?(/移动|小程序|App/i.test(item.title)?projectMobileArt:/Agent|自动化/i.test(item.title)?projectAgentArt:projectWebArt):courseArt(item);return <div className="wd-cover"><img src={source&&!failed?source:fallback} alt="" onError={()=>setFailed(true)}/>{(!source||failed)&&<small>分类示意</small>}</div>; }
function studyDate(value) { if(!value)return '';const date=new Date(value.includes('T')?value:`${value.replace(' ','T')}Z`);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date); }

function ProductHero({model,extra,current,activeLesson,currentPath,project,ownedIds,navigate}) {
  const unavailable=model.loading||Boolean(model.error)||!model.user;
  return <section className="wd-product-hero" aria-labelledby="wd-hero-title">
    <div className="wd-hero-copy"><span className="wd-hero-eyebrow">AI OPC · 一个人的产品公司</span><h2 id="wd-hero-title">从想法到上线，<br/>一步步做出属于<span>自己的产品。</span></h2>
      <ol className="wd-hero-phases" aria-label="我的五阶段学习进度">{phases.map(([title],index)=>{const status=unavailable||extra.loading||extra.errors.phases?'unavailable':phaseState(extra.phases.find(p=>p.id===index+1),ownedIds);return <li key={title} className={status}><button onClick={()=>navigate(`/opc/phase/${index+1}`)}><span>{status==='completed'?<Check size={15} weight="bold"/>:`0${index+1}`}</span><strong>{title}</strong><small>{{completed:'已完成',started:'学习中',ready:'待学习',pending:'未开始',unavailable:'进度待读取'}[status]}</small></button></li>;})}</ol>
      <div className="wd-hero-actions"><button className="wd-primary" disabled={model.loading||extra.loading} onClick={()=>navigate(model.user?currentPath:'/login')}>{!model.user?'登录后开始学习':current?'继续学习课程':'选择学习课程'}<ArrowRight size={17}/></button><button className="wd-secondary" onClick={()=>navigate(project?`/projects/${encodeURIComponent(project.slug)}/workspace`:'/projects')}>{project?'继续实战项目':'探索实战项目'}<ArrowRight size={17}/></button></div>
      {current&&!unavailable&&<div className="wd-hero-current"><BookOpenText size={16}/><span>{activeLesson?.title||current.title}</span><b>{courseProgress(current)}%</b><small>课程进度</small></div>}
    </div>
    <div className="wd-hero-preview"><section className="wd-hero-project"><Heading action={project?'继续项目':'查看项目'} onClick={()=>navigate(project?`/projects/${encodeURIComponent(project.slug)}/workspace`:'/projects')}>我的实战项目</Heading>{project&&!unavailable&&!extra.errors.mine?<><div className="wd-hero-project-title"><span className="wd-product-icon"><Cube size={25} weight="duotone"/></span><div><h3>{project.title}</h3><span className="wd-product-status">{project.progress.percent===100?'学习与验收已完成':'学习与实践中'}</span></div></div><Progress value={project.progress.percent} label="项目学习与验收进度"/><p className="wd-hero-project-meta">学完 {project.progress.completed} / {project.progress.total} 节 · 验收 {project.progress.accepted} / {project.progress.stageCount} 阶段</p><div className="wd-hero-milestones">{project.stages.slice(0,6).map(stage=><span className={stage.accepted?'done':''} key={stage.id}><CheckCircle size={14} weight={stage.accepted?'fill':'regular'}/>{stage.title}</span>)}</div></>:<Empty icon={Cube} title={extra.loading?'正在读取项目…':extra.errors.mine?'项目记录暂不可用':'让你的想法迈出第一步'}>从感兴趣的项目开始实践，真实学习进度会记录在这里。</Empty>}</section><span className="wd-build-note" aria-hidden="true">Build<br/>Your Idea<br/>With AI ✦</span><img className="wd-hero-art" src={projectMobileArt} alt=""/><small className="wd-hero-art-label">界面示意</small></div>
  </section>;
}

function PersonalProducts({items,unavailable,loading,error,navigate}) {
  const item=currentProductAchievement(items);
  return <section className="wd-panel wd-personal-products"><Heading action="查看全部产品" onClick={()=>navigate('/achievements')}>我的 AI 产品</Heading><p className="wd-panel-subtitle">从 0 到 1，记录属于自己的产品与成长</p>{item&&!unavailable?<div className="wd-personal-product"><div className="wd-product-title"><span className="wd-product-icon"><Cube size={26} weight="duotone"/></span><div><h3>{item.title}</h3><span className="wd-product-status">{STAGES[item.stage]||'个人记录'}</span></div></div><p>{item.description||'为你的产品留下一份进展记录。'}</p><div className="wd-product-stage" aria-label="个人记录的产品阶段">{[['idea','产品想法'],['building','开发中'],['launched','已上线']].map(([stage,title])=><span key={stage} className={item.stage===stage?'active':''}><i/>{title}</span>)}</div><div className="wd-tags">{(item.tags||[]).slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div><footer><small>更新于 {studyDate(item.updatedAt)} · 个人记录</small><button className="wd-secondary" onClick={()=>navigate('/achievements')}>查看产品<ArrowRight size={15}/></button></footer></div>:<Empty icon={Cube} title={loading?'正在加载产品…':error?'产品记录暂不可用':unavailable?'登录后管理你的产品':'你的第一个 AI 产品，从这里开始'} action={loading||error?null:unavailable?'登录账号':'记录我的产品'} onClick={()=>navigate(unavailable?'/login':'/achievements')}>把想法、原型与上线成果记录下来。这里展示你的个人产品，不把课程示例当成已完成作品。</Empty>}</section>;
}

function LearningCalendar({model,selectedDay,onSelect,navigate,notify}) {
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1,12));
  const today=localDay(),checked=model.state.checkIns.includes(today),monthKey=localDay(month).slice(0,7);
  const unavailable=model.loading||Boolean(model.error)||!model.user;
  const shift=n=>setMonth(d=>new Date(d.getFullYear(),d.getMonth()+n,1,12));
  const checkIn=async()=>{if(!model.user)return navigate('/login');if(await model.saveState({...model.state,checkIns:[...new Set([...model.state.checkIns,today])]}))notify('今日学习打卡已保存');};
  return <section className="wd-panel wd-calendar" aria-label="学习日历"><Heading action="查看计划" onClick={()=>navigate('/plan')}>学习日历</Heading>
    <div className="wd-month"><button aria-label="上个月" onClick={()=>shift(-1)}><CaretLeft size={16}/></button><button aria-label="返回本月和今天" onClick={()=>{setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1,12));onSelect(today);}}>{month.getFullYear()} 年 {month.getMonth()+1} 月</button><button aria-label="下个月" onClick={()=>shift(1)}><CaretRight size={16}/></button></div>
    <div className="wd-calendar-grid">{['一','二','三','四','五','六','日'].map(day=><span key={day}>{day}</span>)}{calendarMonth(month.getFullYear(),month.getMonth()).map((date,index)=>date?<button key={localDay(date)} className={`${selectedDay===localDay(date)?'selected':''} ${localDay(date)===today?'today':''} ${model.state.checkIns.includes(localDay(date))?'checked':''}`} aria-pressed={selectedDay===localDay(date)} aria-label={`${localDay(date)}${model.state.checkIns.includes(localDay(date))?'，已打卡':''}，查看任务`} onClick={()=>onSelect(localDay(date))}>{date.getDate()}{model.state.checkIns.includes(localDay(date))&&<i/>}</button>:<span key={`empty-${index}`}/>)}</div>
    <div className="wd-calendar-stats">{[[model.stats.streakDays,'连续打卡'],[model.state.checkIns.filter(day=>day.startsWith(monthKey)).length,'当月打卡'],[model.state.tasks.filter(task=>task.done&&task.date.startsWith(monthKey)).length,'当月完成任务']].map(([value,label])=><div key={label}><strong>{unavailable?'—':value}</strong><small>{label}</small></div>)}</div>
    <button className="wd-check-in" disabled={checked||model.busy||model.loading||Boolean(model.error)} onClick={checkIn}><CalendarCheck size={16}/>{checked?'今日已打卡':'完成学习，打卡记录'}</button>
  </section>;
}

function TutorPanel({model,navigate,notify}) {
  const ai=useAiCapabilities(model.user?.id);
  const [question,setQuestion]=useState(''),[draft,setDraft]=useState('');const dialog=useRef(null);
  useEffect(()=>{if(draft)dialog.current?.showModal();},[draft]);
  const close=()=>{dialog.current?.close();setDraft('');};
  const ask=value=>{if(!value.trim())return;if((ai?.available&&ai.features?.tutor!==false)){prepareTutorQuestion(value.trim());navigate('/tutor');}else setDraft(value.trim());};
  const save=async()=>{if(!model.user){close();return navigate('/login');}const note={id:crypto.randomUUID(),title:draft.slice(0,120),body:`待解答的问题：\n${draft}\n\n我的思考与实践记录：\n`,updatedAt:new Date().toISOString()};if(await model.saveState({...model.state,notes:[note,...model.state.notes]})){close();setQuestion('');notify('问题已保存为私人学习笔记');}};
  const available=ai?.available&&ai.features?.tutor!==false;
  return <section className="wd-panel wd-tutor"><Heading action="进入导师" onClick={()=>navigate('/tutor')}><Robot size={21}/>AI OPC 导师</Heading><div className="wd-tutor-intro"><img src={robotArt} alt="AI 学习助手插图"/><div><span className={`wd-preview-label ${available?'available':''}`}>{available?'AI 问答已接通':ai?'实时回答未接入':'正在检查服务…'}</span><p>从一个好问题开始，让下一步实践更清晰。</p></div></div><div className="wd-tutor-guidance"><p>梳理产品思路、拆解开发任务，或讨论学习中遇到的难题。</p><small>{available?'进入导师后，可结合你选择的学习资料提问。':'暂不生成模拟回答，可以先保存问题。'}</small></div><button className="wd-primary" onClick={()=>ask(questions[0])}>让 AI 帮我开始<ArrowRight size={16}/></button>
    <form className="wd-question" onSubmit={e=>{e.preventDefault();ask(question);}}><input aria-label="向 AI 导师提问" placeholder="问我一个问题…" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} required/><button aria-label="发送学习问题" disabled={!question.trim()}><ArrowRight size={18}/></button></form>
    <dialog ref={dialog} className="wd-dialog" aria-labelledby="wd-question-title" onCancel={close} onClose={()=>setDraft('')}><button className="wd-dialog-close" aria-label="关闭导师说明" onClick={close}><X size={20}/></button><Robot size={32}/><h2 id="wd-question-title">先收好这个好问题</h2><p>AI 导师尚未接入实时回答。可以先把问题保存为私人笔记，不会生成模拟答案。</p><blockquote>{draft}</blockquote><button className="wd-primary" onClick={save} disabled={model.busy}>保存为学习笔记<ArrowRight size={16}/></button></dialog>
  </section>;
}

export function Workbench({model,navigate,notify}) {
  const {data:site}=useSitePage('workbench');
  const [extra,setExtra]=useState({loading:true,projects:[],mine:[],entry:{},phases:[],notes:[],errors:{}}),[reload,setReload]=useState(0);
  const [selectedDay,setSelectedDay]=useState(localDay),[newTask,setNewTask]=useState('');
  useEffect(()=>{
    let active=true;setExtra({loading:true,projects:[],mine:[],entry:{},phases:[],notes:[],errors:{}});
    const requests={projects:'/learning/projects?limit=12',phases:'/opc/curriculum',...(model.user?{mine:'/learning/me/projects',entry:'/learning/entry',notes:'/learning/notes'}:{})};
    Promise.all(Object.entries(requests).map(async([key,url])=>{try{return [key,await api(url)];}catch(e){return [key,{error:e.message}];}})).then(results=>{
      if(!active)return;const data=Object.fromEntries(results),errors=Object.fromEntries(results.filter(([,value])=>value.error).map(([key,value])=>[key,value.error]));
      setExtra({loading:false,projects:data.projects?.items||[],mine:data.mine?.items||[],entry:data.entry||{},phases:data.phases?.phases||[],notes:data.notes?.items||[],notesMore:data.notes?.nextOffset!=null,errors});
    });return()=>{active=false;};
  },[model.user?.id,reload]);
  const {current}=dashboardCourses(model.library,model.recent),project=currentProject(extra.mine),ownedIds=model.library.map(course=>course.id);
  const currentLessons=(extra.entry.lessons||[]).filter(lesson=>lesson.owner_id===current?.id&&!lesson.locked);
  const activeLesson=[...currentLessons].filter(lesson=>lesson.progress?.version>0&&!lesson.progress.completed_at).sort((a,b)=>String(b.progress.updated_at||'').localeCompare(String(a.progress.updated_at||'')))[0]||currentLessons.find(lesson=>!lesson.progress.completed_at)||currentLessons[0];
  const currentPath=activeLesson?lessonLink(activeLesson):current?courseLearningPath(current.slug):'/courses';
  const recent=recentStudyItems(model.library,extra.entry,extra.mine),legacyRecent=recent.length?[]:learningEntries(model.library,model.recent);
  const configuredIds=new Set((site.projects||[]).map(item=>item.id));
  const recommendations=(configuredIds.size?extra.projects.filter(item=>configuredIds.has(item.id)):extra.projects).slice(0,3);
  const tasks=model.state.tasks.filter(task=>task.date===selectedDay),completed=tasks.filter(task=>task.done).length;
  const achievements=liveAchievements(model.state),privateNotes=liveNotes(model.state).length+extra.notes.filter(note=>!note.deleted_at).length;
  const unavailable=model.loading||Boolean(model.error)||!model.user;
  const addTask=async e=>{e.preventDefault();const title=newTask.trim();if(!title)return;if(!model.user)return navigate('/login');if(await model.saveState({...model.state,tasks:[...model.state.tasks,{id:crypto.randomUUID(),title,date:selectedDay,done:false}]})){setNewTask('');notify('学习任务已添加');}};
  const retry=()=>{setReload(value=>value+1);model.refresh({preserve:true});};
  return <div className="wd-layout wd-product-layout" aria-busy={model.loading||extra.loading}>
    <div className="wd-main">
      <header className="wd-welcome"><div><h1>欢迎回来，<span>{model.user?.name?.trim()||'学习者'}</span><HandWaving size={25} weight="duotone"/></h1><p>继续你的 AI OPC 之旅，让想法变成真实的产品。</p></div><blockquote>“不是更努力地打工，而是用 AI 创造属于自己的机会。”<cite>— OneShowLearn</cite></blockquote></header>
      {(model.error||Object.keys(extra.errors).length>0)&&<div className="wd-error" role="alert">部分学习数据暂时无法读取，已保存内容不会丢失。<button onClick={retry}>重新加载</button></div>}
      <ProductHero model={model} extra={extra} current={current} activeLesson={activeLesson} currentPath={currentPath} project={project} ownedIds={ownedIds} navigate={navigate}/>
      <div className="wd-product-grid">
        <PersonalProducts items={achievements} unavailable={unavailable} loading={model.loading} error={model.error} navigate={navigate}/>
        {(recommendations.length>0||extra.loading||extra.errors.projects)&&<section className="wd-panel wd-recommendations"><Heading action="查看全部" onClick={()=>navigate('/projects')}>推荐实战项目</Heading><p className="wd-panel-subtitle">选择一个感兴趣的项目，开始动手实践</p><div className="wd-project-grid">{recommendations.map(item=><button className="wd-project-card" key={item.id} onClick={()=>navigate(`/projects/${encodeURIComponent(item.slug)}`)}><Cover item={item}/><div><h3>{item.title}</h3><p>{item.description||'跟随教程，从想法走向真实作品'}</p><div className="wd-tags">{(item.settings?.tech_stack?.length?item.settings.tech_stack:item.tags||[]).slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div></div><span className="wd-project-arrow"><ArrowRight size={15}/></span></button>)}</div>{!recommendations.length&&<p className="wd-muted">{extra.loading?'正在加载已发布项目…':'项目推荐暂时无法读取。'}</p>}</section>}
      </div>
      <div className="wd-bottom-grid">
        <section className="wd-panel wd-recent"><Heading action="查看课程" onClick={()=>navigate('/courses')}>最近学习</Heading>
          {recent.map(lesson=><button key={`${lesson.kind}-${lesson.id}`} className="wd-recent-row" onClick={()=>navigate(lessonLink(lesson))}><span className={`wd-item-icon ${lesson.kind==='project'?'mint':'violet'}`}>{lesson.kind==='project'?<Code size={19}/>:<BookOpenText size={19}/>}</span><strong>{lesson.title}</strong><em>{lesson.kind==='project'?'项目':'课程'}</em><span className="wd-recent-progress">{lesson.progress.completed_at?<span className="wd-done"><CheckCircle size={14} weight="fill"/>已完成</span>:<Progress value={watchPercent(lesson)} label={`${lesson.title} 视频观看进度`}/>}</span><time>{studyDate(lesson.progress.updated_at)}</time></button>)}
          {legacyRecent.map(course=><button className="wd-recent-row" key={course.id} onClick={()=>navigate(courseLearningPath(course.slug))}><span className="wd-item-icon violet"><FileText size={19}/></span><strong>{course.title}</strong><em>课程</em><Progress value={courseProgress(course)} label="最近课程进度"/></button>)}
          {!recent.length&&!legacyRecent.length&&<Empty title={extra.loading?'正在读取记录…':'每一次学习，都会留下足迹'} action="浏览学习课程" onClick={()=>navigate('/opc')}>开始阅读或观看后，在这里继续上次的内容。</Empty>}
        </section>
        <section className="wd-panel wd-achievements"><Heading action="查看全部" onClick={()=>navigate('/achievements')}>我的成果</Heading><div className="wd-metrics">{[[model.stats.completedPacks,'完成课程','/courses'],[extra.errors.mine?'—':extra.mine.length,'已开始项目','/projects'],[extra.errors.notes?'—':`${privateNotes}${extra.notesMore?'+':''}`,'学习笔记','/notes'],[achievements.length,'成果记录','/achievements']].map(([value,label,path])=><button key={label} onClick={()=>navigate(path)}><strong>{unavailable||extra.loading?'—':value}</strong><small>{label}</small></button>)}</div><h3 className="wd-small-title">最近成果</h3>{achievements.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,2).map(item=><button key={item.id} className="wd-outcome" onClick={()=>navigate('/achievements')}><span className="wd-item-icon amber"><Trophy size={20}/></span><span><strong>{item.title}</strong><small>{studyDate(item.updatedAt)}</small></span><ArrowRight size={15}/></button>)}{!achievements.length&&<div className="wd-outcome-empty"><Trophy size={26} weight="duotone"/><p>一份 PRD、一个原型，<br/>都是值得记录的进步。</p><button className="wd-link" onClick={()=>navigate('/achievements')}>记录成果<ArrowRight size={14}/></button></div>}</section>
      </div>
    </div>
    <aside className="wd-rail" aria-label="个人学习工具">
      <section className="wd-panel wd-tasks"><Heading action={unavailable?'查看计划':`${completed} / ${tasks.length}`} onClick={()=>navigate('/plan')}>{selectedDay===localDay()?'今日任务':`${selectedDay.slice(5).replace('-','/')} 的任务`}</Heading><div className="wd-task-meter" role="progressbar" aria-label="当天任务完成进度" aria-valuenow={tasks.length?Math.round(completed/tasks.length*100):0} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${tasks.length?completed/tasks.length*100:0}%`}}/></div><div className="wd-task-list">{tasks.slice(0,4).map(task=><label key={task.id} className={task.done?'done':''}><input type="checkbox" checked={task.done} disabled={model.busy||unavailable} onChange={()=>model.saveState({...model.state,tasks:model.state.tasks.map(item=>item.id===task.id?{...item,done:!item.done}:item)})}/><span>{task.title}</span></label>)}{!tasks.length&&<p className="wd-muted">{model.loading?'正在加载任务…':model.error?'任务暂时无法读取':'给今天定一个小目标，从完成一节内容开始。'}</p>}</div><form className="wd-task-add" onSubmit={addTask}><input value={newTask} onChange={e=>setNewTask(e.target.value)} aria-label="新学习任务" placeholder="添加一个学习任务…" maxLength={160} required/><button aria-label="添加任务" disabled={model.busy||model.loading||Boolean(model.error)||!newTask.trim()}><Plus size={18}/></button></form><button className="wd-primary" onClick={()=>navigate('/plan')}>{tasks.length?'查看学习计划':'安排今日任务'}<ArrowRight size={15}/></button></section>
      <TutorPanel model={model} navigate={navigate} notify={notify}/>
      <LearningCalendar model={model} selectedDay={selectedDay} onSelect={setSelectedDay} navigate={navigate} notify={notify}/>
      <div className="wd-inspiration"><img src={welcomeArt} alt=""/><strong>Learn. Build. Grow.</strong><span>更好的你，从今天开始。</span></div>
    </aside>
  </div>;
}
