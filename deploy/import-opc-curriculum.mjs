// Owner-authored curriculum only. All content writes use existing CMS APIs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {sectionBody} from '../scripts/prepare-opc-curriculum.mjs';

export async function importOpcCurriculum({base,email,password,data,journalPath,publish=false,media}) {
 assert.ok(media?.videoAssetId||media?.videoPath,'Reviewed mock video required');
 assert.equal(media.slides.length,14,'Approved 14-page template required');
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const journal=existsSync(journalPath)?JSON.parse(readFileSync(journalPath,'utf8')):{base,hash,records:{}};
 assert.equal(journal.base,base);assert.equal(journal.hash,hash,'Changed source requires a new reviewed import');
 const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});
 let token;
 async function request(route,method='GET',body,version,anonymous=false){
  const response=await fetch(base+route,{method,signal:AbortSignal.timeout(30000),headers:{...(!anonymous&&token?{authorization:`Bearer ${token}`} : {}),...(body?{'content-type':'application/json'}:{}),...(version!==undefined?{'if-match':String(version)}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json();assert.ok(response.ok,`${method} ${route}: ${response.status} ${value.error||''}`);return value;
 }
 token=(await request('/auth/login','POST',{email,password})).token;assert.ok(token);
 const cms=await request('/admin/cms/snapshot');
 const path=cms.paths.find(p=>p.slug==='ai-product'&&p.status==='published');assert.ok(path,'Existing published AI product path required');
 const existing=cms.packs.find(p=>p.slug===data.slug);
 if(existing)assert.equal(existing.id,journal.records.course,'Unjournaled course exists; refusing overwrite');
 const learn=await request('/admin/learning/snapshot');
 const library=(await request('/admin/platform/library')).items;
 for(const chapter of data.chapters)for(const section of chapter.sections){
  const title=`${section.number} ${section.title}`;
  const collision=learn.lessons.find(l=>l.title===title);
  if(collision)assert.equal(collision.id,journal.records[`lesson-${section.number}`],'Existing lesson must not be overwritten');
  const material=library.find(l=>l.title===`AI OPC 大纲｜${title}`);
  if(material)assert.equal(material.id,journal.records[`library-${section.number}`],'Unjournaled material must not be duplicated');
 }
 if(journal.completed){await verify();return journal;}
 async function upload(key,filePath,name,type){
  const bytes=readFileSync(filePath),digest=createHash('sha256').update(bytes).digest('hex');
  if(journal.records[key]){assert.equal(journal.assetHashes[key],digest,'Changed media must be reviewed');return journal.records[key];}
  assert.ok(!journal.pending,'Reconcile uncertain prior write before retrying');
  journal.pending={key,name};save();
  const form=new FormData();form.append('file',new Blob([bytes],{type}),name);
  const response=await fetch(base+'/admin/cms/assets',{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,signal:AbortSignal.timeout(120000)});
  const asset=await response.json();assert.ok(response.ok,`Asset upload failed: ${response.status}`);assert.ok(asset.id);
  journal.records[key]=asset.id;journal.assetHashes??={};journal.assetHashes[key]=digest;delete journal.pending;save();return asset.id;
 }
 if(media.videoAssetId){
  const video=learn.assets.find(a=>a.id===media.videoAssetId);assert.ok(video?.original_name.includes('演示')&&video.mime_type.startsWith('video/'),'Expected existing demonstration video');
  if(journal.records.video)assert.equal(journal.records.video,video.id);journal.records.video=video.id;save();
 }else await upload('video',media.videoPath,'【演示占位】22秒平台功能视频.mp4','video/mp4');
 await upload('ppt',media.pptPath,'【演示占位】OneShowLearn-录课通用模板.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation');
 for(const [i,file] of media.slides.entries())await upload(`slide-${i+1}`,file,`【演示占位】通用课件-${String(i+1).padStart(2,'0')}.png`,'image/png');
 async function once(key,route,method,body,item=false){
  if(journal.records[key])return journal.records[key];
  // A request with an uncertain outcome must be reconciled rather than blindly retried.
  assert.ok(!journal.pending,`Uncertain prior write: ${JSON.stringify(journal.pending)}. Inspect CMS before retrying.`);
  journal.pending={key,route,title:body.title||'',at:new Date().toISOString()};save();
  const response=await request(route,method,body);const id=item?response.item.id:response.id;assert.ok(id);
  journal.records[key]=id;delete journal.pending;save();return id;
 }
 const course=await once('course','/admin/cms/packs','POST',{
  path_id:path.id,slug:data.slug,title:data.title,subtitle:data.positioning,
  description:`${data.positioning}\n\n学习主线：找到机会 → 做出产品 → 正式上线 → 第一次收钱 → 获得第一批用户。\n\n${data.notice}\n\n毕业目标（非结果保证）：${data.graduationGoal}`,
  deliverable:data.graduationGoal,cover_url:'',price_cents:39900,estimated_minutes:0,status:'draft',is_featured:false,sort_order:0,
 },true);
 for(const c of data.chapters){
  const chapter=await once(`chapter-${c.number}`,'/admin/cms/steps','POST',{pack_id:course,title:`第 ${c.number} 章 ${c.title}`,summary:`${c.goal}\n核心问题：${c.question}\n阶段成果：${c.outcome}\n${data.notice}`,status:'published',sort_order:c.number,phase:c.number},true);
  await once(`overview-${c.number}`,'/admin/cms/content','POST',{step_id:chapter,type:'document',title:`第 ${c.number} 章 ${c.title}｜章节大纲`,body:`# ${c.title}\n\n> ${data.notice}\n\n## 本章目标\n\n${c.goal}\n\n核心问题：${c.question}\n\n## 课程目录\n\n${c.sections.map(s=>`- ${s.number} ${s.title}`).join('\n')}\n\n## 阶段成果\n\n${c.outcome}`,resource_url:'',duration_seconds:0,is_preview:true,status:'published',sort_order:0},true);
  for(const [i,s] of c.sections.entries()){
   const material=await once(`library-${s.number}`,'/admin/platform/library','POST',{title:`AI OPC 大纲｜${s.number} ${s.title}`,type:'document',body:sectionBody(data,c,s),resource_url:'',duration_seconds:0,status:'published'},true);
   const lesson=await once(`lesson-${s.number}`,'/admin/learning/lessons/0','PUT',{title:`${s.number} ${s.title}`,subtitle:'课程大纲 · 演示视频与通用课件，正式教学素材待补充',status:'published',config:{isDemoMedia:true,videoAssetId:journal.records.video,pptAssetId:journal.records.ppt,subtitleAssetId:null,durationSeconds:22,resultAssetId:null,relatedPlacementIds:[],slides:media.slides.map((_,i)=>({id:`template-${i+1}`,assetId:journal.records[`slide-${i+1}`],text:''})),mappings:[],tasks:[],expectedResult:`本章目标：${c.goal}\n\n阶段成果：${c.outcome}\n\n${data.notice}`,operations:[]}});
   await once(`placement-${s.number}`,'/admin/learning/placements/0','PUT',{lesson_id:lesson,chapter_id:chapter,stage_id:null,is_preview:c.number===1&&i<2,sort_order:i+1,status:'published',materials:[{library_id:material,role:'article'}]});
  }
 }
 if(publish){
  const {pack}=await request(`/admin/cms/packs/${course}`);
  if(pack.status!=='published'){
   assert.equal(pack.status,'draft');
   const fields=['path_id','slug','title','subtitle','description','deliverable','cover_url','price_cents','estimated_minutes','sort_order'];
   await request(`/admin/cms/packs/${course}`,'PUT',{...Object.fromEntries(fields.map(k=>[k,pack[k]])),is_featured:false,status:'published'},pack.version);
  }
 }
 if(publish){
  const latest=await request('/admin/learning/snapshot');
  if(!journal.entryBefore){journal.entryBefore=latest.entrySettings;save();}
  if(latest.entrySettings.courseId!==course){
   assert.deepEqual(latest.entrySettings,journal.entryBefore,'Default course changed during import');
   await request('/admin/learning/default-course','PUT',{courseId:course},latest.entrySettings.version);
  }
 }
 journal.published=publish;journal.completed=new Date().toISOString();save();await verify();return journal;
 async function verify(){
  const snapshot=await request('/admin/learning/snapshot');const {pack,steps}=await request(`/admin/cms/packs/${journal.records.course}`);
  assert.equal(pack.slug,data.slug);assert.equal(pack.status,(journal.published||publish)?'published':'draft');assert.equal(steps.length,5);
  for(const c of data.chapters){
   const ch=steps.find(s=>s.id===journal.records[`chapter-${c.number}`]);assert.equal(ch.phase,c.number);assert.equal(ch.title,`第 ${c.number} 章 ${c.title}`);
   for(const s of c.sections){
    const l=snapshot.lessons.find(l=>l.id===journal.records[`lesson-${s.number}`]);assert.equal(l.title,`${s.number} ${s.title}`);
    assert.equal(l.config.videoAssetId,journal.records.video);assert.equal(l.config.pptAssetId,journal.records.ppt);assert.equal(l.config.durationSeconds,22);assert.equal(l.config.isDemoMedia,true);assert.equal(l.config.slides.length,14);assert.ok(l.config.slides.every(s=>s.text===''));
    const p=snapshot.placements.find(p=>p.id===journal.records[`placement-${s.number}`]);assert.equal(p.chapter_id,ch.id);assert.equal(p.lesson_id,l.id);
    assert.deepEqual(p.materials,[{library_id:journal.records[`library-${s.number}`],role:'article'}]);
   }
  }
  if(journal.published||publish){
   const entry=await request('/learning/entry','GET',undefined,undefined,true);assert.equal(entry.defaultCourseId,journal.records.course);
   const result=await request(`/learning/courses/${data.slug}`,'GET',undefined,undefined,true);assert.equal(result.lessons.length,40);
   assert.equal(result.lessons.filter(l=>!l.locked).length,2);
   const first=await request(`/learning/placements/${journal.records['placement-1.1']}`,'GET',undefined,undefined,true);
   assert.equal(first.materials.length,1);assert.ok(first.materials[0].body.includes('1.1.6'));
  }
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.argv[2],'--approved-new-opc-course','Requires explicit owner approval for a new course');
 const data=JSON.parse(readFileSync(new URL('../docs/curriculum/ai-opc-20261001.json',import.meta.url)));
 process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
 const dir='/var/backups/oneshowlearn/opc-curriculum-20261001';mkdirSync(dir,{recursive:true,mode:0o700});
 const {DatabaseSync}=await import('node:sqlite');
 if(!existsSync(`${dir}/before.db`)){
  const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');db.prepare('VACUUM INTO ?').run(`${dir}/before.db`);db.close();
 }
 const assetsDir=process.argv[3];assert.ok(assetsDir,'Staged template directory required');
 const journal=await importOpcCurriculum({base:'http://127.0.0.1:8791/api',email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,data,journalPath:`${dir}/manifest.json`,publish:true,media:{videoAssetId:1,pptPath:`${assetsDir}/template.pptx`,slides:Array.from({length:14},(_,i)=>`${assetsDir}/${String(i+1).padStart(2,'0')}.png`)}});
 console.log(JSON.stringify({courseId:journal.records.course,counts:data.counts,published:journal.published}));
}
