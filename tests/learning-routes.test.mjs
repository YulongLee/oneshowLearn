import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { routeOverview, coursePhasePath, phaseFromPath } from '../src/learning-route-model.js';
import {chooseContinueLesson, chooseEntry, courseEntryRoute, entryLessonPath} from '../src/course-entry-model.js';
import {completeLogin, safeLoginReturn} from '../src/platforms.js';

test('learning route derives progress only from published account curriculum', () => {
  const empty = routeOverview();
  assert.equal(empty.phases.length, 5);
  assert.deepEqual(empty.progress, {completed:0,total:0,percent:0});
  assert.equal(empty.completedPhases,0);
  const data=routeOverview([{id:1,items:[{id:1,progress:'completed'}]},{id:2,items:[{id:2,progress:'started'},{id:3,progress:null}]},{id:3,items:[{id:4,locked:true}]}]);
  assert.deepEqual(data.progress,{completed:1,total:4,percent:25});
  assert.equal(data.completedPhases,1);
  assert.equal(data.current,2);
  assert.equal(data.phases[3].items.length,0);
});

test('roadmap is an overview, not a second course player or dashboard', () => {
  const source=readFileSync(new URL('../src/LearningRoutes.jsx',import.meta.url),'utf8');
  assert.match(source,/phase\.goals\.map/);
  assert.match(source,/coursePhasePath\(id\)/);
  assert.match(source,/routeOverview\(curriculum\)/);
  assert.doesNotMatch(source,/api\('\/opc\/curriculum'\)/);
  assert.match(source,/api\('\/catalog\/paths'\)/);
  assert.doesNotMatch(source,/lr-calendar|lr-tasks|lr-tutor|lr-projects|phase\.items\.map/);
});

