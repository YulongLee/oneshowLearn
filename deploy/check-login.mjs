// Scoped login release checks. Credentials arrive on stdin, never in the archive.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,chmodSync,copyFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [mode,staging,backup]=process.argv.slice(2);
const app='/var/www/oneshowlearn',envFile='/etc/oneshowlearn/oneshowlearn.env';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex');
if(mode==='key'||mode==='verify-env'){
  const before=parseEnv(readFileSync(`${backup}/oneshowlearn.env`,'utf8'));
  let raw=readFileSync(envFile,'utf8'),env=parseEnv(raw);
  if(mode==='key'&&!env.AUTH_CONFIG_ENCRYPTION_KEY){
    raw+=`\nAUTH_CONFIG_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`;
    writeFileSync(`${envFile}.login-next`,raw,{mode:0o600,flag:'wx'});
    chmodSync(`${envFile}.login-next`,0o600);renameSync(`${envFile}.login-next`,envFile);env=parseEnv(raw);
  }
  assert.match(env.AUTH_CONFIG_ENCRYPTION_KEY||'',/^[a-f0-9]{64}$/i);
  for(const [k,v]of Object.entries(before))assert.equal(env[k],v,`Existing environment changed: ${k}`);
  for(const k of Object.keys(env))assert.ok(k in before||k==='AUTH_CONFIG_ENCRYPTION_KEY');
  if(mode==='key'){copyFileSync(envFile,`${backup}/oneshowlearn-with-login-key.env`);chmodSync(`${backup}/oneshowlearn-with-login-key.env`,0o600);}
  console.log('PASS stable login encryption master; existing environment and email settings preserved');
}else if(mode==='rehearse'||mode==='verify-data'){
  let current;
  if(mode==='rehearse'){
    const target=`${backup}/rehearsal.db`;copyFileSync(`${backup}/oneshowlearn.db`,target);chmodSync(target,0o600);
    process.env.DATABASE_PATH=target;
    const {createApp}=await import(pathToFileURL(`${backup}/rehearsal/server/index.mjs`));createApp();
    current=new DatabaseSync(target,{readOnly:true});
  }else current=new DatabaseSync(`${app}/data/oneshowlearn.db`,{readOnly:true});
  const old=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});
  assert.equal(current.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(),[]);
  let unchanged=0;
  for(const {name}of old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
    let columns=old.prepare(`PRAGMA table_info(${quote(name)})`).all().map(c=>c.name);
    if(mode==='verify-data'&&name==='users')columns=columns.filter(c=>c!=='last_login_at');
    const cols=columns.map(quote).join(',');
    const before=old.prepare(`SELECT ${cols} FROM ${quote(name)}`).all();
    const after=current.prepare(`SELECT ${cols} FROM ${quote(name)}`).all();
    if(mode==='verify-data'&&['auth_rate_limits','account_audit'].includes(name)){
      if(name==='account_audit')for(const r of before)assert.ok(after.some(n=>JSON.stringify(n)===JSON.stringify(r)),'Original audit missing');
      continue;
    }
    // Hashes avoid exposing personal records in assertion output.
    assert.equal(digest(after),digest(before),`Data changed: ${name}`);unchanged++;
  }
  assert.equal(current.prepare('PRAGMA table_info(users)').all().find(c=>c.name==='email').notnull,0);
  for(const table of ['login_identities','login_challenges'])assert.equal(current.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,'No login fixtures allowed');
  if(mode==='rehearse')assert.equal(current.prepare('SELECT COUNT(*) n FROM login_configuration').get().n,0);
  old.close();current.close();console.log(`PASS ${mode}: integrity, foreign keys, ${unchanged} original tables preserved; no login fixtures`);
}else if(mode==='configure'||mode==='smoke'){
  process.loadEnvFile(envFile);
  const request=(route,options={})=>fetch('https://oneshowlearn.com/api'+route,{signal:AbortSignal.timeout(20000),redirect:'error',...options});
  const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  assert.equal(login.status,200,'Existing email login');const {token}=await login.json();assert.ok(token);
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  if(mode==='configure'){
    const incoming=JSON.parse(readFileSync(0,'utf8'));
    assert.deepEqual(Object.keys(incoming).sort(),['smsAccessKeyId','smsAccessKeySecret']);
    for(const value of Object.values(incoming))assert.ok(typeof value==='string'&&value.length>8);
    const response=await request('/admin/login-settings',{headers});assert.equal(response.status,200);
    const c=await response.json();assert.equal(c.version,0,'Do not overwrite existing production login configuration');
    const settings={...c.settings,sms:{enabled:true,signName:'杭州临平知界智能技术',templateCode:'SMS_336645096',dailyLimit:100},wechat:{...c.settings.wechat,enabled:false}};
    const save=await request('/admin/login-settings',{method:'PUT',headers:{...headers,'If-Match':String(c.version)},body:JSON.stringify({settings,secrets:incoming})});
    assert.equal(save.status,200,'Encrypted SMS configuration import');const result=await save.json();
    assert.equal(result.settings.sms.enabled,true);assert.equal(result.settings.wechat.enabled,false);assert.equal(result.secrets,undefined);
    const raw=JSON.stringify(result);assert.ok(Object.values(incoming).every(secret=>!raw.includes(secret)));
    console.log('PASS SMS credentials imported through versioned admin API; WeChat disabled; no SMS sent');
  }else{
    const response=await request('/auth/status');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const status=await response.json();for(const key of ['phoneLoginEnabled','registrationEnabled','passwordResetEnabled'])assert.equal(status[key],true,key);assert.equal(status.wechatLoginEnabled,false);assert.equal(status.deliveryMode,'email');
    for(const route of ['/admin/login-settings','/auth/identities','/auth/profile'])assert.equal((await request(route)).status,401,route);
    for(const route of ['/auth/me','/auth/profile','/auth/identities','/admin/login-settings','/admin/email','/admin/users','/me/workspace','/learning/ai/conversations'])assert.equal((await request(route,{headers})).status,200,route);
    const settings=await(await request('/admin/login-settings',{headers})).json();assert.equal(settings.secrets,undefined);assert.equal(settings.secretsConfigured.smsAccessKeyId,true);assert.equal(settings.secretsConfigured.smsAccessKeySecret,true);assert.equal(settings.secretsConfigured.wechatAppSecret,false);assert.equal(settings.encryptionReady,true);
    assert.equal((await request('/auth/phone/request-code',{method:'POST',headers:{'content-type':'application/json'},body:'{"phone":"123"}'})).status,400);
    assert.equal((await request('/auth/wechat/start',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);
    const email=await request('/admin/email/verify',{method:'POST',headers});assert.equal(email.status,200);assert.equal((await email.json()).ok,true);
    const offer=await request('/commerce/offer');assert.deepEqual(await offer.json(),JSON.parse(readFileSync(`${backup}/offer.before.json`)));
    console.log('PASS HTTPS email login, SMS availability, WeChat off, private permissions, SMTP authentication, existing APIs and unchanged pricing; no real messages sent');
  }
}else throw new Error('Unknown login release check');
