export const PROJECT_CATEGORIES = [['all','全部项目'],['saas','AI SaaS'],['mini','小程序'],['mobile','移动 App'],['tools','工具网站'],['desktop','桌面客户端'],['agent','AI Agent'],['automation','自动化'],['other','其他项目']];

// Discovery facets classify existing CMS copy; they never create catalog entries.
export function projectCategory(pack) {
  if(PROJECT_CATEGORIES.some(([id])=>id===pack.category&&id!=='all'))return pack.category;
  const text = `${pack.title || ''} ${pack.subtitle || ''}`;
  if (/小程序/i.test(text)) return 'mini';
  if (/桌面|electron|macos|windows/i.test(text)) return 'desktop';
  if (/移动|\bapp\b|swiftui|react native/i.test(text)) return 'mobile';
  if (/agent|智能体/i.test(text) || pack.path_slug === 'ai-agent') return 'agent';
  if (/自动化|工作流/i.test(text) || pack.path_slug === 'ai-workflow') return 'automation';
  if (/saas/i.test(text)) return 'saas';
  if (/工具站|工具网站|工具平台/i.test(text)) return 'tools';
  return 'other';
}
export function projectStatus(pack) {
  if (Number(pack.contentCount)>0 && Number(pack.completedCount)>=Number(pack.contentCount)) return 'completed';
  if (Number(pack.startedCount)>0 || Number(pack.completedCount)>0) return 'started';
  return 'new';
}
export function projectStats(library) {
  return library.reduce((stats, pack) => { stats[projectStatus(pack)]++; return stats; },{started:0,completed:0,new:0});
}
export function filterProjects(packs, category='all', sort='recommended', ownedOnly=false, library=[]) {
  const owned = new Set(library.map(p=>p.id));
  const result = packs.filter(p=>(category==='all'||projectCategory(p)===category)&&(!ownedOnly||owned.has(p.id)));
  if (sort==='newest') result.sort((a,b)=>(Date.parse(b.updated_at||b.created_at)||0)-(Date.parse(a.updated_at||a.created_at)||0)||b.id-a.id);
  if (sort==='shortest') result.sort((a,b)=>(Number(a.estimated_minutes)||Infinity)-(Number(b.estimated_minutes)||Infinity));
  return result;
}
export function estimatedTime(minutes) {
  const n=Number(minutes);
  return !n || n<0 ? '时长待定' : n>=60 ? `${Math.round(n/6)/10}h` : `${n} 分钟`;
}
