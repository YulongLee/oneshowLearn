import {useState} from 'react';
import {ArrowRight, BookOpenText, CaretRight, CheckCircle, Circle, Code, Cube, FileText, Gift, LinkSimple, MagnifyingGlass, Robot, RocketLaunch, Stack, Star, X} from '@phosphor-icons/react';
import {safeResourceUrl} from './opc-model.js';
import {discoveryProgress, projectDuration} from './project-discovery-model.js';
import {questionNote} from './tutor-model.js';
import {Dialog} from './AdminDialog.jsx';
import hero from './assets/projects-hero-v1.webp';
import webCover from './assets/project-web-cover-v1.webp';
import mobileCover from './assets/project-mobile-cover-v1.webp';
import agentCover from './assets/project-agent-cover-v1.webp';
import './project-discovery.css';
import { prepareTutorQuestion, useAiCapabilities } from './useAiCapabilities.js';

const benefits=[[RocketLaunch,'项目驱动学习','从需求出发，做出产品'],[Stack,'完整开发教程','视频 · 课件 · Prompt'],[Code,'配套代码模板','边学边做，逐步实现'],[Gift,'产品落地实践','从开发到发布与运营']];
const guide=[['选择项目','根据兴趣和基础选择方向'],['学习教程','跟随课程理解每个步骤'],['动手开发','使用配套资料，完成实践'],['发布上线','完成验收，部署自己的产品'],['持续运营','获取真实反馈，持续迭代']];
const questions=['如何用 Codex 快速搭建项目？','支付功能如何实现？','部署到服务器的详细步骤？','这个报错应该如何解决？','如何设计产品的商业化方案？'];

function ProjectCard({project,onOpen,categories}) {
  const [failed,setFailed]=useState(false);
  const [opening,setOpening]=useState(false),[openError,setOpenError]=useState('');
  const src=safeResourceUrl(project.cover_url);
  const categoryName=categories.find(c=>c.id===project.settings?.category_id)?.name||'';
  const fallback=['mobile','mini'].includes(project.category)||/移动|小程序/.test(categoryName)?mobileCover:['agent','automation','desktop'].includes(project.category)||/Agent|自动化|桌面/.test(categoryName)?agentCover:webCover;
  const tags=[...new Set([...(project.settings?.tech_stack||[]),...(project.tags||[])])].slice(0,5);
  const difficulty=project.settings?.difficulty;
  const open=async()=>{if(opening)return;setOpening(true);setOpenError('');try{await onOpen(project);}catch(error){setOpenError(error.message);}finally{setOpening(false);}};
  return <article className="pd-card">
    <button className="pd-cover" onClick={open} aria-label={`查看${project.title}`}>
      <img src={src&&!failed?src:fallback} onError={()=>setFailed(true)} alt="" loading="lazy"/>
      {project.settings?.is_recommended===1&&<span className="pd-recommend">推荐</span>}
      {(!src||failed)&&<small>界面示意</small>}
    </button>
    <div className="pd-card-body"><h2><button onClick={open}>{project.title}</button></h2>
      <p className="pd-description">{project.description||'跟随项目课程，逐步完成自己的产品。'}</p>
      <div className="pd-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      <div className="pd-meta"><span><BookOpenText/>{project.lessonCount} 节教程</span><span><FileText/>{project.pptCount} 份 PPT</span><span><LinkSimple/>{project.promptCount} 个 Prompt</span></div>
      <div className="pd-difficulty"><span>难度：{difficulty?<span className="pd-stars" aria-label={`${difficulty} 星，共 5 星`}>{[1,2,3,4,5].map(n=><Star key={n} weight={n<=difficulty?'fill':'regular'} className={n<=difficulty?'filled':''}/>)}</span>:'待配置'}</span><span>预计：{projectDuration(project.settings?.estimated_minutes)}</span></div>
      <button className="pd-view" disabled={opening} onClick={open}>{opening?'正在打开…':project.entitled&&project.lessonCount?'进入学习':'查看项目'}<ArrowRight size={16}/></button>
      {openError&&<p role="alert">{openError}</p>}
    </div>
  </article>;
}

