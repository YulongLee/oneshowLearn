import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courseLearningPath,learningSlug,readingProgress,nextReadingItem} from '../src/course-reader-model.js';
import {activeWorkspaceNav} from '../src/workspace-navigation.js';
import {HOME_CARDS,homepageCards} from '../server/homepage-cards.mjs';
import {discoveryProgress,projectDuration,currentProject,projectLearningSummary} from '../src/project-discovery-model.js';
import {projectStudyEntry,studyMaterials} from '../src/project-study-model.js';
import {mediaTime,seekTime,playbackRate} from '../src/player-model.js';
const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('shared video controls clamp seeks and validate remembered playback preferences',()=>{
  assert.equal(mediaTime(65.8),'01:05'); assert.equal(mediaTime(3665),'1:01:05');
  assert.equal(mediaTime(NaN),'00:00'); assert.equal(mediaTime(-2),'00:00');
  assert.equal(seekTime(-10,22),0); assert.equal(seekTime(900,22),22);
  assert.equal(seekTime(10,Infinity),0); assert.equal(seekTime(NaN,22),0);
  assert.equal(playbackRate('1.5'),1.5); assert.equal(playbackRate('bad'),1); assert.equal(playbackRate(100),1);
  const player=source('LearningVideoPlayer.jsx'),page=source('LessonWorkspace.jsx');
  assert.match(player,/playsInline/); assert.match(player,/automaticRetry.current/);
  assert.match(player,/onPause=[\s\S]*onSave\(\)/); assert.match(player,/onKeyDown=\{keyDown\}/);
  assert.match(page,/<LearningVideoPlayer/); assert.doesNotMatch(page,/className="ls-media-tools"/);
  assert.match(page,/const materialTabs = \{ file: "资料" \}/);
});

test('courses omit practice tabs and panels while projects retain them, including pending courses',()=>{
  const page=source('LessonWorkspace.jsx'),pending=source('CourseLearningSpace.jsx');
  assert.match(page,/const materialTabs = \{ file: "资料" \}/);
  assert.match(page,/!isCourse && <button aria-pressed=\{contentTab==='experiment'\}/);
  assert.match(page,/<Flask size=\{19\}\/>实验/);
  assert.match(page,/!isCourse && \["tasks", "operations"\]\.includes\(tab\)/);
  assert.match(page,/!isCourse && tab === "tasks" \?/);
  assert.match(page,/!isCourse && tab === "operations" \?/);
  assert.match(pending,/\["课件", "资料"\]\.map/);
  assert.doesNotMatch(pending,/"实践"/);
});

test('unified study materials filter article code prompt and attachment without copying content',()=>{
  const rows=[{role:'article'},{role:'code'},{role:'prompt'},{role:'file',resource_url:'/private/file'}];
  for(const role of ['article','code','prompt']) assert.deepEqual(studyMaterials(rows,'file',true,role),rows.filter(row=>row.role===role));
  assert.deepEqual(studyMaterials(rows,'file',true,'all'),rows);
});

test('project discovery uses account progress and truthful configured duration',()=>{
  assert.deepEqual(discoveryProgress([]),{started:0,completed:0,pending:0});
  assert.deepEqual(discoveryProgress([{progress:{percent:0}},{progress:{percent:32}},{progress:{percent:100}}]),{started:1,completed:1,pending:1});
  assert.equal(projectDuration(0),'待配置');assert.equal(projectDuration(undefined),'待配置');
  assert.equal(projectDuration(45),'45 分钟');assert.equal(projectDuration(90),'1.5 小时');
});

test('editorial project discovery retains CMS filters and study routes without a duplicate AI rail',()=>{
  const page=source('ProjectDiscovery.jsx'),hub=source('ProjectsHub.jsx'),css=source('workspace-responsive.css');
  assert.match(page,/project\.lessonCount/);assert.match(page,/project\.pptCount/);assert.match(page,/project\.promptCount/);
  assert.match(page,/categories\.slice\(0,6\)/);assert.match(page,/setQuery\(e\.target\.value\)/);
  assert.match(page,/await onOpen\(project\)/);
  assert.match(hub,/projectStudyEntry\(project,Boolean\(model.user\)\)/);
  assert.doesNotMatch(page,/useAiCapabilities|prepareTutorQuestion|pd-rail/);
  assert.match(page,/继续你的项目/);assert.match(page,/pd-equal-grid/);
  assert.match(hub,/setCategories\(d\.categories\)/);assert.match(hub,/setMineStatus\("error"\)/);
  assert.match(css,/@container project-catalog \(max-width:780px\)/);assert.match(css,/@container project-catalog \(max-width:520px\)/);
  assert.doesNotMatch(page,/2\.3k|12\.4k|32%|3\/5/);
});

