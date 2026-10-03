import assert from "node:assert/strict";
import test from "node:test";
import { calendarMonth, learningEntries, recentStudyItems, currentProject, currentProductAchievement, phaseState, watchPercent } from "../src/workbench-model.js";

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
