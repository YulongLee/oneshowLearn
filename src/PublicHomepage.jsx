import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle,ChartBar,Code,CreditCard,Cube,FileText,GraduationCap,Lightbulb,Lightning,List,MagnifyingGlass,Play,Quotes,Robot,Rocket,ShieldCheck,Sparkle,Users,VideoCamera,X} from '@phosphor-icons/react';
import {BrandIdentity} from './BrandIdentity.jsx';
import {ServiceLinks} from './ServiceLinks.jsx';
import './service-center.css';
import {api} from './api.js';
import {sharedRead} from './shared-reads.js';
import hero from './assets/oneshowlearn-hero-optimized.webp';
import {useSitePage} from './useSitePage.js';
import {offerMoney} from './course-offer-model.js';
import {homepageExamples,homepageOffer} from './homepage-model.js';
import {currentPublicCopy} from '../server/site-defaults.mjs';
import './homepage.css';

const phases=[
  {title:'产品与机会',icon:Lightbulb,tone:'violet',items:['发现市场机会','用户需求分析','产品定位与规划']},
  {title:'AI 产品开发',icon:Code,tone:'blue',items:['用 Codex 高效开发','产品架构设计','快速构建 MVP']},
  {title:'上线与合规',icon:Rocket,tone:'green',items:['域名与服务器','备案与数据合规','发布上线流程']},
  {title:'收款与商业化',icon:CreditCard,tone:'orange',items:['微信 / 支付宝接入','海外支付方案','定价策略与商业模式']},
  {title:'运营与增长',icon:ChartBar,tone:'violet',items:['SEO / GEO 优化','内容与社群推广','数据分析与迭代']},
];
const benefits=[
  {icon:VideoCamera,title:'系统课程',text:'循序渐进学习\n从想法到产品',tone:'blue'},
  {icon:Cube,title:'实战项目',text:'从 0 到 1\n掌握开发全过程',tone:'green'},
  {icon:FileText,title:'模板资源',text:'PRD / 设计 / 开发\n配套资料与工具',tone:'blue'},
  {icon:Robot,title:'AI 导师',text:'结合学习资料\n辅助理解与实践',tone:'violet'},
  {icon:Users,title:'学习社区',text:'官方实战分享\n一起交流与成长',tone:'blue'},
];

