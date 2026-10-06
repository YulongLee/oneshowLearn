import {BrandSymbol} from './BrandIdentity.jsx';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpenText,FileText,UsersThree,MagnifyingGlass,WechatLogo,Clock,ArrowUpRight,ShieldCheck,Laptop,Lightbulb,PaperPlaneTilt,Code,CloudArrowUp,ChartLineUp} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {api} from './api.js';
import {useLocationSearch} from './useLocationSearch.js';
import {Empty,Modal,Panel} from './PersonalShared.jsx';
import {COMMUNITY_CATEGORIES,COMMUNITY_SETTINGS} from '../server/community-definition.mjs';
import {ResourceReader} from './ResourceCenter.jsx';
import {communityArticles,communityFeatured,safeCommunityImage,safeCommunityLink,groupAudience,groupMessage} from './community-editorial-model.js';
import './community-official.css';
import './community-editorial.css';

const categoryName=id=>COMMUNITY_CATEGORIES.find(c=>c[0]===id)?.[1]||'官方内容';
const date=value=>value?new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'日期待完善';
const icons={idea:Lightbulb,development:Code,launch:CloudArrowUp,business:ShieldCheck,growth:ChartLineUp,resources:FileText};
function ArticleImage({src,alt=''}){
 const [failed,setFailed]=useState(false),safe=safeCommunityImage(src);
 useEffect(()=>setFailed(false),[src]);
 return safe&&!failed?<img src={safe} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span className="ce-image-unavailable">{alt||'图片'} · 暂不支持预览或无法加载</span>;
}
export function CommunityArticle({article,preview=false}){
 return <article className="oc-reading"><span className="oc-kicker">{preview?'未发布预览 · ':''}{categoryName(article.category)}{article.topic?` / ${article.topic}`:''}</span><h1>{article.title}</h1><div className="oc-byline"><BrandSymbol/><b>OneShowLearn 官方</b><time>{date(article.publishedAt)}</time></div>{article.summary&&<p className="oc-abstract">{article.summary}</p>}<div className="oc-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{img:({src,alt})=><ArticleImage src={src} alt={alt}/>,a:ArticleLink}}>{article.body}</ReactMarkdown></div></article>;
}
function ArticleLink({href,children}){const safe=safeCommunityLink(href);return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>;}
function ArticleCover({item}){
 const [failed,setFailed]=useState(false),src=safeCommunityImage(item.coverUrl),Icon=icons[item.category]||BookOpenText;
 useEffect(()=>setFailed(false),[item.coverUrl]);
 return <div className={`oc-cover ce-cover-${item.category}`}>{src&&!failed?<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="ce-cover-art" aria-hidden="true"><span><Icon size={50} weight="duotone"/></span><i/><small>分类示意</small></div>}</div>;
}
function ArticleCard({item,featured=false,onOpen}){
 return <article className={featured?'ce-featured':'oc-card'}><button className="oc-card-open" onClick={()=>onOpen(item)} aria-label={`阅读文章：${item.title}`}><ArticleCover item={item}/><div className="oc-card-copy"><div className="ce-article-label"><span className="oc-kicker">{categoryName(item.category)}</span>{(item.pinned||item.recommended)&&<small>{item.pinned?'置顶':'官方推荐'}</small>}</div><h2>{item.title}</h2><p>{item.summary||'阅读官方发布的完整内容。'}</p><div className="ce-article-footer"><span className="oc-byline"><BrandSymbol/><span>OneShowLearn 官方</span></span><span className="ce-read">{featured?'阅读文章':'阅读'}<ArrowRight size={15}/></span></div><time className="ce-date"><Clock size={12}/>{date(item.publishedAt)}</time></div></button></article>;
}
function GroupCard({settings,onOpen,onFaq,ready}){
 const defaultTitle=settings.groupTitle===COMMUNITY_SETTINGS.groupTitle;
 return <section className="oc-group"><div className="ce-group-head"><WechatLogo size={28}/><small>{ready?groupAudience(settings):'正在核验入群配置'}</small></div><h2>{defaultTitle?(settings.groupAudience==='signed-in'?'学员学习交流群':'课程学员学习群'):settings.groupTitle}</h2><p>{settings.groupDescription}</p><ul><li>交流产品开发经验</li><li>获取课程与资源更新</li><li>分享实践问题与心得</li></ul><button disabled={!ready} onClick={onOpen}>{settings.groupAccessible?'查看入群二维码':'查看入群方式'}<ArrowRight size={16}/></button><small>{ready?(settings.groupExpired?'二维码已到期，等待官方更新':settings.groupReady?'入群入口按官方配置的账号权限开放':'入群方式准备中，开放后在这里更新'):'加载完成后可查看实际入群方式'}</small><button className="ce-group-rules" onClick={onFaq}>入群规则与常见问题<ArrowRight size={14}/></button></section>;
}
export function CommunityWorkspace({model,navigate,notify,query='',setQuery}){
 const {search:locationSearch,revision:locationRevision}=useLocationSearch();
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[category,setCategory]=useState('all'),[topic,setTopic]=useState(''),[sort,setSort]=useState('latest'),[limit,setLimit]=useState(12),[selected,setSelected]=useState(null),[articleError,setArticleError]=useState(''),[articleLoading,setArticleLoading]=useState(false),[group,setGroup]=useState(false),[groupData,setGroupData]=useState(null),[groupLoading,setGroupLoading]=useState(false),[groupError,setGroupError]=useState('');
 const [resource,setResource]=useState(null);
 const revision=useRef(0),reading=useRef(0),groupRevision=useRef(0),listRef=useRef(null),faqRef=useRef(null),linkedOpened=useRef('');
 const load=async()=>{const rev=++revision.current;setLoading(true);setError('');try{const d=await api('/community');if(rev===revision.current)setData(d);}catch(e){if(rev===revision.current)setError(e.message);}finally{if(rev===revision.current)setLoading(false);}};
 useEffect(()=>{load();return()=>{revision.current++;reading.current++;groupRevision.current++;};},[]);
 useEffect(()=>setLimit(12),[category,topic,query,sort]);
 const openArticle=async item=>{const rev=++reading.current;setSelected(item);setArticleError('');setArticleLoading(true);try{const result=await api(`/community/articles/${item.id}`);if(rev===reading.current)setSelected(result.item);}catch(e){if(rev===reading.current)setArticleError(e.message);}finally{if(rev===reading.current)setArticleLoading(false);}};
 useEffect(()=>{const id=Number(new URLSearchParams(locationSearch).get('article'));if(id&&data&&linkedOpened.current!==locationRevision){linkedOpened.current=locationRevision;openArticle(data.items.find(a=>a.id===id)||{id,title:'官方文章'});}},[data,locationSearch,locationRevision]);
 const openGroup=async()=>{const rev=++groupRevision.current;setGroup(true);setGroupData(null);setGroupError('');setGroupLoading(true);try{const d=await api('/community');if(rev===groupRevision.current)setGroupData(d.settings);}catch{if(rev===groupRevision.current)setGroupError('入群配置暂时无法核验，请稍后重试或联系官方。');}finally{if(rev===groupRevision.current)setGroupLoading(false);}};
 const closeGroup=()=>{groupRevision.current++;setGroup(false);setGroupData(null);};
 const settings=data?.settings||COMMUNITY_SETTINGS,items=data?.items||[],resources=data?.resources||[],ready=!loading&&!error&&Boolean(data);
 const filtered=communityArticles(items,{category,topic,query,sort}),unfiltered=category==='all'&&!topic&&!query.trim();
 const featured=ready&&unfiltered?communityFeatured(items):null,grid=featured?filtered.filter(i=>i.id!==featured.id):filtered;
 const topics=Array.from(new Set(items.map(i=>i.topic).filter(Boolean))).map(name=>({name,count:items.filter(i=>i.topic===name).length})).sort((a,b)=>b.count-a.count);
 const admin=['admin','editor'].includes(model.user?.role);
 const focusList=()=>{listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});listRef.current?.focus({preventScroll:true});};
 const reset=()=>{setCategory('all');setTopic('');setQuery('');};
 if(!loading&&error&&!model.user)return <div className="oc-page ce-page"><section className="oc-guest-prompt"><UsersThree size={38}/><h2>登录后，加入学习社区</h2><p>阅读官方内容、查看学员群和配套资源。课程权益会按你的账号核验。</p><button onClick={()=>navigate('/login?returnTo=%2Fcommunity')}>登录我的学习账号<ArrowRight size={16}/></button></section></div>;
 const faq=()=>{const first=faqRef.current?.querySelector('details');if(first)first.open=true;faqRef.current?.scrollIntoView({behavior:'smooth',block:'center'});first?.querySelector('summary')?.focus();};
 return <div className="oc-page ce-page"><header className="ce-heading"><div><span className="ce-breadcrumb">学习社区</span><h1>{settings.title===COMMUNITY_SETTINGS.title?'学员社区':settings.title}</h1><p>{settings.description===COMMUNITY_SETTINGS.description?'官方实战文章、课程更新与学员交流，在这里持续跟进。':settings.description}</p></div><div><button className="oc-text-link" onClick={()=>navigate('/notes')}>我的学习笔记<ArrowRight size={16}/></button>{admin&&<button className="oc-text-link" onClick={()=>navigate('/admin/community')}>管理官方内容<ArrowUpRight size={14}/></button>}</div></header>
  <div className="oc-layout"><main className="oc-main"><section className="ce-intro"><div><h2>从学习，到把产品做出来</h2><p>{settings.tagline===COMMUNITY_SETTINGS.tagline?'读方法，跟更新，与同行交流。':settings.tagline}</p></div>{safeCommunityImage(settings.heroImage)?<ArticleImage src={settings.heroImage} alt="官方社区配图"/>:<div className="ce-intro-art" aria-hidden="true"><BookOpenText size={64} weight="duotone"/><Laptop size={66} weight="duotone"/><Lightbulb size={32}/></div>}</section>
   {featured&&<section className="ce-feature-section" aria-label="重点文章"><small>{featured.pinned?'官方置顶':featured.recommended?'官方精选':'最新发布'}</small><ArticleCard item={featured} featured onOpen={openArticle}/></section>}
   <section aria-label="官方文章" ref={listRef} tabIndex={-1} className="ce-catalog"><div className="oc-toolbar"><div className="oc-categories" aria-label="文章分类">{COMMUNITY_CATEGORIES.map(([id,label])=><button key={id} aria-pressed={category===id} className={category===id?'active':''} onClick={()=>{setCategory(id);setTopic('');}}>{label}</button>)}</div><form className="oc-search-row" onSubmit={e=>{e.preventDefault();focusList();}}><label><MagnifyingGlass size={17}/><input aria-label="搜索官方文章" placeholder="搜索文章、专题…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="文章排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">最新发布</option><option value="recommended">官方推荐</option></select></form></div>
   <div className="ce-list-heading"><h2>{unfiltered?'官方文章':'筛选结果'}</h2>{!unfiltered&&<button className="oc-text-link" onClick={reset}>清除筛选 ×</button>}</div>{!unfiltered&&<p className="oc-filter-status" role="status">{topic&&`专题：${topic} · `}找到 {filtered.length} 篇文章</p>}
   {loading?<div className="oc-state" role="status">正在加载官方内容…</div>:error?<div className="oc-state" role="alert"><p>{error}</p><button onClick={load}>重新加载</button></div>:grid.length?<><div className="oc-grid">{grid.slice(0,limit).map(item=><ArticleCard key={item.id} item={item} onOpen={openArticle}/>)}</div>{grid.length>limit&&<button className="oc-load-more" onClick={()=>setLimit(x=>x+12)}>加载更多文章（还有 {grid.length-limit} 篇）</button>}</>:!featured&&<div className="oc-state"><Empty title={items.length?'没有找到相关文章':'官方内容即将发布'} action={items.length?'清除筛选':admin?'前往发布文章':undefined} onAction={()=>items.length?reset():navigate('/admin/community')}>{items.length?'试试其他关键词或分类。':'先继续课程学习，或浏览已发布的配套资料。官方文章发布后会出现在这里。'}</Empty></div>}
   </section><section className="ce-next"><PaperPlaneTilt size={34}/><div><h2>把知识用到下一步</h2><p>继续学习课程，或在资源中心找到适合你的配套资料。</p></div><button className="ps-primary" onClick={()=>navigate('/courses')}>继续学习课程<ArrowRight size={15}/></button><button className="ps-outline" onClick={()=>navigate('/resources')}>浏览资源中心<ArrowRight size={15}/></button></section>
  </main><aside className="oc-rail"><GroupCard settings={settings} ready={ready} onOpen={openGroup} onFaq={faq}/><Panel title="入群前你可能想了解" className="ce-faq"><div ref={faqRef}><details><summary>哪些学员可以加入？</summary><p>{groupAudience(settings)}。具体资格以官方群配置与账号当前权益核验为准。</p></details><details><summary>如何完成入群核验？</summary><p>按官方入群说明操作；如需人工核验，联系官方并提供购买课程的学习账号。查看二维码不代表已加入微信群。</p></details><details><summary>二维码失效怎么办？</summary><p>重新打开入群入口获取当前配置；若已过期或无法加载，请联系官方。不要重复购买课程。</p></details></div><button className="oc-text-link" onClick={()=>navigate('/support')}>联系官方支持<ArrowRight size={15}/></button></Panel>
   {ready&&topics.length>0&&<Panel title="学习专题">{topics.slice(0,4).map(t=><button className="oc-rail-link" key={t.name} onClick={()=>{setTopic(t.name);setCategory('all');focusList();}}><BookOpenText size={21}/><span>{t.name}<small>{t.count} 篇文章</small></span><ArrowRight size={14}/></button>)}</Panel>}
   {ready&&resources.length>0&&<Panel title="推荐资源" action={<button className="oc-text-link" onClick={()=>navigate('/resources')}>查看全部<ArrowRight size={14}/></button>}>{resources.map(r=><button className="oc-rail-link" key={r.id} onClick={()=>setResource(r)}><FileText size={21}/><span>{r.title}<small>课程配套资料 · 按课程权限访问</small></span><ArrowUpRight size={14}/></button>)}</Panel>}
  </aside></div>
  {resource&&<ResourceReader key={resource.id} resource={resource} model={model} navigate={navigate} notify={notify} close={()=>setResource(null)}/>}
  {selected&&<Modal title="官方文章" close={()=>{reading.current++;setSelected(null);}}>{articleLoading?<p className="oc-state" role="status">正在读取文章…</p>:articleError?<div className="oc-state" role="alert">{articleError}<button onClick={()=>openArticle(selected)}>重试</button></div>:<CommunityArticle article={selected}/>}</Modal>}
  {group&&<Modal title="学员群入群方式" close={closeGroup}><div className="oc-group-dialog"><WechatLogo size={40}/>{groupLoading?<p role="status">正在核验当前入群配置…</p>:groupError?<div role="alert"><p>{groupError}</p><button className="ps-outline" onClick={openGroup}>重新核验</button></div>:groupData&&<><h3>{groupData.groupTitle}</h3><p>{groupData.groupDescription}</p>{groupData.groupAccessible&&groupData.qrUrl&&<><ArticleImage src={groupData.qrUrl} alt="官方学员群二维码"/><p>{groupData.groupInstructions||COMMUNITY_SETTINGS.groupInstructions}</p>{groupData.groupExpiresAt&&<small>二维码有效至 {groupData.groupExpiresAt}（北京时间）</small>}</>}<p>{groupMessage(groupData)}</p>{groupData.groupReady&&!groupData.groupAccessible&&<button className="ps-outline" onClick={()=>navigate('/courses')}>查看我的课程<ArrowRight size={15}/></button>}</>}
   <div className="ce-group-help"><button className="oc-text-link" onClick={()=>navigate('/support')}>联系官方支持<ArrowRight size={15}/></button>{admin&&<button className="oc-text-link" onClick={()=>navigate('/admin/community')}>管理会员群配置<ArrowRight size={15}/></button>}</div></div></Modal>}
 </div>;
}
