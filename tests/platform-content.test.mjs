import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {HOME_CARDS} from '../server/homepage-cards.mjs';

test('shared library, explicit projects and versioned page publishing',async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'oneshowlearn-platform-content-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'platform-content-test-only'});
  const {db,row,run}=await import('../server/db.mjs');const {signUser}=await import('../server/auth.mjs');const {createApp}=await import('../server/index.mjs');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const user=(name,role)=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[name+'@example.com','unused',name,role]).lastInsertRowid);return{id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
  const admin=user('admin','admin'),learner=user('learner','learner');
  const req=async(route,{method='GET',body,version,token=admin.token}={})=>{const r=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...(version!==undefined?{'If-Match':String(version)}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
  const save=async(kind,item,changes={})=>req('/admin/platform/'+kind+(item.id?'/'+item.id:''),{method:item.id?'PUT':'POST',version:item.version,body:{...item,...changes}});
  const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('shared','Shared path','published')").lastInsertRowid);
  const packs=['one','two'].map(slug=>Number(run("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,?,?,'published')",[pathId,slug,slug]).lastInsertRowid));
  const steps=packs.map(p=>Number(run("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'Chapter','published')",[p]).lastInsertRowid));
  steps.forEach(id=>run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,2)',[id]));
  const original=Number(run("INSERT INTO content_items(step_id,type,title,body,is_preview,status) VALUES(?,'document','Original document','PAID_SECRET',0,'published')",[steps[0]]).lastInsertRowid);
  run("INSERT INTO entitlements(user_id,pack_id,status,starts_at) VALUES(?,?,'active','2000-01-01')",[learner.id,packs[0]]);
  run("INSERT INTO progress(user_id,content_item_id,status) VALUES(?,?,'completed')",[learner.id,original]);
  let library,reference,project;
  await t.test('management APIs reject anonymous and ordinary learners',async()=>{
    for(const endpoint of ['/admin/platform/library','/admin/platform/projects','/admin/platform/pages/public']){
      assert.equal((await req(endpoint,{token:''})).status,401);assert.equal((await req(endpoint,{token:learner.token})).status,403);
    }
    assert.equal((await req('/practice-projects',{token:''})).data.items.length,0);
  });
  await t.test('import preserves content ID/progress; references retain independent access',async()=>{
    const originalVersion=(await req('/admin/cms/packs/'+packs[0])).data.steps[0].items[0].version;
    assert.equal((await req('/admin/platform/library/import/'+original,{method:'POST',version:'stale'})).status,409);
    const imported=await req('/admin/platform/library/import/'+original,{method:'POST',version:originalVersion});assert.equal(imported.status,201);library=imported.data.item;
    assert.equal(row('SELECT status FROM progress WHERE content_item_id=?',[original]).status,'completed');
    assert.equal(row('SELECT library_id FROM content_items WHERE id=?',[original]).library_id,library.id);
    const attached=await req(`/admin/platform/library/${library.id}/attach`,{method:'POST',body:{stepId:steps[1],isPreview:false,status:'published',sortOrder:1}});assert.equal(attached.status,201);reference=attached.data.id;
    assert.equal((await req(`/projects/one/content/${original}`,{token:learner.token})).status,200);
    assert.equal((await req(`/projects/two/content/${reference}`,{token:learner.token})).status,403);
    assert.equal((await req(`/projects/one/content/${original}`,{token:''})).status,403);
    assert.equal((await req(`/admin/platform/library/${library.id}/attach`,{method:'POST',body:{stepId:steps[1],isPreview:false,status:'draft',sortOrder:0}})).status,409);
  });
  await t.test('one source update reaches all readers and stale edits are rejected',async()=>{
    const old=library;library=(await save('library',library,{body:'UPDATED_SECRET',title:'Shared updated title'})).data.item;
    assert.ok(library);assert.equal((await save('library',old,{body:'stale'})).status,409);
    assert.equal((await req(`/projects/one/content/${original}`,{token:learner.token})).data.item.body,'UPDATED_SECRET');
    assert.equal((await req(`/projects/two/content/${reference}`)).data.item.body,'UPDATED_SECRET');
    const resourceList=(await req('/resources',{token:''})).data;assert.equal(JSON.stringify(resourceList).includes('UPDATED_SECRET'),false);
    assert.deepEqual(resourceList.items.map(x=>x.title),['Shared updated title','Shared updated title']);
    assert.throws(()=>run('UPDATE content_items SET body=? WHERE id=?',['fork',reference]),/Shared content/);
  });
  await t.test('library archive hides all public routes without deleting placements or progress',async()=>{
    const file=new FormData();file.append('file',new Blob(['shared protected file']), 'shared.txt');
    const upload=await fetch(base+'/admin/cms/assets',{method:'POST',headers:{Authorization:`Bearer ${admin.token}`},body:file});assert.equal(upload.status,201);
    library=(await save('library',library,{resource_url:(await upload.json()).url})).data.item;
    const attachment=(await req(`/projects/one/content/${original}`,{token:learner.token})).data.item.resource_url;
    const attachmentURL=base.replace(/\/api$/,'')+attachment;
    assert.equal((await fetch(attachmentURL)).status,200);
    library=(await save('library',library,{status:'archived'})).data.item;
    assert.equal((await fetch(attachmentURL)).status,403);
    assert.equal((await req(`/projects/one/content/${original}`,{token:learner.token})).status,404);
    assert.equal((await req(`/opc/content/${original}`)).status,404);
    assert.equal((await req('/resources',{token:''})).data.items.length,0);
    assert.equal((await req('/opc/curriculum',{token:''})).data.phases.flatMap(p=>p.items).length,0);
    assert.equal((await req('/project-packs/one',{token:learner.token})).data.steps[0].contents.length,0);
    assert.equal((await req('/catalog/workspace',{token:''})).data.items[0].contentCount,0);
    assert.equal(row('SELECT COUNT(*) n FROM progress').n,1);
    library=(await save('library',library,{status:'published'})).data.item;
    assert.equal((await req('/resources',{token:''})).data.items.length,2);
    assert.equal((await req(`/projects/one/content/${original}`,{token:learner.token})).status,200);
  });
  await t.test('project catalogue uses explicit associations and does not grant course access',async()=>{
    const fields={title:'Real practice project',slug:'practice',description:'Public introduction',cover_url:'',category:'saas',tags:['React'],deliverable:'Deploy MVP',status:'published',sort_order:0,courseIds:[]};
    assert.equal((await save('projects',fields)).status,400);
    const created=await save('projects',{...fields,courseIds:packs});assert.equal(created.status,201);project=created.data.item;
    const visible=(await req('/practice-projects',{token:learner.token})).data.items[0];assert.equal(visible.title,fields.title);assert.equal(visible.courses.length,2);assert.deepEqual(visible.courses.map(c=>c.entitled),[true,false]);
    assert.equal(JSON.stringify(visible).includes('UPDATED_SECRET'),false);
    assert.equal((await req(`/projects/two/content/${reference}`,{token:learner.token})).status,403);
    project=(await save('projects',project,{status:'archived'})).data.item;
    assert.equal((await req('/practice-projects',{token:''})).data.items.length,0);
    assert.equal((await req('/project-packs/one',{token:learner.token})).status,200);
    project=(await save('projects',project,{status:'published'})).data.item;
  });
  await t.test('page draft, preview, publication, conflicts and recoverable history',async()=>{
    const defaults=(await req('/site/pages/public',{token:''})).data;
    let adminPage=(await req('/admin/platform/pages/public')).data;
    assert.deepEqual(defaults.hotCourseCards.map(c=>c.title),HOME_CARDS.map(c=>c.title));
    assert.ok(defaults.hotCourseCards.every(c=>c.course===null));
    const draft={...adminPage.draft,title:'UNPUBLISHED_HOME',courseIds:[packs[1],packs[0]],hotCourseCards:HOME_CARDS.map((c,i)=>({...c,courseId:i===0?packs[1]:null}))};
    for(const invalid of [{image:'javascript:alert(1)'},{image:'/assets/../secret'},{courseId:-1}]){
      assert.equal((await req('/admin/platform/pages/public/preview',{method:'POST',body:{...draft,hotCourseCards:draft.hotCourseCards.map((c,i)=>i===0?{...c,...invalid}:c)}})).status,400);
    }
    assert.equal((await req('/admin/platform/pages/public',{method:'PUT',version:0,body:{...draft,hotCourseCards:draft.hotCourseCards.map(c=>({...c,courseId:999999}))}})).status,400);
    assert.equal((await req('/admin/platform/pages/public',{method:'PUT',version:0,body:{...draft,ctaPath:'https://attacker.test'}})).status,400);
    const saved=await req('/admin/platform/pages/public',{method:'PUT',version:0,body:draft});assert.equal(saved.status,200);
    assert.equal((await req('/site/pages/public',{token:''})).data.title,defaults.title);
    assert.equal((await req('/admin/platform/pages/public/preview',{method:'POST',body:draft})).data.title,'UNPUBLISHED_HOME');
    assert.equal((await req('/admin/platform/pages/public/publish',{method:'POST',version:0})).status,409);
    assert.equal((await req('/admin/platform/pages/public/publish',{method:'POST',version:saved.data.version})).status,200);
    const live=(await req('/site/pages/public',{token:''})).data;assert.equal(live.title,'UNPUBLISHED_HOME');assert.deepEqual(live.courses.map(c=>c.id),[packs[1],packs[0]]);
    assert.equal(live.hotCourseCards[0].course.id,packs[1]);assert.equal(live.hotCourseCards[0].course.contentCount,1);
    run("UPDATE project_packs SET title='Changed CMS title',cover_url='/assets/raw-screen.png' WHERE id=?",[packs[1]]);
    const stable=(await req('/site/pages/public',{token:''})).data.hotCourseCards;
    assert.equal(stable[0].title,HOME_CARDS[0].title);assert.equal(stable[0].image,HOME_CARDS[0].image);
    adminPage=(await req('/admin/platform/pages/public')).data;assert.equal(adminPage.history.length,1);
    const history=(await req(`/admin/platform/pages/public/history/${adminPage.history[0].id}`)).data;assert.equal(history.draft.title,live.title);
    assert.deepEqual(history.draft.hotCourseCards,draft.hotCourseCards);
    assert.equal((await req(`/admin/platform/pages/workbench/history/${adminPage.history[0].id}`)).status,404);
    assert.equal((await req('/admin/platform/pages/public',{method:'PUT',version:saved.data.version,body:draft})).status,409);
    run("UPDATE project_packs SET status='draft' WHERE id=?",[packs[1]]);
    assert.equal((await req('/site/pages/public',{token:''})).data.hotCourseCards[0].course,null);
    assert.deepEqual((await req('/site/pages/public',{token:''})).data.courses.map(c=>c.id),[packs[0]]);
    run("UPDATE learning_paths SET status='draft' WHERE id=?",[pathId]);
    assert.equal((await req('/site/pages/public',{token:''})).data.courses.length,0);
    assert.equal((await req('/practice-projects',{token:''})).data.items.length,0);
    const {hotCourseCards,...legacy}=draft;
    const legacySave=await req('/admin/platform/pages/public',{method:'PUT',version:adminPage.version,body:legacy});assert.equal(legacySave.status,200);
    assert.deepEqual((await req('/admin/platform/pages/public')).data.draft.hotCourseCards,hotCourseCards);
    run('UPDATE site_pages SET published_json=?,draft_json=? WHERE key=?',[JSON.stringify(legacy),JSON.stringify(legacy),'public']);
    assert.deepEqual((await req('/admin/platform/pages/public')).data.draft.hotCourseCards,HOME_CARDS);
    assert.deepEqual((await req('/site/pages/public',{token:''})).data.hotCourseCards.map(c=>c.image),HOME_CARDS.map(c=>c.image));
  });
});
