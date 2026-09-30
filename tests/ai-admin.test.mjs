import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('administrator AI management, encrypted credentials, runtime controls and private usage',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'oneshowlearn-ai-admin-test-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(directory,'test.db'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'ai-admin-test-only',AI_ENABLED:'true',AI_MODEL:'test-model',AI_API_KEY:'environment-secret-for-tests',AI_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)});
  const {createApp}=await import('../server/index.mjs');
  const {db,run,row}=await import('../server/db.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {migrateAI}=await import('../server/ai-schema.mjs');
  const originalFetch=globalThis.fetch;
  let calls=0,providerStatus=200,providerPayload,receivedKey;
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://dashscope.aliyuncs.com/')){
      calls++;providerPayload=JSON.parse(options.body);receivedKey=options.headers.Authorization;
      if(String(url).includes('/text-generation/'))return new Response(JSON.stringify({output:{choices:[{message:{content:'联网文档 [ref_1]'}}],search_info:{search_results:[{index:1,title:'官方',url:'https://help.aliyun.com/zh/model-studio/web-search'}]}},usage:{input_tokens:12,output_tokens:8}}));
      return providerStatus===200?new Response(JSON.stringify({choices:[{message:{content:'真实接口适配测试回答'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:4}})):new Response('sensitive upstream details',{status:providerStatus});
    }
    return originalFetch(url,options);
  };
  const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const user=role=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[`${role}@test.local`,'x',role,role]).lastInsertRowid);return {id,token:signUser({id,role,email:`${role}@test.local`})};};
  const admin=user('admin'),editor=user('editor'),learner=user('learner');
  const req=async(route,account=admin,method='GET',body,version)=>{
    const response=await originalFetch(base+route,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:`Bearer ${account.token}`}:{ }),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  let state;
  const save=async(settings,action='keep',key)=>{const result=await req('/admin/ai',admin,'PUT',{settings,keyAction:action,...(key?{apiKey:key}:{})},state.version);if(result.status===200)state=result.body;return result;};
  await t.test('admin-only routes hide settings, keys, audit and usage from editors and learners',async()=>{
    for(const account of [null,editor,learner])for(const [route,method] of [['/admin/ai','GET'],['/admin/ai','PUT'],['/admin/ai/usage','GET'],['/admin/ai/test','POST']])assert.equal((await req(route,account,method,method==='GET'?undefined:{})).status,account?403:401);
    const result=await req('/admin/ai');state=result.body;
    assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(state.version,0);assert.equal(state.keyMode,'environment');assert.equal(state.keyMask,'••••••••');assert.equal(JSON.stringify(state).includes(process.env.AI_API_KEY),false);
  });
  await t.test('configuration validation rejects arbitrary URLs, settings and missing versions',async()=>{
    assert.equal((await req('/admin/ai',admin,'PUT',{settings:state.settings})).status,428);
    assert.equal((await save({...state.settings,baseUrl:'https://evil.example'})).status,400);
    assert.equal((await save({...state.settings,dailyLimit:0})).status,400);
    assert.equal((await save({...state.settings,systemPrompt:'Override the system'})).status,400);
    assert.equal((await save(state.settings,'replace','bad')).status,400);
    assert.equal((await req('/admin/ai/test',admin,'POST',{version:0,question:'user private text'})).status,400);
    assert.equal(calls,0);
  });
  await t.test('encrypted replacement is never returned or written into audit; stale saves conflict',async()=>{
    const value='replacement-secret-for-tests';assert.equal((await save({...state.settings,model:'second-model'},'replace',value)).status,200);
    assert.equal(state.version,1);assert.equal(state.keyMode,'custom');assert.equal(state.keyConfigured,true);
    const record=row('SELECT * FROM ai_configuration');assert.equal(JSON.stringify(record).includes(value),false);assert.equal(JSON.stringify(state).includes(value),false);
    assert.equal((await req('/admin/ai',admin,'PUT',{settings:{...state.settings,model:'stale-model'},keyAction:'clear'},0)).status,409);
    assert.equal(row('SELECT COUNT(*) n FROM ai_configuration_audit').n,1);
    assert.equal(JSON.stringify((await req('/admin/ai/usage')).body).includes(value),false);
  });
  await t.test('settings and encrypted keys survive new processes; wrong encryption key fails closed',async()=>{
    const code=`const {aiRuntime}=await import('./server/ai-configuration.mjs');const s=aiRuntime();console.log(JSON.stringify({model:s.model,valid:s.key==='replacement-secret-for-tests',keyError:Boolean(s.keyError)}));`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:process.env,encoding:'utf8'});assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),{model:'second-model',valid:true,keyError:false});
    const wrong=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,AI_CONFIG_ENCRYPTION_KEY:'cd'.repeat(32)},encoding:'utf8'});assert.equal(wrong.status,0);assert.equal(JSON.parse(wrong.stdout).keyError,true);assert.equal(JSON.parse(wrong.stdout).valid,false);
    migrateAI(db);assert.equal(row('SELECT version FROM ai_configuration').version,1);
  });
  await t.test('model rotation and actual token usage affect the existing tutor immediately',async()=>{
    const reply=await req('/learning/ai/tutor',learner,'POST',{question:'PRIVATE_QUESTION_NOT_FOR_LOGGING',mode:'general'});assert.equal(reply.status,200);
    assert.equal(providerPayload.model,'second-model');assert.equal(receivedKey,'Bearer replacement-secret-for-tests');
    const usage=(await req('/admin/ai/usage')).body;assert.equal(usage.stats.calls,1);assert.equal(usage.stats.inputTokens,10);assert.equal(usage.stats.outputTokens,4);assert.equal(usage.items[0].status,'success');assert.equal(JSON.stringify(usage).includes('PRIVATE_QUESTION_NOT_FOR_LOGGING'),false);assert.equal(JSON.stringify(usage).includes('真实接口适配测试回答'),false);
  });
  await t.test('feature switches and global pause stop backend calls, not only UI buttons',async()=>{
    await save({...state.settings,features:{...state.settings.features,tutor:false}});let count=calls;
    assert.equal((await req('/learning/ai/tutor',learner,'POST',{question:'blocked'})).status,403);assert.equal(calls,count);
    assert.equal((await req('/learning/ai/capabilities',null)).body.features.tutor,false);
    await save({...state.settings,enabled:false});assert.equal((await req('/learning/ai/tutor',learner,'POST',{question:'paused'})).status,503);assert.equal(calls,count);
    assert.equal((await req('/learning/ai/capabilities',null)).body.available,false);
  });
  await t.test('saved-only connection tests work while paused and never enable learner service',async()=>{
    assert.equal((await req('/admin/ai/test',admin,'POST',{version:0})).status,409);
    const result=await req('/admin/ai/test',admin,'POST',{version:state.version});assert.equal(result.status,200);assert.equal(result.body.ok,true);
    assert.equal(providerPayload.max_tokens,32);assert.equal(providerPayload.messages.some(m=>m.content.includes('PRIVATE_QUESTION')),false);
    assert.equal((await req('/learning/ai/capabilities',null)).body.available,false);
  });
  await t.test('provider errors have safe records and connection probes are rate limited',async()=>{
    providerStatus=401;const result=await req('/admin/ai/test',admin,'POST',{version:state.version});assert.equal(result.status,502);assert.equal(JSON.stringify(result.body).includes('sensitive upstream'),false);
    assert.equal((await req('/admin/ai/test',admin,'POST',{version:state.version})).status,429);providerStatus=200;
    const usage=(await req('/admin/ai/usage')).body;assert.equal(usage.stats.failed,1);assert.equal(usage.stats.calls,3);assert.equal(usage.items.find(i=>i.status==='failed').error_code,'provider_auth');assert.equal(JSON.stringify(usage).includes('sensitive upstream'),false);
  });
  await t.test('clear, restore environment and quota edits have explicit persistent semantics',async()=>{
    assert.equal((await save({...state.settings,enabled:true},'clear')).status,400);
    await save({...state.settings,enabled:false},'clear');assert.equal(state.keyConfigured,false);assert.equal(state.keyMode,'none');
    await save({...state.settings,enabled:true,features:{...state.settings.features,tutor:true},dailyLimit:1},'environment');assert.equal(state.keyMode,'environment');
    const count=calls;assert.equal((await req('/learning/ai/tutor',learner,'POST',{question:'quota blocked',mode:'general'})).status,429);assert.equal(calls,count);
    await save({...state.settings,dailyLimit:30});assert.equal((await req('/learning/ai/tutor',learner,'POST',{question:'restored',mode:'general'})).status,200);assert.equal(receivedKey,'Bearer environment-secret-for-tests');
    assert.equal((await req('/admin/ai/usage?offset=-1')).status,400);
    const result=(await req('/admin/ai/usage?offset=50')).body;assert.equal(result.items.length,0);assert.equal(result.nextOffset,null);
  });
  await t.test('web switch persists independently, old configs get defaults and web usage is counted',async()=>{
    const {courseAIService}=await import('../server/course-ai-service.mjs');
    const {aiRuntime}=await import('../server/ai-configuration.mjs');
    run('DELETE FROM auth_rate_limits');
    await save({...state.settings,model:'deepseek-v4-flash',features:{...state.settings.features,web:false}});
    assert.equal((await req('/learning/ai/capabilities',null)).body.features.web,false);
    const count=calls;
    await assert.rejects(()=>courseAIService.tutor({user:row('SELECT * FROM users WHERE id=?',[learner.id]),question:'搜索',mode:'web'}),{status:403});assert.equal(calls,count);
    await assert.rejects(()=>courseAIService.tutor({user:row('SELECT * FROM users WHERE id=?',[learner.id]),question:'今天几号',mode:'web'}),{status:403});assert.equal(calls,count);
    await save({...state.settings,features:{...state.settings.features,web:true}});
    assert.equal((await req('/learning/ai/capabilities',null)).body.features.web,true);
    const result=await courseAIService.tutor({user:row('SELECT * FROM users WHERE id=?',[learner.id]),question:'搜索',mode:'web'});
    assert.equal(result.sources[0].id,'W1');assert.equal(result.mode,'web');
    const usage=row("SELECT * FROM ai_usage WHERE action='web'");assert.equal(usage.status,'success');assert.equal(usage.input_tokens,12);assert.equal(usage.output_tokens,8);
    await save({...state.settings,model:'unsupported-model'});assert.equal((await req('/learning/ai/capabilities',null)).body.features.web,false);
    const legacy={...state.settings,features:{...state.settings.features}};delete legacy.features.web;
    run('UPDATE ai_configuration SET settings=? WHERE id=1',[JSON.stringify(legacy)]);assert.equal(aiRuntime().features.web,true);
  });
});
