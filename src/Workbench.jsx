import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpenText, CalendarCheck, CaretLeft, CaretRight, Check, CheckCircle, Code, Cube, FileText, HandWaving, Plus, Robot, Trophy, X } from '@phosphor-icons/react';
import { api } from './api.js';
import { useSitePage } from './useSitePage.js';
import { courseArt, localDay } from './Workspace.jsx';
import { courseLearningPath } from './course-reader-model.js';
import { courseProgress, dashboardCourses } from './dashboard-model.js';
import { calendarMonth, currentProject, learningEntries, phaseState, recentStudyItems, watchPercent } from './workbench-model.js';
import { lessonLink } from './LessonWorkspace.jsx';
import { liveAchievements, liveNotes } from './personal-model.js';
import { safeResourceUrl } from './opc-model.js';
import welcomeArt from './assets/workbench-welcome-v2.webp';
import robotArt from './assets/tutor-robot-v2.webp';
import projectWebArt from './assets/project-web-cover-v1.webp';
import projectMobileArt from './assets/project-mobile-cover-v1.webp';
import projectAgentArt from './assets/project-agent-cover-v1.webp';
import './workbench-overview.css';
import { prepareTutorQuestion, useAiCapabilities } from './useAiCapabilities.js';

const phases = [['产品与机会','找到需求，确定方向','green'],['AI 产品开发','用 AI 做出产品','violet'],['上线与合规','域名 / 服务器 / 上架','blue'],['收款与商业化','支付 / 订阅 / 定价','amber'],['运营与增长','SEO / 内容 / 社区','pink']];
const questions = ['我下一步应该做什么？','帮我检查我的 MVP 功能清单','如何用 Codex 开发支付功能？','帮我整理今天的学习问题'];
function Heading({children,action,onClick}) { return <header className="wd-section-heading"><h2>{children}</h2>{action&&<button className="wd-link" onClick={onClick}>{action}<ArrowRight size={14}/></button>}</header>; }
function Progress({value,label}) { return <div className="wd-progress-row"><div className="wd-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${value}%`}}/></div><span>{value}%</span></div>; }
function Empty({icon:Icon=BookOpenText,title,children,action,onClick}) { return <div className="wd-empty"><span><Icon size={27} weight="duotone"/></span><h3>{title}</h3><p>{children}</p>{action&&<button className="wd-link" onClick={onClick}>{action}<ArrowRight size={14}/></button>}</div>; }
function Cover({item}) { const [failed,setFailed]=useState(false);const source=safeResourceUrl(item.cover_url);const project=item.lessonCount!=null;const fallback=project?(/移动|小程序|App/i.test(item.title)?projectMobileArt:/Agent|自动化/i.test(item.title)?projectAgentArt:projectWebArt):courseArt(item);return <div className="wd-cover"><img src={source&&!failed?source:fallback} alt="" onError={()=>setFailed(true)}/>{(!source||failed)&&<small>分类示意</small>}</div>; }
function studyDate(value) { if(!value)return '';const date=new Date(value.includes('T')?value:`${value.replace(' ','T')}Z`);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date); }

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
  return <section className="wd-panel wd-tutor"><Heading action="进入 AI 导师" onClick={()=>navigate('/tutor')}><Robot size={21}/>AI 导师</Heading><div className="wd-tutor-intro"><img src={robotArt} alt="AI 学习助手插图"/><div><span className="wd-preview-label">{(ai?.available&&ai.features?.tutor!==false)?'阿里云百炼 · 文字问答':ai?'功能预览 · 实时回答未接入':'正在检查 AI 服务…'}</span><p>把学习中的疑问收好，让下一步实践更清晰。</p><small><Check size={13}/>整理课程与项目问题</small><small><Check size={13}/>保存为私人学习笔记</small></div></div>
    <form className="wd-question" onSubmit={e=>{e.preventDefault();ask(question);}}><input aria-label="向 AI 导师提问" placeholder="记录一个学习问题…" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} required/><button aria-label="查看提问方式" disabled={!question.trim()}><ArrowRight size={18}/></button></form><h3>推荐问题</h3><div className="wd-suggestions">{questions.map(q=><button key={q} onClick={()=>ask(q)}><span>›</span>{q}</button>)}</div>
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
  const recommendations=(configuredIds.size?extra.projects.filter(item=>configuredIds.has(item.id)):extra.projects).slice(0,4);
  const tasks=model.state.tasks.filter(task=>task.date===selectedDay),completed=tasks.filter(task=>task.done).length;
  const achievements=liveAchievements(model.state),privateNotes=liveNotes(model.state).length+extra.notes.filter(note=>!note.deleted_at).length;
  const unavailable=model.loading||Boolean(model.error)||!model.user;
  const addTask=async e=>{e.preventDefault();const title=newTask.trim();if(!title)return;if(!model.user)return navigate('/login');if(await model.saveState({...model.state,tasks:[...model.state.tasks,{id:crypto.randomUUID(),title,date:selectedDay,done:false}]})){setNewTask('');notify('学习任务已添加');}};
  const retry=()=>{setReload(value=>value+1);model.refresh({preserve:true});};
  return <div className="wd-layout" aria-busy={model.loading||extra.loading}>
    <div className="wd-main">
      <header className="wd-welcome"><img src={welcomeArt} alt=""/><div><h1>欢迎回来，<span>{model.user?.name?.trim()||'学习者'}</span><HandWaving size={25} weight="duotone"/></h1><p>今天继续把你的 AI 产品向前推进一步！</p></div><span className="wd-welcome-motto">学会 AI，<br/>做出你的产品。</span></header>
      {(model.error||Object.keys(extra.errors).length>0)&&<div className="wd-error" role="alert">部分学习数据暂时无法读取，已保存内容不会丢失。<button onClick={retry}>重新加载</button></div>}
      <div className="wd-continue-grid">
        <section className="wd-panel wd-course"><Heading action="进入课程" onClick={()=>navigate('/courses')}>继续学习课程</Heading>
          {current&&!unavailable?<><div className="wd-current"><Cover item={current}/><div><h3>{current.title}</h3><p>{activeLesson?.chapter||current.subtitle||'按自己的节奏继续学习'}</p>{activeLesson&&<p className="wd-current-lesson">{activeLesson.title}</p>}<Progress value={courseProgress(current)} label="当前课程学习进度"/><small>已完成 {current.completedCount||0} / {current.contentCount||0} 项内容{activeLesson?.progress?.updated_at?` · ${studyDate(activeLesson.progress.updated_at)}`:''}</small></div></div><button className="wd-primary wd-continue-action" disabled={extra.loading} onClick={()=>navigate(currentPath)}>{current.startedCount?'继续学习':'开始学习'}<ArrowRight size={16}/></button></>:<Empty title={model.loading?'正在加载课程…':model.error?'学习进度暂不可用':!model.user?'登录后继续你的学习':'准备好开始第一节了吗？'} action={model.loading?null:!model.user?'登录账号':'查看我的课程'} onClick={()=>navigate(model.user?'/courses':'/login')}>你的课程与真实学习进度会显示在这里。</Empty>}
        </section>
        <section className="wd-panel wd-project-current"><Heading action="进入项目" onClick={()=>navigate('/projects')}>继续开发项目</Heading>
          {project&&!unavailable&&!extra.errors.mine?<><div className="wd-current"><Cover item={project}/><div><h3>{project.title}</h3><p>{project.description||'跟随项目教程，完成自己的作品。'}</p><Progress value={project.progress.percent} label="项目学习与验收进度"/><small>学完 {project.progress.completed} / {project.progress.total} 节 · 验收 {project.progress.accepted} / {project.progress.stageCount} 阶段</small></div></div><div className="wd-stage-chips" aria-label="项目阶段">{project.stages.map(stage=><button key={stage.id} className={stage.accepted?'done':stage.lessons.some(lesson=>lesson.id===project.run.current_placement_id)?'current':''} onClick={()=>navigate(`/projects/${encodeURIComponent(project.slug)}/workspace`)}>{stage.title}{stage.accepted?<Check size={13}/>:<span/>}</button>)}</div><button className="wd-link wd-project-resume" onClick={()=>navigate(`/projects/${encodeURIComponent(project.slug)}/workspace`)}>继续项目<ArrowRight size={15}/></button></>:<Empty icon={Cube} title={extra.loading?'正在加载项目…':extra.errors.mine?'项目记录暂不可用':'从一个真实问题开始'} action={!extra.loading?'探索实战项目':null} onClick={()=>navigate('/projects')}>开始项目后，在这里接着完成教程与阶段验收。</Empty>}
        </section>
      </div>
      <section className="wd-panel wd-path"><Heading action="查看完整路径" onClick={()=>navigate('/paths')}>我的学习路径</Heading><div className="wd-phases">{phases.map(([title,description,tone],index)=>{const state=phaseState(extra.phases.find(phase=>phase.id===index+1),ownedIds);return <button key={title} className={`wd-phase wd-tone-${tone}`} onClick={()=>navigate(`/opc/phase/${index+1}`)} aria-label={`${title}，${state==='completed'?'已完成':state==='started'?'学习中':'查看阶段'}`}><span className="wd-phase-number">{state==='completed'?<Check size={17} weight="bold"/>:`0${index+1}`}</span><span><strong>{title}</strong><small>{description}</small></span>{index<4&&<ArrowRight className="wd-phase-arrow" size={16}/>}</button>;})}</div></section>
      {(recommendations.length>0||extra.loading||extra.errors.projects)&&<section className="wd-panel wd-recommendations"><Heading action="查看全部" onClick={()=>navigate('/projects')}>推荐实战项目</Heading><div className="wd-project-grid">{recommendations.map(item=><button className="wd-project-card" key={item.id} onClick={()=>navigate(`/projects/${encodeURIComponent(item.slug)}`)}><Cover item={item}/><div><h3>{item.title}</h3><div className="wd-tags">{(item.settings?.tech_stack?.length?item.settings.tech_stack:item.tags||[]).slice(0,2).map(tag=><span key={tag}>{tag}</span>)}</div><small><BookOpenText size={13}/>{item.lessonCount} 节<Code size={13}/>{item.promptCount} 个 Prompt</small></div></button>)}</div>{!recommendations.length&&<p className="wd-muted">{extra.loading?'正在加载已发布项目…':'项目推荐暂时无法读取。'}</p>}</section>}
      <div className="wd-bottom-grid">
        <section className="wd-panel wd-recent"><Heading action="查看课程" onClick={()=>navigate('/courses')}>最近学习</Heading>
          {recent.map(lesson=><button key={`${lesson.kind}-${lesson.id}`} className="wd-recent-row" onClick={()=>navigate(lessonLink(lesson))}><span className={`wd-item-icon ${lesson.kind==='project'?'mint':'violet'}`}>{lesson.kind==='project'?<Code size={19}/>:<BookOpenText size={19}/>}</span><strong>{lesson.title}</strong><em>{lesson.kind==='project'?'项目':'课程'}</em><span className="wd-recent-progress">{lesson.progress.completed_at?<span className="wd-done"><CheckCircle size={14} weight="fill"/>已完成</span>:<Progress value={watchPercent(lesson)} label={`${lesson.title} 视频观看进度`}/>}</span><time>{studyDate(lesson.progress.updated_at)}</time></button>)}
          {legacyRecent.map(course=><button className="wd-recent-row" key={course.id} onClick={()=>navigate(courseLearningPath(course.slug))}><span className="wd-item-icon violet"><FileText size={19}/></span><strong>{course.title}</strong><em>课程</em><Progress value={courseProgress(course)} label="最近课程进度"/></button>)}
          {!recent.length&&!legacyRecent.length&&<Empty title={extra.loading?'正在读取记录…':'每一次学习，都会留下足迹'} action="浏览学习课程" onClick={()=>navigate('/opc')}>开始阅读或观看后，在这里继续上次的内容。</Empty>}
        </section>
        <section className="wd-panel wd-achievements"><Heading action="查看全部" onClick={()=>navigate('/achievements')}>我的成果</Heading><div className="wd-metrics">{[[model.stats.completedPacks,'完成课程','/courses'],[extra.errors.mine?'—':extra.mine.length,'已开始项目','/projects'],[extra.errors.notes?'—':`${privateNotes}${extra.notesMore?'+':''}`,'学习笔记','/notes'],[achievements.length,'成果记录','/achievements'],[model.stats.streakDays,'连续打卡','/plan']].map(([value,label,path])=><button key={label} onClick={()=>navigate(path)}><strong>{unavailable||extra.loading?'—':value}</strong><small>{label}</small></button>)}</div><h3 className="wd-small-title">最近成果</h3>{achievements.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,2).map(item=><button key={item.id} className="wd-outcome" onClick={()=>navigate('/achievements')}><span className="wd-item-icon amber"><Trophy size={20}/></span><span><strong>{item.title}</strong><small>{studyDate(item.updatedAt)}</small></span><ArrowRight size={15}/></button>)}{!achievements.length&&<div className="wd-outcome-empty"><Trophy size={26} weight="duotone"/><p>一份 PRD、一个原型，<br/>都是值得记录的进步。</p><button className="wd-link" onClick={()=>navigate('/achievements')}>记录成果<ArrowRight size={14}/></button></div>}</section>
      </div>
    </div>
    <aside className="wd-rail" aria-label="个人学习工具">
      <section className="wd-panel wd-tasks"><Heading action={unavailable?'查看计划':`${completed} / ${tasks.length}`} onClick={()=>navigate('/plan')}>{selectedDay===localDay()?'今日任务':`${selectedDay.slice(5).replace('-','/')} 的任务`}</Heading><div className="wd-task-list">{tasks.slice(0,4).map(task=><label key={task.id} className={task.done?'done':''}><input type="checkbox" checked={task.done} disabled={model.busy||unavailable} onChange={()=>model.saveState({...model.state,tasks:model.state.tasks.map(item=>item.id===task.id?{...item,done:!item.done}:item)})}/><span>{task.title}</span></label>)}{!tasks.length&&<p className="wd-muted">{model.loading?'正在加载任务…':model.error?'任务暂时无法读取':'给今天定一个小目标，从完成一节内容开始。'}</p>}</div><form className="wd-task-add" onSubmit={addTask}><input value={newTask} onChange={e=>setNewTask(e.target.value)} aria-label="新学习任务" placeholder="添加一个学习任务…" maxLength={160} required/><button aria-label="添加任务" disabled={model.busy||model.loading||Boolean(model.error)||!newTask.trim()}><Plus size={18}/></button></form><button className="wd-primary" onClick={()=>navigate('/plan')}>{tasks.length?'查看学习计划':'安排今日任务'}<ArrowRight size={15}/></button></section>
      <LearningCalendar model={model} selectedDay={selectedDay} onSelect={setSelectedDay} navigate={navigate} notify={notify}/>
      <TutorPanel model={model} navigate={navigate} notify={notify}/>
    </aside>
  </div>;
}
