import test from 'node:test';
import assert from 'node:assert/strict';
import {favoriteItems,filterFavorites,withoutFavorite} from '../src/favorites-studio-model.js';

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
