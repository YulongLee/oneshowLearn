import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpenText,CaretDown,CheckCircle,ChartBar,Code,CreditCard,Cube,FileText,Lightbulb,List,MagnifyingGlass,Play,Quotes,Robot,Rocket,ShieldCheck,Sparkle,UserCircle,Users,VideoCamera,X} from '@phosphor-icons/react';
import {BrandIdentity} from './BrandIdentity.jsx';
import {ServiceLinks} from './ServiceLinks.jsx';
import './service-center.css';
import {api,subscribeToSession} from './api.js';
import {sharedRead} from './shared-reads.js';
import hero from './assets/oneshowlearn-hero-optimized.webp';
import interviewArt from './assets/workbench-interview-v1.webp';
import directoryArt from './assets/workbench-directory-v1.webp';
import mobileArt from './assets/project-mobile-cover-v1.webp';
import agentArt from './assets/project-agent-cover-v1.webp';
import {workbenchProjectVisual,workbenchProjectSummary} from './workbench-visual-model.js';
import {useSitePage} from './useSitePage.js';
import {offerMoney} from './course-offer-model.js';
import {homepageExamples,homepageOffer,homepagePresentation,homepageCourse,homepagePreviewText} from './homepage-model.js';
import {currentPublicCopy} from '../server/site-defaults.mjs';
import './homepage.css';

const phases=[
  {title:'产品与机会',icon:Lightbulb,tone:'violet',items:['发现市场机会','用户需求分析','产品定位与规划']},
  {title:'AI 产品开发',icon:Code,tone:'blue',items:['用 Codex 高效开发','产品架构设计','快速构建 MVP']},
  {title:'上线与合规',icon:Rocket,tone:'green',items:['域名与服务器','备案与数据合规','发布上线流程']},
  {title:'收款与商业化',icon:CreditCard,tone:'orange',items:['微信 / 支付宝接入','海外支付方案','定价策略与商业模式']},
  {title:'运营与增长',icon:ChartBar,tone:'violet',items:['SEO / GEO 优化','内容与社群推广','数据分析与迭代']},
];
const audiences=[
  [Lightbulb,'有产品想法的创作者','想把一个点子做成真实可用的产品，但不确定从哪里开始。'],
  [CreditCard,'想独立开发的职场人','希望用 AI 提升开发效率，练习独立做出自己的产品。'],
  [Code,'需要上线与收款方法的开发者','已经有一些技术基础，希望学习产品化、上线和商业化的方法。'],
];
const benefits=[
  {icon:VideoCamera,title:'系统课程',text:'从产品机会到运营增长，按五章路线循序学习。',tone:'blue'},
  {icon:FileText,title:'配套资料与模板',text:'结合已发布的课件、文档与 Prompt，把方法用在实践中。',tone:'green'},
  {icon:Robot,title:'AI 导师 · 课程答疑',text:'围绕有权访问的课程资料提问，结合参考来源理解知识。',tone:'violet'},
  {icon:Users,title:'学习交流入口',text:'阅读官方实战分享；会员群加入条件以社区说明为准。',tone:'blue'},
];

