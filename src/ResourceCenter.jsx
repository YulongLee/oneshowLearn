import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowSquareOut, BookOpenText, BookmarkSimple, CaretDown, CheckCircle, ClipboardText, Code, Copy, DownloadSimple, FileText, FolderSimple, LockKey, MagnifyingGlass, NotePencil, Package, Sparkle, VideoCamera, Wrench, X } from '@phosphor-icons/react';
import { api } from './api.js';
import {FavoriteButton} from './FavoriteButton.jsx';
import { canManage } from './platforms.js';
import { safeResourceUrl } from './opc-model.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES, resourceCategory, resourceDate } from './resource-model.js';
import {RESOURCE_COURSE_PHASES,resourcePurpose,resourceAction,resourceAccess,resourceLibraryItems,resourceHighlights,resourcePrimaryCategories} from './resource-library-model.js';
import './resources.css';
import './resource-discovery.css';
import './resource-library-refinement.css';

const categoryIcons = {skill:Sparkle,video:VideoCamera,prompt:NotePencil,code:Code,template:FileText,tools:Wrench,checklist:ClipboardText,case:Package,learning:BookOpenText};

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

function ResourceSpotlight({resource,open,model,navigate}) {
  const kind=resourceCategory(resource), Icon=categoryIcons[kind];
  const label=RESOURCE_CATEGORIES.find(([id])=>id===kind)?.[1] || '学习资料';
  return <article className={`rd-card rd-card-${kind}`}>
    <div className={`rl-cover rl-cover-${kind}`} aria-hidden="true"><span className="rl-cover-orbit"/><span className="rl-cover-sheet"><Icon size={52} weight="duotone"/><i/><i/><i/></span><span className="rl-cover-companion"><Icon size={30}/></span><Sparkle className="rl-cover-sparkle" size={24} weight="fill"/><small>分类示意</small></div>
    <div className="rd-card-copy"><span className="rd-kind">{label}</span><div className="favorite-actions-row"><h3>{resource.title}</h3><FavoriteButton model={model} navigate={navigate} reference={{kind:'resource',id:resource.id}} title={resource.title} compact/></div><p>{resourcePurpose(resource)}</p><small className="rl-card-chapter">所属章节：{resource.step_title||'章节待完善'}</small></div>
    <footer><span className={`rl-access ${resource.locked?'is-locked':'is-accessible'}`}>{resource.locked?<LockKey size={16}/>:<BookOpenText size={16}/>} {resourceAccess(resource)}</span><button onClick={()=>open(resource)} aria-label={`查看资源：${resource.title}`}>{resourceAction(resource)}<ArrowRight size={15}/></button></footer>
  </article>;
}

