import {homepageCards} from '../server/homepage-cards.mjs';

export function homepageOffer(offer) {
  const priced=Number.isInteger(offer?.priceCents)&&offer.priceCents>=0;
  return {priced,discounted:priced&&Number.isInteger(offer?.originalPriceCents)&&offer.originalPriceCents>offer.priceCents};
}

export function homepageExamples(site) {
  const projects=(site.projects||[]).filter(p=>p.status==='published'&&p.courses?.length);
  if(projects.length) return {projects:true,items:projects.slice(0,3).map(p=>({id:p.id,title:p.title,description:p.description,image:p.cover_url,path:'/projects/'+p.slug,label:p.tags?.slice(0,3).join(' · ')||'项目实战'}))};
  return {projects:false,items:homepageCards(site).slice(0,3).map((p,i)=>({...p,id:i,label:'学习方向'}))};
}