function ProgressRail({mine,status,navigate,retry}) {
  const counts=discoveryProgress(mine);
  const current=mine.find(p=>Number(p.progress?.percent||0)<100)||mine[0];
  return <section className="pd-panel"><header><h2>我的项目进度</h2>{mine.length>0&&<button onClick={()=>document.getElementById('pd-my-projects')?.showModal()}>查看全部<ArrowRight/></button>}</header>
    <div className="pd-counts">{[['started','进行中'],['completed','学习完成'],['pending','待开始']].map(([key,label])=><div key={key}><b>{status==='ready'?counts[key]:'—'}</b><span>{label}</span></div>)}</div>
    {status==='error'?<div className="pd-rail-empty" role="alert">进度暂时无法读取<button className="pd-view" onClick={retry}>重试</button></div>:status==='loading'?<p className="pd-rail-empty" role="status">正在读取你的项目…</p>:status==='guest'?<button className="pd-view" onClick={()=>navigate('/login')}>登录后保存项目进度<ArrowRight/></button>:current?<div className="pd-current">
      <button className="pd-current-title" onClick={()=>navigate(`/projects/${current.slug}/workspace`)}><span><Cube weight="duotone"/></span><div><small>当前项目</small><strong>{current.title}</strong></div><CaretRight/></button>
      <div className="pd-progress"><progress max="100" value={current.progress?.percent||0} aria-label={`${current.title}学习进度`}/><span>{current.progress?.percent||0}%</span></div>
      <ul>{current.stages.slice(0,4).map(stage=><li key={stage.id}><button onClick={()=>navigate(`/projects/${current.slug}/workspace`)}>{stage.accepted?<CheckCircle weight="fill" className="pd-done"/>:<Circle/>}<span>{stage.title}</span><small>{stage.lessons.filter(l=>l.progress?.completed_at).length}/{stage.lessons.length}</small></button></li>)}</ul>
      <small className="pd-hint">进度包含课时学习与阶段验收，不代表产品已上线。</small>
    </div>:<div className="pd-rail-empty"><Cube size={28}/><p>你的第一个项目，从这里开始。</p><small>开始学习后，在这里继续上次的实践。</small></div>}
    <dialog aria-label="我的项目" id="pd-my-projects" className="pd-my-dialog" onClick={e=>{if(e.target===e.currentTarget)e.currentTarget.close();}}><header><h2>我的项目</h2><button aria-label="关闭我的项目" onClick={()=>document.getElementById('pd-my-projects').close()}><X/></button></header>{mine.map(p=><button className="pd-view" key={p.id} onClick={()=>navigate(`/projects/${p.slug}/workspace`)}>{p.title}<span>{p.progress?.percent||0}%</span><ArrowRight/></button>)}</dialog>
  </section>;
}

