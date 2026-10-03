import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

const [mode,stage,backup]=process.argv.slice(2);
const envFile='/etc/oneshowlearn/oneshowlearn.env';
const keys=['ASSET_STORAGE','OSS_BUCKET','OSS_REGION','OSS_ENDPOINT','OSS_KEY_PREFIX','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET'];
if(mode==='configure'){
  const input=JSON.parse(readFileSync(0,'utf8'));
  assert.deepEqual(Object.keys(input).sort(),[...keys].sort());
  assert.equal(input.OSS_BUCKET,'projects-yulong');assert.equal(input.OSS_KEY_PREFIX,'oneshowlearn/resources/');
  const {ossSettings}=await import(pathToFileURL(stage+'/server/asset-storage.mjs'));ossSettings(input);
  const original=readFileSync(envFile,'utf8');
  const clean=original.split('\n').filter(line=>!keys.some(k=>new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=`).test(line))).join('\n');
  for(const value of Object.values(input))assert.match(value,/^[A-Za-z0-9_:/.-]+$/);
  const result=clean+'\n'+keys.map(k=>`${k}=${input[k]}`).join('\n')+'\n';
  const before=parseEnv(original),after=parseEnv(result);
  for(const key of Object.keys(before).filter(k=>!keys.includes(k)))assert.equal(after[key],before[key]);
  writeFileSync(stage+'/proposed.env',result,{mode:0o600});
  console.log('PASS scoped OSS configuration prepared; unrelated settings preserved');
}else if(mode==='rehearse'){
  Object.assign(process.env,parseEnv(readFileSync(stage+'/proposed.env','utf8')),{DATABASE_PATH:backup+'/rehearsal.db',UPLOAD_DIR:stage+'/rehearsal/uploads'});
  const {db,row,rows}=await import(pathToFileURL(stage+'/rehearsal/server/db.mjs'));
  const {createApp}=await import(pathToFileURL(stage+'/rehearsal/server/index.mjs'));
  const {signUser}=await import(pathToFileURL(stage+'/rehearsal/server/auth.mjs'));
  const {materialUrl}=await import(pathToFileURL(stage+'/rehearsal/server/materials.mjs'));
  const {createAssetStorage}=await import(pathToFileURL(stage+'/rehearsal/server/asset-storage.mjs'));
  const storage=createAssetStorage();const admin=row("SELECT * FROM users WHERE role='admin' AND status='active' AND email_verified=1 LIMIT 1");assert.ok(admin);
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;const headers={Authorization:`Bearer ${signUser(admin)}`};
  const previous=rows('SELECT asset_id FROM asset_storage').map(a=>a.asset_id);
  try{
    const settings=await(await fetch(base+'/api/admin/cms/storage',{headers})).json();assert.equal(settings.provider,'oss');
    const form=new FormData();form.append('file',new Blob(['OneShowLearn private OSS deployment probe.']), 'oss-release-probe.txt');
    const upload=await fetch(base+'/api/admin/cms/assets',{method:'POST',headers,body:form});assert.equal(upload.status,201);
    const asset=await upload.json(),url=base+materialUrl(asset.url,admin);
    assert.equal(await(await fetch(url)).text(),'OneShowLearn private OSS deployment probe.');
    const range=await fetch(url,{headers:{Range:'bytes=0-11'}});assert.equal(range.status,206);assert.equal(await range.text(),'OneShowLearn');
    assert.equal((await fetch(url,{method:'HEAD'})).status,200);
    assert.equal((await fetch(base+asset.url)).status,401);
    const location=row('SELECT * FROM asset_storage WHERE asset_id=?',[asset.id]);
    const anonymous=await fetch(`https://${location.bucket}.oss-cn-shanghai.aliyuncs.com/${location.object_key}`,{method:'HEAD'});assert.equal(anonymous.status,403);
    console.log('PASS server rehearsal: CMS upload, download, byte range, HEAD and anonymous denial; live DB untouched');
  }finally{
    for(const location of rows('SELECT * FROM asset_storage'))if(!previous.includes(location.asset_id))await storage.remove(location);
    await new Promise(r=>server.close(r));db.close();
  }
}else if(mode==='live'){
  const env=parseEnv(readFileSync(envFile,'utf8'));
  const before=parseEnv(readFileSync(backup+'/oneshowlearn.env','utf8'));
  for(const key of Object.keys(before).filter(k=>!keys.includes(k)))assert.equal(env[key],before[key]);
  const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
  try{
    const admin=db.prepare("SELECT * FROM users WHERE role='admin' AND status='active' AND email_verified=1 LIMIT 1").get();assert.ok(admin);
    const require=createRequire('/var/www/oneshowlearn/package.json'),jwt=require('jsonwebtoken');
    const token=jwt.sign({sub:admin.id,ver:admin.token_version},env.JWT_SECRET,{expiresIn:'2m'});
    const headers={Authorization:`Bearer ${token}`};
    const status=await fetch('https://oneshowlearn.com/api/admin/cms/storage',{headers});assert.equal(status.status,200);
    assert.deepEqual(await status.json(),{provider:'oss',bucket:'projects-yulong',prefix:'oneshowlearn/resources/',region:'cn-shanghai'});
    assert.equal((await fetch('https://oneshowlearn.com/api/admin/cms/storage')).status,401);
    const old=db.prepare("SELECT a.* FROM assets a LEFT JOIN asset_storage s ON s.asset_id=a.id WHERE s.asset_id IS NULL AND a.url LIKE '/api/materials/%' ORDER BY a.id").all();
    let checked=0;
    for(const asset of old){
      const file=path.resolve('/var/www/oneshowlearn',env.UPLOAD_DIR||'uploads')+'-private/'+path.basename(asset.filename);
      if(!existsSync(file))continue;
      const ticket=jwt.sign({purpose:'material',asset:asset.id,sub:admin.id,ver:admin.token_version},env.JWT_SECRET,{expiresIn:'2m'});
      const response=await fetch(`https://oneshowlearn.com${asset.url}?ticket=${ticket}`,{method:'HEAD'});assert.equal(response.status,200);checked++;if(checked===3)break;
    }
    assert.ok(checked>0);
    for(const [name,route] of [['offer','/api/commerce/offer'],['status','/api/auth/status'],['resources','/api/resources'],['courses','/api/learning/entry'],['projects','/api/learning/projects']]){
      const response=await fetch('https://oneshowlearn.com'+route);assert.equal(response.status,200);assert.deepEqual(await response.json(),JSON.parse(readFileSync(backup+'/'+name+'.before.json')));
    }
    console.log(`PASS HTTPS OSS status, admin guard, ${checked} old protected files and unchanged catalogues/login/commerce`);
  }finally{db.close();}
}else throw new Error('Unknown verification mode');
