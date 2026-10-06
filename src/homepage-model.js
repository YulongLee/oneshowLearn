import {homepageCards} from '../server/homepage-cards.mjs';
import {SITE_DEFAULTS} from '../server/site-defaults.mjs';

export function homepageOffer(offer) {
  const priced=Number.isInteger(offer?.priceCents)&&offer.priceCents>=0;
  return {priced,discounted:priced&&Number.isInteger(offer?.originalPriceCents)&&offer.originalPriceCents>offer.priceCents};
}

export function homepageExamples(site) {
  const projects=(site.projects||[]).filter(p=>p.status==='published'&&p.courses?.length);
  if(projects.length) return {projects:true,items:projects.slice(0,3).map(p=>({id:p.id,title:p.title,description:p.description,image:p.cover_url,path:'/projects/'+p.slug,label:p.tags?.slice(0,3).join(' · ')||'项目实战'}))};
  return {projects:false,items:homepageCards(site).slice(0,3).map((p,i)=>({...p,id:i,label:'学习方向'}))};
}

// Upgrade only bundled presentation; preserve authored CMS copy and destinations.
export function homepagePresentation(site) {
  return {...site,
    description:site.description===SITE_DEFAULTS.public.description?'面向想做自己产品的个人创作者，系统学习从需求验证、AI 开发，到上线、收款和增长。':site.description,
    footerTitle:site.footerTitle===SITE_DEFAULTS.public.footerTitle?'让你的想法，有一个真正的开始。':site.footerTitle,
    footerDescription:site.footerDescription===SITE_DEFAULTS.public.footerDescription?'系统学习 AI 产品实战，从想法走向真实的产品。':site.footerDescription,
  };
}
export function homepageCourse(entry,offer) {
  const course=(entry?.courses||[]).find(c=>offer?.slug&&c.slug===offer.slug);
  if(!course)return null;
  const chapters=(entry.chapters||[]).filter(c=>c.pack_id===course.id);
  const lessons=(entry.lessons||[]).filter(l=>l.kind==='course'&&l.owner_id===course.id);
  const previews=lessons.filter(l=>l.is_preview&&!l.locked);
  return {course,chapterCount:chapters.length,lessonCount:lessons.length,previewCount:previews.length,
    previewPath:previews.length?`/learn/${encodeURIComponent(course.slug)}/lessons/${previews[0].id}`:null};
}
export function homepagePreviewText(course) {
  return course?.previewCount>0?`免费试看${course.previewCount===2?'前 ':''}${course.previewCount} 节`:'查看课程与试看';
}
