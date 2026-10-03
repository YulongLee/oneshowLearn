import {useEffect,useState} from 'react';
import {ArrowRight,BookOpenText,BookmarkSimple,Clock,FileText,FolderSimple,Hash,List,LockKey,LockSimple,MagnifyingGlass,NotePencil,SquaresFour,Star,Wrench,X} from '@phosphor-icons/react';
import {api} from './api.js';
import {courseArt} from './Workspace.jsx';
import {ResourceReader} from './ResourceCenter.jsx';
import {resourceArt} from './resource-model.js';
import {safeResourceUrl} from './opc-model.js';
import {Gate,Markdown,Modal} from './PersonalShared.jsx';
import {shortDate,tagCounts} from './personal-model.js';
import {FAVORITE_CATEGORIES,favoriteItems,filterFavorites,withoutFavorite} from './favorites-studio-model.js';
import prd from './assets/resources-prd-v1.webp';
import code from './assets/resources-code-v1.webp';
import payment from './assets/resources-payment-v1.webp';
import deploy from './assets/resources-deploy-v1.webp';
import './favorites-studio.css';

const covers={prd,code,payment,deploy};
const icons={all:BookmarkSimple,course:BookOpenText,resource:FolderSimple,article:FileText,tool:Wrench,note:NotePencil};
const kindName=kind=>FAVORITE_CATEGORIES.find(([id])=>id===kind)?.[1]||'资源';
function FavoriteArt({item,open}) {
  const [broken,setBroken]=useState(false);
  const Icon=icons[item.kind];
  const custom=item.kind==='course'?safeResourceUrl(item.source.cover_url):null;
  const image=item.kind==='course'?custom||courseArt(item.source):covers[resourceArt(item.source)];
  useEffect(()=>setBroken(false),[image]);
  return <button className={`fs-art fs-art-${item.kind}`} disabled={item.unavailable} onClick={()=>open(item)} aria-label={`打开${item.title}`}>
    {item.kind==='note'?<div className="fs-note-preview"><span><NotePencil size={17}/>学习笔记</span><strong>{item.title}</strong><p>{item.description||'记录下的每一次思考，都是下一次实践的起点。'}</p></div>:item.unavailable||broken?<div className="fs-art-fallback"><Icon size={36} weight="duotone"/><span>{item.pending?'资料信息待加载':item.unavailable?'内容暂不可用':kindName(item.kind)}</span></div>:<><img src={image} loading="lazy" alt="" onError={()=>setBroken(true)}/>{!custom&&<small>分类示意</small>}</>}
  </button>;
}

