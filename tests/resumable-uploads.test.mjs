import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
test('private resumable upload preserves offset, owner, checksums and retry safety',async t=>{
 const temp=await mkdtemp(path.join(tmpdir(),'osl-resumable-'));
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-upload-only',ASSET_STORAGE:'local'});
 const {db,row,run}=await import('../server/db.mjs'),{signUser}=await import('../server/auth.mjs'),{createApp}=await import('../server/index.mjs'),{materialUrl}=await import('../server/materials.mjs'),{UPLOAD_CHUNK_BYTES:CHUNK}=await import('../server/resumable-uploads.mjs');
 const make=role=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[randomUUID()+'@example.invalid','unused',role,role]).lastInsertRowid);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};},owner=make('admin'),other=make('editor'),learner=make('learner');
 let puts=0,fail=false,removed=0,release,enter;const objects=new Map();
 const storage={async put(f){puts++;if(fail)throw Error('isolated simulated storage failure');if(enter){enter();await new Promise(r=>release=r);enter=null;}const data=await readFile(f.path),key='oneshowlearn/resources/'+f.filename;objects.set(key,data);return {provider:'oss',bucket:'isolated-bucket',endpoint:'https://oss-cn-shanghai.aliyuncs.com',object_key:key,etag:'mock',header_hex:data.subarray(0,12).toString('hex')};},async remove(l){removed++;objects.delete(l.object_key);},async open(l){return {res:{status:200},stream:Readable.from([objects.get(l.object_key)])};}};
 const server=createApp({assetStorage:storage}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();await rm(temp,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(route,user=owner,method='GET',body)=>{const binary=Buffer.isBuffer(body),r=await fetch(base+route,{method,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(body?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},...(body?{body:binary?body:JSON.stringify(body)}:{})});return {status:r.status,data:r.status===204?null:await r.json()};};
 const bytes=Buffer.alloc(52*1024*1024+17,17),parts=[];for(let n=0;n<bytes.length;n+=CHUNK)parts.push(bytes.subarray(n,n+CHUNK));
 const manifest={name:'隔离长视频.mp4',size:bytes.length,mime:'video/mp4',chunks:parts.map(p=>createHash('sha256').update(p).digest('hex'))};let id,asset;
 await t.test('only management, safe extension and bounded verified manifests',async()=>{
  assert.equal((await req('/admin/uploads',null,'POST',manifest)).status,401);assert.equal((await req('/admin/uploads',learner,'POST',manifest)).status,403);
  assert.equal((await req('/admin/uploads',owner,'POST',{...manifest,name:'../video.mp4'})).status,400);assert.equal((await req('/admin/uploads',owner,'POST',{...manifest,name:'unsafe.html'})).status,400);
  assert.equal((await req('/admin/uploads',owner,'POST',{...manifest,size:2*1024*1024*1024})).status,400);assert.equal((await req('/admin/uploads',owner,'POST',{...manifest,chunks:[]})).status,400);
  const created=await req('/admin/uploads',owner,'POST',manifest);assert.equal(created.status,201);id=created.data.id;assert.equal(created.data.received,0);
  assert.equal((await req('/admin/uploads/'+id,other)).status,404);
 });
 await t.test('interrupted upload resumes exact original manifest; corrupt/out-of-order chunks rejected',async()=>{
  assert.equal((await req(`/admin/uploads/${id}/chunks/1`,owner,'PUT',parts[1])).status,409);
  assert.equal((await req(`/admin/uploads/${id}/chunks/0`,owner,'PUT',Buffer.alloc(CHUNK,18))).status,400);
  assert.equal((await req(`/admin/uploads/${id}/chunks/0`,owner,'PUT',parts[0])).data.received,CHUNK);
  assert.equal((await req(`/admin/uploads/${id}/chunks/0`,owner,'PUT',parts[0])).data.received,CHUNK);
  const resumed=(await req('/admin/uploads',owner,'POST',manifest)).data;assert.equal(resumed.id,id);assert.equal(resumed.received,CHUNK);
  assert.equal((await req(`/admin/uploads/${id}/complete`,owner,'POST',{})).status,409);
  for(let n=1;n<parts.length;n++)assert.equal((await req(`/admin/uploads/${id}/chunks/${n}`,owner,'PUT',parts[n])).status,200);
 });
 await t.test('cloud failure retains verified chunks; retry creates exactly one private asset',async()=>{
  fail=true;assert.equal((await req(`/admin/uploads/${id}/complete`,owner,'POST',{})).status,500);fail=false;
  const saved=(await req('/admin/uploads/'+id)).data;assert.equal(saved.received,bytes.length);assert.equal(saved.state,'uploading');
  const complete=await req(`/admin/uploads/${id}/complete`,owner,'POST',{});assert.equal(complete.status,201);asset=complete.data.asset;
  assert.equal((await req(`/admin/uploads/${id}/complete`,owner,'POST',{})).data.asset.id,asset.id);assert.equal(row('SELECT COUNT(*) n FROM assets').n,1);
  assert.equal((await fetch(base+'/materials/'+asset.id)).status,401);const url=materialUrl('/api/materials/'+asset.id,row('SELECT * FROM users WHERE id=?',[owner.id]));const downloaded=await fetch(base.replace(/\/api$/,'')+url);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
 });
 await t.test('in-flight completion cannot publish after account revocation; independent sessions cannot race',async()=>{
  const small=Buffer.from('isolated content'),m={name:'revocation.txt',size:small.length,mime:'text/plain',chunks:[createHash('sha256').update(small).digest('hex')]},s=(await req('/admin/uploads',owner,'POST',m)).data;
  await req(`/admin/uploads/${s.id}/chunks/0`,owner,'PUT',small);const entered=new Promise(r=>enter=r),pending=req(`/admin/uploads/${s.id}/complete`,owner,'POST',{});await entered;
  assert.equal((await req(`/admin/uploads/${s.id}/complete`,owner,'POST',{})).status,202);
  run('UPDATE users SET token_version=token_version+1 WHERE id=?',[owner.id]);release();assert.equal((await pending).status,403);assert.equal(removed,1);assert.equal(row('SELECT COUNT(*) n FROM assets').n,1);
  owner.token=signUser(row('SELECT * FROM users WHERE id=?',[owner.id]));assert.equal((await req('/admin/uploads/'+s.id)).data.state,'uploading');assert.equal((await req('/admin/uploads/'+s.id,owner,'DELETE')).status,204);
 });
 await t.test('expired sessions cannot receive or finalize chunks and owner can cancel active staging',async()=>{
  const small=Buffer.from('expires'),m={name:'expires.txt',size:small.length,mime:'text/plain',chunks:[createHash('sha256').update(small).digest('hex')]},s=(await req('/admin/uploads',owner,'POST',m)).data;
  run('UPDATE asset_upload_sessions SET expires_at=0 WHERE id=?',[s.id]);assert.equal((await req('/admin/uploads/'+s.id)).status,410);assert.equal((await req(`/admin/uploads/${s.id}/chunks/0`,owner,'PUT',small)).status,410);
  const fresh=(await req('/admin/uploads',owner,'POST',m)).data;assert.notEqual(fresh.id,s.id);assert.equal((await req('/admin/uploads/'+fresh.id,other,'DELETE')).status,404);assert.equal((await req('/admin/uploads/'+fresh.id,owner,'DELETE')).status,204);
 });
 assert.ok(puts>=3);
});
