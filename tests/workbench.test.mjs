import assert from "node:assert/strict";
import test from "node:test";
import { calendarMonth, learningEntries, recentStudyItems, currentProject, currentProductAchievement, phaseState, watchPercent,workbenchSelection,workbenchPhaseState,sidebarCourseAccess } from "../src/workbench-model.js";
import {prepareTutorQuestion,takeTutorIntent,peekTutorIntent} from '../src/tutor-navigation.js';
import {workbenchProjectVisual,workbenchProjectSummary} from '../src/workbench-visual-model.js';
import {readFileSync} from 'node:fs';

test('workbench differentiates labeled generic demo art while preserving real CMS covers',()=>{
  assert.equal(workbenchProjectVisual({title:'[演示] AI 面试助手'}).key,'interview');
  assert.equal(workbenchProjectVisual({title:'【演示】 AI 工具聚合站'}).key,'directory');
  assert.equal(workbenchProjectVisual({title:'AI 健康 App'}).key,'mobile');
  assert.equal(workbenchProjectVisual({title:'AI Agent'}).key,'agent');
  const demo={title:'【演示】 AI 面试助手',cover_url:'/assets/project-web-cover-v1-A1b2.webp',tags:['React'],settings:{tech_stack:['React','RAG']}};
  assert.equal(workbenchProjectVisual(demo).useIllustration,true);
  assert.equal(workbenchProjectVisual(demo).title,'AI 面试助手');
  assert.deepEqual(workbenchProjectVisual(demo).tags,['React','RAG']);
  assert.equal(workbenchProjectVisual({...demo,cover_url:'https://cms.example/real-cover.webp'}).useIllustration,false);
  assert.equal(workbenchProjectVisual({...demo,title:'正式项目'}).useIllustration,false);
  assert.equal(workbenchProjectVisual({...demo,cover_url:'/api/assets/12'}).useIllustration,false);
  assert.equal(workbenchProjectSummary({description:'项目需求与开发。演示内容，非正式课程。当前共用素材。'}),'项目需求与开发。');
});
test('selected workbench keeps actual lesson, explicit demo status and non-payment previews',()=>{
  const ui=readFileSync(new URL('../src/Workbench.jsx',import.meta.url),'utf8');
  const sidebar=readFileSync(new URL('../src/SidebarCourseOffer.jsx',import.meta.url),'utf8');
  assert.match(ui,/id="wd-current-lesson"/);
  assert.match(ui,/lesson\?\.is_demo_media\?'演示素材'/);
  assert.match(ui,/正式教学内容待补充/);
  assert.match(ui,/illustratedOpc=opc&&\(!source\|\|failed\)/);
  assert.match(ui,/src=\{source&&!failed\?source:opc\?coursePreviewArt:courseArt\(course\)\}/);
  assert.match(sidebar,/learning=access==='unlocked'/);
  assert.match(sidebar,/管理员预览 · 不代表购买记录/);
  assert.doesNotMatch(sidebar,/commerce\/orders|priceCents:49900/);
});

test('personal product selects the latest non-archived product without mutating account data',()=>{
  const items=[
    {id:'old',type:'product',stage:'idea',updatedAt:'2026-09-01'},
    {id:'new',type:'product',stage:'building',updatedAt:'2026-10-01'},
    {id:'note',type:'document',updatedAt:'2026-10-02'},
    {id:'archived',type:'product',updatedAt:'2026-10-03',deletedAt:'2026-10-04'}
  ];
  const before=JSON.stringify(items);
  assert.equal(currentProductAchievement(items),items[1]);
  assert.equal(JSON.stringify(items),before);
  assert.equal(currentProductAchievement(items).progress,undefined);
});
test('empty personal products never turn course progress or sample projects into shipped products',()=>{
  assert.equal(currentProductAchievement(),null);
  assert.equal(currentProductAchievement([{type:'code'},{title:'catalogue',progress:{percent:100}}]),null);
  assert.equal(currentProductAchievement([{type:'product',deletedAt:'2026-10-01'}]),null);
});

