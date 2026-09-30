// Owner-approved, scoped CMS publication. No SQL content writes or account fixtures.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const demoCategories = [
  {index:0,slug:'saas',name:'AI SaaS',stack:['React','FastAPI','RAG'],summary:'以 AI 面试助手为例，演示需求梳理、页面开发与模型接入的学习流程。'},
  {index:1,slug:'tools',name:'工具网站',stack:['Next.js','SEO','工具导航'],summary:'以 AI 工具聚合站为例，演示工具分类、搜索和内容管理的项目结构。'},
  {index:2,slug:'mobile',name:'移动 App',stack:['React Native','AI 识别','移动端'],summary:'以健康饮食记录 App 为例，演示移动端页面、记录表单与 AI 功能规划。'},
  {index:5,slug:'agent',name:'AI Agent',stack:['Python','Agent','工作流'],summary:'以 AI Agent 工作流为例，演示任务拆解、工具调用和执行结果验收。'},
  {index:4,slug:'mini',name:'小程序',stack:['小程序','云开发','AI'],summary:'以微信 AI 小程序为例，演示页面搭建、云端数据和上线检查流程。'},
];
const notice='演示内容，非正式教学课程。当前共用 22 秒流程演示视频、2 页课件预览和示例 Prompt，后续由管理员替换真实资料；不代表完整项目源码或正式课程交付。';
const pick=(obj,keys)=>Object.fromEntries(keys.split(' ').map(k=>[k,obj[k]]));

