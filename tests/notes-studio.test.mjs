import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPersonalNotes,noteExcerpt} from '../src/notes-studio-model.js';
const notes=[{id:'a',title:'需求分析',body:'Codex 实践',tags:['产品'],starred:true,updatedAt:'2026-10-01'},{id:'b',title:'MVP',body:'复盘',tags:['开发'],updatedAt:'2026-10-02'},{id:'c',title:'归档',starred:true,tags:['产品'],deletedAt:'2026-10-01'}];
test('notes studio filters preserve private records and exclude trash from favorites',()=>{
  assert.deepEqual(filterPersonalNotes(notes).map(n=>n.id),['b','a']);
  assert.deepEqual(filterPersonalNotes(notes,{tab:'starred'}).map(n=>n.id),['a']);
  assert.deepEqual(filterPersonalNotes(notes,{tab:'trash'}).map(n=>n.id),['c']);
  assert.deepEqual(filterPersonalNotes(notes,{query:'codex',tag:'产品'}).map(n=>n.id),['a']);
  assert.equal(filterPersonalNotes(notes,{query:'no match'}).length,0);
  assert.deepEqual(notes.map(n=>n.id),['a','b','c']);
});
test('notes studio titles sort without mutating inputs and handles legacy dates',()=>{
  assert.deepEqual(filterPersonalNotes([{title:'B'},{title:'A'}],{sort:'title'}).map(n=>n.title),['A','B']);
  assert.equal(filterPersonalNotes([{title:'Legacy'}]).length,1);
});
test('note excerpts remove Markdown syntax and image addresses',()=>{
  assert.equal(noteExcerpt('## 关键结论\n**MVP** [资料](https://example.com) ![图片](private.png)'),'关键结论 MVP 资料');
  assert.equal(noteExcerpt(null),'');assert.equal(noteExcerpt('a'.repeat(300)).length,130);
});
