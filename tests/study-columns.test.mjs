import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studyColumns,studyPreferences,resizedStudyColumn} from '../src/study-columns-model.js';
import {coursePanelPreferences,toggleCoursePanel} from '../src/course-study-preferences.js';
test('course panel preferences default safely and preserve independent hidden choices',()=>{
  for(const bad of [undefined,null,{},'broken',[],{directory:'false',assistant:0}]) assert.deepEqual(coursePanelPreferences(bad),{directory:true,assistant:true});
  const start={directory:true,assistant:true};
  const directoryOff=toggleCoursePanel(start,'directory');
  assert.deepEqual(start,{directory:true,assistant:true});
  assert.deepEqual(directoryOff,{directory:false,assistant:true});
  const bothOff=toggleCoursePanel(directoryOff,'assistant');
  assert.deepEqual(coursePanelPreferences(JSON.parse(JSON.stringify(bothOff))),{directory:false,assistant:false});
  assert.deepEqual(toggleCoursePanel(bothOff,'directory'),{directory:true,assistant:false});
  assert.deepEqual(toggleCoursePanel(bothOff,'invalid'),bothOff);
});
test('course controls keep hidden panels mounted and constrain a real 16:9 player without cropping',()=>{
  const component=readFileSync(new URL('../src/CourseStudyFrame.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-study-reference.css',import.meta.url),'utf8');
  assert.match(component,/hidden=\{!panels.directory\}>\{parts\[0\]\}/);
  assert.match(component,/hidden=\{!panels.assistant\}>\{parts\[2\]\}/);
  assert.match(component,/aria-controls=\{`\$\{panelId\}-\$\{key\}`\}/);
  assert.match(component,/data-rail-hidden=\{!hasRail/);
  assert.match(component,/localStorage.setItem\(COURSE_PANELS_KEY/);
  assert.match(css,/width:min\(100%,1120px,calc\(65dvh \* 16 \/ 9\)\); aspect-ratio:16\/9; height:auto; min-height:0; max-height:none/);
  assert.doesNotMatch(css,/aspect-ratio:21\/9/);
  assert.match(css,/\.cs-layout\[data-rail-hidden\] \{ grid-template-columns:minmax\(0,1fr\)/);
});
test('study width preferences are bounded and recover from missing or corrupt values',()=>{
  assert.deepEqual(studyPreferences(),{directory:null,notes:null});
  assert.deepEqual(studyPreferences({directory:-10,notes:9999}),{directory:200,notes:720});
  assert.deepEqual(studyPreferences({directory:'300',notes:Infinity}),{directory:null,notes:null});
  assert.deepEqual(studyPreferences({directory:270.7,notes:390.2}),{directory:271,notes:390});
});
test('study columns preserve 400px reading width as the available workspace changes',()=>{
  for(const width of [761,800,960,961,1000,1200,1440,1920,2560,3440]){
    for(const preferences of [{},{directory:440,notes:720},{directory:200,notes:280}]){
      const v=studyColumns(width,preferences);
      const center=width-v.notes-v.gap-(v.mode==='full'?v.directory+v.gap:0);
      assert.ok(center>=400,`${width}: ${center}`);assert.ok(v.notes>=280);assert.ok(v.directory>=200);
      assert.ok(v.notes<=720);assert.ok(v.directory<=440);
    }
  }
});
test('separators clamp drag and keyboard changes without overwriting preferred widths',()=>{
  const preferred={directory:440,notes:720},v=studyColumns(1100,preferred);
  assert.equal(resizedStudyColumn(v,'notes',-1),280);
  assert.equal(resizedStudyColumn(v,'notes',10000),v.notesMax);
  assert.equal(resizedStudyColumn(v,'directory',10000),v.directoryMax);
  assert.deepEqual(preferred,{directory:440,notes:720});
  const wide=studyColumns(2200,preferred);assert.equal(wide.notes,720);assert.equal(wide.directory,440);
});
test('responsive study modes keep small devices stacked and share the layout across readers',()=>{
  assert.equal(studyColumns(760).mode,'stacked');assert.equal(studyColumns(761).mode,'notes');
  assert.equal(studyColumns(960).mode,'notes');assert.equal(studyColumns(961).mode,'full');
  assert.match(readFileSync(new URL('../src/LessonWorkspace.jsx',import.meta.url),'utf8'),/const Layout = CourseStudyFrame/);
  assert.match(readFileSync(new URL('../src/CourseLearningSpace.jsx',import.meta.url),'utf8'),/<CourseStudyFrame/);
  const component=readFileSync(new URL('../src/StudyColumns.jsx',import.meta.url),'utf8');
  for(const feature of ['setPointerCapture','onPointerCancel','onLostPointerCapture','aria-valuenow','Escape','ResizeObserver','localStorage','恢复默认布局'])assert.ok(component.includes(feature));
});
