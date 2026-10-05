import {liveNotes} from './personal-model.js';
import {noteExcerpt} from './notes-studio-model.js';
import {noteText} from './notes-library-model.js';
import {resourceCategory,resourceTags} from './resource-model.js';
import {resourceAction,resourcePurpose} from './resource-library-model.js';
import {safeResourceUrl} from './opc-model.js';
import {favoriteReferenceKey} from './favorite-reference.js';

export function favoriteCoverUrl(value=''){
  // CMS public artwork lives under /assets; do not accept traversal or arbitrary
  // API routes as image URLs. Private material tickets retain their own guard.
  if(/^\/assets\/[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|svg)$/.test(value))return value;
  return safeResourceUrl(value);
}

export const FAVORITE_CATEGORIES=[['all','全部收藏'],['course','课程'],['project','项目'],['resource','资源'],['article','文档'],['tool','工具'],['note','笔记']];
export function favoriteAction(item){
  if(item.unavailable)return item.pending?'正在加载':'暂不可用';
  if(item.reference)return item.kind==='project'?'查看项目':item.kind==='note'?'打开笔记':item.locked?'查看学习权限':item.reference.kind==='lesson'?'打开课时':item.reference.kind==='courseware'?'查看课件':'查看资料';
  if(item.kind==='course')return '查看课程';
  if(item.kind==='project')return '查看项目';
  if(item.kind==='note')return '打开笔记';
  if(item.locked)return '查看学习权益';
  if(item.kind==='tool')return '查看工具';
  if(item.kind==='article')return '查看文档';
  return resourceAction(item.source);
}
export function favoriteSource(item){
  if(item.reference)return item.source?.sourceTitle||(item.reference.kind==='learning-note'?'课时笔记 · 仅自己可见':'关联内容');
  if(item.kind==='note')return '个人笔记 · 仅自己可见';
  if(item.kind==='course')return item.source?.path_title||'课程目录';
  return item.source?.step_title||item.source?.pack_title||'资源中心';
}
export function favoriteItems({state={},library=[],recommendations=[],resources=[],resourcesReady=false,contents=[],contentsReady=false}) {
  const packs=new Map([...recommendations,...library].map(p=>[p.id,p]));
  const catalog=new Map(resources.map(r=>[r.id,r]));
  const result=[...new Set(state.favorites||[])].reverse().map((id,index)=>{
    const source=packs.get(id);
    return {id:`pack-${id}`,source:source||{id},kind:'course',title:source?.title||'课程暂不可用',description:source?.subtitle||source?.description||'',tags:source?[source.path_title||'实战课程']:[],order:index,date:null,unavailable:!source};
  });
  const seen=new Set();
  for(const saved of state.resourceFavorites||[]){
    if(seen.has(saved.id))continue;seen.add(saved.id);
    const source=catalog.get(saved.id);
    // Preserve saved references when a resource is unpublished or cannot load.
    result.push({id:`resource-${saved.id}`,source:source||{id:saved.id},kind:source?(resourceCategory(source)==='tools'?'tool':source.type==='document'&&!/章节大纲/.test(source.title)?'article':'resource'):'resource',title:source?.title||(resourcesReady?'资源暂不可用':'资源信息待加载'),description:source?resourcePurpose(source):'',searchText:source?`${source.summary||''} ${source.pack_title||''} ${source.step_title||''}`:'',tags:source?resourceTags(source):[],date:saved.savedAt,unavailable:!source,pending:!source&&!resourcesReady,locked:Boolean(source?.locked)});
  }
  for(const source of liveNotes(state).filter(n=>n.starred))result.push({id:`note-${source.id}`,source,kind:'note',title:source.title||'未命名笔记',description:noteExcerpt(source.body),searchText:noteText(source.body),tags:source.tags||[],date:source.updatedAt});
  const contentMap=new Map(contents.map(item=>[favoriteReferenceKey(item.reference),item.content]));
  for(const reference of state.contentFavorites||[]){
    const key=favoriteReferenceKey(reference),source=contentMap.get(key);
    result.push({id:'content-'+key,reference,source:source||{},kind:source?.kind||(reference.kind==='learning-note'?'note':reference.kind==='project'?'project':reference.kind==='lesson'?'course':'resource'),title:source?.title||(contentsReady?'关联内容暂不可用':'关联内容待加载'),description:source?.body?noteExcerpt(noteText(source.body)):source?.description||'',searchText:source?.body?noteText(source.body):'',tags:[],date:reference.savedAt,unavailable:!source,pending:!source&&!contentsReady,locked:Boolean(source?.locked)});
  }
  return result;
}
const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function filterFavorites(items,{category='all',query='',tag='',sort='recent'}={}) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(i=>(category==='all'||i.kind===category)&&(!tag||i.tags.includes(tag))&&terms.every(t=>`${i.title} ${i.description} ${i.searchText||''} ${favoriteSource(i)} ${i.tags.join(' ')}`.toLowerCase().includes(t)))
    .sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):time(b.date)-time(a.date)||(a.order??0)-(b.order??0));
}
export function withoutFavorite(state,item) {
  if(item.reference)return {...state,contentFavorites:(state.contentFavorites||[]).filter(ref=>favoriteReferenceKey(ref)!==favoriteReferenceKey(item.reference))};
  if(item.kind==='course')return {...state,favorites:(state.favorites||[]).filter(id=>id!==item.source.id)};
  if(item.kind==='note')return {...state,notes:(state.notes||[]).map(n=>n.id===item.source.id?{...n,starred:false}:n)};
  return {...state,resourceFavorites:(state.resourceFavorites||[]).filter(r=>r.id!==item.source.id)};
}