test('course space keeps study actions and explicit phase navigation ahead of discovery', () => {
  const source=readFileSync(new URL('../src/CourseLearningSpace.jsx',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../src/Workspace.jsx',import.meta.url),'utf8');
  assert.match(source,/<LessonWorkspace/);
  assert.match(source,/<CourseDirectory/);
  assert.match(source,/chooseEntry\(state.entryData/);
  assert.match(source,/cl-video-empty/);
  assert.match(source,/onLegacy:/);
  assert.match(app,/<CourseLearningSpace\s+route=\{route\}/);
  assert.doesNotMatch(app,/<OpcLearning/);
  assert.match(shell,/\["\/opc", "学习课程", BookOpenText\]/);
  assert.doesNotMatch(shell,/\["\/paths", "学习路线图"/);
});

test('legacy paths opens the roadmap inside the same course space with shared curriculum', () => {
  const source=readFileSync(new URL('../src/CourseLearningSpace.jsx',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(app,/route === ["']\/opc["']\s*\|\|\s*route === ["']\/paths["']\s*\|\|\s*route.startsWith\(["']\/opc\/["']\)/);
  assert.match(source,/setRoadmapOpen\(route === ["']\/paths["']\)/);
  assert.doesNotMatch(app,/<LearningRoutes/);
  assert.match(source,/className="cl-roadmap-disclosure"\s+open=\{roadmapOpen\}/);
  assert.match(source,/curriculum=\{state.curriculum\?\.phases \|\| \[\]\}/);
});

test('learning route chooses accessible work and keeps phase deep links valid', () => {
  assert.equal(routeOverview([{id:1,items:[{locked:true}]},{id:4,items:[{id:2}]}]).current,4);
  for(let phase=1;phase<=5;phase++) assert.equal(phaseFromPath(coursePhasePath(phase)),phase);
  for(const invalid of ['/opc/phase/0','/opc/phase/6','/opc/phase/x','/paths/ai-product','/opc/phase/2/more']) assert.equal(phaseFromPath(invalid),null);
  assert.equal(coursePhasePath(9),'/opc');
  assert.equal(phaseFromPath('/opc/phase/3/'),3);
});

const entryFixture=()=>({courses:[{id:1,slug:'owned',entitled:true},{id:2,slug:'discovery',entitled:false}],chapters:[{id:1,pack_id:1,phase:1},{id:2,pack_id:1,phase:2}],lessons:[{id:1,kind:'course',owner_id:2,owner_slug:'discovery',phase:1,locked:false},{id:2,kind:'course',owner_id:1,owner_slug:'owned',phase:2,locked:false},{id:3,kind:'course',owner_id:1,owner_slug:'owned',phase:1,locked:true}]});
test('directory toggle stores previous open state as next closed state',()=>{
  const ui=readFileSync(new URL('../src/CourseLearningUi.jsx',import.meta.url),'utf8');
  // Exercise the actual updater, not a second implementation of the toggle.
  const updater=ui.match(/setClosed\(\(v\) => \(\{ \.\.\.v, \[g\.id\]: ([^}]+) \}\)\)/);
  assert.ok(updater,'Chapter toggle updater must be covered');
  const nextClosed=new Function('open',`return (${updater[1]});`);
  for(const initialOpen of [true,false]){
    let open=initialOpen;
    for(let click=0;click<4;click++){
      const nextOpen=!nextClosed(open);
      assert.equal(nextOpen,!open,'Each click must change expanded state');open=nextOpen;
    }
    assert.equal(open,initialOpen);
  }
  assert.match(ui,/\[current.chapter_id \|\| current.stage_id\]: false/,'Current lesson chapter remains expanded on navigation');
});
test('course entry prefers entitled unfinished study, resumes actual history and respects explicit links',()=>{
  const data=entryFixture();
  assert.equal(chooseEntry(data).lesson.id,2);
  data.lessons[0].progress={version:1,updated_at:'2026-09-29',completed_at:null};
  assert.equal(chooseEntry(data).lesson.id,1);
  data.lessons[0].progress.completed_at='2026-09-29';
  assert.equal(chooseEntry(data).lesson.id,2);
  assert.equal(chooseEntry(data,'/opc/lessons/3').lesson.locked,true);
  assert.equal(chooseEntry(data,'/opc/course/owned').course.id,1);
  assert.equal(chooseEntry(data,'/opc/phase/2').lesson.id,2);
  assert.equal(chooseEntry(data,'/opc/phase/5').lesson,null);
  assert.equal(entryLessonPath(data.lessons[1]),'/opc/lessons/2');
});

test('course reader and course entry share the same stable, account-metadata-only continuation rule',()=>{
  const course={id:7,slug:'same-course',entitled:true};
  const lesson=(id,progress,locked=false)=>({id,owner_id:course.id,owner_slug:course.slug,kind:'course',locked,progress});
  const lessons=[lesson(1),lesson(2,{version:1,updated_at:'2026-10-20',completed_at:'2026-10-20'}),lesson(3,{version:2,updated_at:'2026-10-19'}),lesson(4,{version:3,updated_at:'2026-10-21'},true)];
  const before=structuredClone(lessons),data={courses:[course],lessons};
  assert.equal(chooseContinueLesson(lessons).id,3);
  assert.equal(chooseEntry(data,'/opc/course/same-course').lesson.id,chooseContinueLesson(lessons).id);
  assert.equal(chooseEntry(data,'/opc/lessons/1').lesson.id,1,'an explicit deep link still wins over recent study');
  assert.equal(chooseEntry(data,'/opc/lessons/4').lesson.id,4,'an explicit locked link is not silently substituted');
  assert.deepEqual(lessons,before,'sorting must never mutate the supplied catalogue or progress');
  const completed=lessons.map(l=>({...l,progress:{...l.progress,completed_at:'2026-10-22'}}));
  assert.equal(chooseContinueLesson(completed).id,2,'all complete resumes the latest readable record');
  assert.equal(chooseContinueLesson([lesson(9),lesson(10)]).id,9,'no history begins with the first readable lesson');
  assert.equal(chooseContinueLesson([lesson(9,null,true),lesson(10,null,true)]).id,9,'locked-only catalogue retains its truthful access state');
  assert.equal(chooseContinueLesson(),null);
  const tied=[lesson(11,{version:1,updated_at:'2026-10-21'}),lesson(12,{version:2,updated_at:'2026-10-21'})];
  assert.equal(chooseContinueLesson(tied).id,11,'equal timestamps retain catalogue order');
  const reader=readFileSync(new URL('../src/CourseReader.jsx',import.meta.url),'utf8');
  assert.match(reader,/placementId \|\| chooseContinueLesson\(catalog\?\.lessons\)/);
  assert.match(reader,/\[placementId,catalog\?\.course\]/,'implicit entry remains stable across progress-only updates');
  assert.match(reader,/catalog.lessons.find\(l=>l.id===currentId\)/);
});
test('missing entries stay empty and never invent a course or silently substitute another lesson',()=>{
  assert.equal(chooseEntry({}).lesson,null);
  assert.equal(chooseEntry({}).course,null);
  assert.equal(chooseEntry(entryFixture(),'/opc/lessons/99').missing,true);
  assert.equal(chooseEntry(entryFixture(),'/opc/course/missing').missing,true);
  assert.equal(chooseEntry(entryFixture(),'/opc/course/missing').lesson,null);
  assert.equal(courseEntryRoute('/opc/phase/2').phase,2);
  assert.equal(courseEntryRoute('/opc/phase/2/').phase,2);
  assert.equal(courseEntryRoute('/opc/phase/6').phase,null);
});

test('courses, plan and certificates use the existing safe login return contract',()=>{
  const page=readFileSync(new URL('../src/WorkspacePages.jsx',import.meta.url),'utf8');
  assert.match(page,/`\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`/);
  assert.match(page,/returnTo=\{favorites \? undefined : '\/courses'\}/);
  assert.match(page,/returnTo="\/plan"/);
  assert.match(page,/navigate\("\/login\?returnTo=%2Fcertificates"\)/);
  assert.doesNotMatch(page,/\/login\?next=/);
  const user={role:'learner'};
  for(const path of ['/courses','/plan','/certificates']){
    assert.equal(safeLoginReturn(path,'user',user),path);
    const visited=[];
    completeLogin({token:'isolated-only',user},{saveToken:()=>{},navigate:value=>visited.push(value),returnTo:path});
    assert.deepEqual(visited,[path]);
  }
});

test('latest learning reference keeps global navigation and an independent responsive directory',()=>{
  const lesson=readFileSync(new URL('../src/LessonWorkspace.jsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/CourseLearningUi.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-learning-space.css',import.meta.url),'utf8');
  assert.match(lesson,/useLearningFocus\(false\)/);
  assert.match(lesson,/<DirectorySlot inline>/);
  assert.match(ui,/InlineCourseDirectory/);
  assert.match(ui,/ResizeObserver/);
  assert.match(css,/\.cl-course-page \.ls-layout\.cl-course-layout/);
  assert.doesNotMatch(css,/@container learner \(max-width:\s*1160px\)/);
  assert.match(css,/@container learner \(max-width:\s*960px\)/);
  assert.match(css,/@container learner \(max-width:\s*760px\)/);
  assert.match(ui,/entry.contentRect.width <= 960/);
  assert.doesNotMatch(lesson,/dialog.current.show\(\)/);
});

test('course study fills ultrawide workspace without changing unrelated page geometry',()=>{
  const shell=readFileSync(new URL('../src/workspace-shell.css',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-learning-space.css',import.meta.url),'utf8');
  assert.match(shell,/\.ws-unified-layout \.ws-content \{[^}]*max-width:1840px/);
  assert.match(shell,/\.ws-unified-layout \.ws-content:has\(\.cl-course-page\) \{[^}]*max-width:none;[^}]*margin-inline:0/);
  assert.match(css,/grid-template-columns:\s*clamp\(200px, 17cqi, 280px\) minmax\(0, 1fr\) clamp\(280px, 24cqi, 400px\)/);
  assert.match(css,/max-height:\s*min\(68dvh, 780px\)/);
  assert.match(css,/\.cl-study-page:not\(\.cl-course-page\) \.ls-notes-frame/);
});

test('course study keeps directory/materials only and removes redundant return and onboarding controls',()=>{
  const ui=readFileSync(new URL('../src/CourseLearningUi.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/CourseLearningSpace.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/返回我的课程/);
  assert.match(ui,/课程目录/);assert.match(ui,/课程资料/);
  assert.match(ui,/isProject \|\| tab === "files"/);
  assert.match(ui,/context\?\.courses\?\.length > 1/);
  assert.doesNotMatch(page,/你的学习空间已就绪|查看我的课程|查看已有学习笔记/);
  assert.match(page,/roadmapOpen \|\| route === "\/paths"/);
  assert.match(page,/cl-video-empty/);assert.match(page,/cl-courseware-empty/);
  assert.match(page,/选择可访问的课时后，可结合课程资料提问和整理笔记/);
});

test('reference course reader separates private notes below video and grounded assistant in the rail',()=>{
  const page=readFileSync(new URL('../src/LessonWorkspace.jsx',import.meta.url),'utf8');
  const frame=readFileSync(new URL('../src/CourseStudyFrame.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-study-reference.css',import.meta.url),'utf8');
  const directory=readFileSync(new URL('../src/CourseLearningUi.jsx',import.meta.url),'utf8');
  assert.match(page,/const Layout = CourseStudyFrame/);
  assert.match(page,/variant="rail"/);
  assert.match(page,/本阶段/);
  assert.match(page,/footer && <div hidden=\{!isCourse && contentTab !== 'experiment'\}/);
  assert.match(page,/hidden=\{contentTab!=='notes'\}/); // hide without unmounting autosave/editor
  assert.match(page,/notesOnly revision=\{notesRevision\}/);
  assert.match(page,/compact onNote=\{\(\)=>setNotesRevision/);
  assert.match(page,/\/learning\/placements\/\$\{lesson.id\}\/ai/);
  assert.match(page,/cs-resource-list/); assert.match(page,/cs-slide-preview/);
  assert.match(directory,/items.slice\(0,5\)/);
  assert.match(directory,/findIndex\(l => l.id === currentId\) >= 5/);
  for(const feature of ['setPointerCapture','onPointerCancel','onLostPointerCapture','aria-valuenow','Escape','localStorage']) assert.ok(frame.includes(feature));
  assert.match(css,/@container courseStudy \(max-width:960px\)/);
  assert.match(css,/\.cs-course-page \[hidden\]/);
});
