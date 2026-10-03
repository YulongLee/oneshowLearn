import {HOME_CARDS} from './homepage-cards.mjs';
export const SITE_DEFAULTS={
  public:{eyebrow:'AI 产品实战学习平台',title:'AI OPC\n一个人的产品公司',description:'从 0 到 1，用 AI 做出能收款、能获得用户的真实产品。\n系统学习 AI 产品开发、上线合规、支付商业化和运营增长，\n把想法变成一个可以持续运行的产品。',image:'/assets/oneshowlearn-hero.png',ctaLabel:'解锁完整课程',ctaPath:'/membership',secondaryLabel:'查看课程与试听',secondaryPath:'/opc',footerTitle:'现在就开始你的 AI 创业之旅',footerDescription:'从学习到实践，用 AI 创造属于你的产品。',courseIds:[],projectIds:[]},
  workbench:{eyebrow:'旗舰学习路线',title:'AI OPC：\n一个人的产品公司',description:'从 0 到 1，用 AI 做出真实的产品，并实现上线、收款和持续增长。',image:'',ctaLabel:'查看学习路线',ctaPath:'/opc',secondaryLabel:'查看课程介绍',secondaryPath:'/paths',footerTitle:'用 AI，创造更大的自己',footerDescription:'Learn Today · Build Tomorrow',courseIds:[],projectIds:[]},
};
SITE_DEFAULTS.public.hotCourseCards=HOME_CARDS;

// Upgrade only the former bundled copy. Custom authored CMS copy is untouched.
export function currentPublicCopy(payload) {
  if(payload.title!=='学会 AI。\n用好 AI。\n做出你的 AI 产品。')return payload;
  const next={...payload,title:SITE_DEFAULTS.public.title};
  if(payload.description==='从一个想法开始，用 AI + Codex 完成产品设计、开发、上线、运营和增长。\n帮助普通人和开发者，开启一个人的产品公司时代。')next.description=SITE_DEFAULTS.public.description;
  if(payload.ctaLabel==='开始学习'&&payload.ctaPath==='/login'){next.ctaLabel=SITE_DEFAULTS.public.ctaLabel;next.ctaPath='/membership';}
  if(payload.secondaryLabel==='查看课程介绍'&&payload.secondaryPath==='/paths'){next.secondaryLabel=SITE_DEFAULTS.public.secondaryLabel;next.secondaryPath='/opc';}
  return next;
}
