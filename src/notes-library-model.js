export const NOTE_TEMPLATES = [
  {id:'course',title:'课程重点',description:'记录关键知识、核心观点和你的思考',body:'## 核心结论\n\n\n## 我的理解\n\n\n## 下一步实践\n\n- [ ] 写下一个可以验证的小步骤\n',tagsText:'课程重点'},
  {id:'prompt',title:'Prompt 收藏',description:'留下使用场景、提示词和改进方法',body:'## 使用场景\n\n\n## Prompt\n\n```\n\n```\n\n## 使用效果与改进\n\n',tagsText:'Prompt'},
  {id:'project',title:'项目复盘',description:'记录实践过程、经验总结和改进方向',body:'## 实践目标\n\n\n## 实践过程\n\n\n## 经验与问题\n\n\n## 下一步\n\n- [ ] 写下一个改进方向\n',tagsText:'项目复盘'},
];
export function noteText(body){
  try{
    const doc=JSON.parse(body);if(doc?.type==='doc'){
      const parts=[];let count=0;
      const walk=(node,depth=0)=>{if(!node||depth>30||++count>5000)return;if(typeof node.text==='string')parts.push(node.text);if(Array.isArray(node.content))node.content.forEach(n=>walk(n,depth+1));};
      walk(doc);return parts.join(' ').replace(/\s+/g,' ').trim();
    }
  }catch{}
  return String(body||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*>`_\[\]]/g,'').replace(/\s+/g,' ').trim();
}
export function noteSource(url){
 const match=String(url||'').match(/^\/(learn|projects)\/([^/?#\\]+)\/(lessons|workspace)\/([1-9]\d*)$/);
 if(!match||(match[1]==='learn'?match[3]!=='lessons':match[3]!=='workspace'))return null;
 try{return {kind:match[1]==='learn'?'course':'project',slug:decodeURIComponent(match[2]),url:String(url)};}catch{return null;}
}
export function unifiedNotes(personal=[],learning=[],entry={}){
 const own=personal.map(n=>({...n,key:'personal:'+n.id,kind:'personal',text:noteText(n.body),raw:n,sourceTitle:'个人笔记',scope:'personal'}));
 return own.concat(learning.map(n=>{
  const source=noteSource(n.source_url),lesson=(entry.lessons||[]).find(l=>l.id===n.placement_id),course=source?.kind==='course'?(entry.courses||[]).find(c=>c.slug===source.slug):null;
  const chapter=source?.kind==='course'?(entry.chapters||[]).find(c=>c.id===lesson?.chapter_id&&c.pack_id===course?.id):null;
  const matchingLesson=lesson&&source&&lesson.kind===source.kind&&lesson.owner_slug===source.slug?lesson:null;
  return {...n,key:'learning:'+n.id,kind:source?.kind||'learning',raw:n,text:noteText(n.body),deletedAt:n.deleted_at,updatedAt:n.updated_at,tags:[],sourceTitle:course?.title||matchingLesson?.owner_title||(source?.kind==='project'?'实战项目':'课时来源'),chapterTitle:chapter?.title||matchingLesson?.chapter||'',lessonTitle:n.lesson_title||'',sourceUrl:source?.url||'',scope:source?source.kind+':'+source.slug:'learning',videoTime:n.video_time};
 }));
}
export function filterNoteLibrary(items,{kind='all',tab='all',query='',tag='',scope='',sort='modified'}={}){
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(n=>Boolean(n.deletedAt)===(tab==='trash')&&(kind==='all'||n.kind===kind)&&(tab!=='starred'||n.starred)&&(!scope||n.scope===scope)&&(!tag||(n.tags||[]).includes(tag))&&terms.every(t=>`${n.title} ${n.text} ${n.sourceTitle} ${n.chapterTitle||''} ${n.lessonTitle||''} ${(n.tags||[]).join(' ')}`.toLowerCase().includes(t))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0)||a.key.localeCompare(b.key));
}
export function draftStorageKey(userId){return `oneshowlearn:notes:${userId}:draft:v1`;}
export function validStoredDraft(value,userId){
 if(value?.userId!==userId||!value.draft||!['personal','learning'].includes(value.draft.kind)||typeof value.draft.body!=='string'||value.draft.body.length>250000||typeof value.draft.title!=='string'||value.draft.title.length>120)return null;
 if(typeof value.draft.id!=='string'||!value.draft.id||value.draft.id.length>120)return null;
 if(value.draft.kind==='personal'&&(value.draft.body.length>20000||typeof value.draft.tagsText!=='string'||value.draft.tagsText.length>200))return null;
 if(value.draft.kind==='learning'&&(!Number.isInteger(value.draft.placement_id)||value.draft.placement_id<=0||!Number.isInteger(value.draft.version)||value.draft.version<1))return null;
 return value;
}
