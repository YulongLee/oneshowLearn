import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUESTION_LENGTH, questionNote, selectedLearningContext, tutorQuestions, tutorHistory, TUTOR_FAQ, handleTutorComposerKeyDown } from '../src/tutor-model.js';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TutorAnswer,TutorSources,answerHref,answerLabel} from '../src/TutorAnswer.js';
import {readFileSync} from 'node:fs';

function composerKey(overrides={}, composing=false) {
  let prevented=0, sent=0;
  handleTutorComposerKeyDown({key:'Enter',preventDefault:()=>prevented++,...overrides},()=>sent++,composing);
  return {prevented,sent};
}
test('tutor Enter sends once and retains Ctrl/Command Enter compatibility',()=>{
  for(const modifiers of [{},{ctrlKey:true},{metaKey:true}])assert.deepEqual(composerKey(modifiers),{prevented:1,sent:1});
  const page=readFileSync(new URL('../src/AiTutorChat.jsx',import.meta.url),'utf8');
  assert.match(page,/onKeyDown=\{e=>handleTutorComposerKeyDown\(e,send,composing.current\)\}/);
  assert.match(page,/onCompositionStart=/);assert.match(page,/onCompositionEnd=/);
  assert.match(page,/if\(!available\|\|busy\|\|!\(quick\?\.question\|\|draft\).trim\(\)\)return/);
});
test('tutor Shift Enter keeps newlines and other keys are untouched',()=>{
  for(const modifiers of [{shiftKey:true},{shiftKey:true,ctrlKey:true},{shiftKey:true,metaKey:true},{altKey:true},{key:'a'}])
    assert.deepEqual(composerKey(modifiers),{prevented:0,sent:0});
});
test('tutor IME confirmation never sends or prevents candidate selection',()=>{
  for(const modifiers of [{isComposing:true},{nativeEvent:{isComposing:true}},{nativeEvent:{isComposing:false,keyCode:229}},{keyCode:229}])
    assert.deepEqual(composerKey(modifiers),{prevented:0,sent:0});
  assert.deepEqual(composerKey({},true),{prevented:0,sent:0});
});
test('holding Enter consumes repeated keydowns without resending',()=>{
  assert.deepEqual(composerKey({repeat:true}),{prevented:1,sent:0});
  assert.deepEqual(composerKey({nativeEvent:{repeat:true}}),{prevented:1,sent:0});
});

