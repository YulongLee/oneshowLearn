import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createAssetStorage,ossSettings,materialRange} from '../server/asset-storage.mjs';

const env={ASSET_STORAGE:'oss',OSS_BUCKET:'projects-yulong',OSS_REGION:'cn-shanghai',OSS_ENDPOINT:'https://oss-cn-shanghai.aliyuncs.com',OSS_KEY_PREFIX:'oneshowlearn/resources/',OSS_ACCESS_KEY_ID:'fake-id',OSS_ACCESS_KEY_SECRET:'fake-secret'};
test('OSS configuration is explicit, project scoped and private by default',()=>{
  assert.equal(ossSettings({}),null);
  for(const changes of [{ASSET_STORAGE:'other'},{OSS_KEY_PREFIX:'other-product/'},{OSS_KEY_PREFIX:'oneshowlearn/../'},{OSS_ENDPOINT:'http://oss-cn-shanghai.aliyuncs.com'},{OSS_ENDPOINT:'https://example.com'},{OSS_ACCESS_KEY_SECRET:''}])assert.throws(()=>ossSettings({...env,...changes}));
  assert.equal(ossSettings(env).prefix,'oneshowlearn/resources/');
  const storage=createAssetStorage(env,{});
  assert.equal(JSON.stringify(storage.info).includes('fake-'),false);
});
test('media byte ranges normalize suffix and open-ended seeks',()=>{
  assert.equal(materialRange(undefined,100),null);
  assert.deepEqual(materialRange('bytes=5-9',100),{start:5,end:9,length:5,header:'bytes=5-9'});
  assert.equal(materialRange('bytes=-10',100).header,'bytes=90-99');
  assert.equal(materialRange('bytes=90-',100).length,10);
  assert.equal(materialRange('bytes=0-999',100).length,100);
  for(const value of ['bytes=100-','bytes=8-5','bytes=-0','bytes=-','bytes=0-1,5-6','items=0-2','bytes=99999999999999999999-'])assert.equal(materialRange(value,100),false);
});