test('project cards use an equal grid without suppressing or featuring CMS records',()=>{
  const page=source('ProjectDiscovery.jsx');
  assert.match(page,/data.items.map\(project=><ProjectCard/);
  assert.doesNotMatch(page,/pd-featured|pd-editorial-grid|featured=/);
  assert.match(page,/探索项目/);assert.match(page,/className="pd-card-action"/);
  const css=source('project-editorial.css');
  assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);
});

test('continuation uses private project runs and actual lesson completion, not acceptance percentage',()=>{
  assert.equal(currentProject([{id:1,progress:{percent:30}}]),null);
  const done={id:1,run:{id:1},progress:{percent:100}},active={id:2,run:{id:2},progress:{percent:50},stages:[{lessons:[{id:10,progress:{completed_at:'date'}},{id:11,locked:true},{id:12}]}]};
  assert.equal(currentProject([done,active]),active);assert.equal(currentProject([done]),done);
  assert.deepEqual(projectLearningSummary(active),{total:3,completed:1,percent:33,next:active.stages[0].lessons[2]});
  assert.deepEqual(projectLearningSummary(null),{total:0,completed:0,percent:0,next:null});
});

test('project card opens shared study while preserving locked, preview and empty entry rules',()=>{
  const project={slug:'test-project',entitled:true,stages:[{lessons:[{id:8,is_preview:false}]}]};
  assert.deepEqual(projectStudyEntry(project,true),{path:'/projects/test-project/workspace',start:true});
  assert.equal(projectStudyEntry({...project,run:{id:1}},true).start,false);
  assert.deepEqual(projectStudyEntry({...project,entitled:false},true),{path:'/projects/test-project',start:false});
  assert.equal(projectStudyEntry(project,false).path,'/projects/test-project');
  assert.equal(projectStudyEntry({...project,stages:[]},true).start,false);
  assert.deepEqual(projectStudyEntry({...project,entitled:false,stages:[{lessons:[{id:8,is_preview:true}]}]},false),{path:'/projects/test-project/preview/8',start:false});
});

test('project materials contain inline Codex prompts and file filters without hiding course material types',()=>{
  const materials=[{role:'prompt',body:'Codex instruction',resource_url:''},{role:'article',body:'说明'},{role:'file',resource_url:'/api/materials/1'}];
  assert.deepEqual(studyMaterials(materials,'file',true),materials);
  assert.deepEqual(studyMaterials(materials,'file',true,'prompt'),[materials[0]]);
  assert.deepEqual(studyMaterials(materials,'file',true,'files'),[materials[2]]);
  assert.deepEqual(studyMaterials(materials,'file',false),[materials[2]]);
  assert.deepEqual(studyMaterials(materials,'prompt',false),[materials[0]]);
  const page=source('LessonWorkspace.jsx');
  assert.match(page,/项目资料分类/);assert.match(page,/Codex 提示词/);
  assert.match(page,/className="ls-layout cl-course-layout"/);
  assert.match(page,/\.writeText\(m.body\)/);
});

test('homepage cards preserve approved artwork and copy independently of course catalogue',()=>{
  const cards=homepageCards({courses:[{title:'Unrelated CMS title',cover_url:'/raw-screenshot.png'}],courseIds:[123]});
  assert.equal(cards.length,4);
  assert.deepEqual(cards.map(c=>c.image),HOME_CARDS.map(c=>c.image));
  assert.deepEqual(cards.map(c=>c.title),HOME_CARDS.map(c=>c.title));
  assert.deepEqual(cards.map(c=>c.path),['/opc','/paths','/paths','/paths']);
  assert.ok(cards.every(c=>c.lessons==='学习方向'));
  const linked=homepageCards({hotCourseCards:HOME_CARDS.map((c,i)=>({...c,course:i===0?{slug:'real-course',contentCount:3}:null}))});
  assert.equal(linked[0].path,'/packs/real-course');assert.equal(linked[0].lessons,'3 项资料');
  assert.equal(linked[0].image,HOME_CARDS[0].image);assert.equal(linked[0].title,HOME_CARDS[0].title);
  assert.doesNotMatch(source('PublicHomepage.jsx'),/site\.courses\.map|course\.cover_url/);
});

