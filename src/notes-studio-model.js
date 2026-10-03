import {matchText} from './personal-model.js';
export function noteExcerpt(body){return String(body||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*>`_\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,130);}
export function filterPersonalNotes(items,{tab='all',query='',tag='',sort='modified'}={}){
  return items.filter(n=>Boolean(n.deletedAt)===(tab==='trash')&&(tab!=='starred'||n.starred)&&matchText(n,query)&&(!tag||(n.tags||[]).includes(tag))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
}
