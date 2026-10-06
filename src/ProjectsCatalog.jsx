import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpenText, CaretRight, Check, CheckCircle, Clock, Cube, FileText, LockKey, NotePencil, Robot, Star, X } from '@phosphor-icons/react';
import { api } from './api.js';
import { CONTENT_TYPES, safeResourceUrl } from './opc-model.js';
import { PROJECT_CATEGORIES, estimatedTime, filterProjects, projectCategory, projectStats, projectStatus } from './project-model.js';
import hero from './assets/projects-hero-v1.webp';
import poster from './assets/projects-quote-v1.webp';
import webCover from './assets/project-web-cover-v1.webp';
import mobileCover from './assets/project-mobile-cover-v1.webp';
import agentCover from './assets/project-agent-cover-v1.webp';
import './projects.css';

const prompts = ['如何用 Codex 快速开发 MVP？','微信小程序上线需要哪些步骤？','帮我设计一个数据库结构','这个报错应该如何解决？'];
const formatLabels = { document:'文档', prompt:'Prompt', code:'代码', template:'模板', task:'任务', checklist:'清单', video:'视频', download:'资源' };
const steps = [['选择项目','根据兴趣或需求选择一个项目'],['学习教程','跟随课程完成每个步骤'],['动手开发','边学边做，完成你的项目'],['记录成果','整理作品链接与实践心得'],['发布上线','部署并分享你的产品']];

function ProjectImage({pack,...props}) {
  const [failed,setFailed]=useState(false);
  const src=safeResourceUrl(pack.cover_url);
  const category=projectCategory(pack);
  const fallback=['mobile','mini'].includes(category)?mobileCover:['agent','automation','desktop'].includes(category)?agentCover:webCover;
  return <div {...props}><img src={!failed&&src?src:fallback} onError={()=>setFailed(true)} alt="" loading="lazy"/>{(!src||failed)&&<small>界面示意</small>}</div>;
}
function Dialog({title,close,children,wide=false}) {
  const ref=useRef(null);
  useEffect(()=>{const element=ref.current;element.showModal();return()=>element.close();},[]);
  return <dialog ref={ref} className={`pj-dialog ${wide?'pj-wide':''}`} aria-labelledby="pj-modal-title" onCancel={close} onClick={e=>e.target===e.currentTarget&&close()}><header><h2 id="pj-modal-title">{title}</h2><button aria-label="关闭窗口" onClick={close}><X size={20}/></button></header>{children}</dialog>;
}