test('public homepage shows the owner ICP number as an official accessible footer link',()=>{
  const homepage=source('PublicHomepage.jsx');
  assert.match(homepage,/<footer[^>]*className="sales-footer"[^>]*>[\s\S]*<a className="sales-icp-link" href="https:\/\/beian\.miit\.gov\.cn\/" target="_blank" rel="noopener noreferrer"[^>]*>浙ICP备2026052190号-4<\/a><\/footer>/);
  const css=source('homepage.css');
  assert.match(css,/\.sales-footer \{[^}]*align-items: center/);
  assert.match(css,/\.sales-footer \.sales-icp-link:focus-visible/);
});

test('course learning URLs preserve legacy links and support every CMS slug',()=>{
  assert.equal(learningSlug('/learn/cursor'),'cursor-first-site');
  assert.equal(learningSlug('/learn/ai-toolkit/'),'ai-toolkit');
  assert.equal(learningSlug(courseLearningPath('中文课程')),'中文课程');
  assert.equal(learningSlug('/learn/%invalid'),null);
  assert.equal(learningSlug('/packs/test'),null);
  assert.equal(activeWorkspaceNav('/learn/cursor'),'/opc');
  assert.equal(activeWorkspaceNav('/learn/ai-toolkit'),'/opc');
});
test('reader progress and next item derive exclusively from published account metadata',()=>{
  assert.deepEqual(readingProgress(),{total:0,completed:0,percent:0});
  assert.equal(nextReadingItem(),null);
  const chapters=[{items:[{id:1,locked:true},{id:2,progress:'completed'},{id:3,progress:'started'}]}];
  assert.deepEqual(readingProgress(chapters),{total:3,completed:1,percent:33});
  assert.equal(nextReadingItem(chapters).id,3);
  assert.equal(nextReadingItem([{items:[{id:1,locked:true}]}]),null);
  assert.equal(nextReadingItem([{items:[{id:2,progress:'completed'}]}]).id,2);
});
test('the legacy demo is retired and every course detail reaches the shared reader',()=>{
  const app=source('App.jsx');
  assert.doesNotMatch(app,/function LearningWorkspace|35 \+ completed|阅读功能完善中/);
  assert.match(app,/navigate\(courseLearningPath\(pack.slug\)\)/);
  assert.match(app,/learningSlug\(route\)[\s\S]*?<CourseReader/);
  const reader=source('CourseReader.jsx');
  assert.match(reader,/\/me\/progress\//);
  assert.match(reader,/resource_url/);
  assert.match(reader,/metadata.locked/);
  assert.match(reader,/revision!==request.current/);
});
test('workbench prioritizes course/project continuation, private tools and responsive phases',()=>{
  const workbench=source('Workbench.jsx');
  assert.ok(workbench.indexOf('<ProductHero model=')<workbench.indexOf('<PersonalProducts items='));
  assert.ok(workbench.indexOf('<PersonalProducts items=')<workbench.indexOf('className="wd-panel wd-recommendations"'));
  assert.match(workbench,/phaseState\(extra.phases.find/);
  assert.match(workbench,/currentProductAchievement\(items\)/);
  assert.ok(workbench.indexOf('<TutorPanel model=')<workbench.indexOf('<LearningCalendar model='));
  assert.match(source('workbench-product.css'),/@container learner \(max-width:1050px\)/);
  assert.match(workbench,/className="wd-panel wd-tasks"/);
  assert.match(workbench,/实时回答未接入/);
  assert.doesNotMatch(workbench,/wb-hero|method:\s*['"]POST['"]/);
  assert.match(workbench,/recommendations.length>0\|\|extra.loading\|\|extra.errors.projects/);
  const routes=source('LearningRoutes.jsx');
  assert.match(routes,/aria-expanded=\{expanded\}/);
  assert.match(routes,/expandedPhase===null\?data.current/);
  const css=source('workspace-responsive.css');
  assert.match(css,/\.lr-stage-body:not\(\.is-expanded\) \{ display:none/);
  assert.match(css,/\.nt-toolbar button \{ min-width:44px; min-height:44px/);
  assert.match(source('NotesWorkspace.jsx'),/className="nt-save"[^>]*onClick=\{save\}/);
});
test('public search uses published catalog and community navigation is accurate',()=>{
  const page=source('PublicHomepage.jsx');
  assert.match(page,/api\('\/catalog\/workspace'\)/);
  assert.match(page,/aria-label="课程搜索结果"/);
  assert.match(page,/navigate\(['"]\/community['"]\)\}>学习社区/);
});
