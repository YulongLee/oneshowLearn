import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {importOpcCurriculum} from '../deploy/import-opc-curriculum.mjs';
import {sectionBody} from '../scripts/prepare-opc-curriculum.mjs';
import {courseEvidence} from '../server/course-ai-grounding.mjs';
import {chooseEntry} from '../src/course-entry-model.js';
const data=JSON.parse(readFileSync(new URL('../docs/curriculum/ai-opc-20261001.json',import.meta.url)));

test('owner curriculum preserves all five chapters, forty sections and channel entries',()=>{
 assert.deepEqual(data.counts,{chapters:5,sections:40,numberedTopics:296,channelEntries:13});
 assert.deepEqual(data.chapters.map(c=>c.sections.length),[7,10,7,7,9]);
 const all=data.chapters.flatMap(c=>c.sections.flatMap(s=>s.topics)).filter(t=>t.number);
 assert.equal(new Set(all.map(t=>t.number)).size,296);
 assert.ok(sectionBody(data,data.chapters[4],data.chapters[4].sections[5]).includes('海外 · Product Hunt'));
 assert.ok(data.chapters[1].sections[1].context.includes('Requirement → Spec → Plan → Task → Code → Test → Review'));
});

test('CMS-only curriculum import is repeatable, permission-safe and preserves prior data',async t=>{
 const temp=mkdtempSync(path.join(tmpdir(),'osl-opc-outline-'));
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'isolated.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-opc-outline-test'});
 const {db,run,rows}=await import('../server/db.mjs');const {createApp}=await import('../server/index.mjs');
 const password='Isolated-Outline-Test-2026';
 run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('outline@example.com',?,'Outline test','admin',1)",[bcrypt.hashSync(password,4)]);
 const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','Existing product path','published')").lastInsertRowid);
 run("INSERT INTO project_packs(path_id,slug,title,status,price_cents) VALUES(?,'existing-course','Preserve course','published',29900)",[pathId]);
 const original=rows('SELECT * FROM project_packs');
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const videoPath=path.join(temp,'demo.mp4');writeFileSync(videoPath,Buffer.from('isolated media bytes'));
 // API transport/ownership test, not media rendering. Do not depend on ignored
 // owner-authored courseware artifacts that are absent in a clean Git checkout.
 const pptPath=path.join(temp,'isolated.pptx');writeFileSync(pptPath,'Isolated PPTX transport fixture, not teaching media');
 const slides=Array.from({length:14},(_,i)=>{const file=path.join(temp,`isolated-slide-${i+1}.png`);writeFileSync(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=','base64'));return file;});
 const media={videoPath,pptPath,slides};
 const opts={base,email:'outline@example.com',password,data,journalPath:path.join(temp,'journal.json'),publish:true,media};
 const journal=await importOpcCurriculum(opts);
 assert.equal(journal.published,true);
 assert.deepEqual(rows('SELECT * FROM project_packs WHERE id=?',[original[0].id]),original);
 assert.equal(rows('SELECT * FROM project_steps').length,5);
 assert.equal(rows('SELECT * FROM lesson_placements').length,40);
 assert.equal(rows('SELECT * FROM content_library').length,40);
 assert.equal(rows('SELECT * FROM content_items').length,5);
 assert.equal(rows('SELECT * FROM assets').length,16);
 for(const table of ['entitlements','orders','learning_progress','learning_notes','project_runs','project_entitlements'])assert.equal(rows(`SELECT * FROM ${table}`).length,0,table);
 const protectedResponse=await fetch(`${base}/learning/placements/${journal.records['placement-1.3']}`);assert.equal(protectedResponse.status,403);
 const tables=['project_packs','project_steps','content_items','learning_lessons','lesson_placements','content_library','cms_audit'];
 const before=Object.fromEntries(tables.map(table=>[table,rows(`SELECT * FROM ${table}`)]));
 await importOpcCurriculum(opts);
 for(const table of tables)assert.deepEqual(rows(`SELECT * FROM ${table}`),before[table],`Retry does not overwrite ${table}`);
 await assert.rejects(()=>importOpcCurriculum({...opts,journalPath:path.join(temp,'unowned.json')}),/Unjournaled course/);
 const changed=structuredClone(data);changed.title+=' changed';
 await assert.rejects(()=>importOpcCurriculum({...opts,data:changed}),/Changed source/);
 const entry=await(await fetch(base+'/learning/entry')).json();assert.equal(chooseEntry(entry).course.id,journal.records.course);assert.equal(entry.lessons.filter(l=>l.is_demo_media).length,40);
 const auth=await(await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:opts.email,password})})).json();
 const headers={authorization:`Bearer ${auth.token}`,'content-type':'application/json'};
 const get=async(route,admin=false)=>(await fetch(base+route,{headers:admin?headers:{}})).json();
 const first=await get(`/learning/placements/${journal.records['placement-1.1']}`);
 assert.equal(first.config.slides.length,14);assert.equal(first.config.isDemoMedia,true);
 const evidence=courseEvidence({...first,config:{...first.config,slides:[{id:'template',text:'NOT REAL TEACHING',assetId:1}]}},first.materials,'template');assert.equal(evidence.currentSlide.hasText,false);assert.ok(evidence.sources.every(s=>!s.text.includes('NOT REAL TEACHING')));
 const snap=await get('/admin/learning/snapshot',true);
 const refused=await fetch(base+'/admin/learning/default-course',{method:'PUT',headers:{...headers,'if-match':'0'},body:JSON.stringify({courseId:journal.records.course})});assert.equal(refused.status,409);
 const privateLesson=snap.lessons.find(l=>l.id===journal.records['lesson-1.3']);const other=snap.lessons.find(l=>l.id===journal.records['lesson-1.4']);
 const updated={title:privateLesson.title,subtitle:'真实内容已补充',status:privateLesson.status,config:{...privateLesson.config,isDemoMedia:false,slides:[],pptAssetId:null}};
 const response=await fetch(base+`/admin/learning/lessons/${privateLesson.id}`,{method:'PUT',headers:{...headers,'if-match':String(privateLesson.version)},body:JSON.stringify(updated)});assert.equal(response.status,200);
 const snap2=await get('/admin/learning/snapshot',true);assert.deepEqual(snap2.lessons.find(l=>l.id===other.id),other,'Replacing one lesson leaves others intact');
 const progressBody={video_time:3,video_duration:22,slide_id:'template-2',follow_video:false,tasks:[],complete:false};
 const denyComplete=await fetch(base+`/learning/placements/${journal.records['placement-1.1']}/progress`,{method:'PUT',headers:{...headers,'if-match':'0'},body:JSON.stringify({...progressBody,complete:true})});assert.equal(denyComplete.status,409);
 const savedProgress=await fetch(base+`/learning/placements/${journal.records['placement-1.1']}/progress`,{method:'PUT',headers:{...headers,'if-match':'0'},body:JSON.stringify(progressBody)});assert.equal(savedProgress.status,200);
 const reloaded=await get(`/learning/placements/${journal.records['placement-1.1']}`,true);assert.equal(reloaded.progress.video_time,3);assert.equal(reloaded.progress.slide_id,'template-2');assert.equal(reloaded.progress.completed_at,null);
 assert.deepEqual(rows('PRAGMA foreign_key_check'),[]);
});

test('default course supersedes old history without breaking explicit course links',()=>{
 const d={defaultCourseId:2,courses:[{id:1,slug:'old'},{id:2,slug:'primary'}],chapters:[],lessons:[{id:1,owner_id:1,owner_slug:'old',locked:false,progress:{version:1,updated_at:'2026-10-01'}},{id:2,owner_id:2,owner_slug:'primary',locked:false}]};
 assert.equal(chooseEntry(d).course.id,2);assert.equal(chooseEntry(d).lesson.id,2);
 assert.equal(chooseEntry(d,'/opc/course/old').course.id,1);assert.equal(chooseEntry(d,'/opc/lessons/1').lesson.id,1);
});
