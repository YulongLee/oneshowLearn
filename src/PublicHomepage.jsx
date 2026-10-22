import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpenText,CaretDown,CheckCircle,ChartBar,Code,CreditCard,Cube,FileText,Lightbulb,List,MagnifyingGlass,Play,Quotes,Robot,Rocket,ShieldCheck,Sparkle,UserCircle,Users,VideoCamera,X} from '@phosphor-icons/react';
import {BrandIdentity} from './BrandIdentity.jsx';
import {SeoLink} from './SeoLink.jsx';
import {updatePublicMetadata} from './public-metadata.js';
import {ServiceLinks} from './ServiceLinks.jsx';
import './service-center.css';
import {api,subscribeToSession} from './api.js';
import {sharedRead} from './shared-reads.js';
import hero from './assets/oneshowlearn-hero-optimized.webp';
import founderPortrait from './assets/yulong-lee-instructor-lavender-v2.webp';
import interviewArt from './assets/workbench-interview-v1.webp';
import directoryArt from './assets/workbench-directory-v1.webp';
import mobileArt from './assets/project-mobile-cover-v1.webp';
import agentArt from './assets/project-agent-cover-v1.webp';
import coursesBackground from './assets/homepage-capability-courses-soft-v1.webp';
import aiBackground from './assets/homepage-capability-ai-soft-v1.webp';
import practiceBackground from './assets/homepage-capability-practice-soft-v1.webp';
import ideaBackground from './assets/homepage-audience-idea-soft-v1.webp';
import buildBackground from './assets/homepage-audience-build-soft-v1.webp';
import launchBackground from './assets/homepage-audience-launch-soft-v1.webp';
import opportunityPhase from './assets/homepage-roadmap-opportunity-soft-v1.webp';
import developmentPhase from './assets/homepage-roadmap-development-soft-v1.webp';
import launchPhase from './assets/homepage-roadmap-launch-soft-v1.webp';
import commercePhase from './assets/homepage-roadmap-commerce-soft-v1.webp';
import growthPhase from './assets/homepage-roadmap-growth-soft-v1.webp';
import {workbenchProjectVisual,workbenchProjectSummary} from './workbench-visual-model.js';
import {useSitePage} from './useSitePage.js';
import {offerMoney} from './course-offer-model.js';
import {homepageCommercialProjects,homepageOffer,homepageDiscount,homepagePresentation,homepageCourse,homepagePreviewText,homepageDeliveryText,HOMEPAGE_INSTRUCTOR,HOMEPAGE_HERO_TITLE} from './homepage-model.js';
import {currentPublicCopy} from '../server/site-defaults.mjs';
import './homepage.css';

