export const RESOURCE_CATEGORIES = [
  ['all', '全部', ''], ['prompt', 'Prompt 模板', 'Codex / 产品 / 营销 / 写作'],
  ['code', '项目源码', 'Web / 小程序 / App / 工具站'], ['template', '文档模板', 'PRD / 产品 / 项目文档'],
  ['tools', '工具推荐', '开发 / 设计 / 产品 / 运营'], ['checklist', '检查清单', '上线 / 备案 / 支付 / 上架'],
  ['case', '案例库', '真实产品拆解与复盘'], ['learning', '学习资料', '教程 / 文档 / 短视频'],
];
export const RESOURCE_TYPES = {document:'实战文档',prompt:'Prompt',code:'项目代码',template:'文档模板',task:'实践任务',checklist:'检查清单',video:'视频演示',download:'配套附件'};
export function resourceCategory(item) {
  if (['prompt','code','template'].includes(item.type)) return item.type;
  if (['task','checklist'].includes(item.type)) return 'checklist';
  if (/工具推荐|工具清单|工具选型|工具合集/.test(item.title)) return 'tools';
  if (/案例|拆解|复盘/.test(item.title)) return 'case';
  return 'learning';
}
const keywords = ['Codex','PRD','微信支付','小程序','FastAPI','部署','SEO','App','Docker','数据分析','Prompt','RAG','Agent','增长','React','Stripe','支付','上线'];
export function resourceTags(item) {
  const text = `${item.title} ${item.step_title || ''} ${item.pack_title || ''}`.toLowerCase();
  const found = keywords.filter(tag=>text.includes(tag.toLowerCase()));
  return [...new Set([...found,RESOURCE_TYPES[item.type] || '资料'])].slice(0,5);
}
export function resourceArt(item) {
  if (/支付|收款|商业化/.test(item.title)) return 'payment';
  if (/部署|Docker|服务器|上线/.test(item.title)) return 'deploy';
  return ['prompt','code','tools'].includes(resourceCategory(item)) ? 'code' : 'prd';
}
export function filterResources(items, {category='all',query='',tag='',sort='newest'}={}) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item=>(category==='all'||resourceCategory(item)===category)&&(!tag||resourceTags(item).includes(tag))&&terms.every(term=>`${item.title} ${item.summary || ''} ${item.pack_title} ${resourceTags(item).join(' ')}`.toLowerCase().includes(term))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):sort==='accessible'?Number(a.locked)-Number(b.locked)||b.id-a.id:String(b.created_at).localeCompare(String(a.created_at))||b.id-a.id);
}
export const resourceDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10) : '日期待完善';
