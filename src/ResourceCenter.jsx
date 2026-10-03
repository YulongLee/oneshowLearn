import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowSquareOut, BookOpenText, CheckCircle, ClipboardText, Code, Copy, DownloadSimple, FileText, FolderSimple, LockKey, MagnifyingGlass, NotePencil, Package, Sparkle, VideoCamera, Wrench, X, Lightbulb, RocketLaunch, CurrencyCircleDollar, ChartLineUp } from '@phosphor-icons/react';
import { api } from './api.js';
import { canManage } from './platforms.js';
import { safeResourceUrl } from './opc-model.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES, RESOURCE_STAGES, filterResources, featuredResources, resourceStages, resourceArt, resourceCategory, resourceDate, resourceTags } from './resource-model.js';
import prdCover from './assets/resources-prd-v1.webp';
import codeCover from './assets/resources-code-v1.webp';
import paymentCover from './assets/resources-payment-v1.webp';
import deployCover from './assets/resources-deploy-v1.webp';
import './resources.css';
import './resource-discovery.css';

const categoryIcons = {skill:Sparkle,video:VideoCamera,prompt:NotePencil,code:Code,template:FileText,tools:Wrench,checklist:ClipboardText,case:Package,learning:BookOpenText};
const stageIcons = [Lightbulb,MagnifyingGlass,Code,RocketLaunch,CurrencyCircleDollar,ChartLineUp];
const covers = {prd:prdCover,code:codeCover,payment:paymentCover,deploy:deployCover};

function ResourceDialog({title,close,children}) {
  const ref=useRef(null);
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog className="rc-dialog" ref={ref} aria-labelledby="rc-dialog-title" onCancel={close} onClick={e=>e.target===e.currentTarget&&close()}><header><h2 id="rc-dialog-title">{title}</h2><button aria-label="关闭资源窗口" onClick={close}><X size={21}/></button></header>{children}</dialog>;
}