export async function publishDemoProjects({base,email,password,importManifest,journalPath}) {
  assert.equal(importManifest.base,base,'Import manifest belongs to another API');
  const ids=importManifest.records;
  const journal=existsSync(journalPath)?JSON.parse(readFileSync(journalPath)):{base,done:{}};
  assert.equal(journal.base,base);
  const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});
  let token;
  async function req(route,method='GET',body,version,anonymous=false) {
    const r=await fetch(base+route,{method,signal:AbortSignal.timeout(30000),headers:{...(!anonymous&&token?{authorization:`Bearer ${token}`} : {}),...(body?{'content-type':'application/json'}:{}),...(version!==undefined?{'if-match':String(version)}:{})},body:body?JSON.stringify(body):undefined});
    const value=await r.json();assert.ok(r.ok,`${method} ${route}: ${r.status} ${value.error||''}`);return value;
  }
  token=(await req('/auth/login','POST',{email,password})).token;
  const snapshot=await req('/admin/learning/snapshot');
  const projects=(await req('/admin/platform/projects')).items;
  let {pack,steps}=await req(`/admin/cms/packs/${ids.course}`);
  assert.equal(pack.slug,'demo-learning-20260930');
  assert.ok(pack.title.startsWith('【演示】'));
  for(const spec of demoCategories) {
    const p=projects.find(p=>p.id===ids[`project${spec.index}`]);
    assert.equal(p?.slug,`demo-project-20260930-${spec.index+1}`);
    assert.ok(p.title.startsWith('【演示】'));assert.deepEqual(p.courseIds,[ids.course]);
    assert.equal(snapshot.stages.find(s=>s.id===ids[`stage${spec.index}`])?.project_id,p.id);
    const placement=snapshot.placements.find(p=>p.id===ids[`placement${spec.index}`]);
    assert.equal(placement?.stage_id,ids[`stage${spec.index}`]);assert.equal(placement.lesson_id,ids.lesson);
  }
  const lesson=snapshot.lessons.find(l=>l.id===ids.lesson);
  assert.ok(lesson?.title.startsWith('【演示】'));assert.equal(lesson.config.videoAssetId,importManifest.assets.video.id);
  const run=async(key,fn)=>{if(journal.done[key])return;journal.done[key]=await fn()||true;save();};
  // Shared dependencies before exposing any project card.
  await run('prompt',async()=>{
    const l=(await req('/admin/platform/library')).items.find(l=>l.id===ids.prompt);
    assert.ok(l.title.startsWith('【演示】'));
    await req(`/admin/platform/library/${l.id}`,'PUT',{...pick(l,'title type resource_url duration_seconds'),status:'published',body:`${notice}\n\n示例 Prompt：\n请先阅读项目结构，根据目标用户与核心场景列出 MVP 功能、页面、数据字段和验收步骤。未经确认不要修改代码；不要编造支付、AI 或部署成功的结果。`},l.version);
  });
  await run('lesson',()=>req(`/admin/learning/lessons/${lesson.id}`,'PUT',{title:lesson.title,subtitle:notice,status:'published',config:lesson.config},lesson.version));
  const chapter=steps.find(s=>s.id===ids.chapter);assert.equal(chapter.pack_id,pack.id);
  await run('chapter',()=>req(`/admin/cms/steps/${chapter.id}`,'PUT',{...pick(chapter,'pack_id title sort_order phase'),summary:notice,status:'published'},chapter.version));
  await run('course-prompt-reference',async()=>{
    const current=await req(`/admin/cms/packs/${ids.course}`);
    const attached=current.steps.find(s=>s.id===chapter.id).items.find(i=>i.library_id===ids.prompt);
    if(attached){assert.equal(attached.status,'published');return attached.id;}
    const result=await req(`/admin/platform/library/${ids.prompt}/attach`,'POST',{stepId:chapter.id,isPreview:true,status:'published',sortOrder:0});return result.id;
  });
  await run('course-placement',async()=>{
    const p=snapshot.placements.find(p=>p.id===ids.coursePlacement);assert.equal(p.chapter_id,chapter.id);
    await req(`/admin/learning/placements/${p.id}`,'PUT',{...pick(p,'lesson_id chapter_id stage_id sort_order materials'),is_preview:true,status:'published'},p.version);
  });
  await run('course',()=>req(`/admin/cms/packs/${pack.id}`,'PUT',{...pick(pack,'path_id slug title subtitle deliverable cover_url price_cents estimated_minutes sort_order'),description:notice,is_featured:false,status:'published'},pack.version));
  for(const [order,spec] of demoCategories.entries()) {
    let categories=(await req('/admin/learning/snapshot')).categories;
    let category=categories.find(c=>c.slug===spec.slug);
    if(!category) {
      await req('/admin/learning/categories/0','PUT',{slug:spec.slug,name:spec.name,sort_order:order,is_active:true});
      category=(await req('/admin/learning/snapshot')).categories.find(c=>c.slug===spec.slug);
    }
    assert.ok(category.is_active,`Category ${spec.slug} inactive; do not overwrite`);
    const p=projects.find(p=>p.id===ids[`project${spec.index}`]);
    await run(`settings${p.id}`,async()=>{
      const current=(await req('/admin/learning/snapshot')).settings.find(s=>s.project_id===p.id);
      assert.ok(!current,'Unexpected settings; inspect before overwriting');
      await req(`/admin/learning/settings/${p.id}`,'PUT',{category_id:category.id,tech_stack:spec.stack,difficulty:1,estimated_minutes:5,audience:'用于体验项目课程目录、视频、课件和私人笔记流程。',prerequisites:notice,access_type:'free',price_cents:0,is_recommended:false},0);
    });
    const stage=snapshot.stages.find(s=>s.id===ids[`stage${spec.index}`]);
    await run(`stage${p.id}`,()=>req(`/admin/learning/stages/${stage.id}`,'PUT',{...pick(stage,'project_id title checklist sort_order'),description:`${spec.summary}\n\n${notice}`,status:'published'},stage.version));
    const placement=snapshot.placements.find(l=>l.id===ids[`placement${spec.index}`]);
    await run(`placement${p.id}`,()=>req(`/admin/learning/placements/${placement.id}`,'PUT',{...pick(placement,'lesson_id chapter_id stage_id sort_order materials'),is_preview:true,status:'published'},placement.version));
    await run(`project${p.id}`,()=>req(`/admin/platform/projects/${p.id}`,'PUT',{...pick(p,'title slug cover_url category sort_order courseIds'),tags:['演示',...spec.stack],description:`${spec.summary}\n\n${notice}`,deliverable:'演示练习：明确目标用户、列出 MVP 功能、记录验收步骤。非正式产品成果。',status:'published'},p.version));
  }
  for(const spec of demoCategories) {
    const detail=await req(`/learning/projects/demo-project-20260930-${spec.index+1}`,'GET',undefined,undefined,true);
    assert.equal(detail.lessonCount,1);assert.equal(detail.promptCount,1);assert.equal(detail.settings.access_type,'free');
    assert.ok(detail.title.startsWith('【演示】'));
    const filtered=await req(`/learning/projects?category=${detail.settings.category_id}`,'GET',undefined,undefined,true);
    assert.ok(filtered.items.some(p=>p.id===detail.id));
    const content=await req(`/learning/placements/${ids[`placement${spec.index}`]}`);
    assert.ok(content.config.video.url);assert.equal(content.config.slides.length,2);
  }
  const final=await req('/admin/learning/snapshot');
  assert.equal(final.projects.find(p=>p.id===ids.project3)?.status,'draft','Unrequested automation project must stay draft');
  journal.verifiedAt=new Date().toISOString();save();
  console.log('PASS five demonstration project categories published; lessons and materials available; automation stays draft');
  return journal;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2],'--approved-five-demo-projects','Explicit publication approval required');
  process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
  const dir='/var/backups/oneshowlearn/demo-publication-20260930';mkdirSync(dir,{recursive:true,mode:0o700});
  const {DatabaseSync}=await import('node:sqlite');
  if(!existsSync(`${dir}/before-publication.db`)) {
    const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');db.prepare('VACUUM INTO ?').run(`${dir}/before-publication.db`);db.close();
  }
  await publishDemoProjects({base:'http://127.0.0.1:8791/api',email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,
    importManifest:JSON.parse(readFileSync('/var/backups/oneshowlearn/demo-import-20260930/manifest.json')),journalPath:`${dir}/manifest.json`});
}
