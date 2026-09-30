// Explicit owner-approved import, not an application seed. Never imports accounts or learner state.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function importDemo({base, email, password, source, journalPath, pathSlug = 'ai-product'}) {
  const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath)) : {base, assets:{}, records:{}};
  assert.equal(journal.base, base, 'Import journal belongs to another API');
  const save = () => writeFileSync(journalPath, JSON.stringify(journal,null,2), {mode:0o600});
  let token;
  async function request(route, method='GET', body) {
    const multipart = body instanceof FormData;
    const r = await fetch(`${base}${route}`, {method, signal:AbortSignal.timeout(30000),
      headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(!multipart&&body?{'content-type':'application/json'}:{})},
      body:body ? multipart ? body : JSON.stringify(body) : undefined});
    const value = await r.json();
    assert.ok(r.ok, `${method} ${route}: ${r.status} ${value.error||''}`);
    return value;
  }
  token = (await request('/auth/login','POST',{email,password})).token;
  assert.ok(token);
  const cms = await request('/admin/cms/snapshot');
  const learning = await request('/admin/learning/snapshot');
  const assets = (await request('/admin/cms/assets')).items;
  const libraries = (await request('/admin/platform/library')).items;
  const direction = cms.paths.find(p=>p.slug===pathSlug);
  assert.ok(direction, 'Target product direction missing; do not create or alter a direction');
  const slug='demo-learning-20260930';
  const existingCourse=cms.packs.find(p=>p.slug===slug);
  if(existingCourse)assert.equal(existingCourse.id,journal.records.course,'Unowned demo slug already exists; refusing overwrite');
  const materialSpecs = [
    ['video','fixture.mp4','演示资料-20260930-22秒视频.mp4','video/mp4'],
    ['slide1','slide1.webp','演示资料-20260930-课件第1页.webp','image/webp'],
    ['slide2','slide2.webp','演示资料-20260930-课件第2页.webp','image/webp'],
    ['subtitle','a46eb1fc-b33e-4c63-a07c-cc8899c51465.vtt','演示资料-20260930-字幕.vtt','text/vtt'],
  ];
  for(const [key,file,name,mime] of materialSpecs) {
    const bytes=readFileSync(path.join(source,file));
    const digest=createHash('sha256').update(bytes).digest('hex');
    if(journal.assets[key]) {
      assert.equal(journal.assets[key].sha256,digest);
      assert.ok(assets.some(a=>a.id===journal.assets[key].id&&a.original_name===name));
      continue;
    }
    assert.ok(!assets.some(a=>a.original_name===name),'Unjournaled upload exists; inspect before retrying');
    const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),name);
    journal.assets[key]={...await request('/admin/cms/assets','POST',form),sha256:digest};save();
  }
  async function once(key, route, method, payload, item=false) {
    if(journal.records[key])return journal.records[key];
    const response=await request(route,method,payload);
    const id=item?response.item.id:response.id;
    assert.ok(id);journal.records[key]=id;save();return id;
  }
  const disclaimer='演示资料，仅用于页面与学习流程测试，不是正式教学课程；请在后台替换真实视频、课件和内容后再发布。';
  const course=await once('course','/admin/cms/packs','POST',{
    path_id:direction.id,slug,title:'【演示】AI 产品开发课程',subtitle:'视频、课件、笔记与实践流程演示',
    description:disclaimer,deliverable:'演示学习流程，不代表完成或上线真实产品',cover_url:'',price_cents:0,
    estimated_minutes:0,status:'draft',is_featured:false,sort_order:9000,
  },true);
  const chapter=await once('chapter','/admin/cms/steps','POST',{
    pack_id:course,title:'【演示】第一章 产品与开发',summary:disclaimer,status:'draft',sort_order:0,phase:0,
  },true);
  const libraryTitle='【演示】阅读项目指令';
  if(!journal.records.prompt)assert.ok(!libraries.some(l=>l.title===libraryTitle),'Unjournaled Prompt exists');
  const prompt=await once('prompt','/admin/platform/library','POST',{
    title:libraryTitle,type:'prompt',body:`${disclaimer}\n\n先阅读项目结构，列出需要实现的功能与验证步骤。`,resource_url:'',duration_seconds:0,status:'draft',
  },true);
  const lessonTitle='【演示】1.1 从需求到第一个 AI 产品';
  if(!journal.records.lesson)assert.ok(!learning.lessons.some(l=>l.title===lessonTitle),'Unjournaled lesson exists');
  const lesson=await once('lesson','/admin/learning/lessons/0','PUT',{
    title:lessonTitle,subtitle:disclaimer,status:'draft',config:{
      videoAssetId:journal.assets.video.id,pptAssetId:null,subtitleAssetId:null,durationSeconds:22,
      expectedResult:'演示：明确目标用户、完成最小功能，并通过验收清单。',resultAssetId:null,relatedPlacementIds:[],
      slides:[{id:'page1',assetId:journal.assets.slide1.id,text:'演示：明确产品需求和目标用户。'},{id:'page2',assetId:journal.assets.slide2.id,text:'演示：开发可用产品并验证。'}],
      mappings:[{slideId:'page1',start:0,end:10},{slideId:'page2',start:10,end:22}],
      tasks:[{id:'task-1',title:'已阅读项目结构并运行测试',required:true}],
      operations:[{id:'op-1',title:'先理解需求，再开始开发',body:disclaimer}],
    },
  });
  const placement=(chapter_id,stage_id)=>({lesson_id:lesson,chapter_id,stage_id,is_preview:false,sort_order:0,status:'draft',materials:[{library_id:prompt,role:'prompt'}]});
  await once('coursePlacement','/admin/learning/placements/0','PUT',placement(chapter,null));
  const titles=['AI 面试助手','AI 工具聚合站','AI 健康饮食管理 App','AI SEO 自动化工具','微信 AI 小程序','AI Agent 自动化工作流'];
  const categories=['saas','tools','mobile','automation','mini','agent'];
  for(const [i,title] of titles.entries()) {
    const project=await once(`project${i}`,'/admin/platform/projects','POST',{
      title:`【演示】${title}`,slug:`demo-project-20260930-${i+1}`,description:disclaimer,cover_url:'',category:categories[i],
      tags:['演示资料','待替换'],deliverable:'整理自己的 MVP 与部署记录，不自动声称产品已上线。',status:'draft',sort_order:9000+i,courseIds:[course],
    },true);
    const stage=await once(`stage${i}`,'/admin/learning/stages/0','PUT',{
      project_id:project,title:'【演示】项目准备',description:disclaimer,
      checklist:[{id:'accept-1',title:'已经实际运行并检查结果',required:true}],sort_order:0,status:'draft',
    });
    await once(`placement${i}`,'/admin/learning/placements/0','PUT',placement(null,stage));
  }
  const final=await request('/admin/learning/snapshot');
  const finalCourse=(await request(`/admin/cms/packs/${course}`));
  assert.equal(finalCourse.pack.status,'draft');assert.equal(finalCourse.steps.length,1);
  const current=final.lessons.find(l=>l.id===lesson);
  assert.equal(current.status,'draft');assert.equal(current.config.slides.length,2);
  const placements=final.placements.filter(p=>p.lesson_id===lesson);
  assert.equal(placements.length,7);assert.ok(placements.every(p=>p.status==='draft'&&p.materials[0].library_id===prompt));
  assert.equal(final.projects.filter(p=>p.slug.startsWith('demo-project-20260930-')&&p.status==='draft').length,6);
  for(const a of Object.values(journal.assets)) {
    const {url}=await request(`/admin/cms/assets/${a.id}/link`);
    const r=await fetch(new URL(url,base),{signal:AbortSignal.timeout(30000)});
    assert.equal(r.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),a.sha256);
    assert.equal((await fetch(`${base}/materials/${a.id}`)).status,401);
  }
  const publicEntry=await fetch(`${base}/learning/entry`).then(r=>r.json());
  assert.ok(!publicEntry.courses.some(c=>c.slug===slug));
  journal.verifiedAt=new Date().toISOString();save();
  console.log(JSON.stringify({status:'verified-drafts',assets:4,courses:1,chapters:1,lessons:1,prompts:1,projects:6,placements:7,records:journal.records}));
  return journal;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2],'--approved-draft-import','Explicit approval flag required');
  process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
  const source=path.resolve(process.argv[3]);
  assert.ok(source.startsWith('/tmp/oneshowlearn-platforms-'));
  const journalDir='/var/backups/oneshowlearn/demo-import-20260930';
  mkdirSync(journalDir,{recursive:true,mode:0o700});
  const {DatabaseSync}=await import('node:sqlite');
  const backup=path.join(journalDir,'before-import.db');
  if(!existsSync(backup)) {
    const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');
    db.prepare('VACUUM INTO ?').run(backup);db.close();
  }
  await importDemo({base:'http://127.0.0.1:8791/api',email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,source,journalPath:path.join(journalDir,'manifest.json')});
}