test('tutor studio preserves sessions and exposes a grounded course picker without uploads',()=>{
  const page=readFileSync(new URL('../src/AiTutorChat.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/tutor-studio.css',import.meta.url),'utf8');
  assert.match(page,/<h1>OneShow AI<\/h1>/);
  assert.match(page,/model\.user\?\.name/);
  for(const action of ['session.startNew()','session.open(item.id)','session.stop()','session.reload','session.retryUnconfirmed']) assert.ok(page.includes(action));
  assert.match(page,/aria-label="添加上下文与问答设置"/);
  assert.match(page,/hidden=\{!settingsOpen\}/);
  assert.match(page,/aria-label="联网回答" aria-pressed=\{mode==='web'\}/);
  assert.doesNotMatch(page,/上传文件|Paperclip|tc-upload-unavailable/);
  assert.match(page,/aria-label="选择课程"/);
  assert.match(page,/setCourseId\(e.target.value\);setMode\('knowledge'\)/);
  assert.match(page,/model.library.map\(p=><option/);
  assert.equal((page.match(/<select /g)||[]).length,1);
  assert.ok(page.indexOf('aria-label="选择课程"')>page.indexOf('className="tc-tools"'));
  assert.match(page,/courseId:selectedMode==='web'\?null:courseId,includeProduct:selectedMode==='web'\?false:includeProduct/);
  assert.ok(page.indexOf('aria-label="快捷开始"')>page.indexOf('className="tc-composer"'));
  assert.match(css,/\.tc-studio \[hidden\]\{display:none!important\}/);
  assert.match(css,/\.tc-studio \.tc-faq\.is-open\{display:block\}/);
  assert.match(css,/repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/@container learner \(max-width:600px\)/);
});

test('AI Markdown renders tables, nested lists, headings and copyable code safely',()=>{
  const body='# Title\n\n1. First\n   - Nested\n2. Second\n\n| Name | Value |\n| --- | --- |\n| A | **bold** |\n\n```js\nconst value = "<script>";\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![tracking](https://example.com/tracker.png)';
  const html=renderToStaticMarkup(h(TutorAnswer,{body}));
  for(const tag of ['<h1>','<ol>','<ul>','<table>','<strong>','<pre>'])assert.ok(html.includes(tag),tag);
  assert.match(html,/复制代码/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
  assert.match(renderToStaticMarkup(h(TutorAnswer,{body:'**小标题**\n下一行解释'})),/<strong>小标题<\/strong><br\/>/);
});
test('known citations are accessible links, unknown citations and code remain literal',()=>{
  const sources=[{id:'W1',href:'https://example.com/one',label:'Example'},{id:'W2',href:'javascript:alert(1)',label:'Unsafe'}];
  const html=renderToStaticMarkup(h(TutorAnswer,{body:'事实 [W1][W2][W99]\n\n`[W1]`\n\n```\n[W1]\n```',sources}));
  assert.equal((html.match(/class="tc-citation"/g)||[]).length,1);assert.match(html,/来源 W1：Example/);assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/\[W99\]/);assert.match(html,/<code>\[W1\]<\/code>/);
  for(const href of ['javascript:x','//evil.com','http://127.0.0.1/a','https://user:pass@example.com','https://example.internal','https://example.com\\evil'])assert.equal(answerHref(href),null);
});
test('sources are collapsed and initially limited to three, system answers are not labeled web',()=>{
  const html=renderToStaticMarkup(h(TutorSources,{mode:'web',sources:Array.from({length:9},(_,i)=>({id:`W${i+1}`,href:'https://example.com',label:`Source ${i+1}`}))}));
  assert.match(html,/<details class="tc-reference-panel">/);assert.equal((html.match(/<li>/g)||[]).length,3);assert.match(html,/查看其余 6 个来源/);
  assert.equal(answerLabel({mode:'web',answerKind:'system-model'}),'平台配置 · 当前模型');
  assert.equal(answerLabel({mode:'web',answerKind:'system-time'}),'系统时间 · 北京时间');
});

test('FAQ shortcuts distinguish grounded questions from general help without supplying canned answers',()=>{
  assert.equal(TUTOR_FAQ.length,3);
  assert.equal(new Set(TUTOR_FAQ.map(g=>g.id)).size,3);
  const questions=TUTOR_FAQ.flatMap(g=>g.questions);
  assert.equal(questions.length,9);
  assert.equal(new Set(questions.map(q=>q.id)).size,9);
  for(const group of TUTOR_FAQ){
    assert.ok(['knowledge','general'].includes(group.mode));
    assert.equal(group.mode,group.id==='general'?'general':'knowledge');
    for(const item of group.questions){
      assert.ok(item.title && item.question.trim());
      assert.ok(item.question.length<=MAX_QUESTION_LENGTH);
      assert.equal(item.answer,undefined);
    }
  }
});

test('tutor context is chosen only from current account library',()=>{
  const library=[{id:1,title:'Owned one'},{id:2,title:'Owned two'}];
  assert.equal(selectedLearningContext(library,{id:2},'').id,2);
  assert.equal(selectedLearningContext(library,{id:2},'1').id,1);
  assert.equal(selectedLearningContext(library,{id:99},99).id,1);
  assert.equal(selectedLearningContext([], {id:99},99),null);
});

test('question note stores the real context with an explicit no-AI disclaimer',()=>{
  const note=questionNote('  我该如何开发？  ',{title:'我的课程',progressPercent:0},{name:'测试产品'},'id','2026-09-26T00:00:00Z');
  assert.equal(note.title,'[AI 导师提问] 我该如何开发？');
  assert.match(note.body,/学习进度：0%/);
  assert.match(note.body,/课程：我的课程/);
  assert.match(note.body,/产品：测试产品/);
  assert.match(note.body,/本次未调用 AI 或生成回答/);
  assert.deepEqual(Object.keys(note),['id','title','body','updatedAt']);
});

test('question limits preserve input and do not fabricate missing context',()=>{
  assert.throws(()=>questionNote('  '));
  assert.throws(()=>questionNote('文'.repeat(MAX_QUESTION_LENGTH+1)));
  const note=questionNote('文'.repeat(MAX_QUESTION_LENGTH),null,null,'id','date');
  assert.ok(note.title.length<=120);
  assert.ok(note.body.length<=20000);
  assert.match(note.body,/课程：未选择课程/);
  assert.match(note.body,/产品：尚未创建/);
});

test('question history is derived from account notes without mutating them',()=>{
  const notes=[{title:'[AI 导师提问] earlier',updatedAt:'2026-09-25'},{title:'ordinary note',updatedAt:'2026-09-26'},{title:'[AI 导师提问] later',updatedAt:'2026-09-26'}];
  const copy=structuredClone(notes);
  assert.deepEqual(tutorQuestions(notes).map(n=>n.title),['[AI 导师提问] later','[AI 导师提问] earlier']);
  assert.deepEqual(notes,copy);
  assert.deepEqual(tutorQuestions(),[]);
});

test('tutor follow-up history is bounded and never crosses knowledge/general or course scopes',()=>{
  const messages=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(5000),mode:'knowledge',courseId:'1',sources:[{id:'S1'}]}));
  const history=tutorHistory(messages,'knowledge','1');
  assert.ok(history.length<=8);assert.ok(history.reduce((n,m)=>n+m.content.length,0)<=36000);
  assert.ok(history.every(m=>Object.keys(m).length===2));
  assert.deepEqual(tutorHistory(messages,'general','1'),[]);
  assert.deepEqual(tutorHistory(messages,'knowledge','2'),[]);
  assert.equal(messages.length,12);
});
