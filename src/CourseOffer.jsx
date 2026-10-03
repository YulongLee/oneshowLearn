import {BrandIdentity} from './BrandIdentity.jsx';
import {useEffect, useRef, useState} from 'react';
import {ArrowRight, BookOpenText, CheckCircle, Code, FileText, Flame, Heart, Lightning, List, LockKey, MagnifyingGlass, NotePencil, PlayCircle, Robot, ShieldCheck, ShoppingCart, UsersThree, X} from '@phosphor-icons/react';
import {api} from './api.js';
import {Modal} from './PersonalShared.jsx';
import {UserAuthCard} from './Auth.jsx';
import {useWorkspaceModel} from './Workspace.jsx';
import {courseLearningPath} from './course-reader-model.js';
import {offerCurriculum, offerMoney, offerPrice} from './course-offer-model.js';
import {CourseCheckout} from './CourseCheckout.jsx';
import {paymentReturnId} from './payment-navigation.js';
import mascot from './assets/course-sales-mascot-v2.png';
import mountain from './assets/course-sales-banner-v1.png';
import './course-offer.css';
import {ServiceSummary,ServiceLinks} from './ServiceCenter.jsx';

const benefits = [
  [PlayCircle,'完整课程学习','视频、课件与文档','循序渐进，动手实践','orange'],
  [Code,'实战项目案例','结合课程案例拆解','把知识用在产品中','violet'],
  [Robot,'AI 导师答疑','围绕课程资料提问','服务以实际配置为准','blue'],
  [FileText,'模板与资源','PRD、Prompt、代码','按已发布资料提供','indigo'],
  [NotePencil,'AI 学习笔记','记录重点与实践思考','结合课件整理笔记','mint'],
  [UsersThree,'会员学习群','和做产品的同行交流','加入条件见社区说明','violet'],
  [ShieldCheck,'课程内容更新','集中查看课程资料','更新范围以课程为准','green'],
  [Heart,'学习支持','官方内容与实战分享','陪伴每次动手实践','pink'],
];
const links=[['首页','/'],['课程','/course-offer'],['实战项目','/projects'],['AI 导师','/tutor'],['学习社区','/community'],['资源中心','/resources']];

