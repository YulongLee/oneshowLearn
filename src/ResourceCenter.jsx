import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowSquareOut, BookOpenText, CaretRight, CheckCircle, ClipboardText, CloudArrowUp, Code, Copy, DownloadSimple, FileText, FolderSimple, LockKey, MagnifyingGlass, NotePencil, Package, Sparkle, Timer, UsersThree, Wrench, X } from '@phosphor-icons/react';
import { api } from './api.js';
import { canManage } from './platforms.js';
import { safeResourceUrl } from './opc-model.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES, filterResources, resourceArt, resourceCategory, resourceDate, resourceTags } from './resource-model.js';
import hero from './assets/resources-hero-v1.webp';
import prdCover from './assets/resources-prd-v1.webp';
import codeCover from './assets/resources-code-v1.webp';
import paymentCover from './assets/resources-payment-v1.webp';
import deployCover from './assets/resources-deploy-v1.webp';
import './resources.css';

const categoryIcons = {prompt:NotePencil,code:Code,template:FileText,tools:Wrench,checklist:ClipboardText,case:Package,learning:BookOpenText};
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

export function ResourceCenter({model,navigate,notify,query,setQuery,searchRevision}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [category,setCategory]=useState('all'),[tag,setTag]=useState(''),[sort,setSort]=useState('newest'),[limit,setLimit]=useState(4),[tagPage,setTagPage]=useState(0),[modal,setModal]=useState(null);
  const listRef=useRef(null),requestRef=useRef(0);
  const load=async()=>{
    const request=++requestRef.current;setLoading(true);setError('');
    try{const result=await api('/resources');if(request===requestRef.current)setItems(result.items||[]);}
    catch(e){if(request===requestRef.current)setError(e.message);}
    finally{if(request===requestRef.current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{requestRef.current++;};},[]);
  useEffect(()=>{setLimit(4);},[category,tag,sort,query]);
  const focusList=()=>{listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});listRef.current?.focus({preventScroll:true});};
  useEffect(()=>{if(searchRevision)focusList();},[searchRevision]);
  const reset=()=>{setCategory('all');setQuery('');setTag('');setLimit(4);};
  const browseAll=()=>{reset();focusList();};
  const catalog=filterResources(items,{category,query,tag,sort});
  const filtered=category!=='all'||query.trim()||tag;
  const allTags=[...new Set(items.flatMap(resourceTags))];
  const tags=allTags.slice(tagPage*15,tagPage*15+15);
  const totalTemplates=items.filter(i=>['prompt','code','template'].includes(i.type)).length;
  return <div className="rc-layout"><div className="rc-main">
    <header className="rc-heading"><nav aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><CaretRight size={13}/><span>资源中心</span></nav><div><section><h1>资源中心</h1><p>精选实用资源，助你更快做出真正的产品。</p></section><blockquote>“好的工具和模板，让想法更快落地。”<span>— OneShowLearn</span></blockquote></div></header>
    <section className="rc-hero"><img src={hero} alt="悬浮的 AI、代码与文档图标，Build Faster, Ship Sooner"/><div className="rc-hero-copy"><span className="rc-eyebrow">精选资源合集</span><h2>从 0 到 1，做出你的第一个 AI 产品</h2><p>包含模板、代码、教程、工具和实战案例，持续更新中。</p><div className="rc-hero-bottom"><button className="rc-dark" onClick={browseAll}>浏览全部资源<ArrowRight size={16}/></button><div className="rc-hero-facts">{[[Package,loading||error?'—':items.length,'已发布资源'],[ClipboardText,loading||error?'—':totalTemplates,'代码与模板'],[Timer,'持续更新','跟随课程上新']].map(([Icon,value,label])=><div key={label}><Icon size={23}/><span><strong>{value}</strong><small>{label}</small></span></div>)}</div></div></div></section>
    <section className="rc-catalog" aria-label="资源目录" ref={listRef} tabIndex={-1}>
      <div className="rc-filters"><div role="group" aria-label="资源分类">{RESOURCE_CATEGORIES.map(([id,title])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setTag('');}}>{title}</button>)}</div><select aria-label="资源排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">最新发布</option><option value="accessible">可访问优先</option><option value="title">按名称排序</option></select></div>
      <div className="rc-section-title"><h2>{filtered?'筛选结果':'资源精选'}</h2>{filtered?<button className="rc-text" onClick={reset}>清除筛选<X size={13}/></button>:!loading&&!error&&catalog.length>4&&<button className="rc-text" onClick={()=>setLimit(limit===4?catalog.length:4)}>{limit===4?`查看全部 ${catalog.length} 项`:'收起资源'}<ArrowRight size={13}/></button>}</div>
      {filtered&&<div className="rc-result-summary" aria-live="polite">找到 {catalog.length} 项资源{query.trim()&&` · “${query.trim()}”`}{tag&&` · ${tag}`}</div>}
      {loading?<div className="rc-empty" role="status">正在读取资源目录…</div>:error?<div className="rc-empty" role="alert"><h3>资源暂时无法加载</h3><p>{error}</p><button className="rc-outline" onClick={load}>重新加载</button></div>:catalog.length?<><div className="rc-cards">{catalog.slice(0,limit).map(resource=><article className="rc-card" key={resource.id}><button className="rc-card-art" aria-label={`查看${resource.title}`} onClick={()=>setModal({resource})}><img src={covers[resourceArt(resource)]} alt="" loading="lazy"/>{resource.is_preview?<span className="rc-badge">免费预览</span>:resource.is_featured?<span className="rc-badge featured">精选</span>:null}<small>分类示意</small></button><div className="rc-card-body"><button className="rc-card-title" onClick={()=>setModal({resource})}><h3 title={resource.title}>{resource.title}</h3></button><p>{resource.summary||`配套「${resource.pack_title}」的${RESOURCE_TYPES[resource.type]}，跟随课程逐步完成实践。`}</p><div className="rc-tags">{resourceTags(resource).slice(0,3).map(t=><button key={t} onClick={()=>{setTag(t);setCategory('all');}}>{t}</button>)}</div><footer><span>{resource.locked?<LockKey size={14}/>:<FileText size={14}/>}<span>{resource.locked?'课程专享':RESOURCE_TYPES[resource.type]}</span></span><button onClick={()=>setModal({resource})}>{resource.locked?'详情':'查看'}<ArrowRight size={12}/></button></footer></div></article>)}</div>{catalog.length>limit&&<button className="rc-load-more rc-outline" onClick={()=>setLimit(v=>v+8)}>查看更多资源（剩余 {catalog.length-limit} 项）<ArrowRight size={15}/></button>}</>:<div className="rc-empty"><FolderSimple size={35}/><h3>{items.length?'暂未找到匹配的资源':'资源内容正在准备中'}</h3><p>{items.length?'试试其他关键词或分类。':'后台发布课程文档、源码与模板后，会自动出现在这里。'}</p>{items.length?<button className="rc-outline" onClick={reset}>查看全部资源</button>:canManage(model.user)&&<button className="rc-primary" onClick={()=>navigate('/admin/content')}>去后台配置资料<ArrowRight size={15}/></button>}</div>}
    </section>
    <section className="rc-browse"><div className="rc-section-title"><h2>按类别浏览</h2></div><div className="rc-category-grid">{RESOURCE_CATEGORIES.slice(1).map(([id,title,desc])=>{const Icon=categoryIcons[id];return <button className={`rc-category rc-tone-${id}`} key={id} onClick={()=>{setCategory(id);setQuery('');setTag('');focusList();}}><span className="rc-category-icon"><Icon size={25}/></span><span><strong>{title}</strong><small>{loading||error?'—':items.filter(item=>resourceCategory(item)===id).length} 项资源</small><small>{desc}</small></span><CaretRight size={14}/></button>;})}<button className="rc-category rc-tone-community" onClick={()=>setModal({community:true})}><span className="rc-category-icon"><UsersThree size={25}/></span><span><strong>社区贡献</strong><small>共建计划筹备中</small><small>让好资源被更多人看见</small></span><CaretRight size={14}/></button></div></section>
  </div><aside className="rc-rail" aria-label="资源搜索与发现">
    <section className="rc-panel rc-quick-search"><h2>快速搜索</h2><form onSubmit={e=>{e.preventDefault();focusList();}}><MagnifyingGlass size={19}/><input aria-label="快速搜索资源" placeholder="搜索资源…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="清空资源关键词" onClick={()=>setQuery('')}><X size={15}/></button>}</form></section>
    <section className="rc-panel rc-tag-panel"><header><h2>资源标签</h2>{allTags.length>15&&<button className="rc-text" onClick={()=>setTagPage(v=>(v+1)%Math.ceil(allTags.length/15))}>换一批</button>}</header><div className="rc-tag-cloud">{tags.map(t=><button key={t} aria-pressed={tag===t} onClick={()=>{setTag(tag===t?'':t);setCategory('all');focusList();}}>{t}</button>)}</div>{!tags.length&&<p className="rc-muted">{loading?'正在读取标签…':'资料发布后，相关标签会显示在这里。'}</p>}</section>
    <section className="rc-panel rc-latest"><header><h2>最新资源</h2><button className="rc-text" onClick={()=>{reset();setSort('newest');setLimit(12);focusList();}}>查看更多<ArrowRight size={13}/></button></header><div>{items.slice(0,5).map(resource=>{const key=resourceCategory(resource),Icon=categoryIcons[key];return <button className={`rc-latest-item rc-tone-${key}`} key={resource.id} onClick={()=>setModal({resource})}><span className="rc-category-icon"><Icon size={21}/></span><span><strong>{resource.title}</strong><small>{resourceDate(resource.created_at)}</small></span></button>;})}</div>{!items.length&&<p className="rc-muted">{loading?'正在加载最新资料…':'新的资源正在准备中，敬请期待。'}</p>}</section>
    <section className="rc-contribute"><div><h2>参与资源共建</h2><p>分享你的实践经验，<br/>让好资源帮助更多创造者。</p><button className="rc-outline" onClick={()=>canManage(model.user)?navigate('/admin/content'):setModal({community:true})}>{canManage(model.user)?'上传与管理资源':'了解共建计划'}<ArrowRight size={15}/></button></div><span><CloudArrowUp size={31}/></span></section>
  </aside>
  {modal?.resource&&<ResourceReader key={modal.resource.id} resource={modal.resource} model={model} navigate={navigate} notify={notify} close={()=>setModal(null)} onComplete={id=>setItems(current=>current.map(i=>i.id===id?{...i,progress:'completed'}:i))}/>}
  {modal?.community&&<ResourceDialog title="资源共建计划" close={()=>setModal(null)}><div className="rc-community-dialog"><CloudArrowUp size={40}/><h3>你的实践，可能帮到下一个创造者</h3><p>社区资源投稿暂未开放。目前资源由管理员在后台配置并发布。你可以先在学习笔记中整理经验、代码和资源链接，待共建功能开放后再分享。</p><button className="rc-primary" onClick={()=>navigate(canManage(model.user)?'/admin/content':model.user?'/notes':'/login?returnTo=%2Fnotes')}>{canManage(model.user)?'进入资源管理':'整理我的学习笔记'}<ArrowRight size={16}/></button></div></ResourceDialog>}
  </div>;
}