test('OSS CMS integration keeps permissions, media semantics and local compatibility',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'oneshowlearn-oss-test-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'test.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'asset-storage-tests-only',ASSET_STORAGE:'local'});
  const {db,row,run}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {materialUrl}=await import('../server/materials.mjs');
  const {validCommunityImage}=await import('../server/community-assets.mjs');
  const {createApp}=await import('../server/index.mjs');
  const objects=new Map();let fail=false,lastHeaders,opens=0,removed=0;
  const client={
    async put(key,file,options){lastHeaders=options.headers;if(fail)throw Object.assign(new Error('storage unavailable'),{code:'TestUnavailable'});assert.equal(objects.has(key),false);objects.set(key,await readFile(file));return {res:{headers:{etag:'test-etag'}}};},
    async delete(key){removed++;objects.delete(key);},
    async head(key){if(!objects.has(key))throw Object.assign(new Error('missing'),{code:'NoSuchKey'});},
    async getStream(key,options){opens++;if(!objects.has(key))throw Object.assign(new Error('missing'),{code:'NoSuchKey'});let content=objects.get(key);const range=materialRange(options.headers.Range,content.length);if(range)content=content.subarray(range.start,range.end+1);return {stream:Readable.from([content]),res:{status:range?206:200,headers:{}}};}
  };
  const storage=createAssetStorage(env,client);
  const server=createApp({assetStorage:storage}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();await rm(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  function user(name,role){const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[`${name}@example.com`,'unused',name,role]).lastInsertRowid);return row('SELECT * FROM users WHERE id=?',[id]);}
  const admin=user('oss-admin','admin'),learner=user('oss-learner','learner');
  const headers={Authorization:`Bearer ${signUser(admin)}`};
  async function upload(name,content='private material body'){const body=new FormData();body.append('file',new Blob([content]),name);const response=await fetch(base+'/api/admin/cms/assets',{method:'POST',headers,body});return {status:response.status,data:await response.json()};}
  const get=url=>fetch(base+url);
  let asset,url;
  await t.test('upload stores only in scoped private OSS and returns stable website URL',async()=>{
    const result=await upload('课程资料.txt');assert.equal(result.status,201);asset=result.data;
    assert.match(asset.url,/^\/api\/materials\/\d+$/);assert.equal(asset.name,'课程资料.txt');
    const location=row('SELECT * FROM asset_storage WHERE asset_id=?',[asset.id]);
    assert.match(location.object_key,/^oneshowlearn\/resources\/\d{4}-\d{2}\/[a-f0-9-]+\.txt$/);
    assert.equal(lastHeaders['x-oss-object-acl'],'private');assert.equal(lastHeaders['x-oss-forbid-overwrite'],'true');
    assert.deepEqual(await readdir(path.join(temp,'uploads-private')),[]);
    url=materialUrl(asset.url,admin);
    const response=await get(url);assert.equal(response.status,200);assert.equal(await response.text(),'private material body');
    assert.match(response.headers.get('content-disposition'),/attachment/);assert.match(response.headers.get('cache-control'),/no-store/);
    const list=await(await fetch(base+'/api/admin/cms/assets',{headers})).json();assert.equal(list.items[0].storage_provider,'oss');
    const status=await(await fetch(base+'/api/admin/cms/storage',{headers})).json();assert.equal(status.prefix,env.OSS_KEY_PREFIX);assert.equal(JSON.stringify(status).includes('fake-'),false);
  });
  await t.test('no direct access, no learner bypass, current session is revalidated before OSS',async()=>{
    const before=opens;
    assert.equal((await get(asset.url)).status,401);
    assert.equal((await get(materialUrl(asset.url,learner))).status,403);
    assert.equal((await fetch(base+'/api/admin/cms/storage')).status,401);
    run('UPDATE users SET token_version=token_version+1 WHERE id=?',[admin.id]);
    assert.equal((await get(url)).status,403);
    run('UPDATE users SET token_version=0 WHERE id=?',[admin.id]);
    assert.equal(opens,before);
  });
  await t.test('video seek, suffix range, HEAD and unsatisfiable ranges work',async()=>{
    const video=(await upload('demo.mp4','0123456789abcdef')).data;
    const link=base+materialUrl(video.url,admin);
    const response=await fetch(link,{headers:{Range:'bytes=3-7'}});assert.equal(response.status,206);assert.equal(await response.text(),'34567');assert.equal(response.headers.get('content-range'),'bytes 3-7/16');assert.equal(response.headers.get('content-type'),'video/mp4');
    const suffix=await fetch(link,{headers:{Range:'bytes=-3'}});assert.equal(await suffix.text(),'def');
    const head=await fetch(link,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'16');assert.equal(await head.text(),'');
    const invalid=await fetch(link,{headers:{Range:'bytes=99-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */16');
  });
  await t.test('local files and verified community image signatures remain usable',async()=>{
    const id=Number(run('INSERT INTO assets(filename,original_name,mime_type,size_bytes,url) VALUES(?,?,?,?,?)',['legacy.txt','legacy.txt','text/plain',6,'']).lastInsertRowid);
    run('UPDATE assets SET url=? WHERE id=?',[`/api/materials/${id}`,id]);await writeFile(path.join(temp,'uploads-private','legacy.txt'),'legacy');
    assert.equal(await(await get(materialUrl(`/api/materials/${id}`,admin))).text(),'legacy');
    const png=(await upload('qr.png',Buffer.from('89504e470d0a1a0a00000000','hex'))).data;
    assert.equal(validCommunityImage(png.url),true);
    const bad=(await upload('fake.png','not an image header')).data;assert.equal(validCommunityImage(bad.url),false);
  });
  await t.test('failed remote upload has no database row or local leak',async()=>{
    const before=row('SELECT COUNT(*) AS n FROM assets').n;fail=true;
    assert.equal((await upload('fail.txt')).status,500);fail=false;
    assert.equal(row('SELECT COUNT(*) AS n FROM assets').n,before);
    assert.deepEqual(await readdir(path.join(temp,'uploads-private')),['legacy.txt']);
  });
  await t.test('database insert failure removes only the just-created remote object',async()=>{
    const count=objects.size;
    db.exec("CREATE TRIGGER reject_oss_test BEFORE INSERT ON assets WHEN NEW.original_name='db-fail.txt' BEGIN SELECT RAISE(ABORT,'test'); END;");
    try{assert.equal((await upload('db-fail.txt')).status,500);}finally{db.exec('DROP TRIGGER reject_oss_test');}
    assert.equal(objects.size,count);assert.equal(removed,1);
  });
  await t.test('missing cloud object is a missing-file error, not an expired ticket',async()=>{
    const location=row('SELECT * FROM asset_storage WHERE asset_id=?',[asset.id]);objects.delete(location.object_key);
    assert.equal((await get(url)).status,404);
    await assert.rejects(()=>storage.open({...location,bucket:'other-bucket'}));
  });
});
