import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle,Play} from '@phosphor-icons/react';
import {sharedRead} from './shared-reads.js';
import {offerMoney} from './course-offer-model.js';
import {courseLearningPath} from './course-reader-model.js';
import {sidebarCourseAccess} from './workbench-model.js';
import {sidebarCatalogue,sidebarOfferSummary} from './sidebar-offer-model.js';

// Revalidate the public CMS offer without clearing the last successful display.
// Checkout still reads authoritative prices; this card never creates an order.
export function SidebarCourseOffer({route,navigate,model}) {
  const [offer,setOffer]=useState(null);
  const [catalogue,setCatalogue]=useState({});
  useEffect(()=>{
    let active=true;
    sharedRead('/commerce/offer').then(value=>{if(active)setOffer(value);}).catch(()=>{
      // A temporary refresh failure must not collapse the persistent sidebar.
      // With no successful response, retain the honest price-unavailable label.
    });
    sharedRead('/learning/entry').then(value=>{if(active)setCatalogue(sidebarCatalogue(value));}).catch(()=>{});
    return()=>{active=false;};
  },[route,model?.user?.id]);
  const priced=Number.isInteger(offer?.priceCents)&&offer.priceCents>=0;
  const discounted=priced&&Number.isInteger(offer?.originalPriceCents)&&offer.originalPriceCents>offer.priceCents;
  const access=sidebarCourseAccess(offer,model), learning=access==='unlocked';
  const course=model?.library?.find(c=>c.slug===offer?.slug);
  const summary=sidebarOfferSummary(offer,catalogue);
  const channels=(offer?.channels||[]).filter(c=>c.available).map(c=>c.label);
  return <section className={`wb-access ws-course-purchase ws-course-offer${learning?' ws-course-unlocked':''}`} data-access={access} aria-label={learning?'课程与学习服务':'课程购买入口'} onFocusCapture={event=>{if(event.currentTarget.scrollHeight>event.currentTarget.clientHeight)event.target.scrollIntoView({block:'nearest',inline:'nearest'});}}>
    {access!=='purchase'&&<span className="ws-offer-account">{access==='management'?'管理员预览':learning?'已解锁':'访问核验中'}</span>}
    <h3>{learning?<><CheckCircle size={20} weight="fill"/><span>完整课程已解锁</span></>:summary.title}</h3>
    <p className="ws-offer-value">用 AI，做出自己的产品</p>
    {learning?<p className="ws-unlocked-course">{course?.title||'从学习到实践，做出自己的产品'}</p>:<>
      <div className="ws-offer-syllabus">{summary.lessons>0&&summary.chapters>0?`${summary.chapters} 章 · ${summary.lessons} 节`:'系统课程 · 配套学习资料'}</div>
      <ul className="ws-offer-benefits">
        <li><CheckCircle size={15} weight="fill"/><span>系统课程 · 产品实战</span></li>
        <li className="ws-offer-ai"><CheckCircle size={15} weight="fill"/><span>AI 导师 · 课程答疑</span></li>
        <li><CheckCircle size={15} weight="fill"/><span>课件 · Prompt 模板</span></li>
      </ul>
      <div className="ws-offer-price" aria-label="课程价格">{priced?<><strong>{offerMoney(offer.priceCents)}</strong>{discounted&&<del aria-label={`原价${offerMoney(offer.originalPriceCents)}`}>{offerMoney(offer.originalPriceCents)}</del>}</>:<span>查看课程与价格</span>}</div>
      <div className="ws-offer-billing">单次购买</div>
    </>}
    <button className="ws-offer-primary" disabled={access==='checking'} aria-current={route==='/membership'?'page':undefined} onClick={()=>learning?navigate(offer?.slug?courseLearningPath(offer.slug):'/opc'):navigate('/membership')}>{access==='checking'?'正在核对课程访问…':learning?'继续学习':'查看完整课程'}<ArrowRight size={17}/></button>
    {!learning&&summary.previewPath&&<button className="ws-offer-preview" disabled={access==='checking'} onClick={()=>navigate(summary.previewPath)}><Play size={14} weight="fill"/><span>免费试看前 {summary.previews} 节</span><ArrowRight size={15}/></button>}
    {!learning&&<small className="ws-offer-payment">{channels.length?`支持${channels.join(' / ')}支付`:'支付方式以收银台为准'}</small>}
    {(learning||access==='management')&&<small>{learning?'课程与学习服务 · 仅限所购课程':'管理员课程预览'}</small>}
  </section>;
}
