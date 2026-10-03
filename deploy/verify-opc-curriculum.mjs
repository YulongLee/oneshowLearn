// Read-only post-import verification. Never creates learner records.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const [base,backup,assetsDir]=process.argv.slice(2);
const digest=b=>createHash('sha256').update(b).digest('hex');
const get=async(route)=>{const r=await fetch(base+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,route.split('?')[0]);return r.json();};
const entry=await get('/api/learning/entry');const course=entry.courses.find(c=>c.id===entry.defaultCourseId);assert.equal(course.slug,'ai-opc-product-company');
const data=await get(`/api/learning/courses/${course.slug}`);assert.equal(data.lessons.length,40);assert.equal(data.lessons.filter(l=>!l.locked).length,2);assert.ok(data.lessons.every(l=>l.is_demo_media));
const first=await get(`/api/learning/placements/${data.lessons[0].id}`);assert.equal(first.config.slides.length,14);
const video=await fetch(base+first.config.video.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});assert.equal(video.status,206);assert.equal((await video.arrayBuffer()).byteLength,1024);
for(const [url,file] of [[first.config.ppt.url,`${assetsDir}/template.pptx`],...first.config.slides.map((s,i)=>[s.asset.url,`${assetsDir}/${String(i+1).padStart(2,'0')}.png`])]){
 const r=await fetch(base+url,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(digest(Buffer.from(await r.arrayBuffer())),digest(readFileSync(file)));
}
assert.equal((await fetch(base+`/api/learning/placements/${data.lessons[2].id}`)).status,403);
const before=new DatabaseSync(backup,{readOnly:true}),after=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
const tables=['users','learning_paths','project_packs','project_steps','content_items','content_library','assets','learning_lessons','lesson_placements','lesson_materials','products','orders','entitlements','learning_progress','learning_notes','practice_projects','practice_project_stages','practice_project_settings','project_runs','project_entitlements'];
for(const table of tables){
 const keys=before.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);assert.ok(keys.length,table);
 const previous=before.prepare(`SELECT * FROM ${table}`).all();
 for(const old of previous){const live=after.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>`${k}=?`).join(' AND ')}`).get(...keys.map(k=>old[k]));assert.ok(live,`Missing old ${table}`);if(table==='users'){delete old.last_login_at;delete live.last_login_at;}assert.equal(digest(JSON.stringify(live)),digest(JSON.stringify(old)),`Old ${table} was modified`);}
 if(['users','orders','entitlements','learning_progress','learning_notes','project_runs','project_entitlements'].includes(table))assert.equal(after.prepare(`SELECT count(*) n FROM ${table}`).get().n,previous.length,`Unexpected new private record in ${table}`);
}
assert.deepEqual(after.prepare('PRAGMA foreign_key_check').all(),[]);before.close();after.close();
console.log('PASS primary course, 5 chapters/40 lessons, 14 template image hashes, PPT hash, ranged video playback, access control and preservation of existing data.');
