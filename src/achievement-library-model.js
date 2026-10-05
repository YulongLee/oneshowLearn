export const OUTCOME_TYPES=[['all','全部成果'],['product','产品项目'],['work','学习作品'],['document','文档'],['code','代码']];
export const OUTCOME_STARTERS=[{id:'idea',title:'记录产品想法',description:'留下目标用户与要解决的问题',stage:'idea'},{id:'prototype',title:'记录原型 / 作品',description:'整理已经做出的页面或功能',stage:'building'},{id:'launched',title:'记录上线产品',description:'保存作品链接与上线过程',stage:'launched'}];
export function outcomeSummary(items){return {total:items.length,building:items.filter(i=>i.stage==='building').length,launched:items.filter(i=>i.stage==='launched').length};}
export function outcomeSource(item,projects=[],status='ready'){
 if(!item.sourceProjectId)return {label:'个人成果记录',project:null};
 const project=projects.find(p=>p.id===item.sourceProjectId)||null;
 return {label:project?`关联实战：${project.title}`:status==='loading'?'关联项目正在加载':status==='error'?'关联项目信息暂不可读取':'原关联项目暂不可用',project};
}
export function filterOutcomes(items,{category='all',stage='all',query='',sort='updated',projects=[]}={}){
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean),stamp=i=>Date.parse(i.updatedAt)||0;
 return items.filter(i=>(category==='all'||i.type===category)&&(stage==='all'||i.stage===stage)&&terms.every(t=>`${i.title} ${i.description||''} ${(i.tags||[]).join(' ')} ${outcomeSource(i,projects).project?.title||''}`.toLowerCase().includes(t))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):stamp(b)-stamp(a)||a.id.localeCompare(b.id));
}
export function outcomeCoverUrl(value=''){
 if(/^\/assets\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g|gif|svg)$/.test(value))return value;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function validateOutcome(value,tags){
 if(!value.title.trim())return '请填写成果名称。';
 if(value.title.trim().length>120)return '成果名称最多 120 个字。';
 if((value.description||'').length>5000)return '成果描述最多 5000 个字。';
 if(!OUTCOME_TYPES.some(([id])=>id===value.type&&id!=='all'))return '请选择已有的成果类型。';
 if(!['idea','building','launched'].includes(value.stage))return '请选择有效的当前阶段。';
 if(tags.some(t=>t.length>24))return '每个标签最多 24 个字。';
 for(const [key,label] of [['url','作品链接'],['githubUrl','代码仓库链接'],['screenshotUrl','截图地址']]){
  const raw=(value[key]||'').trim();if(!raw)continue;
  if(raw.length>2000)return `${label}过长，请精简后重试。`;
  try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{return `${label}请填写不含账号密码的 HTTP 或 HTTPS 地址。`;}
 }
 return '';
}
export function saveOutcome(state,item){return {...state,achievements:[item,...(state.achievements||[]).filter(i=>i.id!==item.id)]};}
export function archiveOutcome(state,id,deletedAt){return {...state,achievements:(state.achievements||[]).map(i=>i.id===id?{...i,deletedAt}:i)};}