export function FavoritesWorkspace({model,navigate,notify,query='',setQuery}) {
  const [resources,setResources]=useState([]),[resourceStatus,setResourceStatus]=useState('loading'),[retry,setRetry]=useState(0);
  const [category,setCategory]=useState('all'),[tag,setTag]=useState(''),[sort,setSort]=useState('recent'),[tagsOpen,setTagsOpen]=useState(false);
  const [view,setView]=useState(()=>{try{return localStorage.getItem('oneshowlearn:favorites-view')==='list'?'list':'grid';}catch{return 'grid';}});
  const [modal,setModal]=useState(null),[pending,setPending]=useState(null),[removing,setRemoving]=useState(false),[removeError,setRemoveError]=useState('');
  useEffect(()=>{if(!model.user)return;let active=true;setResourceStatus('loading');setResources([]);api('/resources').then(d=>{if(active){setResources(d.items||[]);setResourceStatus('ready');}}).catch(()=>{if(active)setResourceStatus('error');});return()=>{active=false;};},[retry,model.user?.id]);
  const items=favoriteItems({state:model.state,library:model.library,recommendations:model.recommendations,resources,resourcesReady:resourceStatus==='ready'});
  const visible=filterFavorites(items,{category,tag,query,sort});
  const tags=tagCounts(items),filtered=category!=='all'||Boolean(tag||query.trim());
  const reset=()=>{setCategory('all');setTag('');setQuery('');};
  const switchView=value=>{setView(value);try{localStorage.setItem('oneshowlearn:favorites-view',value);}catch{/* Storage may be disabled. */}};
  const open=item=>{if(item.unavailable)return;if(item.kind==='course')navigate(`/packs/${item.source.slug}`);else setModal(item);};
  const askRemove=item=>{setPending(item);setRemoveError('');};
  const remove=async()=>{
    if(!pending||model.busy||removing)return;setRemoving(true);setRemoveError('');
    try{if(await model.saveState(withoutFavorite(model.state,pending))){setPending(null);notify('已取消收藏，原内容仍然保留');}else setRemoveError('未能保存本次操作，请重试；收藏仍保留。');}
    catch{setRemoveError('暂时无法取消收藏，请稍后重试。');}finally{setRemoving(false);}
  };
  return <div className="favorites-studio">
    <header className="fs-heading"><div><span className="fs-eyebrow"><BookmarkSimple size={18}/>我的知识收藏</span><h1>我的收藏</h1><p>把值得再看的内容留下，让下一次学习更有方向。</p></div><div className="fs-heading-actions"><span><LockSimple size={14}/>仅自己可见</span><button className="fs-button" onClick={()=>navigate('/resources')}>发现学习资源<ArrowRight size={16}/></button></div></header>
    <Gate model={model} navigate={navigate}>
      {model.error?<div className="fs-notice" role="alert">收藏数据暂时无法读取，请重试后再操作。<button onClick={()=>model.refresh()}>重新加载</button></div>:<>
      <section className="fs-library" aria-label="收藏内容">
        <div className="fs-library-heading"><div><span className="fs-library-icon"><Star size={24} weight="duotone"/></span><div><h2>你的灵感资料库</h2><p><strong>{items.length}</strong> 项收藏<span>·</span>{tags.length} 个标签</p></div></div><span className="fs-library-hint">收藏不止于保存，更在于下一次使用</span></div>
        <nav className="fs-categories" aria-label="收藏分类">{FAVORITE_CATEGORIES.map(([id,label])=>{const Icon=icons[id];return <button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setTag('');}}><Icon size={18}/>{label}<span>{id==='all'?items.length:items.filter(i=>i.kind===id).length}</span></button>;})}</nav>
        <div className="fs-toolbar"><label className="fs-search"><MagnifyingGlass size={19}/><input aria-label="在收藏中搜索" placeholder="搜索标题、内容或标签…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')} aria-label="清空收藏搜索"><X size={16}/></button>}</label><div className="fs-tools"><button className="fs-button fs-tag-toggle" aria-expanded={tagsOpen} aria-controls="favorite-tags" onClick={()=>setTagsOpen(!tagsOpen)}><Hash size={17}/>标签{tag&&<i/>}</button><select aria-label="收藏排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">最近记录</option><option value="title">名称排序</option></select><div className="fs-view" aria-label="展示方式"><button aria-label="网格视图" aria-pressed={view==='grid'} onClick={()=>switchView('grid')}><SquaresFour size={19}/></button><button aria-label="列表视图" aria-pressed={view==='list'} onClick={()=>switchView('list')}><List size={19}/></button></div></div></div>
        {tagsOpen&&<div id="favorite-tags" className="fs-tag-filter">{tags.length?tags.map(([value,count])=><button key={value} aria-pressed={tag===value} onClick={()=>setTag(tag===value?'':value)}><Hash size={13}/>{value}<span>{count}</span></button>):<p>收藏内容自带的标签会显示在这里，方便你快速查找。</p>}</div>}
      </section>
      {resourceStatus==='error'&&(model.state.resourceFavorites||[]).length>0&&<div className="fs-notice" role="alert">部分资源信息加载失败，收藏记录仍然保留。<button onClick={()=>setRetry(v=>v+1)}>重新加载资源</button></div>}
      <div className="fs-results"><h2>{kindName(category)}<span>{visible.length} 项</span></h2><div>{tag&&<button onClick={()=>setTag('')} aria-label={`清除标签${tag}`}>#{tag}<X size={13}/></button>}{filtered&&<button onClick={reset}>清除筛选</button>}</div></div>
      {visible.length?<div className={`fs-grid${view==='list'?' fs-list':''}`} aria-busy={model.busy}>{visible.map(item=>{const Icon=icons[item.kind];return <article className={`fs-card fs-kind-${item.kind}${item.unavailable?' fs-unavailable':''}`} key={item.id}>
        <div className="fs-cover"><FavoriteArt item={item} open={open}/><button className="fs-save" disabled={model.busy} aria-label={`取消收藏${item.title}`} title="取消收藏" onClick={()=>askRemove(item)}><BookmarkSimple size={19} weight="fill"/></button></div>
        <div className="fs-card-body"><div className="fs-card-kind"><span><Icon size={15}/>{kindName(item.kind)}</span>{item.locked&&<span className="fs-access"><LockKey size={13}/>课程专享</span>}{item.unavailable&&<span className="fs-access">{item.pending?'待加载':'暂不可用'}</span>}</div><button className="fs-title" disabled={item.unavailable} onClick={()=>open(item)}><h3>{item.title}</h3></button><p className="fs-description">{item.unavailable?(item.pending?'资料信息尚未读取，收藏记录仍然保留。':'内容可能已下架或调整访问范围，收藏记录仍然保留。'):item.description||'打开内容，继续你的学习与实践。'}</p><div className="fs-card-tags">{item.tags.slice(0,3).map(value=><button key={value} onClick={()=>{setTag(value);setTagsOpen(true);}}>{value}</button>)}</div><footer><span><Clock size={13}/>{item.date&&Number.isFinite(Date.parse(item.date))?`${item.kind==='note'?'更新':'收藏'} ${shortDate(item.date)}`:'收藏时间未记录'}</span><button disabled={item.unavailable} onClick={()=>open(item)} aria-label={`查看${item.title}`}>{item.unavailable?'暂不可用':item.kind==='note'?'阅读笔记':item.kind==='course'?'查看课程':'查看内容'}<ArrowRight size={15}/></button></footer></div>
      </article>;})}</div>:<section className="fs-empty"><div className="fs-empty-art" aria-hidden="true"><span><BookOpenText size={30}/></span><span><BookmarkSimple size={38} weight="duotone"/></span><span><NotePencil size={28}/></span></div><span className="fs-eyebrow">{filtered?'换个关键词，再找找':'为下一次学习，留一点灵感'}</span><h2>{filtered?'没有找到匹配的收藏':'你的好内容，从这里开始积累'}</h2><p>{filtered?'试试其他分类、标签或更短的关键词。':'在课程、资源或笔记中点击收藏，想回看时都能在这里找到。'}</p><button className="fs-primary" onClick={filtered?reset:()=>navigate('/resources')}>{filtered?'查看全部收藏':'去发现学习资源'}<ArrowRight size={16}/></button>{!filtered&&<div className="fs-empty-guide"><span><BookOpenText size={18}/>收藏课程，随时回看</span><span><FolderSimple size={18}/>保存资料，实践时用</span><span><NotePencil size={18}/>星标笔记，沉淀思考</span></div>}</section>}
      {items.length>0&&<p className="fs-footnote"><LockSimple size={13}/>收藏仅对你可见；收藏内容不会改变原有访问权限。</p>}
      </>}
    </Gate>
    {pending&&<Modal title="取消这项收藏？" close={()=>{if(!removing)setPending(null);}}><div className="fs-remove"><p>「{pending.title}」将从收藏中移除，{pending.kind==='note'?'笔记内容不会删除。':'原课程或资料不会删除。'}</p><p>之后仍可在原内容中重新收藏。</p>{removeError&&<p role="alert">{removeError}</p>}<div><button className="fs-button" disabled={removing} onClick={()=>setPending(null)}>保留收藏</button><button className="fs-primary" disabled={model.busy||removing} onClick={remove}>{removing?'正在保存…':'确认取消收藏'}</button></div></div></Modal>}
    {modal?.kind==='note'&&<Modal title={modal.title} close={()=>setModal(null)}><div className="ps-modal-body"><Markdown body={modal.source.body}/><button className="fs-button" onClick={()=>navigate('/notes')}>进入学习笔记<ArrowRight size={15}/></button></div></Modal>}
    {modal&&modal.kind!=='note'&&<ResourceReader resource={modal.source} model={model} navigate={navigate} notify={notify} close={()=>setModal(null)}/>}
  </div>;
}
