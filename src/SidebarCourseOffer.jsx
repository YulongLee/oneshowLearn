import {useEffect,useState} from 'react';
import {ArrowRight,BookOpenText,CheckCircle,Sparkle} from '@phosphor-icons/react';
import {api} from './api.js';
import {offerMoney} from './course-offer-model.js';

// Revalidate the public CMS offer without clearing the last successful display.
// Checkout still reads authoritative prices; this card never creates an order.
export function SidebarCourseOffer({route,navigate}) {
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
  return <section className="wb-access ws-course-purchase ws-course-offer" aria-label="课程购买入口">
    <div className="ws-offer-eyebrow"><span><Sparkle size={15} weight="fill"/>从学习，到创造</span><BookOpenText size={21} weight="duotone"/></div>
    <h3>解锁完整课程</h3>
    <p className="ws-offer-value">用 AI，做出自己的产品</p>
    <div className="ws-offer-price" aria-label="课程价格">{priced?<><strong>{offerMoney(offer.priceCents)}</strong>{discounted&&<del aria-label={`原价${offerMoney(offer.originalPriceCents)}`}>{offerMoney(offer.originalPriceCents)}</del>}</>:<span>查看课程与价格</span>}</div>
    <div className="ws-offer-saving-slot">{discounted&&<span className="ws-offer-saving">比原价省 {offerMoney(offer.originalPriceCents-offer.priceCents)}</span>}</div>
    <ul><li><CheckCircle size={14}/>视频课件 · 项目实战</li><li><CheckCircle size={14}/>Prompt 模板 · 学习资料</li></ul>
    <button aria-current={route==='/membership'?'page':undefined} onClick={()=>navigate('/membership')}>查看课程与权益<ArrowRight size={17}/></button>
    <small>先看目录，再选择适合的课程</small>
  </section>;
}
