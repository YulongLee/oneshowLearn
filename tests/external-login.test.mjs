import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomUUID } from 'node:crypto';

test('nullable email upgrade preserves IDs, indexes, references, data and backup',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'osl-login-migration-')),file=path.join(dir,'old.db'),db=new DatabaseSync(file);
  try {
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'learner',status TEXT NOT NULL DEFAULT 'active',email_verified INTEGER DEFAULT 0,token_version INTEGER DEFAULT 0);
      CREATE INDEX users_name ON users(name); CREATE TABLE owned(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,body TEXT);
      INSERT INTO users VALUES(42,'original@example.com','original-hash','Original','admin','active',1,3); INSERT INTO owned VALUES(1,42,'Private notes'); CREATE VIEW test_user_view AS SELECT id FROM users;
      UPDATE sqlite_sequence SET seq=100 WHERE name='users';`);
    const {migrateLogin}=await import('../server/login-schema.mjs');migrateLogin(db,file);
    assert.equal(db.prepare('SELECT * FROM users WHERE id=42').get().password_hash,'original-hash');
    assert.equal(db.prepare('SELECT body FROM owned').get().body,'Private notes');
    assert.equal(db.prepare('SELECT id FROM test_user_view').get().id,42);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='users_name'").get());
    const id=db.prepare("INSERT INTO users(email,password_hash,name) VALUES(NULL,'','Phone')").run().lastInsertRowid;assert.ok(id>100);
    migrateLogin(db,file);assert.equal(readdirSync(dir).filter(f=>f.endsWith('.bak')).length,1);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('external authentication and safe account binding',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'osl-login-api-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'login-tests-only',APP_URL:'http://127.0.0.1:4179',ADMIN_PASSWORD:'Testing-2026',REGISTRATION_ENABLED:'true'});
  const {db,row,run}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {createApp}=await import('../server/index.mjs');
  const bcrypt=(await import('bcryptjs')).default,hash=await bcrypt.hash('Testing-2026',4);
  const add=(email,role='learner')=>{const id=Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,'Tester',?,1)",[email,hash,role]).lastInsertRowid);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
  const owner=add('owner@example.com','admin'),learner=add('learner@example.com'),editor=add('editor@example.com','editor');
  let sms=[],exchanges=0,deliveryFails=false,wxSubject='wx0123456789abcdef:wechat_person_1';
  const server=createApp({loginProviders:{sendSms:async(_c,phone,code)=>{if(deliveryFails)throw new Error('test transport failure');sms.push({phone,code});},exchangeWechat:async()=>{exchanges++;return wxSubject;}}}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(url,{method,body,token,cookie,headers={}}={})=>{const r=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{ }),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={html:text};}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],cache:r.headers.get('cache-control')};};
  const resetLimits=()=>run('DELETE FROM auth_rate_limits');
  const send=async(number,extra={})=>{resetLimits();return request('/auth/phone/request-code',{body:{phone:number,...extra.body},token:extra.token});};
  const verify=async(ch,number,extra={})=>request('/auth/phone/verify',{body:{phone:number,challengeId:ch.data.challengeId,code:sms.findLast(s=>s.phone===number)?.code,...extra.body},token:extra.token});
  let settings,version=0,phoneUser;
  await t.test('disabled by default and owner-only configuration, secrets never returned',async()=>{
    assert.equal((await request('/auth/status')).data.phoneLoginEnabled,false);
    assert.equal((await send('13800000001')).status,503);
    assert.equal((await request('/admin/login-settings')).status,401);
    assert.equal((await request('/admin/login-settings',{token:editor.token})).status,403);
    const c=await request('/admin/login-settings',{token:owner.token});assert.equal(c.cache,'no-store');settings=c.data.settings;
    settings.sms={enabled:true,signName:'测试签名',templateCode:'SMS_123456',dailyLimit:100};settings.wechat={enabled:true,appId:'wx0123456789abcdef'};
    const saved=await request('/admin/login-settings',{method:'PUT',token:owner.token,headers:{'If-Match':'0'},body:{settings,secrets:{smsAccessKeyId:'test-access-id',smsAccessKeySecret:'test-access-secret',wechatAppSecret:'test-wechat-secret'}}});
    assert.equal(saved.status,200);version=saved.data.version;assert.equal(saved.data.secretsConfigured.smsAccessKeySecret,true);assert.ok(!JSON.stringify(saved.data).includes('test-access-secret'));
    assert.ok(!row('SELECT secrets_cipher FROM login_configuration').secrets_cipher.includes('test-access-secret'));
    assert.equal((await request('/admin/login-settings',{method:'PUT',token:owner.token,headers:{'If-Match':'0'},body:{settings}})).status,409);
    assert.equal((await request('/admin/login-settings',{method:'PUT',token:owner.token,body:{settings}})).status,428);
    assert.equal((await request('/admin/login-settings',{method:'PUT',token:owner.token,headers:{'If-Match':String(version)},body:{settings,secrets:{smsAccessKeySecret:''}}})).status,400);
  });
  await t.test('email login still works and SMS validates input, throttles and never exposes OTP',async()=>{
    assert.equal((await request('/auth/login',{body:{email:'learner@example.com',password:'Testing-2026'}})).status,200);
    assert.equal((await send('+8613800000001')).status,400);
    const ch=await send('13800000001');assert.equal(ch.status,200);assert.ok(!JSON.stringify(ch.data).includes(sms.at(-1).code));
    const record=row('SELECT * FROM login_challenges WHERE id=?',[ch.data.challengeId]);assert.notEqual(record.proof_hash,sms.at(-1).code);
    assert.equal((await request('/auth/phone/request-code',{body:{phone:'13800000001'}})).status,429);
    assert.equal((await verify(ch,'13800000001')).status,409); // explicit new-account confirmation
    const result=await verify(ch,'13800000001',{body:{allowCreate:true}});assert.equal(result.status,200);phoneUser=result.data;
    assert.equal(phoneUser.user.email,null);assert.equal(phoneUser.user.email_verified,0);assert.equal(phoneUser.user.role,'learner');
    assert.equal((await request('/auth/me',{token:phoneUser.token})).status,200);
    assert.equal((await request('/auth/profile',{token:phoneUser.token})).data.hasPassword,false);
    assert.equal((await request('/admin/login-settings',{token:phoneUser.token})).status,403);
    assert.equal((await verify(ch,'13800000001',{body:{allowCreate:true}})).status,400);
  });
  await t.test('attempt limit, expired, superseded and delivery-failed codes cannot log in',async()=>{
    const ch=await send('13800000002');const wrong=sms.at(-1).code==='000000'?'111111':'000000';
    for(let n=0;n<5;n++)assert.equal((await verify(ch,'13800000002',{body:{code:wrong,allowCreate:true}})).status,400);
    assert.equal((await verify(ch,'13800000002',{body:{allowCreate:true}})).status,400);
    const expired=await send('13800000003');run('UPDATE login_challenges SET expires_at=0 WHERE id=?',[expired.data.challengeId]);assert.equal((await verify(expired,'13800000003',{body:{allowCreate:true}})).status,400);
    const older=await send('13800000004');await send('13800000004');assert.equal((await verify(older,'13800000004')).status,400);
    deliveryFails=true;assert.equal((await send('13800000005')).status,500);deliveryFails=false;
    assert.equal(row("SELECT status FROM login_challenges WHERE subject='13800000005'").status,'failed');
  });
  await t.test('persisted daily budget stops sending before provider calls',async()=>{
    resetLimits();
    const key=createHmac('sha256',process.env.JWT_SECRET).update('sms-global-day:all').digest('hex');
    run('INSERT INTO auth_rate_limits(key,hits,expires_at) VALUES(?,100,?)',[key,Date.now()+86400000]);
    const before=sms.length;assert.equal((await request('/auth/phone/request-code',{body:{phone:'13800000100'}})).status,429);assert.equal(sms.length,before);resetLimits();
  });
  await t.test('phone-only account retains private workspace and AI history without fake email verification',async()=>{
    const token=phoneUser.token;
    assert.equal((await request('/me/workspace',{token})).status,200);
    const {courseAIService}=await import('../server/course-ai-service.mjs');courseAIService.configure({generate:async()=> '先明确产品的目标用户。'});
    try {
      const id=randomUUID(),root='/learning/ai/conversations';
      assert.equal((await request(root,{token,body:{id}})).status,201);
      const current=(await request(`${root}/${id}`,{token})).data;
      const turn={id:randomUUID(),question:'产品定位如何开始？',mode:'general',courseId:null,includeProduct:false};
      assert.equal((await request(`${root}/${id}/turns`,{token,headers:{'If-Match':String(current.conversation.version)},body:turn})).status,202);
      let result;for(let n=0;n<40;n++){result=(await request(`${root}/${id}`,{token})).data;if(result.turns[0]?.status!=='pending')break;await new Promise(r=>setTimeout(r,5));}
      assert.equal(result.turns[0].status,'complete');assert.equal(result.turns[0].result.answer,'先明确产品的目标用户。');
      assert.equal((await request(`${root}/${id}`,{token:learner.token})).status,404);
    }finally{courseAIService.configure(null);}
  });
  await t.test('binding proves existing account and new phone; preserves account ID; no account merging',async()=>{
    assert.equal((await send('13800000006',{token:learner.token,body:{purpose:'bind',password:'incorrect'}})).status,400);
    const ch=await send('13800000006',{token:learner.token,body:{purpose:'bind',password:'Testing-2026'}});assert.equal(ch.status,200);
    assert.equal((await verify(ch,'13800000006',{token:owner.token})).status,403);
    assert.equal((await verify(ch,'13800000006',{token:learner.token})).status,200);
    assert.equal((await request('/auth/identities',{token:learner.token})).data.phone,'138****0006');
    const login=await send('13800000006');assert.equal((await verify(login,'13800000006')).data.user.id,learner.id);
    const conflict=await send('13800000001',{token:learner.token,body:{purpose:'bind',password:'Testing-2026'}});assert.equal((await verify(conflict,'13800000001',{token:learner.token})).status,409);
    assert.equal(row("SELECT user_id FROM login_identities WHERE provider='phone' AND subject='13800000001'").user_id,phoneUser.user.id);
    const stale=await send('13800000007',{token:editor.token,body:{purpose:'bind',password:'Testing-2026'}});run('UPDATE users SET token_version=token_version+1 WHERE id=?',[editor.id]);assert.equal((await verify(stale,'13800000007',{token:editor.token})).status,401);
  });
  await t.test('disabled users cannot use phone login, revocation remains effective',async()=>{
    const ch=await send('13800000001');run("UPDATE users SET status='disabled' WHERE id=?",[phoneUser.user.id]);assert.equal((await verify(ch,'13800000001')).status,403);assert.equal((await request('/auth/me',{token:phoneUser.token})).status,401);
    run("UPDATE users SET status='active' WHERE id=?",[phoneUser.user.id]);assert.equal((await request('/auth/logout',{token:phoneUser.token,method:'POST'})).status,200);assert.equal((await request('/auth/me',{token:phoneUser.token})).status,401);
  });
  const start=async(extra={})=>{resetLimits();return request('/auth/wechat/start',{body:{allowCreate:true,...extra.body},token:extra.token});};
  const callback=ch=>request(`/auth/wechat/callback?state=${ch.data.challengeId}&code=provider-code`,{cookie:ch.cookie});
  const finish=(ch,extra={})=>request('/auth/wechat/finish',{body:{challengeId:ch.data.challengeId,pollToken:ch.data.pollToken},cookie:ch.cookie,...extra});
  await t.test('WeChat official URL, browser-bound state, single-use callback and token exchange',async()=>{
    const ch=await start();assert.equal(ch.status,200);const url=new URL(ch.data.url);assert.equal(url.origin,'https://open.weixin.qq.com');assert.equal(url.searchParams.get('scope'),'snsapi_login');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:4179/api/auth/wechat/callback');
    assert.equal((await finish(ch)).data.status,'pending');
    assert.equal((await request(`/auth/wechat/callback?state=${ch.data.challengeId}&code=x`)).status,400);assert.equal(exchanges,0);
    assert.equal((await callback(ch)).status,200);assert.equal(exchanges,1);
    assert.equal((await callback(ch)).status,400);assert.equal(exchanges,1);
    assert.equal((await finish(ch,{cookie:''})).status,400);
    const result=await finish(ch);assert.equal(result.status,200);assert.equal(result.data.user.email,null);assert.equal(result.data.user.email_verified,0);assert.equal(result.data.user.role,'learner');assert.equal((await request('/auth/me',{token:result.data.token})).status,200);
    assert.equal((await finish(ch)).status,400);
  });
  await t.test('WeChat binding stays on original email account and cancellation/expiry never creates users',async()=>{
    wxSubject='wx0123456789abcdef:wechat_person_2';
    const ch=await start({token:learner.token,body:{purpose:'bind',password:'Testing-2026'}});assert.equal((await callback(ch)).status,200);assert.equal((await finish(ch,{token:owner.token})).status,403);assert.equal((await finish(ch,{token:learner.token})).status,200);
    assert.equal((await request('/auth/identities',{token:learner.token})).data.wechat,true);
    const login=await start();await callback(login);assert.equal((await finish(login)).data.user.id,learner.id);
    const count=row('SELECT count(*) n FROM users').n;
    const cancelled=await start();assert.equal((await request(`/auth/wechat/callback?state=${cancelled.data.challengeId}`,{cookie:cancelled.cookie})).status,400);assert.equal((await finish(cancelled)).status,400);
    const expired=await start();run('UPDATE login_challenges SET expires_at=0 WHERE id=?',[expired.data.challengeId]);assert.equal((await callback(expired)).status,400);assert.equal(row('SELECT count(*) n FROM users').n,count);
    const changed={...settings,wechat:{...settings.wechat,appId:'wxabcdef0123456789'}};assert.equal((await request('/admin/login-settings',{method:'PUT',token:owner.token,headers:{'If-Match':String(version)},body:{settings:changed}})).status,409);
  });
  await t.test('live configuration changes invalidate pending codes and authorizations',async()=>{
    const smsCh=await send('13800000009'),wx=await start();
    const saved=await request('/admin/login-settings',{method:'PUT',token:owner.token,headers:{'If-Match':String(version)},body:{settings}});assert.equal(saved.status,200);
    assert.equal((await verify(smsCh,'13800000009',{body:{allowCreate:true}})).status,409);assert.equal((await callback(wx)).status,400);
  });
  await t.test('registration disabled never creates external accounts',async()=>{
    const {config}=await import('../server/config.mjs');config.registrationEnabled=false;
    try {const count=row('SELECT count(*) n FROM users').n;const ch=await send('13800000999');assert.equal((await verify(ch,'13800000999',{body:{allowCreate:true}})).status,409);assert.equal(row('SELECT count(*) n FROM users').n,count);assert.equal((await request('/auth/status')).data.externalRegistrationEnabled,false);}
    finally{config.registrationEnabled=true;}
  });
  await t.test('missing/wrong encryption key fails closed without breaking email login',async()=>{
    const prior=process.env.AUTH_CONFIG_ENCRYPTION_KEY;process.env.AUTH_CONFIG_ENCRYPTION_KEY='00'.repeat(32);
    try {const c=await request('/auth/status');assert.equal(c.data.phoneLoginEnabled,false);assert.equal(c.data.wechatLoginEnabled,false);assert.equal((await request('/admin/login-settings',{token:owner.token})).status,503);assert.equal((await request('/auth/login',{body:{email:'learner@example.com',password:'Testing-2026'}})).status,200);}
    finally{if(prior===undefined)delete process.env.AUTH_CONFIG_ENCRYPTION_KEY;else process.env.AUTH_CONFIG_ENCRYPTION_KEY=prior;}
  });
});

test('provider adapters use signed fixed endpoints, validate replies and never return secrets',async()=>{
  const {aliyunSmsRequest,sendLoginSms,exchangeWechatCode}=await import('../server/login-providers.mjs');
  const c={settings:{sms:{signName:'OneShowLearn',templateCode:'SMS_123'},wechat:{appId:'wx0123456789abcdef'}},secrets:{smsAccessKeyId:'test-id',smsAccessKeySecret:'test-secret',wechatAppSecret:'test-wechat-secret'}};
  const a=aliyunSmsRequest(c,'13800000000','012345',new Date('2026-10-01T00:00:00Z'),'fixed-nonce');assert.equal(new URL(a.url).origin,'https://dysmsapi.aliyuncs.com');assert.match(a.options.headers.Authorization,/^ACS3-HMAC-SHA256 Credential=test-id/);assert.ok(!a.options.headers.Authorization.includes('test-secret'));assert.equal(JSON.parse(new URL(a.url).searchParams.get('TemplateParam')).code,'012345');assert.equal(a.options.redirect,'error');
  await sendLoginSms(c,'13800000000','012345',async()=>({ok:true,json:async()=>({Code:'OK'})}));
  await assert.rejects(sendLoginSms(c,'13800000000','012345',async()=>({ok:true,json:async()=>({Code:'isv.INVALID_PARAMETERS',Message:'secret'})})),/短信暂未发送成功/);
  await assert.rejects(sendLoginSms(c,'13800000000','012345',async()=>{throw new Error('test-secret');}),/短信暂未发送成功/);
  const subject=await exchangeWechatCode(c,'auth-code',async(url,options)=>{assert.equal(url.origin,'https://api.weixin.qq.com');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({openid:'openid_one',access_token:'provider-secret',scope:'snsapi_login'})};});assert.equal(subject,'wx0123456789abcdef:openid_one');
  await assert.rejects(exchangeWechatCode(c,'code',async()=>({ok:true,json:async()=>({errcode:40029})})),/微信授权未完成/);
  await assert.rejects(exchangeWechatCode(c,'code',async()=>({ok:true,json:async()=>({openid:'valid',access_token:'secret',scope:'snsapi_base'})})),/微信授权未完成/);
});

test('UI retains email login, real configuration and existing account binding',()=>{
  const auth=readFileSync(new URL('../src/Auth.jsx',import.meta.url),'utf8'),external=readFileSync(new URL('../src/ExternalLogin.jsx',import.meta.url),'utf8');
  assert.match(auth,/邮箱登录/);assert.match(auth,/手机验证码登录/);assert.doesNotMatch(auth,/微信扫码/);assert.match(auth,/mode==='login'&&!isAdmin/);assert.match(external,/设置中心 → 登录方式/);assert.doesNotMatch(external,/绑定微信<\/button>/);assert.match(external,/新用户，未绑定时创建独立学习账号/);assert.match(external,/验证码登录/);
  const admin=readFileSync(new URL('../src/AdminLoginSettings.jsx',import.meta.url),'utf8');
  assert.match(admin,/邮箱登录/);assert.match(admin,/查看邮件服务/);assert.doesNotMatch(admin,/启用微信扫码|网站应用 AppID/);
  const css=readFileSync(new URL('../src/external-login.css',import.meta.url),'utf8');
  assert.match(css,/\.el-consent input\[type=checkbox\].*width:18px.*min-height:18px/);
  assert.match(css,/\.el-consent>span\{flex:1;min-width:0/);
});
