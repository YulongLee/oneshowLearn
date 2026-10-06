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

// Public proof must not turn the existing explicitly labeled demo catalogue
// into customer outcomes. Keep the project catalogue and all records intact.
export function homepageCommercialProjects(site) {
  return (site.projects||[]).filter(p=>p.status==='published'&&p.courses?.length&&
    !/[【\[]演示[】\]]|演示内容[，,]|非正式教学课程|当前共用/.test(`${p.title||''} ${p.description||''}`)&&
    p.settings?.isDemo!==true).slice(0,2).map(p=>({id:p.id,title:p.title,description:p.description,
      image:p.cover_url,path:'/projects/'+p.slug,label:'项目教程'}));
}

// Biography supplied by the owner; former employers are experience, not sponsors.
export const HOMEPAGE_INSTRUCTOR=Object.freeze({name:'Yulong Lee',identity:'OneShowAILab 创始人',
  expertise:'大模型算法专家',experience:'10 年以上 AI 算法行业经验',
  background:'先后在百度、科大讯飞、阿里等国内一线互联网企业工作。',
  philosophy:'以长期主义建设 AI 产品，用技术判断连接真实需求、商业落地与持续影响力。'});

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
    demoCount:lessons.filter(l=>l.is_demo_media===true).length,
    previewPath:previews.length?`/learn/${encodeURIComponent(course.slug)}/lessons/${previews[0].id}`:null};
}
export function homepageDeliveryText(course) {
  return course?.demoCount>0?`当前目录中有 ${course.demoCount} 节使用演示素材，正式教学内容仍在更新。购买前请先试看，并核对课程目录与购买说明。`:
    '教学内容与配套资料以课程目录中的实际发布内容为准。购买前建议先试看，确认内容和学习方式适合自己。';
}
export function homepagePreviewText(course) {
  return course?.previewCount>0?`免费试看${course.previewCount===2?'前 ':''}${course.previewCount} 节`:'查看课程与试看';
}
