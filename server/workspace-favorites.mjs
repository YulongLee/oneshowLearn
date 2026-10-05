import {z} from 'zod';
import {row} from './db.mjs';
import {placement,canReadPlacement,projectAccess,stageAccessIssue} from './learning-model.mjs';

// References only: never persist copies of course bodies, signed URLs or titles.
export const contentFavoriteSchema=z.discriminatedUnion('kind',[
  ...['project','lesson','courseware'].map(kind=>z.object({kind:z.literal(kind),id:z.number().int().positive(),savedAt:z.string().datetime({offset:true})}).strict()),
  z.object({kind:z.literal('material'),id:z.number().int().positive(),placementId:z.number().int().positive(),savedAt:z.string().datetime({offset:true})}).strict(),
  z.object({kind:z.literal('learning-note'),id:z.string().uuid(),savedAt:z.string().datetime({offset:true})}).strict(),
]);
export const contentFavoriteKey=ref=>`${ref.kind}:${ref.id}:${ref.placementId||''}`;
const lessonUrl=p=>p.kind==='course'?`/learn/${encodeURIComponent(p.owner_slug)}/lessons/${p.id}`:`/projects/${encodeURIComponent(p.owner_slug)}/workspace/${p.id}`;

export function resolveContentFavorite(user,ref){
  if(ref.kind==='project'){
    const p=row("SELECT id,slug,title,description,cover_url FROM practice_projects WHERE id=? AND status='published'",[ref.id]);
    return p?{title:p.title,description:p.description,cover_url:p.cover_url,sourceTitle:'实战项目',kind:'project',url:`/projects/${encodeURIComponent(p.slug)}`,locked:!projectAccess(user,p.id)}:null;
  }
  if(ref.kind==='learning-note'){
    const n=row('SELECT id,title,body,placement_id FROM learning_notes WHERE id=? AND user_id=? AND deleted_at IS NULL',[ref.id,user.id]);
    if(!n)return null;
    const p=placement(n.placement_id);
    return {title:n.title,body:n.body,sourceTitle:p?`${p.owner_title} · ${p.title}`:'课时笔记 · 来源暂不可用',kind:'note',url:`/notes?learningNote=${encodeURIComponent(n.id)}`};
  }
  const p=placement(ref.kind==='material'?ref.placementId:ref.id);
  if(!p)return null;
  const locked=!canReadPlacement(user,p)||Boolean(stageAccessIssue(user,p));
  const sourceTitle=`${p.owner_title} · ${p.chapter_title}`;
  if(ref.kind==='material'){
    const m=row("SELECT l.id,l.title FROM lesson_materials m JOIN content_library l ON l.id=m.library_id WHERE m.placement_id=? AND m.library_id=? AND l.status='published'",[p.id,ref.id]);
    // A private library item is discoverable only through an authorized placement.
    return m?{title:locked?'课程配套资料':m.title,description:p.title,sourceTitle,kind:'resource',url:lessonUrl(p)+`?material=${m.id}`,locked}:null;
  }
  if(ref.kind==='courseware'){
    if(!p.config.pptAssetId&&!p.config.slides?.length)return null;
    return {title:`${p.title} · 课件`,description:p.config.isDemoMedia?'通用演示课件，不代表正式课程素材':'本节课程课件',sourceTitle,kind:'resource',url:lessonUrl(p)+'?courseware=1',locked};
  }
  return {title:p.title,description:p.subtitle,sourceTitle,kind:'course',url:lessonUrl(p),locked};
}