const phases=[
  {title:'产品与机会',icon:Lightbulb,tone:'violet',background:opportunityPhase,items:['发现市场机会','用户需求分析','产品定位与规划']},
  {title:'AI 产品开发',icon:Code,tone:'blue',background:developmentPhase,items:['用 Codex 高效开发','产品架构设计','快速构建 MVP']},
  {title:'上线与合规',icon:Rocket,tone:'green',background:launchPhase,items:['域名与服务器','备案与数据合规','发布上线流程']},
  {title:'收款与商业化',icon:CreditCard,tone:'orange',background:commercePhase,items:['微信 / 支付宝接入','海外支付方案','定价策略与商业模式']},
  {title:'运营与增长',icon:ChartBar,tone:'violet',background:growthPhase,items:['SEO / GEO 优化','内容与社群推广','数据分析与迭代']},
];
const POLICE_RECORD_NUMBER='浙公网安备33010602014974号';
const POLICE_RECORD_URL='https://beian.mps.gov.cn/#/query/webSearch?code=33010602014974';
const audiences=[
  {icon:Lightbulb,number:'01',label:'从想法开始',title:'有想法，却不知道先验证什么',text:'你想做一个真实产品，但还在需求、用户和方向之间犹豫。',points:['发现值得做的机会','把想法拆成清晰的产品问题'],tone:'violet',background:ideaBackground},
  {icon:CreditCard,number:'02',label:'边学边做',title:'想用 AI，把开发效率真正提起来',text:'你有一定基础，想把 AI 放进产品开发流程，练习独立做出可运行的 MVP。',points:['从架构到 MVP 开发','按步骤留下自己的实践记录'],tone:'blue',background:buildBackground},
  {icon:Code,number:'03',label:'准备上线',title:'产品已在手上，差上线与商业化',text:'你已经有雏形或开发经验，正在补齐部署、收款与增长的方法。',points:['上线与合规的关键环节','定价、支付与运营思路'],tone:'green',background:launchBackground},
];
const benefits=[
  {icon:VideoCamera,title:'系统课程',text:'从产品机会到运营增长，按五章路线循序学习。',tone:'blue'},
  {icon:FileText,title:'配套资料与模板',text:'结合已发布的课件、文档与 Prompt，把方法用在实践中。',tone:'green'},
  {icon:Robot,title:'AI 导师 · 课程答疑',text:'围绕有权访问的课程资料提问，结合参考来源理解知识。',tone:'violet'},
  {icon:Users,title:'学习交流入口',text:'阅读官方实战分享；会员群加入条件以社区说明为准。',tone:'blue'},
];
const heroCapabilities=[
  {icon:BookOpenText,title:'系统课程'},
  {icon:Cube,title:'实战项目'},
  {icon:Robot,title:'AI 导师'},
  {icon:Users,title:'学习交流'},
];

