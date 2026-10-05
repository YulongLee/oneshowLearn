import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hasFavorite,toggleFavorite,favoriteReferenceKey} from '../src/favorite-reference.js';
import {favoriteItems,withoutFavorite,favoriteAction} from '../src/favorites-studio-model.js';

test('reference identity keeps course/resource/project/material/notes distinct and removal immutable',()=>{
 const state={favorites:[1],resourceFavorites:[{id:1,savedAt:'2026-10-01T00:00:00Z'}],notes:[{id:'note',body:'keep',starred:true}],tasks:[{id:'keep'}]},original=JSON.stringify(state);
 const refs=[{kind:'project',id:1},{kind:'lesson',id:1},{kind:'material',id:1,placementId:1},{kind:'material',id:1,placementId:2},{kind:'courseware',id:1},{kind:'learning-note',id:randomUUID()}];
 let next=state;for(const ref of refs)next=toggleFavorite(next,ref,'2026-10-01T00:00:00Z');
 assert.equal(new Set(refs.map(favoriteReferenceKey)).size,6);assert.equal(next.contentFavorites.length,6);
 for(const ref of refs)assert.equal(hasFavorite(next,ref),true);
 assert.equal(JSON.stringify(state),original);
 const contents=refs.map(reference=>({reference,content:{title:reference.kind,sourceTitle:'真实来源',kind:reference.kind==='learning-note'?'note':'resource',url:'/learn/course/lessons/1'}}));
 const items=favoriteItems({state:next,contents,contentsReady:true});
 const material=items.find(i=>i.reference?.placementId===1),removed=withoutFavorite(next,material);
 assert.equal(removed.contentFavorites.length,5);assert.ok(removed.contentFavorites.some(r=>r.placementId===2));assert.equal(removed.notes,state.notes);assert.equal(removed.favorites,state.favorites);assert.equal(removed.tasks,state.tasks);
 assert.equal(favoriteAction(items.find(i=>i.reference?.kind==='lesson')),'打开课时');
 assert.equal(favoriteAction(items.find(i=>i.reference?.kind==='learning-note')),'打开笔记');
});

