import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPersonalNotes,noteExcerpt} from '../src/notes-studio-model.js';
import {NOTE_TEMPLATES,noteText,noteSource,unifiedNotes,filterNoteLibrary,draftStorageKey,validStoredDraft} from '../src/notes-library-model.js';
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
test('unified notes preserve independent records, namespaces, source and actual chapter metadata',()=>{
 const personal=[{id:'same',title:'个人',body:'自己写的',tags:['产品']}],learning=[{id:'same',title:'课程',body:'课时内容',placement_id:4,lesson_title:'1.1 核心课时',source_url:'/learn/course/lessons/4',version:3,video_time:138},{id:'project',title:'复盘',body:'项目内容',source_url:'/projects/app/workspace/5',version:1},{id:'orphan',title:'历史',body:'仍保留',source_url:null}];
 const entry={courses:[{id:2,slug:'course',title:'真实课程'}],lessons:[{id:4,chapter_id:3}],chapters:[{id:3,pack_id:2,title:'真实章节'}]};
 const all=unifiedNotes(personal,learning,entry);
 assert.equal(all.length,4);assert.deepEqual(all.map(n=>n.key),['personal:same','learning:same','learning:project','learning:orphan']);assert.equal(all[1].chapterTitle,'真实章节');assert.equal(all[1].videoTime,138);assert.equal(all[1].raw.version,3);assert.equal(all[2].kind,'project');assert.equal(all[3].kind,'learning');assert.equal(personal[0].key,undefined);
});
test('unified search covers full bodies, source/chapter/tags and combines filters without mutation',()=>{
 const items=unifiedNotes([{id:'p',title:'Prompt',body:'x'.repeat(200)+' 尾部目标',tags:['产品'],starred:true,updatedAt:'2026-10-01'},{id:'trash',title:'旧记录',deletedAt:'2026-10-01'}],[{id:'l',title:'课时',body:'需求验证',lesson_title:'机会判断',source_url:'/learn/opc/lessons/3',updated_at:'2026-10-02'}]);
 assert.equal(filterNoteLibrary(items,{query:'尾部目标',tag:'产品'})[0].id,'p');assert.equal(filterNoteLibrary(items,{query:'需求 机会',kind:'course'})[0].id,'l');assert.equal(filterNoteLibrary(items,{scope:'course:opc'})[0].id,'l');assert.equal(filterNoteLibrary(items,{tab:'trash'})[0].id,'trash');assert.equal(filterNoteLibrary(items,{tab:'starred'}).length,1);assert.equal(filterNoteLibrary(items,{kind:'project'}).length,0);assert.equal(items.length,3);
});
test('structured note text excludes image data/link attrs and supports long/legacy bodies',()=>{
 const body=JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'真正的文字',marks:[{type:'link',attrs:{href:'https://private.invalid'}}]}]},{type:'image',attrs:{src:'data:image/png;base64,secret'}}]});
 assert.equal(noteText(body),'真正的文字');assert.equal(noteText('a'.repeat(400)).length,400);assert.equal(noteText('## 标题\n**内容**'),'标题 内容');assert.equal(noteText(null),'');
});
test('only actual relative course/project source routes can be used',()=>{
 assert.equal(noteSource('/learn/opc/lessons/4').kind,'course');assert.equal(noteSource('/projects/app/workspace/4').kind,'project');for(const url of ['https://example.com','//example.com','javascript:alert(1)','/learn/a/workspace/2','/learn/a/lessons/0','/learn/a/lessons/2?redirect=https://example.com','/learn/a/lessons/2\\x'])assert.equal(noteSource(url),null);
});
test('templates prepare empty personal drafts, not automatic course records or model requests',()=>{
 assert.equal(NOTE_TEMPLATES.length,3);assert.deepEqual(NOTE_TEMPLATES.map(t=>t.id),['course','prompt','project']);assert.ok(NOTE_TEMPLATES.every(t=>t.body.includes('## ')&&!t.body.includes('OPC 不只是')));
});
test('current-tab draft recovery is account separated and preserves original lesson version',()=>{
 const value={userId:4,selected:'learning:l',draft:{id:'l',kind:'learning',title:'草稿',body:'私密',placement_id:3,version:2}};
 assert.equal(validStoredDraft(value,4),value);assert.equal(validStoredDraft(value,5),null);assert.equal(validStoredDraft({...value,draft:{...value.draft,version:null}},4),null);assert.notEqual(draftStorageKey(4),draftStorageKey(5));assert.equal(validStoredDraft({userId:4,draft:{kind:'personal',title:'a',body:'x'.repeat(250001)}},4),null);
});
