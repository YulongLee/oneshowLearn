import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';

test('legacy upload aliases private storage and historical active content is blocked',async t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'osl-upload-security-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'isolated.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-upload-security',ASSET_STORAGE:'local'});
  const {db,row,run}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {createApp}=await import('../server/index.mjs');
  const user=role=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[`${role}@example.invalid`,'unused',role,role]).lastInsertRowid);return signUser(row('SELECT * FROM users WHERE id=?',[id]));};
  const editor=user('editor'),learner=user('learner');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const upload=async(name,token=editor)=>{const form=new FormData();form.append('file',new Blob(['harmless isolated file'],{type:'text/html'}),name);return fetch(base+'/api/admin/assets',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:form});};
  await t.test('anonymous and learners cannot upload; both active extensions reject without assets',async()=>{
    assert.equal((await upload('blocked.txt','')).status,401);
    assert.equal((await upload('blocked.txt',learner)).status,403);
    for(const name of ['blocked.html','blocked.HTML','blocked.svg','blocked.js','blocked.xhtml'])assert.equal((await upload(name)).status,400,name);
    assert.equal(row('SELECT COUNT(*) n FROM assets').n,0);
  });
  await t.test('old clients receive protected links, never public filenames',async()=>{
    const response=await upload('兼容课件.txt');assert.equal(response.status,201);
    const a=await response.json();assert.match(a.url,/^\/api\/materials\/\d+$/);assert.equal(a.name,'兼容课件.txt');
    assert.equal((await fetch(base+a.url)).status,401);
    const stored=row('SELECT * FROM assets WHERE id=?',[a.id]);
    assert.equal(existsSync(path.join(temp,'uploads',stored.filename)),false);
    assert.equal((await fetch(base+'/uploads/'+stored.filename)).status,404);
    const link=await(await fetch(base+`/api/admin/cms/assets/${a.id}/link`,{headers:{Authorization:`Bearer ${editor}`}})).json();
    const file=await fetch(base+link.url);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/attachment/);
  });
  await t.test('unsafe historical files remain on disk but cannot execute; safe downloads remain readable',async()=>{
    for(const filename of ['old.html','old.SVG','old.js']){
      writeFileSync(path.join(temp,'uploads',filename),'harmless old file');
      const response=await fetch(base+'/uploads/'+filename);assert.equal(response.status,404);
      assert.equal(existsSync(path.join(temp,'uploads',filename)),true);
    }
    assert.equal((await fetch(base+'/uploads/old%2ehtml')).status,404);
    writeFileSync(path.join(temp,'uploads','old.txt'),'historical course text');
    const old=await fetch(base+'/uploads/old.txt');assert.equal(old.status,200);
    assert.match(old.headers.get('content-disposition'),/attachment/);assert.equal(old.headers.get('x-content-type-options'),'nosniff');
    assert.equal(await old.text(),'historical course text');
  });
});
