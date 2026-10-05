import test from 'node:test';
import assert from 'node:assert/strict';
import {FAVORITE_CATEGORIES,favoriteItems,filterFavorites,withoutFavorite,favoriteAction,favoriteSource,favoriteCoverUrl} from '../src/favorites-studio-model.js';

const state={favorites:[1,2,1],resourceFavorites:[{id:7,savedAt:'2026-10-01'},{id:7},{id:8}],notes:[{id:'a',title:'产品笔记',body:'## MVP\n**Codex** 实践',tags:['产品'],starred:true,updatedAt:'2026-10-02'},{id:'b',title:'普通笔记',starred:false},{id:'c',title:'回收站',starred:true,deletedAt:'2026-10-01'}],tasks:[{id:'keep'}]};
test('favorites aggregate account-owned references without duplicating or exposing trashed notes',()=>{
  const items=favoriteItems({state,library:[{id:1,title:'已购课程'}],recommendations:[{id:1,title:'目录课程'}],resources:[{id:7,title:'产品文档',type:'document',locked:true}],resourcesReady:true});
  assert.equal(items.length,5);
  assert.equal(items.find(i=>i.id==='pack-1').title,'已购课程');
  assert.equal(items.find(i=>i.id==='pack-2').unavailable,true);
  assert.equal(items.find(i=>i.id==='resource-7').locked,true);
  assert.equal(items.find(i=>i.id==='resource-7').kind,'article');
  assert.equal(items.find(i=>i.id==='note-a').description,'MVP Codex 实践');
  assert.equal(items.some(i=>['note-b','note-c'].includes(i.id)),false);
  assert.equal(items.find(i=>i.id==='pack-1').date,null);
});
test('unavailable resource references remain visible through loading, failure and unpublication',()=>{
  const loading=favoriteItems({state}),ready=favoriteItems({state,resourcesReady:true});
  assert.equal(loading.find(i=>i.id==='resource-8').pending,true);
  assert.equal(ready.find(i=>i.id==='resource-8').pending,false);
  assert.equal(ready.find(i=>i.id==='resource-8').title,'资源暂不可用');
  assert.equal(ready.find(i=>i.id==='resource-8').source.id,8);
});
test('favorites filters combine category, tag and multi-term search without changing inputs',()=>{
  const items=favoriteItems({state});const before=JSON.stringify(items);
  assert.deepEqual(filterFavorites(items,{category:'note',tag:'产品',query:'codex MVP'}).map(i=>i.id),['note-a']);
  assert.equal(filterFavorites(items,{query:'does-not-exist'}).length,0);
  assert.equal(filterFavorites(items)[0].id,'note-a');
  assert.equal(JSON.stringify(items),before);
  assert.deepEqual(filterFavorites([{title:'B',tags:[],date:'invalid'},{title:'A',tags:[]}],{sort:'title'}).map(i=>i.title),['A','B']);
});
test('unbookmark affects only the selected reference and preserves original notes and unrelated state',()=>{
  const original=JSON.stringify(state),items=favoriteItems({state});
  const course=withoutFavorite(state,items.find(i=>i.id==='pack-1'));
  assert.deepEqual(course.favorites,[2]);assert.equal(course.notes,state.notes);
  const resource=withoutFavorite(state,items.find(i=>i.id==='resource-7'));
  assert.deepEqual(resource.resourceFavorites,[{id:8}]);assert.equal(resource.favorites,state.favorites);
  const note=withoutFavorite(state,items.find(i=>i.id==='note-a'));
  assert.equal(note.notes[0].starred,false);assert.equal(note.notes[0].body,state.notes[0].body);
  assert.equal(note.tasks,state.tasks);assert.equal(note.notes[1],state.notes[1]);
  assert.equal(JSON.stringify(state),original);
});
test('empty and legacy collections produce honest empty states',()=>{
  assert.deepEqual(favoriteItems({}),[]);
  assert.deepEqual(filterFavorites([]),[]);
  assert.equal(favoriteItems({state:{notes:[{id:'legacy',starred:true}]}})[0].title,'未命名笔记');
});
test('taxonomy names only actually integrated content, and course outlines stay resources',()=>{
 assert.equal(FAVORITE_CATEGORIES.find(([k])=>k==='course')[1],'课程');
 assert.equal(FAVORITE_CATEGORIES.find(([k])=>k==='article')[1],'文档');
 const items=favoriteItems({state:{resourceFavorites:[{id:1},{id:2},{id:3}]},resources:[{id:1,type:'document',title:'第 1 章 产品与机会｜章节大纲'},{id:2,type:'document',title:'需求说明'},{id:3,type:'document',title:'工具推荐清单'}]});
 assert.deepEqual(items.map(i=>i.kind),['resource','article','tool']);
});
test('search reads full private note body and complete source metadata without changing records',()=>{
 const body='正文'.repeat(300)+'唯一尾部关键词',own={notes:[{id:'long',title:'标题',body,starred:true}]},before=JSON.stringify(own);
 const items=favoriteItems({state:own});assert.ok(items[0].description.length<200);
 assert.deepEqual(filterFavorites(items,{query:'唯一尾部关键词'}).map(i=>i.id),['note-long']);
 assert.equal(JSON.stringify(own),before);
 const resources=favoriteItems({state:{resourceFavorites:[{id:5}]},resources:[{id:5,title:'大纲',type:'document',summary:'简短摘要'+body,pack_title:'所属课程',step_title:'第 3 章 上线与合规'}]});
 assert.equal(filterFavorites(resources,{query:'所属课程 唯一尾部关键词'}).length,1);
 assert.equal(favoriteSource(resources[0]),'第 3 章 上线与合规');
});
test('type-specific actions honor access and unavailable states, never claim unlocking',()=>{
 assert.equal(favoriteAction({kind:'note'}),'打开笔记');assert.equal(favoriteAction({kind:'course'}),'查看课程');
 assert.equal(favoriteAction({kind:'article'}),'查看文档');assert.equal(favoriteAction({kind:'tool'}),'查看工具');
 assert.equal(favoriteAction({kind:'resource',locked:true}),'查看学习权益');
 assert.equal(favoriteAction({kind:'resource',source:{title:'章节大纲'}}),'阅读大纲');
 assert.equal(favoriteAction({unavailable:true,pending:true}),'正在加载');assert.equal(favoriteAction({unavailable:true}),'暂不可用');
 assert.equal(favoriteSource({kind:'note'}),'个人笔记 · 仅自己可见');
});
test('actual CMS cover is preserved without allowing unsafe image routes',()=>{
 assert.equal(favoriteCoverUrl('/assets/course-case-v2.webp'),'/assets/course-case-v2.webp');
 assert.equal(favoriteCoverUrl('https://example.com/cover.webp'),'https://example.com/cover.webp');
 for(const url of ['/assets/../secret.png','/api/me/workspace','javascript:alert(1)','https://user:pass@example.com/image.png'])assert.equal(favoriteCoverUrl(url),'');
});
