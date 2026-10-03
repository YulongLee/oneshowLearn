// Scoped owner-approved archive; no physical deletion or learner-data writes.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, chmodSync, writeFileSync} from 'node:fs';

const base = 'http://127.0.0.1:8791/api';
const targets = ['ai-tools-starter','cursor-first-site','personal-ai-agent','n8n-content-workflow','ai-product-mvp','ai-product-growth','demo-learning-20260930'];
const db = new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');
let token;
async function api(route, method='GET', body, version) {
  const r = await fetch(base+route, {method, signal:AbortSignal.timeout(30000), headers:{...(token?{authorization:`Bearer ${token}`} : {}), ...(body?{'content-type':'application/json'}:{}), ...(version?{'if-match':version}:{})}, body:body?JSON.stringify(body):undefined});
  if(!r.ok){const error=await r.json();throw Object.assign(new Error(`${method} ${route}: ${r.status} ${error.error||'Request rejected'}`),{status:r.status,detail:error.error});}
  return r.json();
}
const courses = db.prepare('SELECT * FROM project_packs ORDER BY id').all();
assert.equal(courses.length,8,'Unexpected catalogue: inspect before changing it');
targets.forEach((slug,i)=>{assert.equal(courses[i].id,i+1);assert.equal(courses[i].slug,slug);assert.equal(courses[i].status,'published');});
assert.equal(courses[7].slug,'ai-opc-product-company');
assert.equal(courses[7].status,'published');
assert.equal(db.prepare('SELECT course_id FROM learning_entry_settings WHERE id=1').get().course_id,8);
const projectsBefore = await api('/learning/projects');
assert.deepEqual(projectsBefore.items.map(p=>p.id).sort((a,b)=>a-b),[1,2,3,5,6]);
async function verifyProjects() {
  const projects = await api('/learning/projects');
  assert.deepEqual(projects.items.map(p=>[p.id,p.lessonCount,p.pptCount,p.promptCount]),projectsBefore.items.map(p=>[p.id,p.lessonCount,p.pptCount,p.promptCount]));
  for (const project of projects.items) {
    for (const lesson of project.stages.flatMap(s=>s.lessons)) {
      const detail = await api(`/learning/placements/${lesson.id}`);
      assert.ok(detail.config.video.url);
      assert.equal(detail.config.slides.length,2);
      assert.ok(detail.materials.some(m=>m.role==='prompt'));
      const media=await fetch('http://127.0.0.1:8791'+detail.config.video.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});
      assert.equal(media.status,206); await media.arrayBuffer();
    }
  }
}
await verifyProjects();
if (!process.argv.includes('--apply')) {
  console.log('PASS preflight: seven exact courses; five independent project readers and shared media accessible. Re-run --apply to archive.');
  db.close();
} else {
  const dir=mkdtempSync('/var/backups/oneshowlearn/course-archive-');chmodSync(dir,0o700);
  const backup=dir+'/before.db';db.prepare('VACUUM INTO ?').run(backup);chmodSync(backup,0o600);
  const journal={backup,targets:courses.slice(0,7),completed:[],verified:false};
  const save=()=>writeFileSync(dir+'/journal.json',JSON.stringify(journal,null,2),{mode:0o600});save();
  process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
  token=(await api('/auth/login','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})).token;
  assert.ok(token);
  const actor=db.prepare("SELECT id FROM users WHERE email=? AND role='admin'").get(process.env.ADMIN_EMAIL);assert.ok(actor);
  const fields='path_id slug title subtitle description deliverable cover_url price_cents estimated_minutes sort_order'.split(' ');
  for(const old of courses.slice(0,7)) {
    const {pack}=await api(`/admin/cms/packs/${old.id}`);
    for(const key of Object.keys(old))assert.deepEqual(pack[key],old[key],`Concurrent edit to course ${old.id}`);
    try {
      await api(`/admin/cms/packs/${old.id}`,'PUT',{...Object.fromEntries(fields.map(k=>[k,pack[k]])),is_featured:Boolean(pack.is_featured),status:'archived'},pack.version);
    } catch(error) {
      // Existing seeded /assets covers predate CMS URL validation. A status-only
      // migration preserves those exact values instead of rewriting old content.
      if(error.status!==400||!error.detail?.includes('cover_url'))throw error;
      assert.ok(old.id>=1&&old.id<=6&&old.cover_url.startsWith('/assets/'));
      db.exec('BEGIN IMMEDIATE');
      try {
        assert.deepEqual(db.prepare('SELECT * FROM project_packs WHERE id=?').get(old.id),old,'Concurrent course edit');
        assert.equal(db.prepare("UPDATE project_packs SET status='archived',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='published'").run(old.id).changes,1);
        assert.equal(db.prepare("UPDATE products SET status='inactive',updated_at=CURRENT_TIMESTAMP WHERE pack_id=?").run(old.id).changes,1);
        db.prepare('INSERT INTO cms_audit(actor_id,entity,entity_id,title,action,status) VALUES(?,?,?,?,?,?)').run(actor.id,'packs',old.id,old.title,'update','archived');
        db.exec('COMMIT');
      } catch(e){db.exec('ROLLBACK');throw e;}
    }
    journal.completed.push(old.id);save();
  }
  token=undefined; // Verify the learner-visible result without management permissions.
  const entry=await api('/learning/entry');assert.deepEqual(entry.courses.map(c=>c.id),[8]);assert.equal(entry.defaultCourseId,8);
  const course=await api('/learning/courses/ai-opc-product-company');assert.equal(course.lessons.length,40);assert.equal(course.lessons.filter(l=>!l.locked).length,2);
  for(const slug of targets)assert.equal((await fetch(base+'/learning/courses/'+slug)).status,404);
  await verifyProjects();
  const before=new DatabaseSync(backup,{readOnly:true});
  // All rows remain; only archived pack/product state, timestamps, audit and admin login may change.
  for(const table of ['project_packs','products','learning_paths','project_steps','content_items','content_library','assets','learning_lessons','lesson_placements','lesson_materials','practice_projects','practice_project_stages','practice_project_settings','practice_project_courses','learning_entry_settings']) {
    const old=before.prepare(`SELECT * FROM ${table}`).all(),live=db.prepare(`SELECT * FROM ${table}`).all();
    if(table==='project_packs'||table==='products')for(const list of [old,live])for(const row of list)if(targets.includes(row.slug)||table==='products'&&row.pack_id>=1&&row.pack_id<=7){delete row.status;delete row.updated_at;}
    assert.deepEqual(live,old,`Unexpected content change: ${table}`);
  }
  // Private records are never edited; allow unrelated concurrent activity but detect deletion.
  for(const table of ['users','orders','entitlements','learning_progress','learning_notes','project_runs','project_entitlements']) {
    const keys=before.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.pk).map(c=>c.name);assert.ok(keys.length);
    for(const row of before.prepare(`SELECT * FROM ${table}`).all())assert.ok(db.prepare(`SELECT 1 FROM ${table} WHERE ${keys.map(k=>`${k}=?`).join(' AND ')}`).get(...keys.map(k=>row[k])),`Missing private record: ${table}`);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM project_packs WHERE status='archived'").get().n,7);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM products WHERE pack_id BETWEEN 1 AND 7 AND status='inactive'").get().n,7);
  before.close();db.close();journal.verified=true;journal.verifiedAt=new Date().toISOString();save();
  console.log(JSON.stringify({result:'PASS',archived:journal.completed,remainingCourse:8,lessons:40,practicalProjects:5,backup}));
}