function ExampleArt({item,project}) {
  const [failed,setFailed]=useState(false),[fallbackFailed,setFallbackFailed]=useState(false);
  useEffect(()=>{setFailed(false);setFallbackFailed(false);},[item.image]);
  const visual=project?workbenchProjectVisual({title:item.title,cover_url:item.image}):null;
  const illustrated=visual?.useIllustration||!item.image||failed;
  const fallback=visual?({interview:interviewArt,directory:directoryArt,mobile:mobileArt,agent:agentArt})[visual.key]:directoryArt;
  return <div className="sales-example-art">{fallbackFailed?<div className="sales-art-fallback" aria-hidden="true"><Cube size={52}/></div>:<img src={illustrated?fallback:item.image} alt="" loading="lazy" decoding="async" onError={()=>{if(!illustrated)setFailed(true);else setFallbackFailed(true);}}/>}{illustrated&&<small>分类示意</small>}</div>;
}
function PlatformExample({navigate}) {
  return <article className="sales-case-card sales-platform-case">
    <div className="sales-platform-art" aria-label="OneShowLearn 功能示意"><span className="sales-art-label">功能示意</span><div className="sales-mini-platform"><div className="sales-mini-brand"><BrandIdentity tagline="Learn · Build · Grow"/></div><div className="sales-mini-body"><aside aria-hidden="true"><BookOpenText/><Cube/><Robot/><FileText/></aside><div><span>学习 · 实践 · 创造</span><strong>让你的想法，走向作品。</strong><div className="sales-mini-features"><span><BookOpenText/>学习课程</span><span><Cube/>实战项目</span><span><Robot/>AI 导师</span></div><div className="sales-mini-path">Idea <ArrowRight/> Build <ArrowRight/> Launch</div></div></div></div></div>
    <div className="sales-case-copy"><span className="sales-case-label live">已上线产品</span><h3>OneShowLearn 学习平台</h3><p>你正在使用的学习产品：把课程、项目实践、AI 答疑与学习记录连接在一起。</p><button onClick={()=>navigate('/app')}>探索学习平台<ArrowRight size={17}/></button></div>
  </article>;
}
export function PublicHomepage({navigate,configuration}) {
  const root=useRef(null),searchRoot=useRef(null);
  const {data,error,loading}=useSitePage('public',configuration);
  const site=homepagePresentation(currentPublicCopy(data));
  const [menuOpen,setMenuOpen]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  const [catalog,setCatalog]=useState([]),[searchStatus,setSearchStatus]=useState('idle');
  const [offer,setOffer]=useState(null),[entry,setEntry]=useState(null),[metadataError,setMetadataError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>subscribeToSession(()=>{setOffer(null);setEntry(null);setRetry(n=>n+1);}),[]);
  useEffect(()=>{let active=true;setMetadataError(false);
    sharedRead('/commerce/offer',{force:true}).then(value=>{if(active)setOffer(value);}).catch(()=>{if(active)setMetadataError(true);});
    sharedRead('/learning/entry').then(value=>{if(active)setEntry(value);}).catch(()=>{if(active)setMetadataError(true);});
    return()=>{active=false;};
  },[retry]);
  useEffect(()=>{if(!searchOpen||searchStatus==='ready')return;let active=true;setSearchStatus('loading');api('/catalog/workspace').then(value=>{if(active){setCatalog(value.items||[]);setSearchStatus('ready');}}).catch(()=>{if(active)setSearchStatus('error');});return()=>{active=false;};},[searchOpen,retry]);
  useEffect(()=>{if(!searchOpen&&!menuOpen)return;const close=e=>{if(e.key==='Escape'){setMenuOpen(false);setSearchOpen(false);}};const outside=e=>{if(searchRoot.current&&!searchRoot.current.contains(e.target))setSearchOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside);};},[searchOpen,menuOpen]);
  const results=catalog.filter(course=>`${course.title} ${course.subtitle||''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0,8);
  const go=path=>{setMenuOpen(false);setSearchOpen(false);navigate(path);};
  const scrollTo=id=>{setMenuOpen(false);const target=root.current?.querySelector('#'+id);target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});target?.focus({preventScroll:true});};
  const scrollHome=()=>{setMenuOpen(false);root.current?.ownerDocument.defaultView?.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  const examples=homepageExamples(site),price=homepageOffer(offer),course=homepageCourse(entry,offer);
  const previewText=homepagePreviewText(course),previewPath=course?.previewPath||site.secondaryPath;
  const bundledPreview=site.secondaryPath==='/opc'&&['查看课程与试听','查看课程介绍'].includes(site.secondaryLabel);
  const previewLabel=bundledPreview?previewText:site.secondaryLabel;
  const purchaseLabel=site.ctaLabel==='解锁完整课程'?'查看完整课程':site.ctaLabel;
  const purchaseText=site.ctaPath==='/membership'&&price.priced?`${offerMoney(offer.priceCents)} ${purchaseLabel}`:purchaseLabel;
  const metadata=course?[course.chapterCount>0&&`${course.chapterCount} 章`,course.lessonCount>0&&`${course.lessonCount} 节`,'一次购买'].filter(Boolean):['五章学习路线','一次购买'];
  const cards=examples.items.slice(0,2);
  const faqs=[
    ['需要什么基础？','建议先了解基本电脑操作；开发和上线实践会涉及技术工具。先试看课程，再判断内容与你当前的基础是否匹配。'],
    [price.priced?`${offerMoney(offer.priceCents)} 包含什么？`:'课程包含什么？','系统课程与已发布的配套学习资料，以及按实际服务配置提供的课程 AI 答疑。具体内容、访问范围与服务规则请查看课程权益和购买说明。'],
    ['如何免费试看？',course?.previewCount>0?`当前提供 ${course.previewCount} 节免费试看内容。点击“${previewText}”进入首节预览，完整目录中也会标明可试看内容。`:'进入课程目录查看当前已开放的预览内容。具体范围以目录中的免费标记与访问权限为准。'],
    ['AI 导师可以做什么？','在有权访问的课程资料范围内，帮助解释难点、整理要点和讨论实践思路。回答需要核对来源；不代表已自动读取视频或所有附件，也不代替你执行开发、部署或业务决策。'],
    ['遇到学习或购买问题怎么办？','可通过帮助与售后查看服务说明并提交本人问题。学习群入口和加入条件以学习社区的实际配置为准。'],
  ];
  return <main ref={root} className="sales-page sales-reference sales-commercial">
    <header className="sales-nav">
      <button className="sales-brand" onClick={scrollHome} aria-label="OneShowLearn 首页"><BrandIdentity/></button>
      <nav id="homepage-navigation" className={`sales-links${menuOpen?' open':''}`} aria-label="主要导航"><button className="active" onClick={scrollHome}>首页</button><button onClick={()=>scrollTo('roadmap')}>课程体系</button><button onClick={()=>scrollTo('hot-courses')}>实战案例</button><button onClick={()=>scrollTo('home-tutor')}>AI 导师</button><button onClick={()=>scrollTo('home-instructor')}>关于课程</button></nav>
      <div className="sales-actions"><div ref={searchRoot} className="sales-search-wrap"><form className="sales-search" role="search" onSubmit={e=>{e.preventDefault();setSearchOpen(true);}}><MagnifyingGlass size={17}/><input aria-label="搜索课程" placeholder="搜索课程…" value={search} onFocus={()=>setSearchOpen(true)} onChange={e=>{setSearch(e.target.value);setSearchOpen(true);}}/></form>{searchOpen&&<section className="sales-search-results" aria-label="课程搜索结果"><header><strong>已发布课程</strong><button aria-label="关闭课程搜索" onClick={()=>setSearchOpen(false)}><X size={18}/></button></header>{searchStatus==='loading'?<p role="status">正在读取课程…</p>:searchStatus==='error'?<div><p role="alert">搜索暂不可用，请重试。</p><button onClick={()=>setRetry(n=>n+1)}>重试搜索</button></div>:results.length?results.map(item=><button key={item.id} onClick={()=>go('/course-offer?course='+encodeURIComponent(item.slug))}>{item.title}<ArrowRight size={15}/></button>):<p>没有匹配的课程，试试其他关键词。</p>}</section>}</div><button className="sales-login" onClick={()=>go('/login')}>登录</button><button className="sales-start" onClick={()=>go(bundledPreview?previewPath:site.secondaryPath)}>{bundledPreview?(course?.previewCount>0?'免费试看':'查看课程'):'探索内容'}<ArrowRight size={16}/></button><button className="sales-menu" aria-controls="homepage-navigation" aria-expanded={menuOpen} aria-label={menuOpen?'关闭导航':'打开导航'} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={22}/>:<List size={22}/>}</button></div>
    </header>
    <section className="sales-hero" aria-labelledby="home-title"><img className="sales-hero-image" src={!site.image||site.image==='/assets/oneshowlearn-hero.png'?hero:site.image} alt="学习者使用电脑实践 AI 项目" fetchPriority="high" decoding="async"/><div className="sales-hero-wash" aria-hidden="true"/><div className="sales-hero-inner"><div className="sales-hero-copy"><span className="sales-pill"><Sparkle size={14} weight="fill"/>{site.eyebrow}</span><h1 id="home-title">{site.title.split('\n').map((line,i)=><span key={i}>{line}</span>)}</h1><p className="sales-lead">{site.description}</p><div className="sales-hero-buttons"><button className="sales-button primary" onClick={()=>go(bundledPreview?previewPath:site.secondaryPath)}><Play size={17} weight="fill"/>{previewLabel}<ArrowRight size={18}/></button><button className="sales-button ghost" onClick={()=>go(site.ctaPath)}>{purchaseText}<ArrowRight size={18}/></button></div><div className="sales-hero-promises" aria-label="课程概览">{metadata.map((text,i)=><span key={text}>{i===0?<BookOpenText/>:i===1?<VideoCamera/>:<ShieldCheck/>}{text}</span>)}</div>{metadataError&&<p className="sales-metadata-error" role="status">课程或价格信息暂未完整读取。<button onClick={()=>setRetry(n=>n+1)}>重新读取</button></p>}</div></div><span className="sales-handwriting" aria-hidden="true">Learn<br/>Build<br/>Grow</span><aside className="sales-hero-quote"><Quotes size={21} weight="fill"/><strong>用 AI，<br/>把想法变成现实。</strong><small>— OneShowLearn</small></aside><div className="sales-hero-note">{['从想法','到上线','从学习','到自己的产品'].map(text=><span key={text}><CheckCircle size={19} weight="fill"/>{text}</span>)}</div></section>
    <section className="sales-audience sales-container" aria-labelledby="audience-title"><header><h2 id="audience-title">这门课，适合正在迈出下一步的你</h2><p>无论你刚有一个想法，还是已经开始动手，先找到适合自己的学习起点。</p></header><div>{audiences.map(([Icon,title,text])=><article key={title}><i><Icon size={29} weight="duotone"/></i><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section>
    <section className="sales-examples" id="hot-courses" tabIndex={-1} aria-labelledby="examples-title"><div className="sales-container"><div className="sales-section-head"><div><h2 id="examples-title">不止学概念，看产品如何落地</h2><p>{examples.projects?'从已上线的学习平台，到已发布的实战项目，理解产品开发的具体环节。':'先探索真实学习平台，再找到适合自己的实战学习方向。'}</p></div><button onClick={()=>go('/projects')}>查看更多项目<ArrowRight size={16}/></button></div>{error&&<p role="alert">{error} 下方学习方向不代表已发布项目。</p>}<div className="sales-example-grid" aria-busy={loading}><PlatformExample navigate={go}/>{cards.map(item=>{const demo=examples.projects&&workbenchProjectVisual({title:item.title}).demo;return <article className="sales-case-card" key={item.id}><ExampleArt item={item} project={examples.projects}/><div className="sales-case-copy"><span className="sales-case-label">{demo?'演示项目':examples.projects?'实战项目':item.label}</span><h3>{item.title.replaceAll('\n',' · ')}</h3><p>{examples.projects?workbenchProjectSummary({description:item.description}):item.description}</p><button onClick={()=>go(item.path)}>{examples.projects?'查看项目详情':'查看学习方向'}<ArrowRight size={17}/></button></div></article>;})}</div></div></section>
    <section className="sales-roadmap sales-container" id="roadmap" tabIndex={-1} aria-labelledby="roadmap-title"><div className="sales-section-head"><div><h2 id="roadmap-title">从想法到上线，一条完整的学习路径</h2><p>系统学习 AI 产品从需求到增长的关键环节，在实践中逐步建立自己的产品能力。</p></div><button onClick={()=>go('/paths')}>查看完整课程体系<ArrowRight size={17}/></button></div><ol className="sales-phase-grid">{phases.map(({title,icon:Icon,tone,items},i)=><li className={`sales-phase ${tone}`} key={title}><span className="sales-phase-number">0{i+1}</span><Icon className="sales-phase-icon" size={39} weight="duotone"/><h3>{title}</h3><ul>{items.map(text=><li key={text}><CheckCircle size={13} weight="fill"/>{text}</li>)}</ul>{i<4&&<ArrowRight className="sales-phase-arrow" size={21}/>}</li>)}</ol></section>
    <section className="sales-instructor sales-container" id="home-instructor" tabIndex={-1} aria-labelledby="instructor-title"><div className="sales-section-head"><div><h2 id="instructor-title">认识课程主理人</h2><p>了解课程背后的真实经历与产品实践。</p></div></div><div className="sales-instructor-band"><div className="sales-instructor-avatar" aria-hidden="true"><UserCircle size={76} weight="duotone"/></div><div><h3>讲师介绍待补充</h3><p>这里将展示主理人的真实介绍与产品经历；人物品牌图不代表讲师本人。</p></div><blockquote><Quotes size={30} weight="fill"/><p>让更多人用 AI，<br/>把自己的想法变成真实的产品。</p><cite>— OneShowLearn</cite></blockquote></div></section>
    <section className="sales-tutor sales-container" id="home-tutor" tabIndex={-1} aria-labelledby="tutor-title"><div className="sales-tutor-copy"><h2 id="tutor-title">学不懂的地方，<br/>让 <em>AI 导师</em>陪你拆解</h2><p>围绕课程资料提问，结合参考来源理解知识，再走向实践。</p><div className="sales-tutor-features">{[[BookOpenText,'解释课程难点','用更明白的方式，理解概念与思路。'],[FileText,'整理学习要点','梳理重点，帮助你建立知识结构。'],[Lightbulb,'提供实践思路','拆解问题，明确下一步尝试方向。']].map(([Icon,title,text])=><article key={title}><i><Icon size={24}/></i><h3>{title}</h3><p>{text}</p></article>)}</div><button className="sales-text-link" onClick={()=>go('/tutor')}>进入 AI 导师<ArrowRight size={17}/></button></div><div className="sales-tutor-demo" aria-label="AI 导师交互示意，非实际回答"><header><span><Robot size={20}/>课程 AI 答疑</span><small>交互示意</small></header><div className="sales-demo-question"><UserCircle size={27}/><p>有了一个 AI 产品想法，应该先验证什么？</p></div><div className="sales-demo-answer"><Sparkle size={25} weight="fill"/><div><p>先明确目标用户和具体场景，再设计一个最小验证方案。</p><span><BookOpenText size={15}/>参考示意：第 1 章 产品与机会</span></div></div><p className="sales-demo-disclaimer">示意问答，不调用 AI。实际回答取决于资料、权限与服务配置。</p><button className="sales-demo-entry" onClick={()=>go('/tutor')}>去问一个课程相关的问题<ArrowRight size={19}/></button></div></section>
    <section className="sales-clarity sales-container" aria-labelledby="benefits-title"><div><h2 id="benefits-title">一次购买，系统学习</h2><p>从课程内容到学习支持，围绕自己的产品持续实践。</p><div className="sales-benefit-grid">{benefits.map(({icon:Icon,title,text,tone})=><article className={tone} key={title}><i><Icon size={27} weight="duotone"/></i><div><h3>{title}</h3><p>{text}</p></div></article>)}</div><button className="sales-text-link" onClick={()=>go(site.ctaPath)}>查看课程与权益<ArrowRight size={17}/></button></div><div className="sales-faq"><h2>购买前，你可能想了解</h2>{faqs.map(([question,answer],i)=><details key={i}><summary>{question}<CaretDown size={17}/></summary><p>{answer}</p>{i===1&&<a href="/legal/purchase">阅读购买说明<ArrowRight size={15}/></a>}{i===4&&<a href="/support">帮助与售后<ArrowRight size={15}/></a>}</details>)}</div></section>
    <section className="sales-bottom"><div className="sales-bottom-copy"><span>ONE SHOW LEARN · KEEP BUILDING</span><h2>{site.footerTitle}</h2><p>{site.footerDescription}</p><small><ShieldCheck size={16}/>具体权益以课程与购买说明为准。</small></div><div className="sales-price-card"><span>AI OPC 完整课程</span><div className="sales-price-slot">{price.priced?<strong>{offerMoney(offer.priceCents)}</strong>:<strong className="sales-price-pending">查看课程与价格</strong>}{price.discounted&&<del aria-label="原价">{offerMoney(offer.originalPriceCents)}</del>}</div><p>一次购买</p><button className="sales-button primary" onClick={()=>go(site.ctaPath)}>{purchaseLabel}<ArrowRight size={17}/></button><button className="sales-bottom-preview" onClick={()=>go(bundledPreview?previewPath:site.secondaryPath)}><Play size={15} weight="fill"/>{previewLabel}</button></div><span className="sales-bottom-note" aria-hidden="true">Learn<br/>Build<br/>Grow</span></section>
    <footer className="sales-footer" id="about" aria-label="关于 OneShowLearn"><div className="sales-footer-top"><button className="sales-brand" onClick={scrollHome}><BrandIdentity/></button><nav aria-label="页脚导航"><button onClick={scrollHome}>首页</button><button onClick={()=>scrollTo('roadmap')}>课程体系</button><button onClick={()=>go('/projects')}>实战案例</button><button onClick={()=>navigate('/community')}>学习社区</button></nav><span>© 2026 OneShowLearn · OneShowLab</span></div><a className="sales-icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" aria-label="浙ICP备2026052190号-4（在新窗口打开工信部备案查询）">浙ICP备2026052190号-4</a></footer>
    <div className="sales-service-footer"><ServiceLinks/></div>
  </main>;
}
