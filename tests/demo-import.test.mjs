import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {importDemo} from '../deploy/import-demo-materials.mjs';
import {publishDemoProjects} from '../deploy/publish-demo-projects.mjs';

test('approved demo import creates private drafts, preserves existing content, and safely resumes',async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'oneshowlearn-demo-import-test-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-demo-import-test'});
  const {db,run,rows}=await import('../server/db.mjs');
  const {createApp}=await import('../server/index.mjs');
  const password='Isolated-Import-Test-2026';
  run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('import@example.com',?,'Import test','admin',1)",[bcrypt.hashSync(password,4)]);
  const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','Existing direction','published')").lastInsertRowid);
  run("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'existing-course','Existing course','published')",[pathId]);
  const old=rows('SELECT * FROM project_packs');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  for(const file of ['fixture.mp4','slide1.webp','slide2.webp','a46eb1fc-b33e-4c63-a07c-cc8899c51465.vtt'])writeFileSync(path.join(temp,file),`Isolated bytes for API transport test: ${file}`);
  const options={base:`http://127.0.0.1:${server.address().port}/api`,email:'import@example.com',password,source:temp,journalPath:path.join(temp,'manifest.json')};
  const imported=await importDemo(options);
  const tables=['assets','project_packs','project_steps','learning_lessons','lesson_placements','content_library','practice_projects','practice_project_stages','cms_audit'];
  const before=Object.fromEntries(tables.map(table=>[table,rows(`SELECT * FROM ${table}`)]));
  await importDemo(options);
  for(const table of tables)assert.deepEqual(rows(`SELECT * FROM ${table}`),before[table],`No duplicates or rewrites: ${table}`);
  assert.deepEqual(rows('SELECT * FROM project_packs WHERE id=?',[old[0].id]),old);
  assert.equal(rows('SELECT * FROM users').length,1);
  for(const table of ['entitlements','learning_progress','learning_notes','project_runs','project_entitlements','orders'])assert.equal(rows(`SELECT * FROM ${table}`).length,0,table);
  assert.deepEqual(rows('PRAGMA foreign_key_check'),[]);
  assert.ok(imported.verifiedAt);
  const publication={base:options.base,email:options.email,password,importManifest:imported,journalPath:path.join(temp,'publication.json')};
  await publishDemoProjects(publication);
  const after=Object.fromEntries(tables.map(table=>[table,rows(`SELECT * FROM ${table}`)]));
  await publishDemoProjects(publication);
  for(const table of tables)assert.deepEqual(rows(`SELECT * FROM ${table}`),after[table],`Publication retry must not rewrite: ${table}`);
  assert.equal(rows("SELECT * FROM practice_projects WHERE status='published'").length,5);
  assert.equal(rows("SELECT * FROM project_categories WHERE is_active=1").length,5);
  assert.deepEqual(rows('SELECT * FROM project_packs WHERE id=?',[old[0].id]),old);
  for(const table of ['entitlements','learning_progress','learning_notes','project_runs','project_entitlements','orders'])assert.equal(rows(`SELECT * FROM ${table}`).length,0,table);
  for(const spec of [0,1,2,4,5]) {
    const response=await fetch(`${options.base}/learning/placements/${imported.records[`placement${spec}`]}`);
    assert.equal(response.status,200,'Preview-readable demonstration lesson');
    const detail=await response.json();assert.equal(detail.config.slides.length,2);assert.equal(detail.materials.length,1);
  }
  assert.deepEqual(rows('PRAGMA foreign_key_check'),[]);
});