test("calendar is Monday-first and does not add synthetic dates", () => {
  const september = calendarMonth(2026, 8);
  assert.equal(september.length, 35);
  assert.equal(september[0], null);
  assert.equal(september[1].getDate(), 1);
  assert.equal(september.filter(Boolean).length, 30);
  assert.equal(september.filter(Boolean).at(-1).getDate(), 30);
});
test("calendar handles leap years, six rows, and month rollover", () => {
  assert.equal(calendarMonth(2024, 1).filter(Boolean).length, 29);
  assert.equal(calendarMonth(2026, 1).filter(Boolean).length, 28);
  assert.equal(calendarMonth(2026, 2).length, 42);
  assert.equal(calendarMonth(2026, 12).filter(Boolean)[0].getFullYear(), 2027);
  assert.equal(calendarMonth(2026, -1).filter(Boolean)[0].getFullYear(), 2025);
});
test("recent learning only includes the API's owned recent pack", () => {
  const packs = [{ id: 1, title: "First", progressPercent: 0 }, { id: 2, title: "Second", progressPercent: 30 }];
  assert.deepEqual(learningEntries(packs), []);
  assert.deepEqual(learningEntries(packs, { id: 99 }), []);
  assert.deepEqual(learningEntries(packs, { id: 2 }), [packs[1]]);
  assert.deepEqual(Object.keys(learningEntries(packs, { id: 2 })[0]), ["id", "title", "progressPercent"]);
});

test('workbench recent lessons exclude discovery, locked and unstarted data',()=>{
  const row=(id,owner_id,updated_at,more={})=>({id,owner_id,progress:{version:1,updated_at},...more});
  const result=recentStudyItems([{id:1}],{lessons:[row(1,1,'2026-09-29'),row(2,2,'2026-09-30'),row(3,1,'2026-09-30',{locked:true}),row(4,1,'',{progress:{version:0}})]},[{run:{id:1},stages:[{lessons:[row(5,9,'2026-09-30')]}]},{stages:[{lessons:[row(6,9,'2026-09-30')]}]}]);
  assert.deepEqual(result.map(x=>x.id),[5,1]);
});
test('project continuation chooses a real unfinished run, never a catalogue recommendation',()=>{
  const items=[{id:1},{id:2,run:{},progress:{percent:100}},{id:3,run:{},progress:{percent:32}}];
  assert.equal(currentProject(items).id,3);
  assert.equal(currentProject([{id:1}]),null);
  assert.equal(currentProject(items.slice(0,2)).id,2);
});
test('phase status and watching percentages use actual records only',()=>{
  assert.equal(phaseState({items:[{pack_id:2,progress:'completed'}]},[1]),'pending');
  assert.equal(phaseState({items:[{pack_id:1,progress:null}]},[1]),'ready');
  assert.equal(phaseState({items:[{pack_id:1,progress:'started'}]},[1]),'started');
  assert.equal(phaseState({items:[{pack_id:1,progress:'completed'}]},[1]),'completed');
  assert.equal(watchPercent({progress:{video_time:32,video_duration:100}}),32);
  assert.equal(watchPercent({progress:{video_time:120,video_duration:100}}),100);
  assert.equal(watchPercent({progress:{video_time:-10,video_duration:100}}),0);
  assert.equal(watchPercent({progress:{video_time:32}}),0);
  assert.equal(watchPercent({progress:{completed_at:'2026-09-30'}}),100);
});

