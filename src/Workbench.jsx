import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpenText,CalendarBlank,ChartBar,Check,CheckCircle,ClipboardText,Code,CreditCard,Cube,FileText,Lightbulb,Play,Plus,Robot,RocketLaunch,SquaresFour,Trophy,X} from '@phosphor-icons/react';
import {api} from './api.js';
import {sharedRead} from './shared-reads.js';
import {useSitePage} from './useSitePage.js';
import {localDay,courseArt} from './Workspace.jsx';
import {courseLearningPath} from './course-reader-model.js';
import {currentProject,currentProductAchievement,recentStudyItems,watchPercent,workbenchSelection,workbenchPhaseState} from './workbench-model.js';
import {lessonLink} from './lesson-link.js';
import {liveAchievements,STAGES} from './personal-model.js';
import {safeResourceUrl} from './opc-model.js';
import {prepareTutorQuestion,useAiCapabilities} from './useAiCapabilities.js';
import {BrandIdentity} from './BrandIdentity.jsx';
import {workbenchProjectVisual,workbenchProjectSummary} from './workbench-visual-model.js';
import {WorkbenchProjectCarousel} from './WorkbenchProjectCarousel.jsx';
import {orderedWorkbenchProjects} from './workbench-carousel-model.js';
import coursePreviewArt from './assets/workbench-course-preview-v1.webp';
import interviewArt from './assets/workbench-interview-v1.webp';
import directoryArt from './assets/workbench-directory-v1.webp';
import tutorRobotArt from './assets/tutor-robot-v2.webp';
import projectMobileArt from './assets/project-mobile-cover-v1.webp';
import projectAgentArt from './assets/project-agent-cover-v1.webp';
import './workbench-overview.css';
import './workbench-product.css';

const phases=['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'];
const phaseIcons=[Lightbulb,Code,RocketLaunch,CreditCard,ChartBar];
const blank=accountId=>({accountId,loading:true,projects:[],mine:[],entry:{},errors:{}});
function Heading({children,action,onClick}) {return <header className="wd-section-heading"><h2>{children}</h2>{action&&<button className="wd-link" onClick={onClick}>{action}<ArrowRight size={15}/></button>}</header>;}
function Progress({value,label}) {return <div className="wd-progress-row"><div className="wd-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${value}%`}}/></div><span>{value}%</span></div>;}
function Cover({item,project=false}) {
  const [failed,setFailed]=useState(false),visual=workbenchProjectVisual(item),source=safeResourceUrl(item.cover_url);
  const fallback=project||item.lessonCount!=null?({interview:interviewArt,directory:directoryArt,mobile:projectMobileArt,agent:projectAgentArt}[visual.key]):courseArt(item);
  const generic=!source||failed||((project||item.lessonCount!=null)&&visual.useIllustration);
  useEffect(()=>setFailed(false),[item.cover_url]);
  return <div className="wd-cover"><img src={generic?fallback:source} alt="" loading="lazy" onError={()=>setFailed(true)}/>{generic&&<small>分类示意</small>}{visual.demo&&<span className="wd-demo-badge">演示</span>}</div>;
}
function CoursePreview({course,lesson,navigate,path,disabled,guest}) {
  const [failed,setFailed]=useState(false),opc=course?.slug==='ai-opc-product-company',source=safeResourceUrl(course?.cover_url),illustratedOpc=opc&&(!source||failed);
  useEffect(()=>setFailed(false),[course?.cover_url]);
  return <button className={`wd-course-preview${illustratedOpc?' wd-opc-preview':''}`} disabled={disabled} aria-label={`打开${lesson?.title||course?.title||'课程'}学习`} onClick={()=>navigate(guest?'/login':path)}>
    <img src={source&&!failed?source:opc?coursePreviewArt:courseArt(course)} alt="" onError={()=>setFailed(true)}/>
    {illustratedOpc&&<div className="wd-preview-copy"><span className="wd-preview-brand"><BrandIdentity/></span><strong>AI OPC</strong><span>一个人的产品公司</span><small>从想法到产品<br/>用 AI 创造更多可能</small></div>}
    <span className="wd-preview-play"><Play size={25} weight="fill"/></span><span className="wd-preview-label">{lesson?.is_demo_media?'演示素材':lesson?.is_preview?'课程预览':'进入课程'}</span>
  </button>;
}
function studyDate(value) {if(!value)return '';const date=new Date(value.includes('T')?value:`${value.replace(' ','T')}Z`);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);}