function useDecorativeImageFailure(src) {
  const image=useRef(null),[failedSrc,setFailedSrc]=useState(null);
  useEffect(()=>{
    // SSR images can fail before React attaches onError. Read their settled
    // state once attached; a new source still gets its original fresh attempt.
    const element=image.current;
    if(element?.complete&&element.naturalWidth===0)setFailedSrc(src);
    else setFailedSrc(current=>current===src?current:null);
  },[src]);
  return {ref:image,failed:failedSrc===src,onError:()=>setFailedSrc(src)};
}
function AudienceBackground({src}) {
  const {ref,failed,onError}=useDecorativeImageFailure(src);
  return failed?null:<img ref={ref} className="sales-audience-background" src={src} width="1536" height="1024" alt="" aria-hidden="true" loading="lazy" decoding="async" onError={onError}/>;
}
function PhaseBackground({src}) {
  const {ref,failed,onError}=useDecorativeImageFailure(src);
  return failed?null:<img ref={ref} className="sales-phase-background" src={src} width="1024" height="1536" alt="" aria-hidden="true" loading="lazy" decoding="async" onError={onError}/>;
}
function ExampleArt({item,project}) {
  const [failed,setFailed]=useState(false),[fallbackFailed,setFallbackFailed]=useState(false);
  useEffect(()=>{setFailed(false);setFallbackFailed(false);},[item.image]);
  const visual=project?workbenchProjectVisual({title:item.title,cover_url:item.image}):null;
  const illustrated=visual?.useIllustration||!item.image||failed;
  const fallback=visual?({interview:interviewArt,directory:directoryArt,mobile:mobileArt,agent:agentArt})[visual.key]:directoryArt;
  return <div className="sales-example-art">{fallbackFailed?<div className="sales-art-fallback" aria-hidden="true"><Cube size={52}/></div>:<img src={illustrated?fallback:item.image} alt="" loading="lazy" decoding="async" onError={()=>{if(!illustrated)setFailed(true);else setFallbackFailed(true);}}/>}{illustrated&&<small>分类示意</small>}</div>;
}
const platformFeatures=[
  {id:'courses',label:'课程与资料',title:'把知识和动手实践，放在一起',description:'课程目录、学习课件与资源资料，在同一个学习空间中衔接。',path:'/opc',action:'查看学习课程',icon:BookOpenText,items:['五章学习路线','课件与配套资料','进度与学习笔记'],tone:'violet',background:coursesBackground},
  {id:'tutor',label:'AI 辅助学习',title:'遇到难点，不必一个人卡住',description:'围绕课程资料提问，解释难点、梳理要点，并查看回答的参考来源。',path:'/tutor',action:'了解 AI 导师',icon:Robot,items:['课程资料答疑','参考来源可查看','保留自己的对话'],tone:'blue',background:aiBackground},
  {id:'outcomes',label:'实践与沉淀',title:'让学习，留下自己的作品',description:'用项目练习方法，用笔记、收藏和私人成果记录自己的实践过程。',path:'/achievements',action:'探索成果空间',icon:Cube,items:['项目练习入口','私人学习记录','产品成果归档'],tone:'green',background:practiceBackground},
];
function PlatformExample({navigate,feature=platformFeatures[0]}) {
  const Icon=feature.icon;
  const background=useDecorativeImageFailure(feature.background);
  return <article className="sales-case-card sales-platform-case">
    <div className={'sales-platform-art sales-capability-art '+feature.tone}>
      {!background.failed&&<img ref={background.ref} className="sales-capability-background" src={feature.background} width="1536" height="1024" alt="" aria-hidden="true" loading="lazy" decoding="async" onError={background.onError}/>}
      <span className="sales-art-label">平台功能概览</span>
      <div className="sales-capability-icon"><Icon size={44} weight="duotone"/></div>
      <strong>{feature.label}</strong>
      <ul>{feature.items.map(text=><li key={text}><CheckCircle size={15}/>{text}</li>)}</ul>
    </div>
    <div className="sales-case-copy"><span className="sales-case-label live">OneShowLearn</span><h3>{feature.title}</h3><p>{feature.description}</p><SeoLink href={feature.path} navigate={navigate}>{feature.action}<ArrowRight size={17}/></SeoLink></div>
  </article>;
}
function InstructorProfile({onPreview,previewLabel,previewPath}) {
  const [failed,setFailed]=useState(false);
  return <div className="sales-instructor-profile">
    <div className="sales-instructor-copy"><span className="sales-eyebrow">课程主理人 · Cody老师</span><h2 id="instructor-title">不只学 AI 工具，<br/>更要学会做产品。</h2>
      <p className="sales-instructor-value">把需求判断、AI 开发、上线与收款串起来，学习围绕一个产品推进，而不是零散地追逐工具。</p>
      <ul className="sales-instructor-method">{['从需求出发','用 AI 动手做','理解上线与商业化'].map(text=><li key={text}><CheckCircle size={16}/>{text}</li>)}</ul>
      <div className="sales-instructor-bio"><h3>{HOMEPAGE_INSTRUCTOR.name}<span>{HOMEPAGE_INSTRUCTOR.identity}</span></h3><p className="sales-instructor-role">{HOMEPAGE_INSTRUCTOR.experience} · {HOMEPAGE_INSTRUCTOR.expertise}</p><p className="sales-instructor-background">{HOMEPAGE_INSTRUCTOR.background}</p></div>
      <SeoLink className="sales-instructor-preview" href={previewPath} navigate={onPreview}><Play size={16} weight="fill"/>{previewLabel}<ArrowRight size={17}/></SeoLink>
    </div>
    <figure className="sales-instructor-photo">{failed?<div className="sales-portrait-fallback" aria-label="Cody老师"><UserCircle size={96}/><strong>Cody老师</strong></div>:<img src={founderPortrait} width="1536" height="1024" alt="Cody老师人物形象，背景经 AI 合成" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>}<figcaption><strong>Cody老师</strong><span>OneShowAiLab · Learn. Build. Grow.</span></figcaption></figure>
  </div>;
}
function HeroTitle({title}) {
  const bundled=title===HOMEPAGE_HERO_TITLE;
  return title.split('\n').map((line,i)=>{
    const marker='伟大的产品';
    const markerIndex=line.indexOf(marker);
    return <span className="sales-hero-title-line" key={i}>{markerIndex>=0?<>{line.slice(0,markerIndex)}<span className={bundled?'sales-hero-title-tail':undefined}><em className="sales-hero-emphasis">{marker}</em>{line.slice(markerIndex+marker.length)}</span></>:line}</span>;
  });
}
export function PublicHomepage({navigate,configuration,initialData}) {
  const root=useRef(null),searchRoot=useRef(null);
  const {data,error,loading}=useSitePage('public',configuration,initialData?.site);
  const site=homepagePresentation(currentPublicCopy(data));
  const [menuOpen,setMenuOpen]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  const [catalog,setCatalog]=useState([]),[searchStatus,setSearchStatus]=useState('idle');
  const [offer,setOffer]=useState(initialData?.offer||null),[entry,setEntry]=useState(initialData?.entry||null),[metadataError,setMetadataError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>subscribeToSession(()=>{setOffer(null);setEntry(null);setRetry(n=>n+1);}),[]);
  useEffect(()=>{let active=true;setMetadataError(false);
    sharedRead('/commerce/offer',{force:true}).then(value=>{if(active)setOffer(value);}).catch(()=>{if(active)setMetadataError(true);});
    sharedRead('/learning/entry').then(value=>{if(active)setEntry(value);}).catch(()=>{if(active)setMetadataError(true);});
    return()=>{active=false;};
  },[retry]);
  useEffect(()=>{updatePublicMetadata({kind:'home',site:data,...(!metadataError?{offer,entry}:{})});},[data,offer,entry,metadataError]);
  useEffect(()=>{if(!searchOpen||searchStatus==='ready')return;let active=true;setSearchStatus('loading');api('/catalog/workspace').then(value=>{if(active){setCatalog(value.items||[]);setSearchStatus('ready');}}).catch(()=>{if(active)setSearchStatus('error');});return()=>{active=false;};},[searchOpen,retry]);
  useEffect(()=>{if(!searchOpen&&!menuOpen)return;const close=e=>{if(e.key==='Escape'){setMenuOpen(false);setSearchOpen(false);}};const outside=e=>{if(searchRoot.current&&!searchRoot.current.contains(e.target))setSearchOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside);};},[searchOpen,menuOpen]);
  const results=catalog.filter(course=>`${course.title} ${course.subtitle||''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0,8);
  const go=path=>{setMenuOpen(false);setSearchOpen(false);navigate(path);};
  const scrollTo=id=>{setMenuOpen(false);const target=root.current?.querySelector('#'+id);target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});target?.focus({preventScroll:true});};
  const scrollHome=()=>{setMenuOpen(false);root.current?.ownerDocument.defaultView?.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  const cards=homepageCommercialProjects(site),price=homepageOffer(offer),discount=homepageDiscount(offer),course=homepageCourse(entry,offer);
  const previewText=homepagePreviewText(course),previewPath=course?.previewPath||site.secondaryPath;
  const bundledPreview=site.secondaryPath==='/opc'&&['查看课程与试听','查看课程介绍'].includes(site.secondaryLabel);
  const previewLabel=bundledPreview?previewText:site.secondaryLabel;
  const purchaseLabel=site.ctaPath==='/membership'&&site.ctaLabel==='解锁完整课程'?'立即开始学习':site.ctaLabel;
  const heroPurchaseLabel=site.ctaPath==='/membership'&&site.ctaLabel==='解锁完整课程'?'立即开始学习':purchaseLabel;
  const metadata=course?[course.chapterCount>0&&`${course.chapterCount} 章`,course.lessonCount>0&&`${course.lessonCount} 节`,'一次购买'].filter(Boolean):['五章学习路线','一次购买'];
  const faqs=[
    ['需要什么基础？','建议先了解基本电脑操作；开发和上线实践会涉及技术工具。先试看课程，再判断内容与你当前的基础是否匹配。'],
    ['课程包含哪些内容？','AI OPC 是围绕产品机会、AI 开发、上线、商业化和运营增长推进的个人产品学习路线。课程包含系统课程与已发布的配套学习资料，以及按实际服务配置提供的课程 AI 答疑。具体内容、访问范围与服务规则请查看课程权益和购买说明。'],
    ['如何免费试看？',course?.previewCount>0?`当前提供 ${course.previewCount} 节免费试看内容。点击“${previewText}”进入首节预览，完整目录中也会标明可试看内容。`:'进入课程目录查看当前已开放的预览内容。具体范围以目录中的免费标记与访问权限为准。'],
    ['AI 导师可以做什么？','在有权访问的课程资料范围内，帮助解释难点、整理要点和讨论实践思路。基于已授权、可检索的课程文字资料答疑，回答附参考来源，方便你核对和继续实践。开发、部署和业务决策由你根据实际情况推进。'],
    ['课程内容和更新如何查看？',homepageDeliveryText(course)],
    ['遇到学习或购买问题怎么办？','可通过帮助与售后查看服务说明并提交本人问题。学习群入口和加入条件以学习社区的实际配置为准。'],
  ];
  return <main ref={root} className="sales-page sales-reference sales-commercial">
    <header className="sales-nav">
      <SeoLink className="sales-brand" href="/" navigate={scrollHome} aria-label="OneShowLearn 首页"><BrandIdentity/></SeoLink>
      <nav id="homepage-navigation" className={`sales-links${menuOpen?' open':''}`} aria-label="主要导航"><SeoLink href="/" className="active" navigate={scrollHome}>首页</SeoLink><SeoLink href="#roadmap" navigate={()=>scrollTo('roadmap')}>课程体系</SeoLink><SeoLink href="#hot-courses" navigate={()=>scrollTo('hot-courses')}>实战案例</SeoLink><SeoLink href="#home-tutor" navigate={()=>scrollTo('home-tutor')}>AI 导师</SeoLink><SeoLink href="#home-instructor" navigate={()=>scrollTo('home-instructor')}>课程主理人</SeoLink></nav>
      <div className="sales-actions"><div ref={searchRoot} className="sales-search-wrap"><form className="sales-search" role="search" onSubmit={e=>{e.preventDefault();setSearchOpen(true);}}><MagnifyingGlass size={17}/><input aria-label="搜索课程" placeholder="搜索课程…" value={search} onFocus={()=>setSearchOpen(true)} onChange={e=>{setSearch(e.target.value);setSearchOpen(true);}}/></form>{searchOpen&&<section className="sales-search-results" aria-label="课程搜索结果"><header><strong>已发布课程</strong><button aria-label="关闭课程搜索" onClick={()=>setSearchOpen(false)}><X size={18}/></button></header>{searchStatus==='loading'?<p role="status">正在读取课程…</p>:searchStatus==='error'?<div><p role="alert">搜索暂不可用，请重试。</p><button onClick={()=>setRetry(n=>n+1)}>重试搜索</button></div>:results.length?results.map(item=><SeoLink key={item.id} href={'/course-offer?course='+encodeURIComponent(item.slug)} navigate={go}>{item.title}<ArrowRight size={15}/></SeoLink>):<p>没有匹配的课程，试试其他关键词。</p>}</section>}</div><SeoLink className="sales-login" href="/login" navigate={go}>登录</SeoLink><SeoLink className="sales-start" href={site.ctaPath} navigate={go}>{site.ctaPath==='/membership'?'课程与价格':purchaseLabel}<ArrowRight size={16}/></SeoLink><button className="sales-menu" aria-controls="homepage-navigation" aria-expanded={menuOpen} aria-label={menuOpen?'关闭导航':'打开导航'} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={22}/>:<List size={22}/>}</button></div>
    </header>
    <section className={`sales-hero sales-hero-reference${site.title===HOMEPAGE_HERO_TITLE?' sales-hero-bundled':''}`} aria-labelledby="home-title">
      <img className="sales-hero-image" src={!site.image||site.image==='/assets/oneshowlearn-hero.png'?hero:site.image} alt="学习者使用电脑实践 AI 项目" width="1536" height="1024" fetchPriority="high" decoding="async"/>
      <div className="sales-hero-wash" aria-hidden="true"/>
      <div className="sales-hero-inner">
        <div className="sales-hero-copy">
          <span className="sales-pill"><Sparkle size={14} weight="fill"/>{site.eyebrow}</span>
          <h1 id="home-title"><HeroTitle title={site.title}/></h1>
          <p className="sales-lead">{site.description}</p>
          <div className="sales-hero-buttons">
            <SeoLink className="sales-button primary" href={site.ctaPath} navigate={go}>{heroPurchaseLabel}<ArrowRight size={18}/></SeoLink>
            {!bundledPreview&&<SeoLink className="sales-button ghost" href={site.secondaryPath} navigate={go}><Play size={17} weight="fill"/>{previewLabel}</SeoLink>}
          </div>
          <div className="sales-hero-promises" aria-label="课程概览">{metadata.map((text,i)=><span key={text}>{i===0?<BookOpenText/>:i===1?<VideoCamera/>:<ShieldCheck/>}{text}</span>)}</div>
          {metadataError&&<p className="sales-metadata-error" role="status">课程或价格信息暂未完整读取。<button onClick={()=>setRetry(n=>n+1)}>重新读取</button></p>}
        </div>
      </div>
      <div className="sales-hero-callouts">
        <aside className="sales-hero-quote sales-hero-growth" aria-label="课程学习路径">
          <strong>从想法到上线</strong>
          <div className="sales-growth-graphic" aria-hidden="true">
            <svg viewBox="0 0 160 65" fill="none"><path d="M6 58C62 48 108 26 149 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m136 8 14-2-5 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div className="sales-growth-bars"><i/><i/><i/><i/><i/></div>
          </div>
        </aside>
        <div className="sales-hero-note" aria-label="课程学习重点">{['一个人的产品公司','AI 驱动的生产力','从想法到上线','真实可落地的实战'].map(text=><span key={text}><CheckCircle size={20} weight="fill"/>{text}</span>)}</div>
      </div>
      <div className="sales-hero-rail" aria-label="平台能力概览">
        <div className="sales-hero-rail-inner">{heroCapabilities.map(({icon:Icon,title})=><article key={title}><i><Icon size={28} weight="duotone"/></i><strong>{title}</strong></article>)}</div>
      </div>
    </section>
    <section className="sales-audience sales-container" aria-labelledby="audience-title"><header className="sales-audience-head"><div><span className="sales-eyebrow"><Sparkle size={12} weight="fill"/>选择你的起点</span><h2 id="audience-title">你现在，正处在哪个阶段？</h2><p>这是一套面向真实产品实践的课程。选最接近你的起点，按自己的节奏往前走。</p></div><div className="sales-audience-route" aria-label="课程推进方式"><span>想法</span><ArrowRight size={15}/><span>开发</span><ArrowRight size={15}/><span>上线</span><ArrowRight size={15}/><span>增长</span></div></header><div className="sales-audience-grid">{audiences.map(({icon:Icon,number,label,title,text,points,tone,background})=><article className={`sales-audience-card ${tone}`} key={title}><AudienceBackground src={background}/><header><span className="sales-audience-phase"><span className="sales-audience-step">{number}</span><span className="sales-audience-label">{label}</span></span><i><Icon size={25} weight="duotone"/></i></header><h3>{title}</h3><p>{text}</p><ul>{points.map(point=><li key={point}><CheckCircle size={15} weight="fill"/>{point}</li>)}</ul></article>)}</div></section>
    <section className="sales-examples" id="hot-courses" tabIndex={-1} aria-labelledby="examples-title"><div className="sales-container"><div className="sales-section-head"><div><span className="sales-eyebrow">LEARN · BUILD · GROW</span><h2 id="examples-title">不只是课程，也是你的产品学习空间</h2><p>从理解知识到动手实践，把课程、AI 答疑与自己的学习记录连接起来。</p></div><SeoLink href="/projects" navigate={go}>探索实战项目<ArrowRight size={16}/></SeoLink></div>{error&&<p role="alert">项目内容暂未读取，仍可通过下方入口了解平台功能。</p>}<div className="sales-example-grid" aria-busy={loading}>{cards.length?<><PlatformExample navigate={go}/>{cards.map(item=><article className="sales-case-card sales-public-project" key={item.id}><ExampleArt item={item} project/><div className="sales-case-copy"><span className="sales-case-label">{item.label}</span><h3>{item.title.replaceAll('\n',' · ')}</h3><p>{workbenchProjectSummary({description:item.description})}</p><SeoLink href={item.path} navigate={go}>查看项目详情<ArrowRight size={17}/></SeoLink></div></article>)}</>:platformFeatures.map(feature=><PlatformExample key={feature.id} feature={feature} navigate={go}/>)}</div></div></section>
    <section className="sales-roadmap sales-container" id="roadmap" tabIndex={-1} aria-labelledby="roadmap-title"><div className="sales-section-head sales-roadmap-head"><div><span className="sales-eyebrow">产品能力地图</span><h2 id="roadmap-title">从想法到上线，一条完整的学习路径</h2><p>系统学习 AI 产品从需求到增长的关键环节，在实践中逐步建立自己的产品能力。</p></div><div className="sales-roadmap-actions"><span className="sales-roadmap-count"><Sparkle size={14} weight="fill"/>5 个阶段，沿着产品真实节奏推进</span><SeoLink href="/paths" navigate={go}>查看完整课程体系<ArrowRight size={17}/></SeoLink></div></div><ol className="sales-phase-grid" aria-label="五阶段学习路径">{phases.map(({title,icon:Icon,tone,items,background},i)=><li className={`sales-phase ${tone}`} key={title}><div className="sales-phase-card"><PhaseBackground src={background}/><div className="sales-phase-top"><span className="sales-phase-number">0{i+1}</span><span className="sales-phase-icon-wrap"><Icon className="sales-phase-icon" size={26} weight="duotone"/></span></div><h3>{title}</h3><ul>{items.map(text=><li key={text}><CheckCircle size={13} weight="fill"/>{text}</li>)}</ul></div>{i<4&&<ArrowRight className="sales-phase-arrow" size={21} aria-hidden="true" focusable="false"/>}</li>)}</ol></section>
    <section className="sales-instructor sales-container" id="home-instructor" tabIndex={-1} aria-labelledby="instructor-title"><InstructorProfile onPreview={go} previewPath={bundledPreview?previewPath:site.secondaryPath} previewLabel={previewLabel}/></section>
    <section className="sales-tutor sales-container" id="home-tutor" tabIndex={-1} aria-labelledby="tutor-title"><div className="sales-tutor-copy"><span className="sales-eyebrow">LEARNING WITH CONTEXT</span><h2 id="tutor-title">学到哪里，<br/>问题就在哪里解决</h2><p>课程不止是“看完”。围绕自己的疑问，与 <em>AI 导师</em>一起拆解知识，再回到实践。</p><div className="sales-tutor-features">{[[BookOpenText,'解释课程难点','从概念到具体场景，换一种方式理解。'],[FileText,'整理学习要点','抓住核心思路，形成自己的学习笔记。'],[Lightbulb,'讨论实践思路','把大问题拆小，明确下一步尝试。']].map(([Icon,title,text])=><article key={title}><i><Icon size={24}/></i><h3>{title}</h3><p>{text}</p></article>)}</div></div><div className="sales-tutor-guide"><header><i><Robot size={27}/></i><div><strong>你的课程学习助手</strong><p>带着问题来，带着思路继续学。</p></div></header><ol>{[[ '选择正在学习的课程','让问题与课程资料保持关联。'],['提出一个具体的问题','解释概念、梳理重点，或讨论实践方向。'],['查看参考来源，回到实践','核对资料，把理解变成自己的下一步。']].map(([title,text],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol><SeoLink className="sales-button primary" href="/tutor" navigate={go}>进入 AI 导师<ArrowRight size={18}/></SeoLink><p className="sales-ai-note">AI 回答作为学习辅助，请结合参考资料核对。</p></div></section>
    <section className="sales-clarity sales-container" aria-labelledby="benefits-title"><div><h2 id="benefits-title">一次购买，系统学习</h2><p>先了解课程包含什么，再按自己的节奏开始学习与实践。</p><details className="sales-benefits-disclosure"><summary>查看包含的学习支持<CaretDown size={17}/></summary><div className="sales-benefit-grid">{benefits.map(({icon:Icon,title,text,tone})=><article className={tone} key={title}><i><Icon size={27} weight="duotone"/></i><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></details><SeoLink className="sales-text-link" href={site.ctaPath} navigate={go}>查看课程与权益<ArrowRight size={17}/></SeoLink></div><div className="sales-faq"><h2>购买前，你可能想了解</h2>{faqs.map(([question,answer],i)=><details key={i}><summary>{question}<CaretDown size={17}/></summary><p>{answer}</p>{i===1&&<a href="/legal/purchase">阅读购买说明<ArrowRight size={15}/></a>}{i===4&&<a href="/legal/purchase">查看购买与更新说明<ArrowRight size={15}/></a>}{i===5&&<a href="/support">帮助与售后<ArrowRight size={15}/></a>}</details>)}</div></section>
<section className="sales-bottom"><div className="sales-bottom-copy"><span>ONE SHOW LEARN · KEEP BUILDING</span><h2>{site.footerTitle}</h2><p>{site.footerDescription}</p><small><ShieldCheck size={16}/>具体权益以课程与购买说明为准。</small></div><div className="sales-price-card"><div className="sales-offer-heading"><span>AI OPC 完整课程</span>{discount&&<span className="sales-saving">立省 {offerMoney(discount.savingCents)}</span>}</div><div className="sales-price-slot">{price.priced?<strong>{offerMoney(offer.priceCents)}</strong>:<strong className="sales-price-pending">查看课程与价格</strong>}{discount&&<del aria-label={'原价 '+offerMoney(offer.originalPriceCents)}>原价 {offerMoney(offer.originalPriceCents)}</del>}</div><p>{discount?'当前优惠价 · 一次购买':'一次购买'}</p><SeoLink className="sales-button primary" href={site.ctaPath} navigate={go}>{purchaseLabel}<ArrowRight size={17}/></SeoLink><SeoLink className="sales-bottom-preview" href={bundledPreview?previewPath:site.secondaryPath} navigate={go}><Play size={15} weight="fill"/>{previewLabel}</SeoLink></div></section>
    <footer className="sales-footer" id="about" aria-label="关于 OneShowLearn"><div className="sales-footer-top"><SeoLink className="sales-brand" href="/" navigate={scrollHome}><BrandIdentity/></SeoLink><nav aria-label="页脚导航"><SeoLink href="/" navigate={scrollHome}>首页</SeoLink><SeoLink href="#roadmap" navigate={()=>scrollTo('roadmap')}>课程体系</SeoLink><SeoLink href="/projects" navigate={go}>实战案例</SeoLink><SeoLink href="/community" navigate={go}>学习社区</SeoLink></nav><span>© 2026 OneShowLearn · OneShowAiLab</span></div><div className="sales-record-links" aria-label="网站备案信息"><a className="sales-icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" aria-label="浙ICP备2026052190号-4（在新窗口打开工信部备案查询）">浙ICP备2026052190号-4</a><a className="sales-police-link" href={POLICE_RECORD_URL} target="_blank" rel="noopener noreferrer" aria-label={`${POLICE_RECORD_NUMBER}（在新窗口打开公安备案查询）`}><ShieldCheck size={14} weight="fill" aria-hidden="true"/>{POLICE_RECORD_NUMBER}</a></div></footer>
    <div className="sales-service-footer"><ServiceLinks/></div>
  </main>;
}