test('favorites resolve published references under account/access/version guards without changing content',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'osl-favorite-api-'));
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-favorites',AI_ENABLED:'false',ASSET_STORAGE:'local'});
 const {db,row,run}=await import('../server/db.mjs'),{signUser}=await import('../server/auth.mjs'),{createApp}=await import('../server/index.mjs'),{lessonSchema}=await import('../server/learning-model.mjs');
 const add=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
 const user=name=>{const id=add("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'learner',1)",[name+'@example.invalid','unused',name]);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
 const owner=user('owner'),other=user('other');
 const lp=add("INSERT INTO learning_paths(slug,title,status) VALUES('fav-path','路径','published')"),pack=add("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'fav-course','课程','published')",[lp]),chapter=add("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'章节','published')",[pack]);
 const lesson=add("INSERT INTO learning_lessons(title,status,config) VALUES('课时','published',?)",[JSON.stringify(lessonSchema.parse({title:'课时',config:{pptAssetId:123,isDemoMedia:true}}).config)]);
 const placement=add("INSERT INTO lesson_placements(lesson_id,chapter_id,status,is_preview) VALUES(?,?,'published',0)",[lesson,chapter]);
 const material=add("INSERT INTO content_library(type,title,body,status) VALUES('document','私有课程资料标题','PRIVATE_MATERIAL_BODY','published')");
 run("INSERT INTO lesson_materials(placement_id,library_id,role) VALUES(?,?,'article')",[placement,material]);
 const project=add("INSERT INTO practice_projects(slug,title,status) VALUES('fav-project','项目','published')"),note=randomUUID(),foreign=randomUUID();
 run('INSERT INTO learning_notes(id,user_id,placement_id,title,body) VALUES(?,?,?,?,?)',[note,owner.id,placement,'我的课程笔记','PRIVATE_OWNER_NOTE']);
 run('INSERT INTO learning_notes(id,user_id,placement_id,title,body) VALUES(?,?,?,?,?)',[foreign,other.id,placement,'其他人笔记','FOREIGN_NOTE_SECRET']);
 run("INSERT INTO entitlements(user_id,pack_id,status,starts_at) VALUES(?,?,'active','2000-01-01')",[owner.id,pack]);
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}/api`,req=async(url,u=owner,body,version)=>{const res=await fetch(base+url,{method:body?'PUT':'GET',headers:{...(u?{Authorization:'Bearer '+u.token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(version?{'If-Match':version}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cache:res.headers.get('cache-control')};};
 const get=()=>req('/me/workspace'),save=async refs=>{const {data}=await get();return req('/me/workspace/state',owner,{...data.state,contentFavorites:refs},data.version);};
 const at='2026-10-01T00:00:00Z',refs=[{kind:'project',id:project,savedAt:at},{kind:'lesson',id:placement,savedAt:at},{kind:'courseware',id:placement,savedAt:at},{kind:'material',id:material,placementId:placement,savedAt:at},{kind:'learning-note',id:note,savedAt:at}];
 await t.test('anonymous guards and reference-only writes',async()=>{
  assert.equal((await req('/me/favorites/contents',null)).status,401);
  assert.equal((await save(refs)).status,200);
  const resolved=await req('/me/favorites/contents');assert.equal(resolved.cache,'private, no-store');assert.equal(resolved.data.items.length,5);
  assert.ok(resolved.data.items.find(i=>i.reference.kind==='material').content.url.endsWith('?material='+material));
  assert.equal(resolved.data.items.find(i=>i.reference.kind==='learning-note').content.body,'PRIVATE_OWNER_NOTE');
  assert.ok(!JSON.stringify(resolved.data).includes('PRIVATE_MATERIAL_BODY'));assert.ok(!JSON.stringify(resolved.data).includes('FOREIGN_NOTE_SECRET'));
  const saved=row('SELECT state_json FROM workspace_state WHERE user_id=?',[owner.id]).state_json;assert.ok(!saved.includes('PRIVATE_OWNER_NOTE'));assert.ok(!saved.includes('私有课程资料标题'));
  assert.deepEqual((await req('/me/favorites/contents',other)).data.items,[]);assert.equal(row('SELECT COUNT(*) n FROM project_runs').n,0);
 });
 await t.test('reject forged note, invalid/unpublished material, duplicates and no version',async()=>{
  for(const extra of [{kind:'learning-note',id:foreign,savedAt:at},{kind:'material',id:material,placementId:9999,savedAt:at},{kind:'project',id:99999,savedAt:at}])assert.equal((await save([...refs,extra])).status,400);
  assert.equal((await save([...refs,refs[0]])).status,400);
  const d=(await get()).data;assert.equal((await req('/me/workspace/state',owner,{...d.state,contentFavorites:refs})).status,428);
  assert.equal((await req('/me/workspace/state',owner,d.state,'stale')).status,409);
 });
 await t.test('legacy client saves preserve typed references and unrelated user notes',async()=>{
  const d=(await get()).data,old={...d.state};delete old.contentFavorites;old.notes=[{id:randomUUID(),title:'个人笔记',body:'KEEP_BODY',updatedAt:at}];
  const result=await req('/me/workspace/state',owner,old,d.version);assert.equal(result.status,200);assert.deepEqual(result.data.state.contentFavorites,refs);assert.equal(result.data.state.notes[0].body,'KEEP_BODY');
  const actual=(await get()).data;assert.equal(result.data.version,actual.version);
 });
 await t.test('revocation never leaks private material metadata or grants entitlement',async()=>{
  run("UPDATE entitlements SET status='revoked' WHERE user_id=?",[owner.id]);
  const resolved=(await req('/me/favorites/contents')).data,resource=resolved.items.find(i=>i.reference.kind==='material').content;
  assert.equal(resource.locked,true);assert.equal(resource.title,'课程配套资料');assert.ok(!JSON.stringify(resolved).includes('私有课程资料标题'));assert.ok(!JSON.stringify(resolved).includes('PRIVATE_MATERIAL_BODY'));
  assert.equal((await req('/learning/placements/'+placement)).status,403);
  const d=(await req('/me/workspace',other)).data;assert.equal((await req('/me/workspace/state',other,{...d.state,contentFavorites:[refs[3]]},d.version)).status,400);
 });
 await t.test('archive/trash and removal retain original records and references until explicit unbookmark',async()=>{
  run("UPDATE practice_projects SET status='archived' WHERE id=?",[project]);run("UPDATE learning_notes SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",[note]);
  const items=(await req('/me/favorites/contents')).data.items;assert.equal(items.find(i=>i.reference.kind==='project').content,null);assert.equal(items.find(i=>i.reference.kind==='learning-note').content,null);
  assert.equal((await get()).data.state.contentFavorites.length,5);
  assert.equal((await save(refs.filter(r=>r.kind!=='material'))).status,200);assert.ok(row('SELECT body FROM content_library WHERE id=?',[material]));assert.ok(row('SELECT body FROM learning_notes WHERE id=?',[note]));
  assert.equal(row('SELECT COUNT(*) n FROM project_runs').n,0);assert.equal(row('SELECT COUNT(*) n FROM orders').n,0);
 });
});