export function PublicHomepage({navigate,configuration}) {
  const root=useRef(null);
  const {data,error,loading}=useSitePage('public',configuration);
  const site=currentPublicCopy(data);
  const [menuOpen,setMenuOpen]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  const [catalog,setCatalog]=useState([]),[searchStatus,setSearchStatus]=useState('idle'),[offer,setOffer]=useState(null);
  useEffect(()=>{let active=true;sharedRead('/commerce/offer',{force:true}).then(value=>{if(active)setOffer(value);}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{if(!searchOpen||searchStatus==='ready')return;let active=true;setSearchStatus('loading');api('/catalog/workspace').then(value=>{if(active){setCatalog(value.items||[]);setSearchStatus('ready');}}).catch(()=>{if(active)setSearchStatus('error');});return()=>{active=false;};},[searchOpen]);
  const results=catalog.filter(course=>`${course.title} ${course.subtitle||''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0,8);
  const scrollTo=id=>{setMenuOpen(false);root.current?.querySelector('#'+id)?.scrollIntoView({behavior:'smooth',block:'start'});};
  const scrollHome=()=>{setMenuOpen(false);root.current?.ownerDocument.defaultView?.scrollTo({top:0,behavior:'smooth'});};
  const examples=homepageExamples(site),price=homepageOffer(offer),description=site.description.split('\n');
  const purchaseText=site.ctaPath==='/membership'&&price.priced?`${offerMoney(offer.priceCents)} ${site.ctaLabel}`:site.ctaLabel;
  return <main ref={root} className="sales-page sales-reference">
    <header className="sales-nav">
      <button className="sales-brand" onClick={scrollHome} aria-label="OneShowLearn 首页"><BrandIdentity/></button>
      <nav id="homepage-navigation" className={`sales-links${menuOpen?' open':''}`} aria-label="主要导航"><button className="active" onClick={scrollHome}>首页</button><button onClick={()=>scrollTo('roadmap')}>课程体系</button><button onClick={()=>scrollTo('hot-courses')}>实战案例</button><button onClick={()=>navigate('/community')}>学习社区</button><button onClick={()=>scrollTo('about')}>关于我们</button></nav>
      <div className="sales-actions"><div className="sales-search-wrap"><form className="sales-search" role="search" onSubmit={e=>{e.preventDefault();setSearchOpen(true);}}><MagnifyingGlass size={17}/><input aria-label="搜索课程" placeholder="搜索课程、实战内容…" value={search} onFocus={()=>setSearchOpen(true)} onChange={e=>{setSearch(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setSearchOpen(false);}}/></form>{searchOpen&&<section className="sales-search-results" aria-label="课程搜索结果"><header><strong>已发布课程</strong><button aria-label="关闭课程搜索" onClick={()=>setSearchOpen(false)}><X size={18}/></button></header>{searchStatus==='loading'?<p role="status">正在读取课程…</p>:searchStatus==='error'?<p role="alert">搜索暂不可用，请关闭后重试。</p>:results.length?results.map(course=><button key={course.id} onClick={()=>navigate('/packs/'+course.slug)}>{course.title}<ArrowRight size={15}/></button>):<p>没有匹配的课程，试试其他关键词。</p>}</section>}</div><button className="sales-login" onClick={()=>navigate('/login')}>登录</button><button className="sales-start" onClick={()=>navigate('/opc')}>开始学习<ArrowRight size={16}/></button><button className="sales-menu" aria-controls="homepage-navigation" aria-expanded={menuOpen} aria-label={menuOpen?'关闭导航':'打开导航'} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={22}/>:<List size={22}/>}</button></div>
    </header>
    <section className="sales-hero" aria-labelledby="home-title"><img className="sales-hero-image" src={!site.image||site.image==='/assets/oneshowlearn-hero.png'?hero:site.image} alt="学习者使用电脑实践 AI 项目" fetchPriority="high" decoding="async"/><div className="sales-hero-wash" aria-hidden="true"/><div className="sales-hero-inner"><div className="sales-hero-copy"><span className="sales-pill"><Sparkle size={14} weight="fill"/>{site.eyebrow}</span><h1 id="home-title">{site.title.split('\n').map((line,i)=><span key={i}>{line}</span>)}</h1><p className="sales-lead">{description[0]}</p><p className="sales-description">{description.slice(1).join('\n')}</p><div className="sales-hero-buttons"><button className="sales-button primary" onClick={()=>navigate(site.ctaPath)}>{purchaseText}<ArrowRight size={18}/></button><button className="sales-button ghost" onClick={()=>navigate(site.secondaryPath)}><Play size={17} weight="fill"/>{site.secondaryLabel}</button></div><div className="sales-hero-promises"><span><ShieldCheck/>一次购买，长期学习</span><span><Lightning/>持续更新</span><span><FileText/>配套资料与模板</span><span><Users/>学习交流</span></div></div></div><span className="sales-handwriting" aria-hidden="true">Learn<br/>Build<br/>Grow</span><aside className="sales-hero-quote"><Quotes size={21} weight="fill"/><strong>用 AI，<br/>把想法变成现实。</strong><small>— OneShowLearn</small></aside><div className="sales-hero-note">{['找到产品机会','用 AI 快速开发','完成上线与合规','接入支付与商业化','获取用户并持续增长'].map(text=><span key={text}><CheckCircle size={22} weight="fill"/>{text}</span>)}</div></section>
    <section className="sales-proof" aria-label="学习体系特色">{[[GraduationCap,'5 大阶段','从想法到增长'],[VideoCamera,'系统课程','按章节循序学习'],[Cube,'项目实战','可复用的方法与模板'],[Users,'一起成长','学习、交流与实践'],[Lightning,'持续更新','关注 AI 产品新机会']].map(([Icon,title,text])=><article key={title}><i><Icon size={30} weight="duotone"/></i><div><strong>{title}</strong><small>{text}</small></div></article>)}</section>
    <section className="sales-roadmap" id="roadmap" aria-labelledby="roadmap-title"><div className="sales-roadmap-intro"><span className="sales-eyebrow">LEARN · BUILD · GROW</span><h2 id="roadmap-title">从想法到收入<br/>一条完整的 <em>AI 产品路径</em></h2><p>不只是学工具，而是帮你完成一个真实可运行的产品，掌握 AI 时代的全流程能力。</p><button className="sales-button primary" onClick={()=>navigate('/paths')}>查看完整课程体系<ArrowRight size={17}/></button></div><ol className="sales-phase-grid">{phases.map(({title,icon:Icon,tone,items},i)=><li className={`sales-phase ${tone}`} key={title}><span className="sales-phase-number">0{i+1}</span><Icon className="sales-phase-icon" size={39} weight="duotone"/><h3>{title}</h3><ul>{items.map(text=><li key={text}><CheckCircle size={13} weight="fill"/>{text}</li>)}</ul>{i<4&&<ArrowRight className="sales-phase-arrow" size={21}/>}</li>)}</ol></section>
    <section className="sales-examples" id="hot-courses" aria-labelledby="examples-title"><div className="sales-section-head"><div><span className="sales-eyebrow">BUILD REAL PRODUCTS</span><h2 id="examples-title">{examples.projects?'项目实战案例':'探索实战学习方向'}</h2><p>{examples.projects?'从具体项目出发，把学习的方法用到自己的产品中。':'从产品机会、开发到增长，找到适合自己的实践方向。'}</p></div><button onClick={()=>navigate('/projects')}>查看更多项目<ArrowRight size={16}/></button></div>{error&&<p role="alert">{error}</p>}<div className="sales-example-grid" aria-busy={loading}>{examples.items.map(p=><button className="sales-example" key={p.id} onClick={()=>navigate(p.path)}><div><span>{p.label}</span><h3>{p.title.replaceAll('\n',' · ')}</h3><p>{p.description}</p><ArrowRight size={18}/></div>{p.image?<img src={p.image} alt="" loading="lazy"/>:<div className="sales-example-placeholder" aria-hidden="true"><Code size={48}/></div>}</button>)}</div></section>
    <section className="sales-benefits" aria-labelledby="benefits-title"><div className="sales-benefits-intro"><span className="sales-eyebrow">YOU WILL GET</span><h2 id="benefits-title">学完你将获得</h2><p>不仅是知识，更是一套可以直接落地的产品能力。</p></div>{benefits.map(({icon:Icon,title,text,tone})=><article className={tone} key={title}><i><Icon size={28} weight="duotone"/></i><h3>{title}</h3><p>{text}</p></article>)}</section>
    <section className="sales-bottom"><div className="sales-bottom-copy"><span>ONE PURCHASE · KEEP BUILDING</span><h2>{site.footerTitle}</h2><p>{site.footerDescription}</p><ul>{['完整课程体系','实战项目与模板','AI 辅助学习','配套学习资料'].map(text=><li key={text}><CheckCircle size={18} weight="fill"/>{text}</li>)}</ul></div><div className="sales-price-card"><span>AI OPC 完整课程</span><div className="sales-price-slot">{price.discounted&&<del aria-label="原价">{offerMoney(offer.originalPriceCents)}</del>}{price.priced?<strong>{offerMoney(offer.priceCents)}</strong>:<strong className="sales-price-pending">查看课程与价格</strong>}</div><p>一次购买，长期学习</p><button className="sales-button primary" onClick={()=>navigate(site.ctaPath)}>{site.ctaLabel}<ArrowRight size={17}/></button></div><span className="sales-bottom-note" aria-hidden="true">Your<br/>AI Product<br/>Starts Here.</span></section>
    <footer className="sales-footer" id="about" aria-label="关于 OneShowLearn"><div className="sales-footer-top"><button className="sales-brand" onClick={scrollHome}><BrandIdentity/></button><nav aria-label="页脚导航"><button onClick={scrollHome}>首页</button><button onClick={()=>scrollTo('roadmap')}>课程体系</button><button onClick={()=>navigate('/projects')}>实战案例</button><button onClick={()=>navigate('/community')}>学习社区</button></nav><span>© 2026 OneShowLearn · OneShowLab</span></div><a className="sales-icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" aria-label="浙ICP备2026052190号-4（在新窗口打开工信部备案查询）">浙ICP备2026052190号-4</a></footer>
    <div className="sales-service-footer"><ServiceLinks/></div>
  </main>;
}
