// Public HTTPS checks plus one real low-scope web probe through the deployed service.
// No production conversations, learning records or administrator settings are created.
import assert from 'node:assert/strict';
process.loadEnvFile('/etc/oneshowlearn/oneshowlearn.env');
process.env.DATABASE_PATH='/var/www/oneshowlearn/data/oneshowlearn.db';
const base='https://oneshowlearn.com/api';
const request=(route,options={})=>fetch(base+route,{signal:AbortSignal.timeout(20000),...options});
const capResponse=await request('/learning/ai/capabilities');assert.equal(capResponse.status,200);
const cap=await capResponse.json();assert.equal(cap.available,true);assert.equal(cap.features.web,true);assert.equal(cap.features.tutor,true);
const login=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);const {token}=await login.json();
const admin=await request('/admin/ai',{headers:{authorization:`Bearer ${token}`}});assert.equal(admin.status,200);
const settings=await admin.json();assert.equal(settings.settings.features.web,true);assert.equal(settings.keyConfigured,true);
const {row,db}=await import('/var/www/oneshowlearn/server/db.mjs');
const {courseAIService}=await import('/var/www/oneshowlearn/server/course-ai-service.mjs');
const user=row('SELECT id,role,status,email_verified,token_version FROM users WHERE email=?',[process.env.ADMIN_EMAIL]);assert.ok(user);
const usageBefore=row('SELECT COUNT(*) n FROM ai_usage').n;
for(const mode of ['web','general']){
  const clock=await courseAIService.tutor({user,mode,question:'几天几号'});
  assert.equal(clock.answerKind,'system-time');assert.equal(clock.timezone,'Asia/Shanghai');assert.deepEqual(clock.sources,[]);
  assert.match(clock.answer,/北京时间/);assert.ok(Math.abs(Date.now()-Date.parse(clock.answeredAt))<5000);
  assert.ok(clock.answer.includes(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())));
}
assert.equal(row('SELECT COUNT(*) n FROM ai_usage').n,usageBefore);
console.log('PASS deployed clock answers: web/general, Shanghai date, honest system-time metadata, no AI usage charged');
for(const mode of ['web','general','knowledge']){
  const identity=await courseAIService.tutor({user,mode,question:'你是什么模型'});
  assert.equal(identity.answerKind,'system-model');assert.ok(identity.answer.includes(cap.model));assert.deepEqual(identity.sources,[]);
}
assert.equal(row('SELECT COUNT(*) n FROM ai_usage').n,usageBefore);
const {verifyWebResult}=await import('/var/www/oneshowlearn/server/ai-web-search.mjs');
assert.throws(()=>verifyWebResult({output:{choices:[{message:{content:'我是平台。\n[ref_1]（引用仅为格式要求。）'}}],search_info:{search_results:[{index:1,title:'无关资料',url:'https://example.com'}]}}}),{status:422});
console.log('PASS deployed model identity uses actual configuration without calls; obvious unsupported citations rejected');
const result=await courseAIService.tutor({user,mode:'web',question:'请联网查找阿里云百炼官方联网搜索文档，用一句话说明如何开启搜索，并标注网页来源。'});
assert.equal(result.mode,'web');assert.equal(result.grounded,true);assert.ok(result.sources.length>0);assert.match(result.answer,/\[W\d+\]/);assert.ok(result.searchedAt);
assert.ok(result.sources.every(s=>/^https?:\/\//.test(s.href)));
assert.ok(row("SELECT id FROM ai_usage WHERE user_id=? AND action='web' AND status='success' ORDER BY rowid DESC LIMIT 1",[user.id]));
console.log(`PASS deployed web search: ${cap.model}, ${result.sources.length} cited public sources, persisted usage; HTTPS capabilities/admin control verified; no private conversation or content written`);
db.close();
