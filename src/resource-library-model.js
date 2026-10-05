import {resourceCategory,resourceTags,RESOURCE_TYPES,filterResources} from './resource-model.js';

export const RESOURCE_COURSE_PHASES=[
  {id:'opportunity',title:'产品与机会',pattern:/机会|需求|验证|访谈|PRD|市场|定位/i},
  {id:'build',title:'AI 产品开发',pattern:/开发|代码|源码|设计|编程|Codex|React|API|Skill|MVP/i},
  {id:'launch',title:'上线与合规',pattern:/上线|部署|备案|合规|服务器|Docker|上架/i},
  {id:'business',title:'收款与商业化',pattern:/支付|收款|定价|订阅|商业化|盈利|Stripe/i},
  {id:'growth',title:'运营与增长',pattern:/增长|SEO|运营|推广|营销|获客|流量/i},
];
const chapterNumbers={'一':1,'二':2,'三':3,'四':4,'五':5};
export function resourceChapterNumber(item){
  const match=String(item.step_title||item.title||'').match(/第\s*([1-5一二三四五])\s*章/);
  return match?Number(chapterNumbers[match[1]]||match[1]):null;
}
export function resourceCoursePhases(item){
  const chapter=resourceChapterNumber(item);
  const text=`${item.title||''} ${item.step_title||''}`;
  // Formal chapter identity takes precedence over incidental keywords in titles.
  if(chapter&&RESOURCE_COURSE_PHASES[chapter-1].pattern.test(item.step_title||item.title||''))return [RESOURCE_COURSE_PHASES[chapter-1].id];
  return RESOURCE_COURSE_PHASES.filter(p=>p.pattern.test(text)).map(p=>p.id);
}
export function resourcePurpose(item){
  const summary=String(item.summary||'').replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim();
  if(summary){const first=summary.split(/核心问题[：:]|阶段成果[：:]|课程大纲已/)[0].trim();const text=first||summary;return text.length>64?text.slice(0,63)+'…':text;}
  return `${item.step_title||item.pack_title||'课程'}配套${RESOURCE_TYPES[item.type]||'资料'}。`;
}
export function resourceAction(item){
  if(item.locked)return '查看学习权益';
  if(/章节大纲/.test(item.title||''))return '阅读大纲';
  return {prompt:'查看 Prompt',template:'预览模板',code:'查看源码',checklist:'阅读清单',task:'阅读清单',video:'查看视频资料'}[item.type]||'阅读资料';
}
export function resourceAccess(item){return item.locked?'课程专享':item.is_preview?'免费预览':'可访问';}
export function resourceLibraryItems(items,{phase='',sort='chapter',query='',...filters}={}){
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result=filterResources(items,{...filters,sort:sort==='chapter'?'title':sort}).filter(item=>(!phase||resourceCoursePhases(item).includes(phase))&&terms.every(term=>resourceSearchText(item).toLowerCase().includes(term)));
  if(sort==='chapter')result.sort((a,b)=>String(a.pack_title||'').localeCompare(String(b.pack_title||''),'zh-CN')||(resourceChapterNumber(a)||99)-(resourceChapterNumber(b)||99)||a.title.localeCompare(b.title,'zh-CN')||a.id-b.id);
  return result;
}
export function resourceHighlights(items,limit=3){
  return resourceLibraryItems(items).sort((a,b)=>Number(Boolean(b.is_featured))-Number(Boolean(a.is_featured))||Number(Boolean(a.locked))-Number(Boolean(b.locked))).slice(0,limit);
}
export function resourcePrimaryCategories(items){
  const present=new Set(items.map(resourceCategory));
  return ['all',...['learning','template','prompt','checklist','code','skill','tools','video','case'].filter(id=>present.has(id)).slice(0,5)];
}
export function resourceSearchText(item){return `${item.title||''} ${item.summary||''} ${item.step_title||''} ${item.pack_title||''} ${resourceTags(item).join(' ')}`;}