export function ResourceReader({resource,model,navigate,notify,close,onComplete=()=>{}}) {
  const [item,setItem]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[done,setDone]=useState(resource.progress==='completed');
  const [downloadUrl,setDownloadUrl]=useState('');
  const revision=useRef(0);
  const load=async()=>{
    const request=++revision.current;setLoading(true);setError('');
    try { const result=await api(`/projects/${encodeURIComponent(resource.pack_slug)}/content/${resource.id}`);if(request===revision.current)setItem(result.item); }
    catch(e){if(request===revision.current)setError(e.message);}
    finally{if(request===revision.current)setLoading(false);}
  };
  useEffect(()=>{if(!resource.locked)load();else setLoading(false);return()=>{revision.current++;};},[]);
  const copy=async()=>{try{await navigator.clipboard.writeText(item.body);notify('资源内容已复制');}catch{setError('暂时无法访问剪贴板，请选择正文后复制。');}};
  useEffect(()=>{
    if(!item?.body){setDownloadUrl('');return;}
    const url=URL.createObjectURL(new Blob([`# ${item.title}\n\n${item.body}\n`],{type:'text/markdown;charset=utf-8'}));
    setDownloadUrl(url);return()=>URL.revokeObjectURL(url);
  },[item]);
  const complete=async()=>{
    if(!model.user)return navigate('/login');
    const request=revision.current;setBusy(true);setError('');
    try { await api(`/me/progress/${resource.id}`,{method:'PUT',body:JSON.stringify({status:'completed'})});if(request!==revision.current)return;setDone(true);onComplete(resource.id);await model.refresh({preserve:true});notify('学习进度已保存'); }
    catch(e){if(request===revision.current)setError(e.message);}
    finally{if(request===revision.current)setBusy(false);}
  };
  return <ResourceDialog title={resource.title} close={close}><div className="rc-reader">
    <div className="rc-reader-meta"><span>{RESOURCE_TYPES[resource.type]}</span><span>更新于 {resourceDate(resource.updated_at)}</span></div>
    <p className="rc-reader-source">所属课程：{resource.pack_title}</p>
    {model.user&&<button className="rc-outline" disabled={model.busy} onClick={async()=>{const favorites=model.state.resourceFavorites||[],saved=favorites.some(i=>i.id===resource.id);if(await model.saveState({...model.state,resourceFavorites:saved?favorites.filter(i=>i.id!==resource.id):[...favorites,{id:resource.id,savedAt:new Date().toISOString()}]}))notify(saved?'已取消资源收藏':'已加入我的收藏');}}>{(model.state.resourceFavorites||[]).some(i=>i.id===resource.id)?'已收藏 · 取消':'收藏这项资源'}</button>}
    {resource.locked?<div className="rc-empty"><LockKey size={34}/><h3>这项资源需要课程权限</h3><p>可先浏览免费预览，或查看所属课程的学习权益。</p><div className="rc-reader-actions"><button className="rc-primary" onClick={()=>navigate(model.user?'/membership':'/login?returnTo=%2Fresources')}>{model.user?'查看学习权益':'登录账号'}<ArrowRight size={15}/></button><button className="rc-outline" onClick={()=>navigate(`/packs/${resource.pack_slug}`)}>查看所属课程</button></div></div>:<>
      {error&&<div className="rc-alert" role="alert">{error}{!item&&<button onClick={load}>重试</button>}</div>}
      {loading?<div className="rc-empty" role="status">正在打开资料…</div>:item&&<>
        <div className={`rc-document ${item.type==='code'?'rc-code-document':''}`}>{item.body || (safeResourceUrl(item.resource_url)?'请打开下方配套附件，查看完整资源。':'该资料暂无正文或附件，内容完善后会在这里更新。')}</div>
        <div className="rc-reader-actions">{item.body&&<><button className="rc-outline" onClick={copy}><Copy size={16}/>复制正文</button>{downloadUrl&&<a className="rc-outline" href={downloadUrl} download={`${item.title.replace(/[\\/:*?"<>|]/g,'-').slice(0,90)}.md`}><DownloadSimple size={16}/>导出文档</a>}</>}{safeResourceUrl(item.resource_url)&&<a className="rc-primary" href={safeResourceUrl(item.resource_url)} target="_blank" rel="noopener noreferrer">打开配套附件<ArrowSquareOut size={16}/></a>}</div>
        <footer><button className="rc-primary" disabled={busy||done||(!item.body&&!safeResourceUrl(item.resource_url))} onClick={complete}><CheckCircle size={17}/>{done?'已完成学习':model.user?'标记为已学习':'登录后保存学习进度'}</button><button className="rc-text" onClick={()=>navigate(`/packs/${resource.pack_slug}`)}>查看完整课程<ArrowRight size={15}/></button></footer>
      </>}
    </>}
  </div></ResourceDialog>;
}

function ResourceSpotlight({resource,open}) {
  const kind=resourceCategory(resource), Icon=categoryIcons[kind];
  const label=RESOURCE_CATEGORIES.find(([id])=>id===kind)?.[1] || '学习资料';
  return <article className={`rd-card rd-card-${kind}`}>
    <img className="rd-card-art" src={covers[resourceArt(resource)]} alt="" loading="lazy"/>
    <div className="rd-card-copy"><span className="rd-kind">{label}</span><h3>{resource.title}</h3><p>{resource.summary||`「${resource.pack_title}」配套${RESOURCE_TYPES[resource.type]||'学习资料'}。`}</p></div>
    <footer><span><Icon size={21}/>{resource.locked?'课程专享':resource.is_preview?'免费预览':RESOURCE_TYPES[resource.type]||'学习资料'}</span><button onClick={()=>open(resource)} aria-label={`查看资源：${resource.title}`}>查看<ArrowRight size={15}/></button></footer><small className="rd-art-note">分类示意</small>
  </article>;
}

