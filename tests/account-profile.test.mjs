import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('private account settings: persistence, isolation, validation and conflict protection', async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'osl-profile-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),ADMIN_EMAIL:'owner@example.com',ADMIN_PASSWORD:'Profile-Tests-2026',JWT_SECRET:'profile-tests-only'});
  const {db,row,run}=await import('../server/db.mjs');
  await import('../server/seed.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {createApp}=await import('../server/index.mjs');
  const server=createApp().listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api/auth`;
  const make=email=>{const id=Number(run("INSERT INTO users(email,name,password_hash,role,status,email_verified) VALUES(?,'Profile tester','unused','learner','active',1)",[email]).lastInsertRowid);return signUser(row('SELECT * FROM users WHERE id=?',[id]));};
  const a=make('a@example.com'),b=make('b@example.com');
  const request=async(token,body,version,route='/profile')=>{const response=await fetch(base+route,{method:body?'PUT':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...(version?{'If-Match':version}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,cache:response.headers.get('cache-control'),data:await response.json()};};
  let initial,saved;
  const update={name:'新的昵称',bio:'学习并做出自己的产品',avatar:''};
  await t.test('authentication and private defaults',async()=>{assert.equal((await request()).status,401);initial=(await request(a)).data;assert.equal(initial.email,'a@example.com');assert.equal(initial.bio,'');assert.equal(initial.avatar,'');assert.equal((await request(a)).cache,'no-store');assert.equal(initial.password_hash,undefined);});
  await t.test('reject missing version, arbitrary fields and invalid input',async()=>{assert.equal((await request(a,update)).status,428);for(const patch of [{role:'admin'},{email:'owner@example.com'},{user_id:1},{name:'a'},{bio:'x'.repeat(301)},{avatar:'data:image/svg+xml;base64,PHN2Zz4='},{avatar:'https://example.com/avatar.png'},{avatar:'data:image/png;base64,QUFBQUFBQUFBQUFB'}])assert.equal((await request(a,{...update,...patch},initial.version)).status,400);});
  await t.test('save persists and updates shared account identity only',async()=>{saved=await request(a,update,initial.version);assert.equal(saved.status,200);assert.equal(saved.data.name,update.name);assert.equal((await request(a)).data.bio,update.bio);assert.equal((await request(a,null,null,'/me')).data.user.name,update.name);assert.equal((await request(a,null,null,'/me')).data.user.role,'learner');assert.equal((await request(b)).data.bio,'');assert.equal((await request(b)).data.name,'Profile tester');});
  await t.test('stale write never overwrites newer data',async()=>{assert.equal((await request(a,{...update,name:'覆盖新昵称'},initial.version)).status,409);assert.equal((await request(a)).data.name,update.name);});
  await t.test('avatar stays private, removable and rejects oversize content',async()=>{const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';const next=await request(a,{...update,avatar},saved.data.version);assert.equal(next.status,200);assert.equal((await request(a,null,null,'/me')).data.user.avatar,avatar);assert.equal((await request(b,null,null,'/me')).data.user.avatar,'');assert.equal((await request(a,{...update,avatar:'x'.repeat(280001)},next.data.version)).status,400);const removed=await request(a,update,next.data.version);assert.equal(removed.status,200);assert.equal(removed.data.avatar,'');});
  await t.test('admin name changes invalidate learner version',async()=>{const prior=(await request(a)).data;run("UPDATE users SET name='Admin changed' WHERE email='a@example.com'");assert.equal((await request(a,update,prior.version)).status,409);});
});
