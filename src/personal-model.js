export const liveNotes = state => (state.notes||[]).filter(n=>!n.deletedAt);
export const liveAchievements = state => (state.achievements||[]).filter(a=>!a.deletedAt);
export const tagsFromText = text => [...new Set(String(text||'').split(/[,，\n]/).map(t=>t.trim()).filter(Boolean))].slice(0,8);
export const tagCounts = items => [...items.reduce((map,item)=>{for(const tag of new Set(item.tags||[]))map.set(tag,(map.get(tag)||0)+1);return map;},new Map())].sort((a,b)=>b[1]-a[1]);
export const shortDate = value => value ? new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}) : '时间未记录';
export const monthCount = (items,now=new Date()) => items.filter(item=>{const d=new Date(item.createdAt);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();}).length;
export const matchText = (item,query) => `${item.title} ${item.body||item.description||''} ${(item.tags||[]).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
export const ACHIEVEMENT_TYPES = [['all','全部成果'],['product','产品项目'],['work','学习作品'],['document','文档笔记'],['code','代码项目'],['certificate','证书']];
export const STAGES = {idea:'构思中',building:'开发中',launched:'已上线'};