function OfferHeader({model,navigate,onLogin,onBuy,catalog,onChoose}) {
  const [menu,setMenu]=useState(false),[query,setQuery]=useState(''),[searched,setSearched]=useState(false);
  const results=(catalog||[]).filter(p=>query.trim()&&`${p.title} ${p.subtitle||''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const go=path=>{setMenu(false);navigate(path);};
  return <header className="co-nav"><div className="co-nav-inner">
    <button className="co-brand" onClick={()=>go('/')} aria-label="OneShowLearn 官网"><BrandIdentity/></button>
    <nav className={menu?'is-open':''} aria-label="课程购买导航">{links.map(([label,path])=><button key={path} aria-current={path==='/course-offer'?'page':undefined} onClick={()=>go(path)}>{label}</button>)}</nav>
    <div className="co-search"><form onSubmit={e=>{e.preventDefault();setSearched(true);}}><MagnifyingGlass size={18}/><input aria-label="搜索课程" placeholder="搜索课程…" value={query} onChange={e=>{setQuery(e.target.value);setSearched(false);}}/><button type="submit" aria-label="提交课程搜索"><ArrowRight size={15}/></button></form>{searched&&<div className="co-search-results"><button className="co-search-close" onClick={()=>setSearched(false)} aria-label="关闭搜索结果"><X size={16}/></button>{results.length?results.map(p=><button key={p.id} onClick={()=>{onChoose(p.slug);setSearched(false);}}>{p.title}<ArrowRight size={14}/></button>):<p>{query.trim()?'未找到匹配的课程':'请输入课程关键词'}</p>}</div>}</div>
    <button className="co-login" onClick={()=>model.user?go('/app'):onLogin()}>{model.user?'工作台':'登录'}</button><button className="co-nav-buy" onClick={onBuy}>立即购买</button>
    <button className="co-menu" aria-label={menu?'关闭导航':'展开导航'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X size={22}/>:<List size={22}/>}</button>
  </div></header>;
}

export function CourseOfferPage({navigate,notify}) {
  const model=useWorkspaceModel(notify);
  return <CourseOffer model={model} navigate={navigate}/>;
}

export default function CourseOffer({model,navigate,embedded=false}) {
  const Content = embedded ? 'div' : 'main';
  const [catalog,setCatalog]=useState(null),[slug,setSlug]=useState(''),[data,setData]=useState(null);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0),[confirm,setConfirm]=useState(false);
  const [offer,setOffer]=useState(null),[paymentError,setPaymentError]=useState('');
  const [authOpen,setAuthOpen]=useState(false);
  const [returnOrderId,setReturnOrderId]=useState(()=>paymentReturnId(window.location.search));
  const returnHandled=useRef(false);
  useEffect(()=>{if(!returnOrderId||!offer||returnHandled.current)return;if(!model.user){setAuthOpen(true);return;}returnHandled.current=true;setConfirm(true);},[returnOrderId,offer,model.user?.id]);
  const purchaseRef=useRef(null);
  useEffect(()=>{let active=true;api('/commerce/offer').then(d=>{if(active){setOffer(d);setPaymentError('');if(d.slug)setSlug(d.slug);}}).catch(e=>active&&setPaymentError(e.message));return()=>{active=false;};},[retry]);
  useEffect(()=>{
    let active=true;setError('');
    Promise.all([api('/catalog/workspace'),api('/learning/entry')]).then(([result,entry])=>{
      if(!active)return;setCatalog(result.items||[]);
      setSlug(current=>{
        const requested=current||new URLSearchParams(window.location.search).get('course');
        return result.items?.find(p=>p.slug===requested)?.slug||result.items?.find(p=>p.id===entry.defaultCourseId)?.slug||result.items?.find(p=>p.path_slug==='ai-product')?.slug||result.items?.[0]?.slug||'';
      });
    }).catch(e=>active&&setError(e.message));return ()=>{active=false;};
  },[retry]);
  useEffect(()=>{
    if(!slug)return;let active=true;
    setData(null);setError('');
    Promise.all([api(`/project-packs/${encodeURIComponent(slug)}`),api(`/learning/courses/${encodeURIComponent(slug)}`)])
      .then(([pack,course])=>active&&setData({pack,lessons:course.lessons||[]})).catch(e=>active&&setError(e.message));
    return ()=>{active=false;};
  },[slug,model.user?.id,retry]);
  const pack=data?.pack,chapters=pack?offerCurriculum(pack,data.lessons):[];
  const items=chapters.flatMap(c=>c.items),previews=items.filter(i=>i.is_preview);
  const materialCount=(pack?.steps||[]).reduce((total,chapter)=>total+(chapter.contents?.length||0),0);
  const isOfferCourse=Boolean(offer&&(!offer.productId||offer.productId===pack?.product_id));
  const price=isOfferCourse?offer.priceCents:pack?.product_id?offerPrice(pack):null;
  const originalPrice=isOfferCourse?offer.originalPriceCents:null;
  const paymentReady=isOfferCourse&&offer?.productId===pack?.product_id&&offer.channels.some(c=>c.available);
  const canBuy=Boolean(pack&&(pack.entitled||paymentReady));
  const ready=Boolean(pack&&catalog?.length&&!error);
  const buy=()=>{
    if(!canBuy)return;
    if(pack.entitled)return navigate(courseLearningPath(pack.slug));
    if(!model.user)return setAuthOpen(true);setConfirm(true);
  };
  const jumpToPurchase=()=>{purchaseRef.current?.scrollIntoView({behavior:'smooth',block:'center'});purchaseRef.current?.focus({preventScroll:true});};
  const chooseCourse=value=>{setSlug(value);window.scrollTo({top:0,behavior:'smooth'});};
  return <div className={`co-site${embedded?' co-workspace':''}`}>
    {embedded ? <nav className="co-breadcrumb" aria-label="当前位置"><button onClick={()=>navigate('/app')}>工作台</button><span aria-hidden="true">/</span><span aria-current="page">课程与价格</span></nav> : <OfferHeader model={model} navigate={navigate} onLogin={()=>setAuthOpen(true)} onBuy={jumpToPurchase} catalog={catalog} onChoose={chooseCourse}/>}
    <Content className="co-page">
      {error?<section className="co-state" role="alert"><h1>课程暂时无法加载</h1><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新加载</button></section>:!catalog||(slug&&!data)?<section className="co-state" role="status">正在读取课程与购买信息…</section>:!catalog.length?<section className="co-state"><BookOpenText size={36}/><h1>课程即将开放</h1><p>正式发布后，可在这里查看目录、试听内容与价格。</p><button onClick={()=>navigate('/community')}>浏览官方学习内容<ArrowRight size={16}/></button></section>:null}
      {ready&&<><div className="co-layout"><div className="co-main">
        <section className="co-hero"><div className="co-hero-art" aria-hidden="true"><img src={mascot} alt=""/><span className="co-handwriting">Build<br/>Your AI Product<br/>Better Together</span><div className="co-art-steps"><strong>一个人<br/>也可以做出<br/>伟大的产品！</strong><span>Idea → Product</span><span>Build → Launch</span><span>Grow → Freedom</span></div></div>
          <div className="co-hero-copy"><span className="co-kicker"><Flame size={15} weight="fill"/>开启你的 AI 产品之路</span><h1>AI OPC<span>一个人的产品公司</span></h1><p>从 0 到 1，用 AI 做出真正可以上线、收款、获得用户的产品。</p><div className="co-checks"><span><CheckCircle weight="fill"/>系统化的实战方法论</span><span><CheckCircle weight="fill"/>真实项目案例拆解</span><span><CheckCircle weight="fill"/>从想法到上线的学习路径</span></div><div className="co-metrics"><div><strong>{chapters.length}<small>章节</small></strong><span>已发布目录</span></div><div><strong>{items.length}<small>{data.lessons.length?'课时':'内容'}</small></strong><span>当前课程内容</span></div><div><strong>{materialCount}<small>资料</small></strong><span>配套学习资源</span></div><div><strong>{previews.length}<small>免费内容</small></strong><span>先体验，再开始</span></div></div></div>
        </section>
        {data.lessons.some(l=>l.is_demo_media)&&<p className="ls-demo-notice">课程目录已开放；当前视频与 PPT 为演示占位素材，非正式教学内容。真实视频、课件和实操材料将陆续补充，请在购买前确认内容交付情况。</p>}
        <section className="co-section"><h2>你将获得什么</h2><p>不只是学习知识，而是围绕真实产品的实战体系。</p><div className="co-benefits">{benefits.map(([Icon,title,line1,line2,color])=><article key={title}><span className={`co-icon ${color}`}><Icon size={26} weight="fill"/></span><div><h3>{title}</h3><p>{line1}<br/>{line2}</p></div></article>)}</div><small className="co-scope">具体权益以所选课程说明为准；独立项目需单独授权，AI 服务以后台配置为准。</small></section>
        <section className="co-section co-outline"><header><h2>课程目录（部分）</h2><button className="co-link" onClick={()=>navigate(courseLearningPath(pack.slug))}>查看完整课程大纲<ArrowRight size={15}/></button></header><div className="co-curriculum">{chapters.slice(0,5).map((chapter,index)=><article key={chapter.id}><span className="co-number">{String(index+1).padStart(2,'0')}</span><h3>{chapter.title}</h3><small>{chapter.items.length} {data.lessons.length?'课时':'份资料'}</small><ul>{chapter.items.slice(0,5).map(item=><li key={item.id}><button onClick={()=>navigate(item.href)} title={item.title}><span>{item.title}</span>{item.is_preview?<em>免费</em>:item.locked?<LockKey size={12} aria-label="购买后解锁"/>:<CheckCircle size={12} aria-label="可学习"/>}</button></li>)}</ul>{!chapter.items.length&&<p>内容准备中</p>}</article>)}</div>{!chapters.length&&<div className="co-empty">课程目录准备中，发布后将在这里展示。</div>}</section>
      </div><aside className="co-rail">
        <section className="co-purchase" ref={purchaseRef} tabIndex={-1}><span className="co-purchase-badge"><Lightning size={15} weight="fill"/>课程优惠</span><h2>{pack.title}</h2><p>单次购买，开启系统学习</p><div className="co-price-row"><div className="co-price">{originalPrice>price&&<del aria-label={`原价${offerMoney(originalPrice)}`}>{offerMoney(originalPrice)}</del>}<strong>{offerMoney(price)}</strong><span>{pack.entitled?'当前账号已解锁':'课程售价 · 人民币'}</span></div>{originalPrice>price&&<div className="co-price-saving"><b>立省 {offerMoney(originalPrice-price)}</b><span>课程优惠价</span></div>}</div><button className="co-primary" disabled={!canBuy} onClick={buy}>{pack.entitled?<BookOpenText size={18}/>:<ShoppingCart size={18}/>} {pack.entitled?'进入课程学习':paymentReady?`${offerMoney(price)} 解锁完整课程`:'支付暂未开放'}<ArrowRight size={17}/></button>{previews.length>0&&<button className="co-preview" onClick={()=>navigate(previews[0].href)}><PlayCircle size={18}/>免费{data.lessons.length?'试听':'预览'} {previews.length} {data.lessons.length?'课时':'份资料'}</button>}
          <div className="co-payment-labels"><span className="co-wechat">微信支付</span><span className="co-alipay">支付宝</span><small>{paymentReady?'平台安全支付':'商户配置完成后开放'}</small></div>{paymentError&&<p className="co-payment-note" role="alert">支付信息暂未加载。<button onClick={()=>setRetry(n=>n+1)}>重试</button></p>}{model.user&&offer&&<button className="co-link co-history-link" onClick={()=>setConfirm(true)}>查看我的支付订单<ArrowRight size={14}/></button>}
          <div className="co-purchase-assurances"><span><ShieldCheck size={18}/>官方课程<br/>真实内容</span><span><LockKey size={18}/>核验到账后<br/>自动开通</span><span><NotePencil size={18}/>学习记录<br/>账号保存</span></div>
        </section>
        <details className="co-course-options"><summary>选择课程与购买说明</summary><label className="co-course-select">当前课程<select value={slug} onChange={e=>chooseCourse(e.target.value)}>{catalog.map(p=><option key={p.id} value={p.slug}>{p.title}</option>)}</select></label><small className="co-payment-note">在线支付仅对后台绑定的课程开放。微信扫码付款，支付宝前往官方收银台付款；到账核验后开通所购课程，不自动续费。</small></details>
        <ServiceSummary/>
        <section className="co-questions"><header><h3>购买前，你可能想了解</h3></header>{[['如何开始试听？','点击免费试听，进入已开放的课时。完整内容以当前课程目录为准。'],['购买后如何开通？','支付渠道开放后，微信扫码付款，支付宝前往官方收银台付款。服务器核验到账后自动开通；页面未更新时可在我的订单查询。'],['包含所有项目和服务吗？','仅解锁所选课程。独立项目、会员群与 AI 服务范围，以对应说明为准。']].map(([title,copy],i)=><article key={title}><span className="co-question-icon">{String(i+1).padStart(2,'0')}</span><div><h4>{title}</h4><p>{copy}</p></div></article>)}</section>
      </aside></div>
      <section className="co-closing"><img src={mountain} alt=""/><div className="co-closing-copy"><span className="co-closing-kicker">🎯 你的下一个产品，就从这里开始</span><h2>现在加入 OneShowLearn<br/>用 AI 实现你的想法，做出真正属于自己的产品。</h2><div className="co-closing-points"><span><CheckCircle size={16}/>更低的试错成本</span><span><CheckCircle size={16}/>更高效的开发实践</span><span><CheckCircle size={16}/>持续积累产品经验</span></div></div><div className="co-closing-action"><i>Ideas into<br/>Real Products<br/>Together</i><button onClick={jumpToPurchase}>立即了解课程<ArrowRight size={17}/></button></div><i className="co-closing-quote">一个人<br/>也可以改变世界！</i></section>
      <footer className="co-footer"><span><ShieldCheck size={18}/>课程范围清晰可查</span><span><PlayCircle size={18}/>免费内容先行体验</span><span><LockKey size={18}/>核验到账后自动开通</span><span><NotePencil size={18}/>学习记录，账号保存</span></footer><ServiceLinks/></>}
    </Content>
    {authOpen&&<Modal title="登录学习账号" close={()=>setAuthOpen(false)}><UserAuthCard onSuccess={()=>setAuthOpen(false)}/></Modal>}
    {confirm&&offer&&<CourseCheckout offer={offer} initialOrderId={returnOrderId} close={()=>{setConfirm(false);setReturnOrderId(null);}} onPaid={()=>{setRetry(n=>n+1);model.refresh({preserve:true});}}/>}
  </div>;
}