export function ProjectDiscovery({data,categories,mine,mineStatus,error,query,category,sort,offset,setQuery,setCategory,setSort,setOffset,retry,retryMine,model,navigate,onOpen}) {
  const ai=useAiCapabilities(model.user?.id);
  const [question,setQuestion]=useState(null),[message,setMessage]=useState('');
  const saveQuestion=async()=>{
    if(!model.user)return navigate('/login');
    const note=questionNote(question,null,null,crypto.randomUUID(),new Date().toISOString());
    if(await model.saveState({...model.state,notes:[note,...model.state.notes]})){setQuestion(null);setMessage('问题已保存到学习笔记，尚未发送给 AI。');}
    else setMessage('保存失败，请重试。');
  };
  const canManage=['admin','editor'].includes(model.user?.role);
  return <section className="pd-page"><div className="pd-layout"><div className="pd-main">
    <section className="pd-hero"><img src={hero} alt=""/><div className="pd-hero-content"><nav aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><CaretRight size={14}/><span>实战项目</span></nav><h1>实战项目</h1><p>通过真实项目，掌握 AI 从想法到上线的完整流程，<br/>成为能够独立打造产品的创作者。</p><div className="pd-benefits">{benefits.map(([Icon,title,description])=><div key={title}><span><Icon size={24} weight="duotone"/></span><section><strong>{title}</strong><small>{description}</small></section></div>)}</div></div><small className="pd-art-label">界面示意</small></section>
    <div className="pd-toolbar"><div className="pd-categories" role="group" aria-label="项目分类"><button aria-pressed={!category} onClick={()=>setCategory(0)}>全部项目</button>{categories.slice(0,6).map(c=><button key={c.id} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}>{c.name}</button>)}{categories.length>6&&<select aria-label="更多项目分类" value={categories.slice(6).some(c=>c.id===category)?category:''} onChange={e=>setCategory(Number(e.target.value))}><option value="">更多</option>{categories.slice(6).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div><div className="pd-search-tools"><label><MagnifyingGlass size={17}/><input aria-label="搜索项目" placeholder="搜索项目、技术栈…" maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={15}/></button>}</label><select aria-label="项目排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">推荐排序</option><option value="newest">最新发布</option><option value="popular">学习人数</option><option value="difficulty">难度由低到高</option></select></div></div>
    {error?<div className="pd-empty" role="alert"><h2>项目目录暂时无法读取</h2><p>{error}</p><button className="pd-view" onClick={retry}>重新加载</button></div>:!data?<div className="pd-empty" role="status">正在读取项目课程…</div>:<><div className="pd-grid">{data.items.map(p=><ProjectCard key={p.id} project={p} onOpen={onOpen} categories={categories}/>)}</div>{!data.items.length&&<div className="pd-empty"><Cube size={36}/><h2>{query||category?'没有找到匹配的项目':'项目课程正在准备中'}</h2><p>{query||category?'试试其他分类或关键词。':'发布后的项目课程、配套课件和实践资料会显示在这里。'}</p>{query||category?<button className="pd-view" onClick={()=>{setQuery('');setCategory(0);}}>重置筛选</button>:canManage?<button className="pd-view" onClick={()=>navigate('/admin/projects')}>前往后台管理项目<ArrowRight/></button>:null}</div>}{data.total>12&&<nav className="pd-pagination" aria-label="项目分页"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-12))}>上一页</button><span>{Math.floor(offset/12)+1} / {Math.ceil(data.total/12)} 页 · {data.total} 个项目</span><button disabled={offset+12>=data.total} onClick={()=>setOffset(offset+12)}>下一页</button></nav>}</>}
    </div><aside className="pd-rail" aria-label="项目学习辅助"><ProgressRail mine={mine} status={mineStatus} navigate={navigate} retry={retryMine}/>
      <section className="pd-panel pd-tutor"><header><span className="pd-robot"><Robot size={29} weight="fill"/></span><div><h2>AI 导师 <small>{(ai?.available&&ai.features?.tutor!==false)?'文字问答':'预览'}</small></h2><p>整理项目问题，明确下一步</p></div></header><p className="pd-tutor-intro">开发中遇到了问题？带着具体问题继续实践。</p><div className="pd-questions">{questions.map(q=><button key={q} onClick={()=>{if((ai?.available&&ai.features?.tutor!==false)){prepareTutorQuestion(q);navigate('/tutor');}else{setMessage('');setQuestion(q);}}}>{q}<CaretRight/></button>)}</div><button className="pd-primary" onClick={()=>navigate('/tutor')}>前往 AI 导师<ArrowRight/></button><small className="pd-hint">{(ai?.available&&ai.features?.tutor!==false)?'由阿里云百炼提供文字回答，请核对建议。':ai?'实时 AI 尚未接入，问题可保存为私人笔记。':'正在检查 AI 服务…'}</small></section>
      <section className="pd-panel pd-guide"><header><h2>项目学习路径</h2><button onClick={()=>navigate('/paths')}>查看路线<ArrowRight/></button></header><ol>{guide.map(([title,desc],i)=><li key={title}><b>{i+1}</b><div><strong>{title}</strong><p>{desc}</p></div></li>)}</ol></section>
    </aside></div>{message&&<p className="pd-feedback" role="status">{message}</p>}{question!==null&&<Dialog title="记录项目问题" close={()=>setQuestion(null)}><div className="pd-question-form"><p>此操作保存私人笔记，不会生成模拟 AI 回答。</p><textarea aria-label="项目问题" maxLength={4000} rows={5} value={question} onChange={e=>setQuestion(e.target.value)}/><button className="pd-primary" disabled={!question.trim()||model.busy} onClick={saveQuestion}>{model.busy?'保存中…':'保存到学习笔记'}<ArrowRight/></button></div></Dialog>}</section>;
}
