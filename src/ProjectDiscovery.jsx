import {useEffect, useRef, useState} from 'react';
import {ArrowRight, BookOpenText, CaretRight, Clock, Cube, FileText, LinkSimple, MagnifyingGlass, Play, Robot, X} from '@phosphor-icons/react';
import {safeResourceUrl} from './opc-model.js';
import {currentProject, projectDuration, projectLearningSummary, projectDifficulty, projectAccessLabel} from './project-discovery-model.js';
import {workbenchProjectVisual, workbenchProjectSummary} from './workbench-visual-model.js';
import {Dialog} from './AdminDialog.jsx';
import {FavoriteButton} from './FavoriteButton.jsx';
import hero from './assets/projects-hero-v1.webp';
import webCover from './assets/project-web-cover-v1.webp';
import mobileCover from './assets/project-mobile-cover-v1.webp';
import agentCover from './assets/project-agent-cover-v1.webp';
import interviewCover from './assets/workbench-interview-v1.webp';
import directoryCover from './assets/workbench-directory-v1.webp';
import './project-discovery.css';
import './project-editorial.css';
import './project-catalog-refinement.css';

function categoryLabel(project,categories) {
  return categories.find(c=>c.id===project.settings?.category_id)?.name || project.category || '实战项目';
}
function ProjectArt({project,categories}) {
  const [failed,setFailed]=useState(false);
  const src=safeResourceUrl(project.cover_url);
  const category=categoryLabel(project,categories);
  const visual=workbenchProjectVisual(project);
  const mini=/小程序|mini/i.test(category);
  const fallback=({interview:interviewCover,directory:directoryCover,mobile:mobileCover,agent:agentCover})[visual.key] || webCover;
  const illustrated=!src||failed||visual.useIllustration;
  useEffect(()=>setFailed(false),[project.cover_url]);
  return <div className={`pd-art${illustrated?' pd-art-illustrated':''}${mini?' pd-art-mini':''}`}><img src={illustrated?fallback:src} alt="" loading="lazy" onError={()=>setFailed(true)}/>{illustrated&&<><span className="pd-cover-copy"><small>{category}</small><strong>{visual.title}</strong></span><small>界面示意</small></>}</div>;
}
function OpenProject({project,onOpen,className='pd-dark',children}) {
  const busy=useRef(false);
  const [opening,setOpening]=useState(false),[error,setError]=useState('');
  async function open() {
    if(busy.current)return;
    busy.current=true;setOpening(true);setError('');
    try{await onOpen(project);}catch(e){setError(e.message);}finally{busy.current=false;setOpening(false);}
  }
  return <div className="pd-open"><button className={className} disabled={opening} onClick={open} aria-label={children+'：'+project.title}>{opening?'正在打开…':children}<ArrowRight size={17}/></button>{error&&<p className="pd-open-error" role="alert">{error}</p>}</div>;
}
function ProjectCard({project,categories,onOpen,onDetails,model,navigate}) {
  const visual=workbenchProjectVisual(project);
  const tags=[...new Set([...(project.settings?.tech_stack||[]),...(project.tags||[])])].slice(0,4);
  return <article className={`pd-card${project.settings?.is_recommended?' pd-card-recommended':''}`}>
    <ProjectArt project={project} categories={categories}/>
    <div className="pd-card-body">
      <div className="pd-card-labels"><span className="pd-category">{categoryLabel(project,categories)}</span>{visual.demo&&<span className="pd-demo-status">演示</span>}{Boolean(project.settings?.is_recommended)&&<span className="pd-recommend">推荐</span>}<span className="pd-access">{projectAccessLabel(project)}</span></div>
      <div className="favorite-actions-row"><h2 title={project.title}>{visual.title}</h2><FavoriteButton model={model} navigate={navigate} reference={{kind:'project',id:project.id}} title={project.title} compact/></div>
      <p className="pd-description">{workbenchProjectSummary(project)}</p>
      <p className="pd-audience">适合：{project.settings?.audience||'查看详情了解前置要求与适合人群。'}</p>
      <div className="pd-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      <div className="pd-meta"><span><BookOpenText/>{visual.demo?'课程预览':project.lessonCount>0?`${project.lessonCount} 节课`:'教程待发布'}</span><span><Cube/>{projectDifficulty(project.settings?.difficulty)}</span>{!visual.demo&&project.settings?.estimated_minutes>0&&<span><Clock/>预计实践 {projectDuration(project.settings.estimated_minutes)}</span>}<div className="pd-card-resources">{project.pptCount>0&&<span><FileText/>{project.pptCount} 个课件</span>}{project.promptCount>0&&<span><LinkSimple/>{project.promptCount} 个 Prompt</span>}</div></div>
      <OpenProject className="pd-card-action" project={project} onOpen={project.run?onOpen:onDetails}>{project.run?'继续学习':'查看项目详情'}</OpenProject>
      {project.run&&<button className="pd-details-link" onClick={()=>onDetails(project)}>查看项目详情<ArrowRight size={14}/></button>}
    </div>
  </article>;
}
function ContinueProject({project,categories,onOpen}) {
  const summary=projectLearningSummary(project);
  return <article className="pd-continue-card">
    <div className="pd-continue-cover"><ProjectArt project={project} categories={categories}/><span><Play size={13} weight="fill"/>{summary.percent===100?'回顾项目':'继续学习'}</span></div>
    <div className="pd-continue-body"><span className="pd-category">{categoryLabel(project,categories)}</span><h3>{project.title}</h3><p className="pd-description">{project.description||'跟随课程和配套资料，继续完成项目实践。'}</p>
      <div className="pd-progress"><progress max="100" value={summary.percent} aria-label="项目课时学习进度"/><span>{summary.percent}%</span></div>
      <small className="pd-completed">已学 {summary.completed} / {summary.total} 节课</small>
      <div className="pd-resume-row"><div><small>{summary.percent===100?'课程已学完，可继续复习':'继续学习'}</small><strong>{summary.next?.title||'查看项目目录与学习权限'}</strong></div><OpenProject className="pd-primary" project={project} onOpen={onOpen}>{summary.percent===100?'回顾项目':'继续学习'}</OpenProject></div>
    </div>
  </article>;
}
export function ProjectDiscovery({data,categories,mine,mineStatus,error,query,category,sort,offset,setQuery,setCategory,setSort,setOffset,retry,retryMine,model,navigate,onOpen,onDetails}) {
  const [showMine,setShowMine]=useState(false);
  const catalog=useRef(null);
  const current=mineStatus==='ready'?currentProject(mine):null;
  const canManage=['admin','editor'].includes(model.user?.role);
  const choose=()=>{catalog.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});catalog.current?.focus({preventScroll:true});};
  return <section className="pd-page pd-editorial pd-refined"><div className="pd-main">
    <header className="pd-hero"><img src={hero} alt=""/><div className="pd-hero-content"><nav aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><CaretRight size={14}/><span>实战项目</span></nav><h1>实战项目</h1><p className="pd-hero-value">把学到的，做成自己的产品。</p><p className="pd-hero-subtitle">从一个具体项目开始，逐步练习 AI 产品开发。</p><div className="pd-hero-meta"><span><Cube/>项目驱动学习</span><span><BookOpenText/>课程与配套资料</span><span><Robot/>AI 学习助手</span></div></div><small className="pd-art-label">界面示意</small></header>
    <section className="pd-continue" aria-labelledby="pd-continue-title">{current&&<header className="pd-section-heading"><div><h2 id="pd-continue-title">继续你的项目</h2><p>从上次中断的地方继续，保持创造的节奏。</p></div>{mineStatus==='ready'&&mine.length>0&&<button className="pd-text" onClick={()=>setShowMine(true)}>查看我的全部项目<ArrowRight size={16}/></button>}</header>}
      {current?<ContinueProject key={current.id} project={current} categories={categories} onOpen={onOpen}/>:<div className="pd-continue-empty"><span className="pd-start-icon"><Cube size={30} weight="duotone"/></span><div><h3 id="pd-continue-title">{mineStatus==='loading'?'正在读取你的项目…':mineStatus==='error'?'暂时无法读取学习进度':'开始你的第一个项目'}</h3><p>{mineStatus==='error'?'请重试，你原有的学习记录不会丢失。':mineStatus==='loading'?'正在同步当前账号的学习记录。':mineStatus==='guest'?'先了解项目目标与学习内容，登录后可记录学习进度。':'先了解项目目标与学习内容，再选择适合你的方向。'}</p></div>{mineStatus!=='loading'&&<button className="pd-primary" onClick={mineStatus==='error'?retryMine:choose}>{mineStatus==='error'?'重新加载':'探索项目'}<ArrowRight size={16}/></button>}</div>}
    </section>
    <section className="pd-catalog" ref={catalog} tabIndex={-1} aria-labelledby="pd-catalog-title"><header className="pd-section-heading"><div><h2 id="pd-catalog-title">探索项目</h2><p>看清成果方向，找到适合自己的实战起点。</p></div><div className="pd-search-tools"><label><MagnifyingGlass size={18}/><input aria-label="搜索项目" placeholder="搜索项目、技术栈…" maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</label><select aria-label="项目排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">推荐排序</option><option value="newest">最新发布</option><option value="popular">学习人数</option><option value="difficulty">难度由低到高</option></select></div></header>
      <div className="pd-toolbar"><div className="pd-categories" role="group" aria-label="项目分类"><button aria-pressed={!category} onClick={()=>setCategory(0)}>全部</button>{categories.slice(0,6).map(c=><button key={c.id} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}>{c.name}</button>)}{categories.length>6&&<select aria-label="更多项目分类" value={categories.slice(6).some(c=>c.id===category)?category:''} onChange={e=>setCategory(Number(e.target.value))}><option value="">更多</option>{categories.slice(6).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div></div>
      {error?<div className="pd-empty" role="alert"><h2>项目目录暂时无法读取</h2><p>{error}</p><button className="pd-outline" onClick={retry}>重新加载</button></div>:!data?<div className="pd-empty" role="status">正在读取项目课程…</div>:<><div className="pd-grid pd-equal-grid">{data.items.map(project=><ProjectCard key={project.id} project={project} onOpen={onOpen} onDetails={onDetails} categories={categories} model={model} navigate={navigate}/>)}</div>{!data.items.length&&<div className="pd-empty"><Cube size={36}/><h2>{query||category?'没有找到匹配的项目':'项目课程正在准备中'}</h2><p>{query||category?'试试其他分类或关键词。':'发布后的项目课程、课件和实践资料会显示在这里。'}</p>{query||category?<button className="pd-outline" onClick={()=>{setQuery('');setCategory(0);}}>重置筛选</button>:canManage?<button className="pd-outline" onClick={()=>navigate('/admin/projects')}>前往后台管理项目<ArrowRight/></button>:null}</div>}{data.total>12&&<nav className="pd-pagination" aria-label="项目分页"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-12))}>上一页</button><span>{Math.floor(offset/12)+1} / {Math.ceil(data.total/12)} 页 · {data.total} 个项目</span><button disabled={offset+12>=data.total} onClick={()=>setOffset(offset+12)}>下一页</button></nav>}</>}
    </section><p className="pd-catalog-note">{data?.items.some(p=>workbenchProjectVisual(p).demo)&&'当前包含演示项目。'}实际内容与学习权限以项目详情为准，示意封面不代表正式交付。</p><footer className="pd-footer">“ Learn by doing. Build a bigger you. ”<span>— OneShowLearn</span></footer>
    </div>{showMine&&<Dialog title="我的实战项目" close={()=>setShowMine(false)}><div className="pd-my-list">{mine.map(project=>{const s=projectLearningSummary(project);return <article key={project.id}><div><h3>{project.title}</h3><p>已学 {s.completed} / {s.total} 节课</p></div><OpenProject className="pd-outline" project={project} onOpen={onOpen}>进入项目</OpenProject></article>;})}</div></Dialog>}</section>;
}