export function ResourceCenter({model,navigate,notify,query,setQuery,searchRevision}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [category,setCategory]=useState('all'),[tag,setTag]=useState(''),[stage,setStage]=useState('');
  const [sort,setSort]=useState('newest'),[limit,setLimit]=useState(5),[modal,setModal]=useState(null);
  const listRef=useRef(null),requestRef=useRef(0);
  const load=async()=>{
    const request=++requestRef.current;setLoading(true);setError('');
    try{const result=await api('/resources');if(request===requestRef.current)setItems(result.items||[]);}
    catch(e){if(request===requestRef.current)setError(e.message);}
    finally{if(request===requestRef.current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{requestRef.current++;};},[]);
  useEffect(()=>{setLimit(5);},[category,tag,stage,sort,query]);
  const focusList=()=>{listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});listRef.current?.focus({preventScroll:true});};
  useEffect(()=>{if(searchRevision)focusList();},[searchRevision]);
  const reset=()=>{setCategory('all');setQuery('');setTag('');setStage('');setLimit(5);};
  const catalog=filterResources(items,{category,query,tag,stage,sort});
  const filtered=category!=='all'||Boolean(query.trim())||Boolean(tag)||Boolean(stage);
  const featured=featuredResources(items);
  const open=resource=>setModal(resource);
  return <div className="rc-layout rd-page"><div className="rd-main">
    <header className="rd-heading"><div><h1>资源中心</h1><p>为 OPC 精选 AI 工具、Skill、模板、源码与学习资料，助你更快做出真正的产品。</p></div><aside>找工具、学方法、看案例<br/>从这里开始<span/></aside></header>
    <form className="rd-search" role="search" aria-label="搜索资源" onSubmit={e=>{e.preventDefault();focusList();}}><MagnifyingGlass size={25}/><input aria-label="搜索资源关键词" placeholder="搜索资源，例如：Claude Skill、支付接入、PRD 模板、SEO…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="rd-clear" type="button" aria-label="清空资源关键词" onClick={()=>setQuery('')}><X size={18}/></button>}<button className="rc-primary" type="submit">搜索</button></form>
    <div className="rd-filters" role="group" aria-label="资源分类">{RESOURCE_CATEGORIES.map(([id,title])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setTag('');setStage('');}}>{title}</button>)}</div>
    {loading?<div className="rc-empty" role="status">正在读取资源目录…</div>:error?<div className="rc-empty" role="alert"><h3>资源暂时无法加载</h3><p>{error}</p><button className="rc-outline" onClick={load}>重新加载</button></div>:<>
      {!filtered&&featured.length>0&&<section aria-label="精选资源" className="rd-section"><div className="rd-section-heading"><div><h2>精选资源</h2><p>从课程配套资料开始，让学习和构建更高效。</p></div><button className="rc-text" onClick={()=>{setLimit(Math.max(5,catalog.length));focusList();}}>查看全部<ArrowRight size={16}/></button></div><div className="rd-featured">{featured.map(resource=><ResourceSpotlight key={resource.id} resource={resource} open={open}/>)}</div></section>}
      <section className="rd-section rd-catalog" aria-label="资源目录" ref={listRef} tabIndex={-1}>
        <div className="rd-section-heading"><div><h2>{filtered?'筛选结果':'最新资源'}</h2><p>{filtered?`找到 ${catalog.length} 项资源`:'持续更新优质的 AI 与 OPC 相关资源。'}</p></div><div className="rd-list-actions">{filtered&&<button className="rc-text" onClick={reset}>清除筛选<X size={14}/></button>}<select aria-label="资源排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">最新发布</option><option value="accessible">可访问优先</option><option value="title">按名称排序</option></select></div></div>
        {filtered&&<div className="rd-filter-summary" role="status">{query.trim()&&<span>关键词：{query.trim()}</span>}{stage&&<span>阶段：{RESOURCE_STAGES.find(s=>s.id===stage)?.title}</span>}{tag&&<span>标签：{tag}</span>}</div>}
        {catalog.length?<><div className="rd-table-wrap"><table className="rd-table"><caption className="rd-sr-only">已发布的课程配套资源</caption><thead><tr><th scope="col">资源名称</th><th scope="col">类型</th><th scope="col">简介</th><th scope="col">标签</th><th scope="col">发布时间</th><th scope="col">操作</th></tr></thead><tbody>{catalog.slice(0,limit).map(resource=>{const kind=resourceCategory(resource),Icon=categoryIcons[kind];return <tr key={resource.id}><td data-label="资源名称"><button className={`rd-resource-name rd-tone-${kind}`} onClick={()=>open(resource)}><span className="rd-resource-icon"><Icon size={18}/></span><strong>{resource.title}</strong>{resource.locked&&<LockKey size={14} aria-label="需要课程权限"/>}</button></td><td data-label="类型">{RESOURCE_CATEGORIES.find(([id])=>id===kind)?.[1]}</td><td data-label="简介"><p>{resource.summary||`「${resource.pack_title}」配套资料`}</p></td><td data-label="标签"><div className="rd-tags">{resourceTags(resource).slice(0,3).map(t=><button key={t} onClick={()=>{setTag(t);setCategory('all');setStage('');}}>{t}</button>)}</div></td><td data-label="发布时间"><time>{resourceDate(resource.created_at)}</time></td><td data-label="操作"><button className="rc-text" onClick={()=>open(resource)} aria-label={`打开资源：${resource.title}`}>查看<ArrowRight size={14}/></button></td></tr>;})}</tbody></table></div>{catalog.length>limit&&<button className="rd-more rc-outline" onClick={()=>setLimit(v=>v+10)}>加载更多（还有 {catalog.length-limit} 项）<ArrowRight size={15}/></button>}</>:<div className="rc-empty"><FolderSimple size={35}/><h3>{items.length?'暂未找到匹配的资源':'资源内容正在准备中'}</h3><p>{items.length?'试试其他关键词、分类或阶段。':'后台发布课程文档、源码与模板后，会自动出现在这里。'}</p>{items.length?<button className="rc-outline" onClick={reset}>查看全部资源</button>:canManage(model.user)&&<button className="rc-primary" onClick={()=>navigate('/admin/content')}>去后台配置资料<ArrowRight size={15}/></button>}</div>}
      </section>
    </>}
    <section className="rd-section rd-stages" aria-label="按阶段浏览"><div className="rd-section-heading"><div><h2>按阶段浏览</h2><p>根据你当前的阶段，快速找到合适的资源。</p></div></div><div className="rd-stage-grid">{RESOURCE_STAGES.map((s,index)=>{const Icon=stageIcons[index];return <button className={`rd-stage rd-stage-${s.id}`} key={s.id} aria-pressed={stage===s.id} onClick={()=>{setStage(s.id);setCategory('all');setQuery('');setTag('');focusList();}}><Icon size={25}/><span><strong>{s.title}</strong><small>{s.description}</small><em>{loading||error?'—':items.filter(item=>resourceStages(item).includes(s.id)).length} 项资源<ArrowRight size={14}/></em></span></button>;})}</div><div className="rd-bottom-note"><span>按标题与章节关键词归类，同一资源可适用于多个阶段。</span>{canManage(model.user)&&<button className="rc-text" onClick={()=>navigate('/admin/content')}>管理资源<ArrowRight size={14}/></button>}</div></section>
    {modal&&<ResourceReader key={modal.id} resource={modal} model={model} navigate={navigate} notify={notify} close={()=>setModal(null)} onComplete={id=>setItems(current=>current.map(i=>i.id===id?{...i,progress:'completed'}:i))}/>}
  </div></div>;
}
