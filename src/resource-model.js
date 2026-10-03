export const RESOURCE_CATEGORIES = [
  ['all', '全部', ''], ['skill', 'Skill', 'AI 技能与可复用工作流'], ['prompt', 'Prompt 模板', 'Codex / 产品 / 营销 / 写作'],
  ['code', '项目源码', 'Web / 小程序 / App / 工具站'], ['template', '文档模板', 'PRD / 产品 / 项目文档'],
  ['tools', '工具推荐', '开发 / 设计 / 产品 / 运营'], ['video', '视频', '短视频与操作演示'], ['checklist', '检查清单', '上线 / 备案 / 支付 / 上架'],
  ['case', '案例库', '真实产品拆解与复盘'], ['learning', '学习资料', '教程 / 文档 / 短视频'],
];
export const RESOURCE_TYPES = {document:'实战文档',prompt:'Prompt',code:'项目代码',template:'文档模板',task:'实践任务',checklist:'检查清单',video:'视频演示',download:'配套附件'};
export function resourceCategory(item) {
  if (/\bskills?\b|技能包/i.test(item.title)) return 'skill';
  if (item.type === 'video') return 'video';
  if (['prompt','code','template'].includes(item.type)) return item.type;
  if (['task','checklist'].includes(item.type)) return 'checklist';
  if (/工具推荐|工具清单|工具选型|工具合集/.test(item.title)) return 'tools';
  if (/案例|拆解|复盘/.test(item.title)) return 'case';
  return 'learning';
}
export const RESOURCE_STAGES = [
  {id:'opportunity',title:'找机会',description:'发现市场机会',pattern:/机会|市场|选题|方向|产品定位/},
  {id:'validation',title:'验需求',description:'验证产品需求',pattern:/需求|验证|访谈|PRD|MVP/i},
  {id:'build',title:'做产品',description:'开发与设计实现',pattern:/开发|代码|源码|设计|编程|Codex|React|API|Skill/i},
  {id:'launch',title:'上线',description:'发布与合规',pattern:/上线|部署|备案|合规|服务器|Docker|上架/i},
  {id:'business',title:'商业化',description:'收款与盈利',pattern:/支付|收款|定价|订阅|商业化|盈利|Stripe/i},
  {id:'growth',title:'增长',description:'用户与内容增长',pattern:/增长|SEO|运营|推广|营销|获客|流量/i},
];
export function resourceStages(item) {
  const text=`${item.title || ''} ${item.step_title || ''}`;
  return RESOURCE_STAGES.filter(stage=>stage.pattern.test(text)).map(stage=>stage.id);
}
export function featuredResources(items, limit=4) {
  return filterResources(items).sort((a,b)=>Number(Boolean(b.is_featured))-Number(Boolean(a.is_featured))).slice(0,limit);
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
  return ['skill','prompt','code','tools'].includes(resourceCategory(item)) ? 'code' : item.type==='video' ? 'deploy' : 'prd';
}
export function filterResources(items, {category='all',query='',tag='',stage='',sort='newest'}={}) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item=>(category==='all'||resourceCategory(item)===category)&&(!tag||resourceTags(item).includes(tag))&&(!stage||resourceStages(item).includes(stage))&&terms.every(term=>`${item.title} ${item.summary || ''} ${item.pack_title || ''} ${resourceTags(item).join(' ')}`.toLowerCase().includes(term))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):sort==='accessible'?Number(a.locked)-Number(b.locked)||b.id-a.id:String(b.created_at).localeCompare(String(a.created_at))||b.id-a.id);
}
export const resourceDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10) : '日期待完善';
