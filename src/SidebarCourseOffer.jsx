import {useEffect,useState} from 'react';
import {ArrowRight,BookOpenText,CheckCircle,Sparkle} from '@phosphor-icons/react';
import {api} from './api.js';
import {offerMoney} from './course-offer-model.js';
import {courseLearningPath} from './course-reader-model.js';
import {sidebarCourseAccess} from './workbench-model.js';

// Revalidate the public CMS offer without clearing the last successful display.
// Checkout still reads authoritative prices; this card never creates an order.
export function SidebarCourseOffer({route,navigate,model}) {
  const [offer,setOffer]=useState(null);
  useEffect(()=>{
    let active=true;
    api('/commerce/offer').then(value=>{if(active)setOffer(value);}).catch(()=>{
      // A temporary refresh failure must not collapse the persistent sidebar.
      // With no successful response, retain the honest price-unavailable label.
    });
    return()=>{active=false;};
  },[route]);
  const priced=Number.isInteger(offer?.priceCents)&&offer.priceCents>=0;
  const discounted=priced&&Number.isInteger(offer?.originalPriceCents)&&offer.originalPriceCents>offer.priceCents;
  const access=sidebarCourseAccess(offer,model), learning=access==='unlocked'||access==='management';
  const course=model?.library?.find(c=>c.slug===offer?.slug);
  return <section className={`wb-access ws-course-purchase ws-course-offer${learning?' ws-course-unlocked':''}`} data-access={access} aria-label={learning?'课程与学习服务':'课程购买入口'}>
    <div className="ws-offer-eyebrow"><span><Sparkle size={15} weight="fill"/>从学习，到创造</span><BookOpenText size={21} weight="duotone"/></div>
    <h3>{learning?<><CheckCircle size={20} weight="fill"/><span>{access==='management'?'课程管理访问':'完整课程已解锁'}</span></>:'解锁完整课程'}</h3>
    <p className="ws-offer-value">用 AI，做出自己的产品</p>
    {learning?<p className="ws-unlocked-course">{course?.title||'从学习到实践，做出自己的产品'}</p>:<><div className="ws-offer-price" aria-label="课程价格">{priced?<><strong>{offerMoney(offer.priceCents)}</strong>{discounted&&<del aria-label={`原价${offerMoney(offer.originalPriceCents)}`}>{offerMoney(offer.originalPriceCents)}</del>}</>:<span>查看课程与价格</span>}</div><div className="ws-offer-saving-slot">{discounted&&<span className="ws-offer-saving">比原价省 {offerMoney(offer.originalPriceCents-offer.priceCents)}</span>}</div><ul><li><CheckCircle size={14}/>视频课件 · 项目实战</li><li><CheckCircle size={14}/>Prompt 模板 · 学习资料</li></ul></>}
    <button disabled={access==='checking'} aria-current={route==='/membership'?'page':undefined} onClick={()=>learning?navigate(offer?.slug?courseLearningPath(offer.slug):'/opc'):navigate('/membership')}>{access==='checking'?'正在核对课程访问…':learning?'继续学习':'查看课程与权益'}<ArrowRight size={17}/></button>
    <small>{learning?(access==='management'?'管理权限不代表购买记录':'课程与学习服务 · 仅限所购课程'):'先看目录，再选择适合的课程'}</small>
  </section>;
}