const entry={defaultCourseId:8,courses:[{id:8,slug:'opc',title:'课程'}],lessons:[
  {id:1,kind:'course',owner_id:8,phase:1,is_preview:true,progress:{version:0}},
  {id:2,kind:'course',owner_id:8,phase:1,locked:true,is_preview:false,progress:{version:0}},
  {id:3,kind:'course',owner_id:8,phase:2,locked:true,progress:{version:0}},
]};
test('first-time guests and trial accounts get only explicit unlocked previews, never ownership',()=>{
  const result=workbenchSelection([],entry);
  assert.equal(result.course.id,8);assert.equal(result.lesson.id,1);assert.equal(result.owned,false);
  assert.equal(result.started,false);assert.equal(result.completed,0);assert.equal(result.total,3);
  assert.equal(workbenchSelection([],{...entry,lessons:entry.lessons.map(l=>({...l,locked:true}))}).lesson,null);
  assert.equal(workbenchSelection([],{}).course,null);
});
test('continuation chooses an incomplete, readable recent lesson within the current owned course',()=>{
  const lessons=[{...entry.lessons[0],progress:{version:2,completed_at:'date'}},{...entry.lessons[1],locked:false,progress:{version:2,updated_at:'2026-10-04'}},{...entry.lessons[2],locked:false,progress:{version:1,updated_at:'2026-10-03'}},{id:99,owner_id:90,progress:{version:8,updated_at:'2026-10-05'}}];
  const result=workbenchSelection([{id:8,slug:'opc'}],{...entry,lessons},{id:90});
  assert.equal(result.lesson.id,2);assert.equal(result.completed,1);assert.equal(result.percent,33);assert.equal(result.started,true);
  assert.equal(result.total,3);assert.equal(result.owned,true);
});
test('course phase learning status never substitutes project shipping or checklist acceptance',()=>{
  assert.equal(workbenchPhaseState(entry.lessons,1,entry.lessons[0]),'current');
  assert.equal(workbenchPhaseState(entry.lessons,2,entry.lessons[0]),'pending');
  assert.equal(workbenchPhaseState(entry.lessons,5,entry.lessons[0]),'unconfigured');
  const lesson={...entry.lessons[0],progress:{version:1}};
  assert.equal(workbenchPhaseState([lesson],1,lesson),'started');
  assert.equal(workbenchPhaseState([{...lesson,progress:{completed_at:'date'}}],1,lesson),'completed');
});
test('sidebar ownership matches only the configured offered course and treats admins separately',()=>{
  const offer={productId:9,slug:'opc'},model={user:{id:1,role:'learner'},library:[{slug:'opc'}]};
  assert.equal(sidebarCourseAccess(offer,model),'unlocked');
  assert.equal(sidebarCourseAccess({...offer,slug:'different'},model),'purchase');
  assert.equal(sidebarCourseAccess({...offer,productId:null},model),'purchase');
  assert.equal(sidebarCourseAccess(offer,{...model,library:[]}),'purchase');
  assert.equal(sidebarCourseAccess(offer,{...model,user:{role:'admin'}}),'management');
  assert.equal(sidebarCourseAccess(offer,{...model,loading:true}),'unlocked');
  assert.equal(sidebarCourseAccess(offer,{...model,user:null,loading:true}),'checking');
  assert.equal(sidebarCourseAccess(offer,{...model,error:'failed'}),'checking');
  assert.equal(sidebarCourseAccess(offer,{...model,user:null}),'purchase');
});
test('tutor navigation intent is bounded, single-use, account-bound and never web mode',()=>{
  prepareTutorQuestion('strict render',{accountId:1,courseId:8});assert.equal(peekTutorIntent(1),peekTutorIntent(1));assert.equal(peekTutorIntent(2),null);assert.equal(takeTutorIntent(1).question,'strict render');assert.equal(peekTutorIntent(1),null);
  prepareTutorQuestion('课程问题',{accountId:1,courseId:8});assert.equal(takeTutorIntent(2),null);assert.equal(takeTutorIntent(1),null);
  prepareTutorQuestion('x'.repeat(4100),{accountId:1,courseId:8});
  const intent=takeTutorIntent(1);assert.equal(intent.question.length,4000);assert.equal(intent.courseId,8);assert.equal(intent.mode,undefined);assert.equal(takeTutorIntent(1),null);
  prepareTutorQuestion('preview',{accountId:1,courseId:-1});assert.equal(takeTutorIntent(1).courseId,null);
  prepareTutorQuestion('unbound');assert.equal(takeTutorIntent(1),null);
});