function ProjectDetail({pack,start,model,navigate,notify,close}) {
  const [data,setData]=useState(null),[item,setItem]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const revision=useRef(0);
  const openItem=async(metadata,slug=pack.slug)=>{
    if(metadata.locked){setError('此内容需要课程权限。可先阅读免费预览，或查看账号已有的课程权益。');return;}
    const rev=++revision.current;setBusy(true);setError('');setItem(null);
    try {
      const result=await api(`/projects/${encodeURIComponent(slug)}/content/${metadata.id}`);
      if(rev!==revision.current)return;
      setItem({...result.item,progress:metadata.progress});
      if(model.user&&metadata.progress!=='completed'){
        await api(`/me/progress/${metadata.id}`,{method:'PUT',body:JSON.stringify({status:'started'})});
        if(rev!==revision.current)return;
        setData(d=>({...d,chapters:d.chapters.map(c=>({...c,items:c.items.map(i=>i.id===metadata.id?{...i,progress:'started'}:i)}))}));
        await model.refresh({preserve:true});
      }
    }catch(e){if(rev===revision.current)setError(e.message);}
    finally{if(rev===revision.current)setBusy(false);}
  };
  const load=async()=>{
    const rev=++revision.current;setLoading(true);setError('');
    try{
      const result=await api(`/projects/${encodeURIComponent(pack.slug)}`);
      if(rev!==revision.current)return;
      setData(result);
      if(start){const items=result.chapters.flatMap(c=>c.items);const next=items.find(i=>!i.locked&&i.progress!=='completed')||items.find(i=>!i.locked);if(next)openItem(next);}
    }catch(e){if(rev===revision.current)setError(e.message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();return()=>{revision.current++;};},[]);
  const complete=async()=>{
    if(!model.user)return navigate('/login');
    setBusy(true);setError('');const rev=revision.current;
    try{
      await api(`/me/progress/${item.id}`,{method:'PUT',body:JSON.stringify({status:'completed'})});
      if(rev!==revision.current)return;
      setItem(i=>({...i,progress:'completed'}));
      setData(d=>({...d,chapters:d.chapters.map(c=>({...c,items:c.items.map(i=>i.id===item.id?{...i,progress:'completed'}:i)}))}));
      await model.refresh({preserve:true});notify('已保存这项内容的学习进度');
    }catch(e){if(rev===revision.current)setError(e.message);}
    finally{if(rev===revision.current)setBusy(false);}
  };
  return <Dialog title={pack.title} close={close} wide><div className="pj-detail">
    {error&&<div className="pj-alert" role="alert">{error}{!data&&<button onClick={load}>重新加载</button>}</div>}
    {loading?<div className="pj-empty">正在读取项目资料…</div>:data&&<>
      <div className="pj-detail-intro"><p>{data.description||data.subtitle||'跟随项目文档，逐步完成实践。'}</p><div><span><Cube size={16}/>目标：{data.deliverable||'完成项目实践与总结'}</span><button className="pj-outline" disabled={model.busy} onClick={async()=>{if(!model.user)return navigate('/login');const selected=model.state.favorites.includes(pack.id);if(await model.saveState({...model.state,favorites:selected?model.state.favorites.filter(id=>id!==pack.id):[...model.state.favorites,pack.id]}))notify(selected?'已取消收藏':'项目已收藏');}}><Star size={15} weight={model.state.favorites.includes(pack.id)?'fill':'regular'}/>{model.state.favorites.includes(pack.id)?'已收藏':'收藏项目'}</button></div></div>
      {!data.entitled&&<div className="pj-access"><LockKey size={16}/><span>当前账号尚未拥有完整项目权限，可阅读已开放的预览资料。</span><button onClick={()=>navigate(model.user?'/membership':'/login')}>{model.user?'查看课程权益':'登录账号'}<ArrowRight size={13}/></button></div>}
      <div className="pj-reader"><nav aria-label="项目章节目录">{data.chapters.map((chapter,index)=><section key={chapter.id}><h3>{String(index+1).padStart(2,'0')} · {chapter.title}</h3>{chapter.items.map(i=><button key={i.id} className={item?.id===i.id?'selected':''} disabled={busy} onClick={()=>openItem(i)}>{i.locked?<LockKey size={14}/>:i.progress==='completed'?<CheckCircle size={14} weight="fill"/>:<FileText size={14}/>}<span>{i.title}<small>{CONTENT_TYPES[i.type]||'资料'}{i.is_preview?' · 免费预览':''}</small></span></button>)}{!chapter.items.length&&<p>本章资料待发布</p>}</section>)}{!data.chapters.length&&<p>项目章节待发布</p>}</nav><article aria-live="polite">{busy&&!item?<div className="pj-empty">正在打开内容…</div>:item?<><span className="pj-eyebrow">{CONTENT_TYPES[item.type]||'实战资料'}</span><h3>{item.title}</h3><div className={`pj-content ${item.type==='code'?'pj-code':''}`}>{item.body||'本项内容以配套资源为主。'}</div>{safeResourceUrl(item.resource_url)&&<a className="pj-outline" href={safeResourceUrl(item.resource_url)} target="_blank" rel="noopener noreferrer">打开配套资源<ArrowRight size={15}/></a>}<footer><button className="pj-primary" disabled={busy||item.progress==='completed'} onClick={complete}><Check size={16}/>{item.progress==='completed'?'已完成学习':model.user?'标记为已完成':'登录后保存进度'}</button><small>这里记录你的课程资料学习进度。</small></footer></>:<div className="pj-empty"><BookOpenText size={32}/><h3>从一项实践开始</h3><p>{data.chapters.some(c=>c.items.length)?'选择左侧的课程资料，开始阅读与实践。':'后台发布章节与资料后，即可在这里开始学习。'}</p></div>}</article></div>
    </>}
  </div></Dialog>;
}

function ManagedProjectDetail({pack,model,navigate,notify,close}){
  const [course,setCourse]=useState(null);
  if(course)return <ProjectDetail pack={course} start={true} model={model} navigate={navigate} notify={notify} close={()=>setCourse(null)}/>;
  return <Dialog title={pack.title} close={close}><div className="pj-detail"><p style={{whiteSpace:'pre-line'}}>{pack.description}</p><h3>项目成果</h3><p>{pack.deliverable||'跟随关联课程完成实践与总结。'}</p><h3>关联学习课程</h3><p>关联课程按账号当前学习权限开放，可分别查看目录与预览。</p>{pack.courses.map(c=><button className="pj-outline" key={c.id} onClick={()=>setCourse(c)}>{c.title} · {c.entitled?'进入学习':'查看目录与预览'}<ArrowRight size={15}/></button>)}</div></Dialog>;
}

export function ProjectsCatalog({model,navigate,notify,initialSlug=''}) {
  const [retry,setRetry]=useState(0);
  const [managed,setManaged]=useState({items:[],loading:true,error:''});
  useEffect(()=>{let active=true;setManaged({items:[],loading:true,error:''});api('/practice-projects').then(d=>{if(active)setManaged({items:d.items,loading:false,error:''});}).catch(e=>{if(active)setManaged({items:[],loading:false,error:e.message});});return()=>{active=false;};},[model.user?.id,retry]);
  const [category,setCategory]=useState('all'),[sort,setSort]=useState('recommended'),[ownedOnly,setOwnedOnly]=useState(false),[modal,setModal]=useState(null),[question,setQuestion]=useState('');
  const filters=useRef(null);
  useEffect(()=>{if(initialSlug&&!managed.loading){const pack=managed.items.find(p=>p.slug===initialSlug);setModal(pack?{type:'project',pack}:null);}},[initialSlug,managed.items,managed.loading]);
  useEffect(()=>{setModal(null);setQuestion('');setOwnedOnly(false);},[model.user?.id]);
  const allProjects=managed.items.map(p=>{const courses=p.courses.map(c=>model.library.find(x=>x.id===c.id)||model.recommendations.find(x=>x.id===c.id)||c);const sums=Object.fromEntries(['contentCount','completedCount','startedCount','chapterCount','estimated_minutes'].map(k=>[k,courses.reduce((n,c)=>n+Number(c[k]||0),0)]));return {...p,...sums,subtitle:p.description,progressPercent:sums.contentCount?Math.round(sums.completedCount/sums.contentCount*100):0};});
  const ownedProjects=allProjects.filter(p=>p.courses.some(c=>c.entitled));
  const catalog=filterProjects(allProjects,category,sort,ownedOnly,ownedProjects);
  const stats=projectStats(ownedProjects);
  const active=ownedProjects.filter(p=>projectStatus(p)==='started').slice(0,2);
  const owned=new Set(ownedProjects.map(p=>p.id));
  const focusCatalog=(personal=false)=>{setOwnedOnly(personal);setCategory('all');filters.current?.scrollIntoView({behavior:'smooth',block:'start'});filters.current?.focus({preventScroll:true});};
  const tutor=q=>{setQuestion(q);setModal({type:'tutor'});};
  const saveQuestion=async()=>{
    if(!model.user)return navigate('/login');
    if(!question.trim()||model.busy)return;
    const note={id:crypto.randomUUID(),title:`项目实践 · ${question.trim()}`.slice(0,120),body:`待解决的问题：\n${question.trim()}\n\n实践与解决思路：\n`,updatedAt:new Date().toISOString()};
    if(await model.saveState({...model.state,notes:[note,...model.state.notes]})){setModal(null);notify('问题已保存到学习笔记');}
  };
  return <div className="pj-space"><div className="pj-layout"><div className="pj-main">
    <header className="pj-heading"><nav aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><CaretRight size={12}/><span>实战项目</span></nav><div><section><h1>实战项目</h1><p>通过真实项目，掌握 AI 从想法到上线的完整流程。</p></section><blockquote>“最好的学习方式，就是做出一个真实的产品。”<span>— OneShowLearn</span></blockquote></div></header>
    <section className="pj-hero"><img src={hero} alt="笔记本与手机上的 AI 产品界面示意，配有 Build、Launch、Grow 手写注解"/><div className="pj-hero-copy"><span className="pj-eyebrow">从 0 到 1 · 真刀真枪做项目</span><h2>在实战中，成为 AI 产品创造者</h2><p>不只是学知识，而是做出可以上线、可以收款、可以被用户使用的真实产品。</p><div className="pj-benefits">{['完整开发流程','配套教程文档','源码与模板','阶段实践目标'].map(t=><span key={t}><CheckCircle weight="fill" size={18}/>{t}</span>)}</div><button className="pj-dark" onClick={()=>focusCatalog()}>选择一个项目开始<ArrowRight size={15}/></button></div><small className="pj-art-label">界面示意</small></section>
    {initialSlug&&!managed.loading&&!managed.error&&!managed.items.some(p=>p.slug===initialSlug)&&<p role="alert" className="pj-alert">该项目不存在或尚未发布。</p>}<section className="pj-catalog" aria-label="项目目录"><div className="pj-filters" ref={filters} tabIndex={-1}><div role="group" aria-label="项目分类">{PROJECT_CATEGORIES.slice(0,7).map(([id,title])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{title}</button>)}<select aria-label="更多项目分类" value={['automation','other'].includes(category)?category:''} onChange={e=>setCategory(e.target.value||'all')}><option value="">更多</option>{PROJECT_CATEGORIES.slice(7).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></div><select aria-label="项目排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">推荐排序</option><option value="newest">最近更新</option><option value="shortest">预计用时最短</option></select></div>
    {ownedOnly&&<div className="pj-filter-notice">仅显示包含我已解锁课程的项目<button onClick={()=>setOwnedOnly(false)}>查看全部项目<X size={12}/></button></div>}
    {managed.loading?<div className="pj-empty">正在读取项目目录…</div>:managed.error?<div className="pj-empty" role="alert"><p>项目目录暂时无法读取</p><button className="pj-outline" onClick={()=>setRetry(r=>r+1)}>重新加载</button></div>:<><div className="pj-cards">{catalog.map(pack=>{
      const status=projectStatus(pack);const tags=pack.tags||[];
      return <article className="pj-card" key={pack.id}><button className="pj-card-visual" aria-label={`查看${pack.title}详情`} onClick={()=>setModal({type:'project',pack,start:false})}><ProjectImage pack={pack}/>{owned.has(pack.id)&&status==='started'?<span className="pj-badge">进行中</span>:owned.has(pack.id)&&status==='completed'?<span className="pj-badge complete">已学完</span>:pack.is_featured?<span className="pj-badge recommended">精选</span>:null}</button><div className="pj-card-body"><h2 title={pack.title}>{pack.title}</h2><p>{pack.subtitle||pack.deliverable||'跟随文档，完成你的项目实践'}</p><div className="pj-tags">{(tags.length?tags:[pack.path_title||'实战项目']).map(t=><span key={t}>{t}</span>)}</div><div className="pj-meta"><span><FileText size={13}/>{pack.chapterCount||0} 章</span><span><Clock size={13}/>{estimatedTime(pack.estimated_minutes)}</span><span><BookOpenText size={13}/>{pack.contentCount||0} 项</span></div><div className="pj-card-actions"><button className="pj-outline" onClick={()=>setModal({type:'project',pack,start:false})}>查看详情</button><button className="pj-primary" onClick={()=>setModal({type:'project',pack,start:true})}>{owned.has(pack.id)?status==='new'?'开始项目':status==='completed'?'回顾项目':'继续项目':'查看项目'}</button></div></div></article>;
    })}</div>{!catalog.length&&<div className="pj-empty"><Cube size={34}/><h2>{managed.items.length?'这个分类还没有项目':'实战项目正在准备中'}</h2><p>{managed.items.length?'试试其他分类，找到适合你的实践方向。':'后台发布的项目与资料会出现在这里。'}</p>{managed.items.length>0&&<button className="pj-outline" onClick={()=>{setCategory('all');setOwnedOnly(false);}}>查看全部项目</button>}</div>}</>}
    </section>
    </div><aside className="pj-rail" aria-label="项目进度与辅助工具"><section className="pj-panel pj-progress"><header><h2>我的项目进度</h2><button onClick={()=>focusCatalog(true)}>查看全部<ArrowRight size={12}/></button></header><div className="pj-stats">{[['started','进行中'],['completed','已学完'],['new','待开始']].map(([key,label])=><div key={key}><b>{model.loading?'—':model.error?'—':stats[key]}</b><span>{label}</span></div>)}</div><div className="pj-recent">{active.map(pack=><button key={pack.id} onClick={()=>setModal({type:'project',pack,start:true})}><ProjectImage pack={pack}/><span><strong>{pack.title}</strong><span><progress value={pack.progressPercent} max="100" aria-label={`${pack.title}学习进度`}/><small>{pack.progressPercent}%</small></span></span></button>)}{!active.length&&<div className="pj-progress-empty">{model.loading?'正在读取学习进度…':model.error?'学习进度暂不可用':model.user?'还没有进行中的项目，选择一个开始吧。':'登录后保存项目学习进度。'}</div>}</div><small className="pj-progress-note">按当前账号的资料学习进度统计</small></section>
    <section className="pj-panel pj-tutor"><header><span className="pj-robot"><Robot size={27} weight="fill"/></span><div><h2>AI 导师</h2><p>整理你的项目实践问题</p></div><small>预览</small></header><p className="pj-tutor-intro">做项目遇到问题？先记录下来。</p><div className="pj-prompts">{prompts.map(q=><button key={q} onClick={()=>tutor(q)}>{q}<CaretRight size={14}/></button>)}</div><button className="pj-primary pj-full" onClick={()=>tutor('')}>向 AI 导师提问<ArrowRight size={15}/></button><small className="pj-tutor-note">实时回答暂未接入，可保存问题为笔记。</small></section>
    <section className="pj-panel pj-steps"><header><h2>项目学习路径</h2><button onClick={()=>navigate('/paths')}>查看路径<ArrowRight size={12}/></button></header><ol>{steps.map(([title,desc],index)=><li key={title}><b>{index+1}</b><div><strong>{title}</strong><p>{desc}</p></div></li>)}</ol></section>
    <div className="pj-poster"><img src={poster} alt="把想法变成产品，让 AI 放大你的创造力。OneShowLearn。远山前的一位探索者。"/></div>
    </aside></div>
    {modal?.type==='project'&&<ManagedProjectDetail key={`${modal.pack.id}-${model.user?.id||'guest'}`} pack={modal.pack} start={modal.start} model={model} navigate={navigate} notify={notify} close={()=>{setModal(null);if(initialSlug)navigate('/projects');}}/>}
    {modal?.type==='tutor'&&<Dialog title="AI 导师 · 功能预览" close={()=>setModal(null)}><div className="pj-question"><p>实时 AI 回答尚未接入。你可以把问题保存到学习笔记，在项目实践中逐步补充解决思路。</p><label>你的项目问题<textarea rows={5} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="描述你遇到的问题…"/></label><button className="pj-primary" disabled={!question.trim()||model.busy} onClick={saveQuestion}><NotePencil size={16}/>保存为学习笔记</button></div></Dialog>}
  </div>;
}
