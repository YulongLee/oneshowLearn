import {useEffect,useState} from 'react';
import {ArrowRight,BookOpenText,BookmarkSimple,Clock,Cube,FileText,FolderSimple,Hash,List,LockKey,LockSimple,MagnifyingGlass,NotePencil,Sparkle,SquaresFour,Star,Wrench,X} from '@phosphor-icons/react';
import {api} from './api.js';
import {ResourceReader} from './ResourceCenter.jsx';
import {Gate,Modal} from './PersonalShared.jsx';
import {shortDate,tagCounts} from './personal-model.js';
import {FAVORITE_CATEGORIES,favoriteItems,filterFavorites,withoutFavorite,favoriteAction,favoriteSource,favoriteCoverUrl} from './favorites-studio-model.js';
import './favorites-studio.css';

const icons={all:BookmarkSimple,course:BookOpenText,project:Cube,resource:FolderSimple,article:FileText,tool:Wrench,note:NotePencil};
const kindName=kind=>FAVORITE_CATEGORIES.find(([id])=>id===kind)?.[1]||'资源';
function FavoriteArt({item,open}){
 const [broken,setBroken]=useState(false),Icon=icons[item.kind];
 const image=item.kind==='course'?favoriteCoverUrl(item.source.cover_url):null;
 useEffect(()=>setBroken(false),[image]);
 return <button className={`fs-art fs-art-${item.kind}`} disabled={item.unavailable} onClick={()=>open(item)} aria-label={`打开${item.title}`}>
  {image&&!broken?<img src={image} loading="lazy" alt="" onError={()=>setBroken(true)}/>:<div className="fs-native-art" aria-hidden="true"><span className="fs-art-orbit"/><span className="fs-art-sheet"><Icon size={52} weight="duotone"/><i/><i/><i/></span><span className="fs-art-companion"><Icon size={28}/></span><Sparkle className="fs-art-spark" size={22} weight="fill"/><small>{item.unavailable?(item.pending?'待加载':'暂不可用'):'分类示意'}</small></div>}
 </button>;
}
export function FavoritesWorkspace({model,navigate,notify,query='',setQuery}){
 const [resources,setResources]=useState([]),[resourceStatus,setResourceStatus]=useState('loading'),[retry,setRetry]=useState(0);
 const [contents,setContents]=useState([]),[contentsStatus,setContentsStatus]=useState('loading');
 const contentRefs=JSON.stringify(model.state.contentFavorites||[]);
 useEffect(()=>{let active=true;setContents([]);if(!model.user||contentRefs==='[]'){setContentsStatus('ready');return;}setContentsStatus('loading');api('/me/favorites/contents').then(d=>{if(active){setContents(d.items||[]);setContentsStatus('ready');}}).catch(()=>{if(active)setContentsStatus('error');});return()=>{active=false;};},[model.user?.id,contentRefs,retry]);
 const [category,setCategory]=useState('all'),[tag,setTag]=useState(''),[sort,setSort]=useState('recent'),[tagsOpen,setTagsOpen]=useState(false);
 const [view,setView]=useState(()=>{try{return localStorage.getItem('oneshowlearn:favorites-view')==='list'?'list':'grid';}catch{return 'grid';}});
 const [modal,setModal]=useState(null),[pending,setPending]=useState(null),[removing,setRemoving]=useState(false),[removeError,setRemoveError]=useState('');
 useEffect(()=>{if(!model.user)return;let active=true;setResourceStatus('loading');setResources([]);api('/resources').then(d=>{if(active){setResources(d.items||[]);setResourceStatus('ready');}}).catch(()=>{if(active)setResourceStatus('error');});return()=>{active=false;};},[retry,model.user?.id]);
 const items=favoriteItems({state:model.state,library:model.library,recommendations:model.recommendations,resources,resourcesReady:resourceStatus==='ready',contents,contentsReady:contentsStatus==='ready'});
 const visible=filterFavorites(items,{category,tag,query,sort}),tags=tagCounts(items),filtered=category!=='all'||Boolean(tag||query.trim()),blocked=model.busy||model.loading;
 const reset=()=>{setCategory('all');setTag('');setQuery('');};
 const switchView=value=>{setView(value);try{localStorage.setItem('oneshowlearn:favorites-view',value);}catch{/* Presentation only. */}};
 const open=item=>{if(item.unavailable)return;if(item.reference)navigate(item.source.url);else if(item.kind==='course')navigate(`/packs/${item.source.slug}`);else if(item.kind==='note')navigate(`/notes?note=${encodeURIComponent(item.source.id)}`);else setModal(item);};
 const remove=async()=>{
  if(!pending||blocked||removing)return;setRemoving(true);setRemoveError('');
  try{if(await model.saveState(withoutFavorite(model.state,pending))){setPending(null);notify('已取消收藏，原内容仍然保留');}else setRemoveError('未能保存本次操作，请核对最新收藏后重试。');}
  catch{setRemoveError('暂时无法取消收藏，请稍后重试。');}finally{setRemoving(false);}
 };
 return <div className="favorites-studio">
  <header className="fs-heading"><div><h1>我的收藏</h1><p>把值得再用的内容留下，让下一次学习更有方向。</p></div><div className="fs-heading-actions"><span><LockSimple size={14}/>仅自己可见</span><button className="fs-button" onClick={()=>navigate('/resources')}>发现学习资源<ArrowRight size={16}/></button></div></header>
  <Gate model={model} navigate={navigate}>
   {model.error?<div className="fs-notice" role="alert">收藏数据暂时无法读取，请重试后再操作。<button onClick={()=>model.refresh()}>重新加载</button></div>:model.loading?<p className="fs-notice" role="status">正在读取你的收藏…</p>:<>
    {items.length>0&&<section className="fs-library" aria-label="收藏内容">
     <nav className="fs-categories" aria-label="收藏分类">{FAVORITE_CATEGORIES.map(([id,label])=>{const Icon=icons[id];return <button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setTag('');}}><Icon size={18}/>{label}<span>{id==='all'?items.length:items.filter(i=>i.kind===id).length}</span></button>;})}</nav>
     <div className="fs-toolbar"><label className="fs-search"><MagnifyingGlass size={19}/><input aria-label="在收藏中搜索" placeholder="搜索标题、摘要或笔记正文…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')} aria-label="清空收藏搜索"><X size={16}/></button>}</label><div className="fs-tools">{tags.length>0&&<button className="fs-button fs-tag-toggle" aria-expanded={tagsOpen} aria-controls="favorite-tags" onClick={()=>setTagsOpen(!tagsOpen)}><Hash size={17}/>标签筛选{tag&&<i/>}</button>}<select aria-label="收藏排序" title="按已知收藏时间或笔记更新时间排列；旧课程未记录时间。" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">最近记录</option><option value="title">名称排序</option></select><div className="fs-view" aria-label="展示方式"><button aria-label="网格视图" aria-pressed={view==='grid'} onClick={()=>switchView('grid')}><SquaresFour size={19}/></button><button aria-label="列表视图" aria-pressed={view==='list'} onClick={()=>switchView('list')}><List size={19}/></button></div></div></div>
     {tagsOpen&&<div id="favorite-tags" className="fs-tag-filter">{tags.map(([value,count])=><button key={value} aria-pressed={tag===value} onClick={()=>setTag(tag===value?'':value)}><Hash size={13}/>{value}<span>{count}</span></button>)}</div>}
    </section>}
    {contentsStatus==='error'&&<div className="fs-notice" role="alert">关联内容加载失败，收藏记录仍然保留。<button onClick={()=>setRetry(v=>v+1)}>重新加载关联内容</button></div>}
    {resourceStatus==='error'&&(model.state.resourceFavorites||[]).length>0&&<div className="fs-notice" role="alert">部分资源信息加载失败，收藏记录仍然保留。<button onClick={()=>setRetry(v=>v+1)}>重新加载资源</button></div>}
    {items.length>0&&<div className="fs-results"><h2>{kindName(category)}<span aria-live="polite">{visible.length} 项</span></h2><div>{tag&&<button onClick={()=>setTag('')} aria-label={`清除标签${tag}`}>#{tag}<X size={13}/></button>}{filtered&&<button onClick={reset}>清除筛选</button>}</div></div>}
    {visible.length?<div className={`fs-grid${view==='list'?' fs-list':''}`} aria-busy={blocked}>{visible.map(item=>{const Icon=icons[item.kind];return <article className={`fs-card fs-kind-${item.kind}${item.unavailable?' fs-unavailable':''}`} key={item.id}>
     <div className="fs-cover"><FavoriteArt item={item} open={open}/><span className="fs-cover-kind"><Icon size={15}/>{item.kind==='note'?(item.reference?'课时笔记':'个人笔记'):kindName(item.kind)}</span><button className="fs-save" disabled={blocked} aria-label={`取消收藏${item.title}`} title="取消收藏" onClick={()=>{setPending(item);setRemoveError('');}}><Star size={21} weight="fill"/></button></div>
     <div className="fs-card-body"><button className="fs-title" disabled={item.unavailable} onClick={()=>open(item)}><h3>{item.title}</h3></button><p className="fs-description">{item.unavailable?(item.pending?'资料信息尚未读取，收藏记录仍然保留。':'内容可能已下架或调整访问范围，收藏记录仍然保留。'):item.description||'打开内容，继续你的学习与实践。'}</p><p className="fs-source">来源：{favoriteSource(item)}</p><div className="fs-card-tags">{item.tags.slice(0,2).map(value=><button key={value} onClick={()=>{setTag(value);setTagsOpen(true);}}>{value}</button>)}{item.kind!=='course'&&item.kind!=='note'&&<span className={`fs-access ${item.locked?'is-locked':''}`}>{item.unavailable?(item.pending?'正在加载':'暂不可用'):item.locked?<><LockKey size={13}/>课程专享</>:item.source.is_preview?'免费预览':'可访问'}</span>}</div><footer><button disabled={item.unavailable} onClick={()=>open(item)} aria-label={`${favoriteAction(item)}：${item.title}`}>{favoriteAction(item)}<ArrowRight size={16}/></button>{item.date&&Number.isFinite(Date.parse(item.date))&&<span><Clock size={13}/>{item.kind==='note'&&!item.reference?'更新':'收藏'} {shortDate(item.date)}</span>}</footer></div>
    </article>;})}</div>:<section className="fs-empty"><BookmarkSimple size={40} weight="duotone" aria-hidden="true"/><h2>{filtered&&items.length?'没有找到匹配的收藏':'从第一次收藏开始'}</h2><p>{filtered&&items.length?'试试其他分类、标签或更短的关键词。':'在课程、项目、资料或笔记中收藏内容，之后在这里快速找回。'}</p>{filtered&&items.length?<button className="fs-primary" onClick={reset}>查看全部收藏<ArrowRight size={16}/></button>:<div className="fs-empty-guide"><button onClick={()=>navigate('/resources')}><FolderSimple size={24}/><span><strong>发现学习资源</strong><small>留下实战时会用到的资料</small></span><ArrowRight size={16}/></button><button onClick={()=>navigate('/courses')}><BookOpenText size={24}/><span><strong>浏览学习课程</strong><small>保存想再次学习的课程</small></span><ArrowRight size={16}/></button><button onClick={()=>navigate('/notes')}><NotePencil size={24}/><span><strong>整理个人笔记</strong><small>星标自己的重要思考</small></span><ArrowRight size={16}/></button></div>}{!items.length&&query&&<button className="fs-button" onClick={reset}>清空搜索</button>}</section>}
    {items.length>0&&<p className="fs-footnote"><LockSimple size={14}/>收藏只保存引用，不改变原内容的访问权限。</p>}
   </>}
  </Gate>
  {pending&&<Modal title="取消这项收藏？" close={()=>{if(!removing)setPending(null);}}><div className="fs-remove"><p>「{pending.title}」将从收藏中移除，{pending.kind==='note'?'笔记内容不会删除。':'原课程或资料不会删除。'}</p><p>之后仍可在原内容中重新收藏。</p>{removeError&&<p role="alert">{removeError}</p>}<div><button className="fs-button" disabled={removing} onClick={()=>setPending(null)}>保留收藏</button><button className="fs-primary" disabled={blocked||removing} onClick={remove}>{removing?'正在保存…':'确认取消收藏'}</button></div></div></Modal>}
  {modal&&<ResourceReader resource={modal.source} model={model} navigate={navigate} notify={notify} close={()=>setModal(null)}/>}
 </div>;
}
