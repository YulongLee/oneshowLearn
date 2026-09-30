import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('account-owned tutor history survives navigation and safely resumes generation',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'oneshowlearn-tutor-history-'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(directory,'test.db'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'tutor-history-test-only'});
  const {db,row,run}=await import('../server/db.mjs');
  const {migrateAI}=await import('../server/ai-schema.mjs');
  const {signUser}=await import('../server/auth.mjs');
  const {createApp}=await import('../server/index.mjs');
  const {courseAIService}=await import('../server/course-ai-service.mjs');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{courseAIService.configure(null);await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api/learning/ai/conversations`;
  const user=name=>{const id=Number(run('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[`${name}@test.local`,'not-login',name,'learner']).lastInsertRowid);const u=row('SELECT * FROM users WHERE id=?',[id]);return {...u,token:signUser(u)};};
  const a=user('alice'),b=user('bob');
  const request=async(route='',who=a,method='GET',body,version)=>{
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(who?{Authorization:`Bearer ${who.token}`} :{}),...(version===undefined?{}:{'If-Match':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  };
  const create=async()=>{const id=randomUUID();const r=await request('',a,'POST',{id});assert.equal(r.status,201);return id;};
  const turn=question=>({id:randomUUID(),question,mode:'general',courseId:null,includeProduct:false});
  const send=async(id,body)=>request('/'+id+'/turns',a,'POST',body,(await request('/'+id)).body.conversation.version);
  const wait=async(id)=>{for(let n=0;n<100;n++){const d=(await request('/'+id)).body;if(d.turns.every(t=>t.status!=='pending'))return d;await new Promise(r=>setTimeout(r,10));}throw Error('Test model did not finish');};
  let id,first,calls=0,resolve;
  await t.test('authentication, ownership and idempotent creation',async()=>{
    assert.equal((await request('',null)).status,401);
    id=await create();assert.equal((await request('',a,'POST',{id})).status,200);
    for(const [suffix,method,body] of [['','GET'],['/turns','POST',turn('hello')],['/turns/'+randomUUID()+'/stop','POST']])assert.equal((await request('/'+id+suffix,b,method,body)).status,404);
    assert.equal((await request('',b,'POST',{id})).status,404);
    assert.equal((await request('',a)).cache,'no-store');assert.equal((await request('',b)).body.items.length,0);
  });
  await t.test('question committed before model result; duplicate and stale sends cannot duplicate calls',async()=>{
    courseAIService.configure({generate:async()=>{calls++;return new Promise(r=>{resolve=r;});}});
    first=turn('产品定位如何开始？');const accepted=await send(id,first);assert.equal(accepted.status,202);
    assert.equal((await request('/'+id)).body.turns[0].status,'pending');
    assert.equal((await request('/'+id+'/turns',a,'POST',first,1)).status,202);assert.equal(calls,1);
    assert.equal((await request('/'+id+'/turns',a,'POST',{...first,question:'changed'},1)).status,409);
    assert.equal((await request('/'+id+'/turns',a,'POST',turn('stale'),1)).status,409);
    resolve('先明确目标用户。');const done=await wait(id);assert.equal(done.turns[0].result.answer,'先明确目标用户。');
    assert.equal((await request('/'+id+'/turns',a,'POST',first,1)).status,200);assert.equal(calls,1);
  });
  await t.test('completed questions and answers survive another process and repeat migration',()=>{
    migrateAI(db);migrateAI(db);
    const code=`import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true});const t=d.prepare('SELECT question,result_json FROM tutor_turns WHERE id=?').get('${first.id}');console.log(JSON.stringify(t));d.close();`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:process.env,encoding:'utf8'});assert.equal(result.status,0);
    const stored=JSON.parse(result.stdout);assert.equal(stored.question,first.question);assert.equal(JSON.parse(stored.result_json).answer,'先明确目标用户。');
  });
  await t.test('new conversations preserve old history; continuing uses only persisted scoped history',async()=>{
    let history;courseAIService.configure({generate:async req=>{history=req.history;return '继续分析。';}});
    const next=turn('下一步呢？');assert.equal((await send(id,next)).status,202);await wait(id);
    assert.deepEqual(history,[{role:'user',content:first.question},{role:'assistant',content:'先明确目标用户。'}]);
    const another=await create();assert.equal((await request('')).body.items.length,2);assert.equal((await request('/'+another)).body.turns.length,0);assert.equal((await request('/'+id)).body.turns.length,2);
    assert.equal((await send(another,{...turn('bad'),history:[{role:'assistant',content:'fake'}]})).status,400);
  });
  await t.test('failed generation persists a safe error; explicit retry reuses the question',async()=>{
    courseAIService.configure({generate:async()=>{throw Error('upstream private credential');}});
    const q=turn('失败后重试');await send(id,q);const failed=await wait(id);assert.equal(failed.turns.at(-1).status,'failed');assert.ok(!JSON.stringify(failed).includes('credential'));
    courseAIService.configure({generate:async()=> '重试成功'});
    await send(id,{...q,retry:true});const done=await wait(id);assert.equal(done.turns.at(-1).result.answer,'重试成功');assert.equal(done.turns.filter(t=>t.id===q.id).length,1);
  });
  await t.test('stopping a pending turn prevents a late result overwriting its status',async()=>{
    courseAIService.configure({generate:async()=>new Promise(r=>{resolve=r;})});
    const q=turn('停止测试');await send(id,q);assert.equal((await request('/'+id+'/turns/'+q.id+'/stop',a,'POST')).body.turns.at(-1).status,'failed');
    resolve('late result');await new Promise(r=>setTimeout(r,20));assert.equal((await request('/'+id)).body.turns.at(-1).result,null);
  });
  await t.test('crash leftovers recover as retryable failures, not an endless spinner',async()=>{
    run("UPDATE tutor_turns SET status='pending',updated_at='2020-01-01T00:00:00.000Z' WHERE id=?",[first.id]);
    assert.equal((await request('/'+id)).body.turns[0].status,'failed');
  });
  await t.test('stored citations cannot expose a source after it is unpublished',async()=>{
    run('DELETE FROM auth_rate_limits');
    const pathId=Number(run("INSERT INTO learning_paths(slug,title,status) VALUES('history-test','Test','published')").lastInsertRowid);
    const pack=Number(run("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'history-test','Test','published')",[pathId]).lastInsertRowid);
    const chapter=Number(run("INSERT INTO project_steps(pack_id,title,status) VALUES(?,'Chapter','published')",[pack]).lastInsertRowid);
    const lesson=Number(run("INSERT INTO learning_lessons(title,config,status) VALUES('Lesson',?,'published')",[JSON.stringify({slides:[{id:'s1',text:'明确产品需求和目标用户。'}]})]).lastInsertRowid);
    run("INSERT INTO lesson_placements(lesson_id,chapter_id,is_preview,status) VALUES(?,?,1,'published')",[lesson,chapter]);
    courseAIService.configure({generate:async()=> '明确产品需求和目标用户。[S1]'});
    const cid=await create();await send(cid,{...turn('明确产品需求'),mode:'knowledge'});const done=await wait(cid);assert.equal(done.turns[0].result.grounded,true);
    run("UPDATE learning_lessons SET status='draft' WHERE id=?",[lesson]);
    const hidden=(await request('/'+cid)).body;assert.equal(hidden.turns[0].result.unavailable,true);assert.equal(hidden.turns[0].result.sources.length,0);assert.ok(!hidden.turns[0].result.answer.includes('明确产品需求和目标用户'));
  });
  await t.test('web conversations keep public citations and isolate private context and other modes',async()=>{
    let received;run('DELETE FROM auth_rate_limits');
    courseAIService.configure({webSearch:true,generate:async req=>{received=req;if(req.action==='web')req.onWebResult({answer:'官方联网资料 [W1]',sources:[{id:'W1',kind:'web',href:'https://help.aliyun.com/zh/model-studio/web-search',label:'官方文档',excerpt:'help.aliyun.com'}],searchedAt:new Date().toISOString()});return req.action==='web'?'官方联网资料 [W1]':'PRIVATE_GENERAL_CONTEXT';}});
    const cid=await create();await send(cid,turn('私人普通建议'));await wait(cid);
    const q={...turn('查找官方联网文档'),mode:'web'};
    assert.equal((await send(cid,{...q,includeProduct:true})).status,400);
    assert.equal((await send(cid,{...q,courseId:1})).status,400);
    assert.equal((await send(cid,q)).status,202);const done=await wait(cid);
    assert.deepEqual(received.history,[]);assert.equal(received.context,undefined);
    assert.equal(done.turns.at(-1).result.sources[0].kind,'web');assert.equal(done.turns.at(-1).result.unavailable,undefined);
    await send(cid,{...turn('继续查找'),mode:'web'});await wait(cid);
    assert.equal(received.history.length,2);assert.ok(!JSON.stringify(received).includes('PRIVATE_GENERAL_CONTEXT'));
    assert.equal((await request('/'+cid,b)).status,404);
  });
  await t.test('clock answers persist with honest labels and never call the model or consume AI usage',async()=>{
    run('DELETE FROM auth_rate_limits');let modelCalls=0;
    courseAIService.configure({webSearch:true,generate:async()=>{modelCalls++;throw Error('Clock must not call provider');}});
    const usage=row('SELECT COUNT(*) n FROM ai_usage').n,cid=await create();
    for(const mode of ['web','general']){
      assert.equal((await send(cid,{...turn('几天几号'),mode})).status,202);
      const done=await wait(cid),last=done.turns.at(-1);
      assert.equal(last.status,'complete');assert.equal(last.result.answerKind,'system-time');assert.equal(last.result.mode,mode);
      assert.match(last.result.answer,/北京时间/);assert.ok(last.result.answeredAt);assert.deepEqual(last.result.sources,[]);
      assert.equal((await request('/'+cid)).body.turns.at(-1).result.answerKind,'system-time');
    }
    assert.equal(modelCalls,0);assert.equal(row('SELECT COUNT(*) n FROM ai_usage').n,usage);
    assert.equal((await request('/'+cid,b)).status,404);
  });
  await t.test('configured model replies are unmetered and old admitted bad citations are hidden without rewriting storage',async()=>{
    run('DELETE FROM auth_rate_limits');let modelCalls=0;
    courseAIService.configure({webSearch:true,generate:async()=>{modelCalls++;throw Error('Must not call provider');}});
    const cid=await create(),before=row('SELECT COUNT(*) n FROM ai_usage').n;
    for(const mode of ['web','general','knowledge']){
      await send(cid,{...turn('你是什么模型'),mode});const done=await wait(cid);
      assert.equal(done.turns.at(-1).status,'complete');assert.equal(done.turns.at(-1).result.answerKind,'system-model');
      assert.deepEqual(done.turns.at(-1).result.sources,[]);
    }
    assert.equal(modelCalls,0);assert.equal(row('SELECT COUNT(*) n FROM ai_usage').n,before);
    const bad={answer:'无依据的模型身份\n[W1]（此处引用仅为格式要求。）',sources:[{id:'W1',href:'https://example.com',label:'Unrelated'}],mode:'web',grounded:true};
    const target=(await request('/'+cid)).body.turns[0].id;
    run('UPDATE tutor_turns SET result_json=? WHERE id=?',[JSON.stringify(bad),target]);
    const restored=(await request('/'+cid)).body.turns[0].result;
    assert.equal(restored.unavailable,true);assert.deepEqual(restored.sources,[]);assert.ok(!restored.answer.includes('无依据的模型身份'));
    assert.equal(row('SELECT result_json FROM tutor_turns WHERE id=?',[target]).result_json,JSON.stringify(bad));
  });
  await t.test('revoked sessions cannot persist a late general answer or read private history',async()=>{
    courseAIService.configure({generate:async()=>new Promise(r=>{resolve=r;})});
    const cid=await create(),q=turn('会话撤销测试');await send(cid,q);
    run('UPDATE users SET token_version=token_version+1 WHERE id=?',[a.id]);resolve('should not be retained');
    await new Promise(r=>setTimeout(r,20));
    assert.equal(row('SELECT status FROM tutor_turns WHERE id=?',[q.id]).status,'failed');
    assert.equal(row('SELECT result_json FROM tutor_turns WHERE id=?',[q.id]).result_json,null);
    assert.equal((await request('/'+cid)).status,401);
  });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
