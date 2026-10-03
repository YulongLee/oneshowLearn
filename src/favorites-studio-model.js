import {liveNotes} from './personal-model.js';
import {noteExcerpt} from './notes-studio-model.js';
import {resourceCategory,resourceTags} from './resource-model.js';

export const FAVORITE_CATEGORIES=[['all','全部收藏'],['course','课程与项目'],['resource','资源'],['article','文章'],['tool','工具'],['note','笔记']];
export function favoriteItems({state={},library=[],recommendations=[],resources=[],resourcesReady=false}) {
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
    result.push({id:`resource-${saved.id}`,source:source||{id:saved.id},kind:source?(resourceCategory(source)==='tools'?'tool':source.type==='document'?'article':'resource'):'resource',title:source?.title||(resourcesReady?'资源暂不可用':'资源信息待加载'),description:source?.summary||'',tags:source?resourceTags(source):[],date:saved.savedAt,unavailable:!source,pending:!source&&!resourcesReady,locked:Boolean(source?.locked)});
  }
  for(const source of liveNotes(state).filter(n=>n.starred))result.push({id:`note-${source.id}`,source,kind:'note',title:source.title||'未命名笔记',description:noteExcerpt(source.body),tags:source.tags||[],date:source.updatedAt});
  return result;
}
const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function filterFavorites(items,{category='all',query='',tag='',sort='recent'}={}) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(i=>(category==='all'||i.kind===category)&&(!tag||i.tags.includes(tag))&&terms.every(t=>`${i.title} ${i.description} ${i.tags.join(' ')}`.toLowerCase().includes(t)))
    .sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):time(b.date)-time(a.date)||(a.order??0)-(b.order??0));
}
export function withoutFavorite(state,item) {
  if(item.kind==='course')return {...state,favorites:(state.favorites||[]).filter(id=>id!==item.source.id)};
  if(item.kind==='note')return {...state,notes:(state.notes||[]).map(n=>n.id===item.source.id?{...n,starred:false}:n)};
  return {...state,resourceFavorites:(state.resourceFavorites||[]).filter(r=>r.id!==item.source.id)};
}