function ProductHero({model,extra,selection,navigate}) {
  const {course,lesson,total,completed,percent,started,finished,owned}=selection;
  const loading=model.loading||extra.loading, error=model.error||extra.errors.entry;
  const path=lesson?lessonLink(lesson):course?courseLearningPath(course.slug):'/opc';
  const title=loading?'正在读取你的课程…':error?'课程记录暂时无法读取':lesson?.title||course?.title||'从课程开始，建立你的产品能力';
  const status=!model.user?'登录后保存学习记录':!owned?'免费课时体验':finished?'课程学习已完成':started?'继续上次学习':'尚未开始';
  return <section className="wd-product-hero" aria-labelledby="wd-hero-title">
    <div className="wd-hero-copy"><span className="wd-hero-eyebrow">{course?.title||'你的课程学习入口'}</span><h2 id="wd-hero-title">把想法，做成你的<br/>第一个 AI 产品</h2>
      <p id="wd-current-lesson" className="wd-current-lesson">{loading||error?'':started?'正在学习 · ':'从这里开始 · '}{title}</p>
      <p className="wd-hero-goal">{!error?'从一节课程开始，建立你的产品能力。':'请重新加载后继续，已保存的学习记录不会丢失。'}</p>
      {!loading&&!error&&<span className="wd-study-status">{status}</span>}
      <div className="wd-hero-actions"><button className="wd-primary" disabled={loading||Boolean(error)} onClick={()=>navigate(model.user?path:'/login')}>{!model.user?'登录后开始学习':finished?'回顾课程':!owned&&lesson?'开始免费试听':started?'继续学习':'开始学习'}<ArrowRight size={18}/></button><button className="wd-link" onClick={()=>navigate(course?courseLearningPath(course.slug):'/opc')}>查看完整课程目录<ArrowRight size={15}/></button></div>
    </div>
    <CoursePreview course={course} lesson={lesson} navigate={navigate} path={path} disabled={loading||Boolean(error)} guest={!model.user}/>
    <div className="wd-course-meter"><span>课程进度</span><div className="wd-progress" role="progressbar" aria-label="课程完成进度" aria-valuenow={error?0:percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${error?0:percent}%`}}/></div><strong>{loading||error?'待读取':total?`${completed} / ${total} 节`:'目录待更新'}</strong><span>{loading||error?'':`${percent}%`}</span></div>
  </section>;
}

function LearningPath({selection,extra,model,navigate}) {
  return <section className="wd-learning-path"><Heading>你的五章学习路径</Heading><p className="wd-panel-subtitle">按课程顺序，逐步建立产品能力。</p><ol className="wd-learning-phases" aria-label="课程五章学习进度">{phases.map((title,index)=>{
    const status=model.loading||model.error||extra.loading||extra.errors.entry?'unavailable':workbenchPhaseState(selection.lessons,index+1,selection.lesson);
    const label={completed:'已完成',started:'学习中',current:'从这里开始',pending:'尚未开始',unconfigured:'目录待更新',unavailable:'进度待读取'}[status];
    const Icon=phaseIcons[index];
    return <li key={title} className={`${status} wd-phase-${index+1}`}><button aria-current={status==='current'||selection.lesson?.phase===index+1?'step':undefined} onClick={()=>navigate(`/opc/phase/${index+1}`)}><span>{status==='completed'?<Check size={19}/>:String(index+1).padStart(2,'0')}</span><strong>{title}</strong><small>{label}</small><i className="wd-phase-icon" aria-hidden="true"><Icon size={30}/></i></button></li>;
  })}</ol></section>;
}
function RecentLearning({recent,navigate}) {
  return <section className="wd-panel wd-recent"><Heading action="查看课程" onClick={()=>navigate('/courses')}>最近学习</Heading>{recent.slice(0,3).map(lesson=><button key={`${lesson.kind}-${lesson.id}`} className="wd-recent-row" onClick={()=>navigate(lessonLink(lesson))}><span className="wd-recent-thumbnail">{lesson.kind==='course'&&lesson.owner_slug==='ai-opc-product-company'?<><img src={coursePreviewArt} alt=""/><b>AI OPC</b></>:lesson.kind==='project'?<Code size={25}/>:<BookOpenText size={25}/>}</span><span className="wd-recent-content"><strong>{lesson.title}</strong><span className="wd-recent-progress">{lesson.progress.completed_at?<span className="wd-done"><CheckCircle size={16} weight="fill"/>已完成</span>:<Progress value={watchPercent(lesson)} label="视频观看进度"/>}</span><time>{studyDate(lesson.progress.updated_at)}</time></span><span className="wd-recent-action">{lesson.progress.completed_at?'回顾课程':'继续学习'}<ArrowRight size={15}/></span></button>)}</section>;
}
function CurrentProject({project,navigate}) {
  return <section className="wd-panel wd-current-project"><Heading action="查看我的项目" onClick={()=>navigate('/projects')}>继续你的实战项目</Heading><div className="wd-resume-project"><Cover item={project} project/><div><h3>{project.title}</h3><p>课程学习与阶段验收进度，不代表产品已上线。</p><Progress value={project.progress?.percent||0} label="项目学习与验收进度"/><small>学完 {project.progress?.completed||0} / {project.progress?.total||0} 节 · 验收 {project.progress?.accepted||0} / {project.progress?.stageCount||0} 阶段</small></div><button className="wd-secondary" onClick={()=>navigate(`/projects/${encodeURIComponent(project.slug)}/workspace`)}>继续项目<ArrowRight size={16}/></button></div></section>;
}
function PersonalProducts({items,model,navigate}) {
  const item=currentProductAchievement(items);
  return <section className="wd-panel wd-personal-products"><Heading action="查看全部产品" onClick={()=>navigate('/achievements')}>我的 AI 产品</Heading><div className="wd-personal-product"><span className="wd-product-icon"><Cube size={27}/></span><div><h3>{item.title}</h3><p>{item.description||'为自己的产品留下一份进展记录。'}</p><span className="wd-study-status">{STAGES[item.stage]||'个人记录'}</span><small>更新于 {studyDate(item.updatedAt)} · 个人记录</small></div><button className="wd-link" disabled={model.loading||Boolean(model.error)} onClick={()=>navigate('/achievements')}>查看产品<ArrowRight size={15}/></button></div></section>;
}
function GrowthEntry({model,items,navigate}) {
  const product=currentProductAchievement(items), outcomes=items.filter(item=>item.type!=='product').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const error=model.error,loading=model.loading;
  return <section className="wd-panel wd-growth-entry" aria-label="产品与成果记录">
    <div><span className="wd-product-icon"><Cube size={27}/></span><div><h2>{product?'记录产品的下一步':'记录你的产品想法'}</h2><p>{loading?'正在读取个人记录…':error?'个人记录暂不可用，请重试加载。':'把想法、原型和上线过程，留在自己的成长档案里。'}</p><button className="wd-link" disabled={loading||Boolean(error)} onClick={()=>navigate(model.user?'/achievements':'/login')}>{model.user?'记录我的产品':'登录后记录'}<ArrowRight size={15}/></button></div></div>
    <div><span className="wd-product-icon"><Trophy size={27}/></span><div><h2>{outcomes.length?'最近的成果':'每一步，都值得留下'}</h2><p>{!loading&&!error&&outcomes[0]?outcomes[0].title:'课程笔记与实践成果，随时整理和回顾。'}</p><button className="wd-link" disabled={loading||Boolean(error)} onClick={()=>navigate(model.user?'/achievements':'/login')}>查看我的成果<ArrowRight size={15}/></button></div></div>
  </section>;
}
function TutorPanel({model,selection,navigate,notify}) {
  const ai=useAiCapabilities(model.user?.id),[question,setQuestion]=useState(''),[draft,setDraft]=useState(''),saving=useRef(false),dialog=useRef(null);
  const available=Boolean(model.user&&ai?.available&&ai.features?.tutor!==false);
  useEffect(()=>{if(draft)dialog.current?.showModal();},[draft]);
  const close=()=>{dialog.current?.close();setDraft('');};
  const ask=value=>{
    if(!value.trim())return;if(!model.user)return navigate('/login');
    const text=selection.lesson?`我正在学习《${selection.course.title}》的“${selection.lesson.title}”。\n${value.trim()}\n请依据可访问的已发布课程文字资料回答，资料没有涉及时请说明。`:value.trim();
    if(available){prepareTutorQuestion(text,{accountId:model.user.id,courseId:selection.owned?selection.course?.id:null});navigate('/tutor');}else setDraft(text);
  };
  const save=async()=>{
    if(saving.current||model.busy||model.loading||model.error)return;
    if(model.state.notes.length>=100)return notify('笔记已达上限，请先整理学习笔记。');
    saving.current=true;
    try{const note={id:crypto.randomUUID(),title:draft.slice(0,120),body:`待解答的问题：\n${draft}\n\n我的思考与实践记录：\n`,updatedAt:new Date().toISOString()};if(await model.saveState({...model.state,notes:[note,...model.state.notes]})){close();setQuestion('');notify('问题已保存为私人学习笔记');}}finally{saving.current=false;}
  };
  return <section className="wd-panel wd-tutor"><div className="wd-tutor-heading"><img src={tutorRobotArt} alt=""/><Heading action="进入导师" onClick={()=>navigate('/tutor')}>课程学习助手</Heading></div><span className="wd-tutor-scope">{selection.lesson?'围绕当前课程准备问题':'选择课程，获取学习帮助'}</span><p className="wd-panel-subtitle">{!model.user?'登录后使用课程答疑。':available?'学习遇到问题？让 AI 帮你把难点讲清楚。':ai?'实时回答未接入，可先保存问题。':'正在检查服务…'}</p><div className="wd-tutor-shortcuts">{[[Lightbulb,'解释本节核心概念'],[FileText,'梳理本节学习重点'],[Cube,'我该如何开始实践']].map(([Icon,title])=><button key={title} disabled={model.loading||Boolean(model.error)||!ai} onClick={()=>ask(selection.lesson?title:`请帮我${title.replace('本节','课程')}，先问我正在学习哪个课程。`)}><Icon size={19}/><span>{title}</span><ArrowRight size={14}/></button>)}</div><small className="wd-tutor-confirm">点击后准备问题，由你确认发送，不自动调用 AI。</small>
    <form className="wd-question" onSubmit={e=>{e.preventDefault();ask(question);}}><input aria-label="向 AI 导师提问" placeholder="问一个课程相关问题…" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} required/><button aria-label="准备课程问题" disabled={!question.trim()||model.loading||Boolean(model.error)||!ai}><ArrowRight size={19}/></button></form>
    <dialog ref={dialog} className="wd-dialog" aria-labelledby="wd-question-title" onCancel={close} onClose={()=>setDraft('')}><button className="wd-dialog-close" aria-label="关闭导师说明" onClick={close}><X size={20}/></button><Robot size={32}/><h2 id="wd-question-title">先收好这个好问题</h2><p>AI 导师暂不可用。可以先保存为私人笔记，不会生成模拟回答。</p><blockquote>{draft}</blockquote><button className="wd-secondary" onClick={save} disabled={model.busy||model.loading||Boolean(model.error)}>保存为学习笔记<ArrowRight size={16}/></button></dialog>
  </section>;
}
function LearningCalendar({model,recent,navigate}) {
  const unavailable=model.loading||model.error||!model.user,checked=model.state.checkIns.length;
  return <section className="wd-panel wd-calendar-summary"><Heading>学习节奏</Heading><div><CalendarBlank size={28}/><p>{model.loading?'正在读取学习记录…':model.error?'学习记录暂时不可用。':!model.user?'登录后保存自己的学习记录。':recent.length?`最近学习：${recent[0].title}`:checked?`已有 ${checked} 天手动打卡记录，打卡不代表课程完成。`:'完成第一次学习后，在这里回顾你的学习记录。'}</p></div><button className="wd-link" disabled={model.loading||Boolean(model.error)} onClick={()=>navigate(unavailable?'/login':'/plan')}>打开学习日历<ArrowRight size={15}/></button></section>;
}

export function Workbench({model,navigate,notify}) {
  const {data:site}=useSitePage('workbench');
  const accountId=model.user?.id??null,[stored,setStored]=useState(()=>blank(accountId)),[reload,setReload]=useState(0),[newTask,setNewTask]=useState('');
  const taskSaving=useRef(false);
  // During account changes do not show a previous account's project/progress snapshot.
  const extra=stored.accountId===accountId?stored:blank(accountId);
  useEffect(()=>{
    let active=true;setStored(blank(accountId));
    const requests={projects:'/learning/projects?limit=12',entry:'/learning/entry',...(accountId?{mine:'/learning/me/projects'}:{})};
    Promise.all(Object.entries(requests).map(async([key,url])=>{try{return [key,await (key==='entry'?sharedRead(url):api(url))];}catch(e){return [key,{error:e.message}];}})).then(results=>{
      if(!active)return;const data=Object.fromEntries(results),errors=Object.fromEntries(results.filter(([,value])=>value.error).map(([key,value])=>[key,value.error]));
      setStored({accountId,loading:false,projects:data.projects?.items||[],mine:data.mine?.items||[],entry:data.entry||{},errors});
    });return()=>{active=false;};
  },[accountId,reload]);
  const selection=workbenchSelection(model.library,extra.entry,model.recent),unavailable=model.loading||Boolean(model.error)||!model.user;
  const recent=unavailable||extra.loading?[]:recentStudyItems(model.library,extra.entry,extra.mine);
  const project=!unavailable&&!extra.loading&&!extra.errors.mine?currentProject(extra.mine):null;
  const recommendations=orderedWorkbenchProjects(extra.projects,site.projects||[]);
  const tasks=model.state.tasks.filter(task=>task.date===localDay()),completed=tasks.filter(task=>task.done).length;
  const achievements=unavailable?[]:liveAchievements(model.state),personalProduct=currentProductAchievement(achievements);
  const suggestedTitle=selection.lesson?`学习 ${selection.lesson.title}`.slice(0,160):'选择一节课程，开始今天的学习';
  const suggestionAdded=tasks.some(task=>task.title===suggestedTitle);
  const saveTask=async(title)=>{
    if(taskSaving.current||model.busy||model.loading||model.error)return;
    if(!model.user)return navigate('/login');
    if(model.state.tasks.length>=200)return notify('任务已达上限，请先在学习计划中整理。');
    if(!title.trim())return;
    taskSaving.current=true;try{if(await model.saveState({...model.state,tasks:[...model.state.tasks,{id:crypto.randomUUID(),title:title.trim().slice(0,160),date:localDay(),done:false}]})){setNewTask('');notify('学习任务已添加');}}finally{taskSaving.current=false;}
  };
  const retry=()=>{setReload(value=>value+1);model.refresh({preserve:true});};
  return <div className="wd-layout wd-product-layout wd-refined" aria-busy={model.loading||extra.loading}>
    <div className="wd-main"><header className="wd-welcome"><div><h1>{model.user?'欢迎回来，':'欢迎来到工作台'}{model.user&&<span>{model.user.name?.trim()||'学习者'}</span>}</h1><p>{selection.started?'继续上次的学习，让想法向前推进一步。':'今天，从一节课开始，把想法向前推进一步。'}</p></div><span className="wd-workspace-tag"><SquaresFour size={17}/>我的学习工作台</span></header>
      {(model.error||Object.keys(extra.errors).length>0)&&<div className="wd-error" role="alert">部分学习数据暂时无法读取，已保存内容不会丢失。<button onClick={retry}>重新加载</button></div>}
      <ProductHero model={model} extra={extra} selection={selection} navigate={navigate}/>
      <LearningPath selection={selection} extra={extra} model={model} navigate={navigate}/>
      {recent.length>0&&<RecentLearning recent={recent} navigate={navigate}/>}
      {project&&<CurrentProject project={project} navigate={navigate}/>}
      {(recommendations.length>0||extra.loading||extra.errors.projects)&&<section className="wd-recommendations"><Heading action="查看全部项目" onClick={()=>navigate('/projects')}>从学习，走向实战</Heading><p className="wd-panel-subtitle">从真实项目出发，练习完整的产品开发流程。</p><WorkbenchProjectCarousel items={recommendations} renderItem={item=>{const visual=workbenchProjectVisual(item);return <button className="wd-project-card" onClick={()=>navigate(`/projects/${encodeURIComponent(item.slug)}`)}><Cover item={item} project/><div className="wd-project-card-copy"><h3>{visual.title}</h3><p>{workbenchProjectSummary(item)}</p>{visual.tags.length>0&&<div className="wd-project-tags">{visual.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}{visual.demo&&<small className="wd-project-demo">演示项目 · 正式教学内容待补充</small>}<span className="wd-link">了解项目<ArrowRight size={15}/></span></div></button>;}}/>{!recommendations.length&&<p className="wd-muted">{extra.loading?'正在加载已发布项目…':'项目推荐暂时无法读取，请重新加载。'}</p>}</section>}
      {personalProduct&&<PersonalProducts items={achievements} model={model} navigate={navigate}/>}
      <GrowthEntry model={model} items={achievements} navigate={navigate}/>
    </div>
    <aside className="wd-rail" aria-label="个人学习工具">
      <section className="wd-panel wd-tasks"><Heading action="查看学习计划" onClick={()=>navigate('/plan')}>{tasks.length?'今日任务':<><CalendarBlank size={23}/>今日学习</>}</Heading>{tasks.length>0&&!unavailable?<><p className="wd-task-count">已完成 {completed} / {tasks.length} 项</p><div className="wd-task-list">{tasks.slice(0,3).map(task=><label key={task.id} className={task.done?'done':''}><input type="checkbox" checked={task.done} disabled={model.busy||unavailable} onChange={()=>model.saveState({...model.state,tasks:model.state.tasks.map(item=>item.id===task.id?{...item,done:!item.done}:item)})}/><span>{task.title}</span></label>)}</div><form className="wd-task-add" onSubmit={e=>{e.preventDefault();saveTask(newTask);}}><input value={newTask} onChange={e=>setNewTask(e.target.value)} aria-label="新学习任务" placeholder="添加一个学习任务…" maxLength={160} required/><button aria-label="添加任务" disabled={model.busy||unavailable||!newTask.trim()}><Plus size={18}/></button></form></>:<><div className="wd-task-empty-art" aria-hidden="true"><ClipboardText size={68} weight="duotone"/></div><span className="wd-task-suggestion-label">{unavailable?'登录后管理学习任务':'尚未添加学习任务'}</span><div className="wd-task-suggestion"><div><strong>{model.loading||extra.loading?'正在读取建议…':model.error||extra.errors.entry?'建议暂不可用':suggestedTitle}</strong><p>建议任务 · 从一节内容开始，建立今天的学习节奏。</p></div></div><button className="wd-secondary" disabled={model.loading||extra.loading||model.busy||Boolean(model.error)||Boolean(extra.errors.entry)||suggestionAdded} onClick={()=>saveTask(suggestedTitle)}>{model.user?'加入今日计划':'登录后加入计划'}<Plus size={17}/></button></>}</section>
      <TutorPanel key={accountId||'guest'} model={model} selection={selection} navigate={navigate} notify={notify}/>
      <LearningCalendar model={model} recent={recent} navigate={navigate}/>
      <div className="wd-inspiration"><strong>Learn. Build. Grow.</strong><span>让学习有方向，让想法有作品。</span></div>
    </aside>
  </div>;
}