export function ResourceCenter({model,navigate,notify,query,setQuery,searchRevision}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [category,setCategory]=useState('all'),[phase,setPhase]=useState('');
  const [sort,setSort]=useState('chapter'),[limit,setLimit]=useState(5),[modal,setModal]=useState(null);
  const listRef=useRef(null),requestRef=useRef(0),moreRef=useRef(null);
  const load=async()=>{
    const request=++requestRef.current;setLoading(true);setError('');
    try{const result=await api('/resources');if(request===requestRef.current)setItems(result.items||[]);}
    catch(e){if(request===requestRef.current)setError(e.message);}
    finally{if(request===requestRef.current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{requestRef.current++;};},[]);
  useEffect(()=>{setLimit(5);},[category,phase,sort,query]);
  const focusList=()=>{listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});listRef.current?.focus({preventScroll:true});};
  useEffect(()=>{if(searchRevision)focusList();},[searchRevision]);
  const reset=()=>{setCategory('all');setQuery('');setPhase('');setLimit(5);};
  const catalog=resourceLibraryItems(items,{category,query,phase,sort});
  const filtered=category!=='all'||Boolean(query.trim())||Boolean(phase);
  const featured=resourceHighlights(items);
  const primary=resourcePrimaryCategories(items),extra=RESOURCE_CATEGORIES.filter(([id])=>!primary.includes(id));
  const selectCategory=id=>{setCategory(id);if(moreRef.current)moreRef.current.open=false;};
  const open=resource=>setModal(resource);
  return <div className="rc-layout rd-page rl-page"><div className="rd-main">
    <header className="rd-heading"><div><h1>资源中心</h1><p>找到合适的资料，把课程方法用到自己的产品。</p></div><button className="rc-text rl-favorites" onClick={()=>navigate('/favorites')}><BookmarkSimple size={19}/>我的收藏<ArrowRight size={17}/></button></header>
    <form className="rd-search" role="search" aria-label="搜索资源" onSubmit={e=>{e.preventDefault();focusList();}}><MagnifyingGlass size={25}/><input aria-label="搜索资源关键词" placeholder="搜索资源名称、用途或关键词…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="rd-clear" type="button" aria-label="清空资源关键词" onClick={()=>setQuery('')}><X size={18}/></button>}<button className="rc-primary" type="submit">搜索</button></form>
    <div className="rd-filters" role="group" aria-label="资源分类">{RESOURCE_CATEGORIES.filter(([id])=>primary.includes(id)).sort((a,b)=>primary.indexOf(a[0])-primary.indexOf(b[0])).map(([id,title])=><button key={id} aria-pressed={category===id} onClick={()=>selectCategory(id)}>{title}</button>)}{extra.length>0&&<details className="rl-more-categories" ref={moreRef} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary className={primary.includes(category)?'':'is-selected'}>更多分类{!primary.includes(category)?`：${RESOURCE_CATEGORIES.find(([id])=>id===category)?.[1]}`:''}<CaretDown size={15}/></summary><div aria-label="更多资源分类">{extra.map(([id,title])=><button key={id} aria-pressed={category===id} onClick={()=>{selectCategory(id);moreRef.current?.querySelector('summary')?.focus();}}>{title}</button>)}</div></details>}</div>
    <div className="rl-phases" role="group" aria-label="课程阶段"><strong>课程阶段</strong><button aria-pressed={!phase} onClick={()=>setPhase('')}>全部阶段</button>{RESOURCE_COURSE_PHASES.map(p=><button key={p.id} aria-pressed={phase===p.id} onClick={()=>setPhase(phase===p.id?'':p.id)}>{p.title}</button>)}</div>
    {loading?<div className="rc-empty" role="status">正在读取资源目录…</div>:error?<div className="rc-empty" role="alert"><h3>资源暂时无法加载</h3><p>{error}</p><button className="rc-outline" onClick={load}>重新加载</button></div>:<>
      {!filtered&&featured.length>0&&<section aria-label="推荐配套资料" className="rd-section"><div className="rd-section-heading"><div><h2>{items.some(i=>i.is_featured)?'推荐配套资料':'从课程资料开始'}</h2><p>先了解用途，再选择适合你的资源。</p></div><button className="rc-text" onClick={()=>{setLimit(Math.max(5,catalog.length));focusList();}}>全部资料<ArrowRight size={16}/></button></div><div className="rd-featured">{featured.map(resource=><ResourceSpotlight key={resource.id} resource={resource} open={open} model={model} navigate={navigate}/>)}</div></section>}
      <section className="rd-section rd-catalog" aria-label="资源目录" ref={listRef} tabIndex={-1}>
        <div className="rd-section-heading"><div><h2>{filtered?'筛选结果':'课程配套资料'}</h2><p>{filtered?`找到 ${catalog.length} 项资源`:'所属章节与访问状态来自已发布课程。'}</p></div><div className="rd-list-actions">{filtered&&<button className="rc-text" onClick={reset}>清除筛选<X size={14}/></button>}<select aria-label="资源排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="chapter">按章节排序</option><option value="newest">最新发布</option><option value="accessible">可访问优先</option><option value="title">按名称排序</option></select></div></div>
        {filtered&&<div className="rd-filter-summary" role="status">{query.trim()&&<span>关键词：{query.trim()}</span>}{category!=='all'&&<span>类型：{RESOURCE_CATEGORIES.find(([id])=>id===category)?.[1]}</span>}{phase&&<span>阶段：{RESOURCE_COURSE_PHASES.find(p=>p.id===phase)?.title}</span>}</div>}
        {catalog.length?<><div className="rd-table-wrap"><table className="rd-table"><caption className="rd-sr-only">已发布的课程配套资源</caption><thead><tr><th scope="col">资源名称</th><th scope="col">用途</th><th scope="col">所属章节</th><th scope="col">访问</th><th scope="col">操作</th></tr></thead><tbody>{catalog.slice(0,limit).map(resource=>{const kind=resourceCategory(resource),Icon=categoryIcons[kind];return <tr key={resource.id}><td data-label="资源名称"><button className={`rd-resource-name rd-tone-${kind}`} onClick={()=>open(resource)}><span className="rd-resource-icon"><Icon size={18}/></span><span><strong>{resource.title}</strong><small>{RESOURCE_CATEGORIES.find(([id])=>id===kind)?.[1]}</small></span></button></td><td data-label="用途"><p title={resource.summary||''}>{resourcePurpose(resource)}</p></td><td data-label="所属章节"><p>{resource.step_title||'章节待完善'}</p><small>{resource.pack_title}</small></td><td data-label="访问"><span className={`rl-access ${resource.locked?'is-locked':'is-accessible'}`}>{resource.locked&&<LockKey size={14}/>} {resourceAccess(resource)}</span></td><td data-label="操作"><div className="favorite-actions-row"><button className="rc-text" onClick={()=>open(resource)} aria-label={`打开资源：${resource.title}`}>{resourceAction(resource)}<ArrowRight size={14}/></button><FavoriteButton model={model} navigate={navigate} reference={{kind:'resource',id:resource.id}} title={resource.title} compact/></div></td></tr>;})}</tbody></table></div>{catalog.length>limit&&<button className="rd-more rc-outline" onClick={()=>setLimit(v=>v+10)}>加载更多（还有 {catalog.length-limit} 项）<ArrowRight size={15}/></button>}</>:<div className="rc-empty"><FolderSimple size={35}/><h3>{items.length?'暂未找到匹配的资源':'资源内容正在准备中'}</h3><p>{items.length?'试试其他关键词、分类或阶段。':'后台发布课程文档、源码与模板后，会自动出现在这里。'}</p>{items.length?<button className="rc-outline" onClick={reset}>查看全部资源</button>:canManage(model.user)&&<button className="rc-primary" onClick={()=>navigate('/admin/content')}>去后台配置资料<ArrowRight size={15}/></button>}</div>}
      </section>
    </>}
    <div className="rd-bottom-note"><span>阶段按章节名称与资源关键词归类；正文与附件权限以打开时核验为准。</span>{canManage(model.user)&&<button className="rc-text" onClick={()=>navigate('/admin/content')}>管理资源<ArrowRight size={14}/></button>}</div>
    {modal&&<ResourceReader key={modal.id} resource={modal} model={model} navigate={navigate} notify={notify} close={()=>setModal(null)} onComplete={id=>setItems(current=>current.map(i=>i.id===id?{...i,progress:'completed'}:i))}/>}
  </div></div>;
}
