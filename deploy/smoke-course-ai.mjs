// Production probe: one existing, conspicuously labelled demo lesson, no private notes.
// No fixture insertion, course edits, progress updates or saved notes.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
const base=process.argv[2];
assert.equal(base,'https://oneshowlearn.com');
const request=(route,options={})=>fetch(base+'/api'+route,{signal:AbortSignal.timeout(60000),...options});
const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);
const {token}=await login.json(),headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
const admin=db.prepare('SELECT id FROM users WHERE email=?').get(process.env.ADMIN_EMAIL);
const entry=await request('/learning/entry',{headers});assert.equal(entry.status,200);
const lesson=(await entry.json()).lessons.find(l=>l.title.includes('演示')&&l.owner_title.includes('演示')&&!l.locked&&!db.prepare('SELECT 1 FROM learning_notes WHERE user_id=? AND placement_id=? AND deleted_at IS NULL').get(admin.id,l.id));
db.close();assert.ok(lesson,'Need a published demo lesson with no administrator notes for safe real-model verification');
const endpoint=`/learning/placements/${lesson.id}/ai`;
assert.equal((await request(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'summary'})})).status,401);
const details=await request(`/learning/placements/${lesson.id}`,{headers});assert.equal(details.status,200);
const slide=(await details.json()).config.slides.find(s=>s.text.trim());assert.ok(slide);
const ask=body=>request(endpoint,{method:'POST',headers,body:JSON.stringify(body)});
assert.equal((await ask({action:'ask',question:'test',slideId:'nonexistent-release-check-page'})).status,400);
assert.equal((await ask({action:'ask',question:'test',context:{sources:[]}})).status,400);
const reply=await ask({action:'ask',question:'请仅摘录当前课件页的一句原文，并标注 [S编号] 来源；不要补充建议。',slideId:slide.id});
assert.equal(reply.status,200,'Real course-grounded reply');
const data=await reply.json();assert.equal(data.contextLessonId,lesson.id);assert.equal(data.grounded,true);
assert.ok(data.sources.some(s=>s.slideId===slide.id&&s.excerpt.includes(slide.text.slice(0,30))));
assert.match(data.answer,/\[S\d+/);assert.ok(data.coverage.included>0);
console.log('PASS HTTPS current-lesson AI reply with real model, valid slide citation/excerpt, anonymous protection and rejected client context; no course/progress/notes changed');
