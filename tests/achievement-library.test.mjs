import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {OUTCOME_TYPES,OUTCOME_STARTERS,outcomeSummary,outcomeSource,filterOutcomes,outcomeCoverUrl,validateOutcome,saveOutcome,archiveOutcome} from '../src/achievement-library-model.js';
import {liveAchievements} from '../src/personal-model.js';
const time='2026-10-05T01:00:00Z',item=(extra={})=>({id:randomUUID(),title:'我的原型',description:'验证目标用户需求',type:'product',stage:'building',url:'https://example.invalid/work',githubUrl:'https://example.invalid/code',screenshotUrl:'https://example.invalid/screenshot.png',tags:['AI'],createdAt:time,updatedAt:time,...extra});
test('outcome library types and blank starter stages never claim certificates or assessments',()=>{
 assert.deepEqual(OUTCOME_TYPES.map(([id])=>id),['all','product','work','document','code']);
 assert.deepEqual(OUTCOME_STARTERS.map(i=>i.stage),['idea','building','launched']);
 assert.ok(OUTCOME_STARTERS.every(i=>!i.url&&!i.title.includes('示例')));
});
test('only actual live records produce total/building/launched counts',()=>{
 const state={achievements:[item(),item({stage:'idea'}),item({stage:'launched'}),item({stage:'launched',deletedAt:time})]};
 assert.deepEqual(outcomeSummary(liveAchievements(state)),{total:3,building:1,launched:1});assert.deepEqual(outcomeSummary([]),{total:0,building:0,launched:0});
});
test('source labels require actual owner-project metadata and preserve unavailable IDs',()=>{
 const value=item({sourceProjectId:3}),project={id:3,title:'实际项目',slug:'actual'};
 assert.equal(outcomeSource(value,[project]).project,project);
 for(const [status,label] of [['loading','关联项目正在加载'],['error','关联项目信息暂不可读取'],['ready','原关联项目暂不可用']])assert.deepEqual(outcomeSource(value,[],status),{label,project:null});
 assert.equal(outcomeSource(item()).label,'个人成果记录');assert.equal(value.sourceProjectId,3);
});
test('combined filters search complete description/tags/actual source and do not mutate records',()=>{
 const a=item({id:'a',description:'正文尾部检索目标',sourceProjectId:3}),b=item({id:'b',type:'code',stage:'launched',title:'代码',updatedAt:'2026-10-04T00:00:00Z'}),c=item({id:'c',stage:'idea'}),list=[b,c,a],projects=[{id:3,title:'面试助手'}],before=JSON.stringify(list);
 assert.deepEqual(filterOutcomes(list,{query:'面试 AI 尾部',projects}),[a]);assert.deepEqual(filterOutcomes(list,{category:'code',stage:'launched'}),[b]);assert.equal(filterOutcomes(list,{query:'不存在'}).length,0);
 assert.deepEqual(filterOutcomes(list).map(i=>i.id),['a','c','b']);assert.equal(JSON.stringify(list),before);
 assert.deepEqual(filterOutcomes(list,{sort:'title'}).map(i=>i.title),list.map(i=>i.title).sort((a,b)=>a.localeCompare(b,'zh-CN')));
});
test('covers display HTTPS or strict public assets, never private API URLs or unsafe schemes',()=>{
 for(const url of ['https://example.invalid/a.png','/assets/image-1.webp'])assert.equal(outcomeCoverUrl(url),url);
 for(const url of ['http://example.invalid/a.png','javascript:alert(1)','data:image/png;base64,x','/api/me/workspace','/uploads/private.png','/assets/../private.svg','https://user:pass@example.invalid/a.png','file:///tmp/private'])assert.equal(outcomeCoverUrl(url),'');
});
test('metadata validation retains legacy HTTP links and rejects credential/scheme/size failures',()=>{
 assert.equal(validateOutcome(item(),['AI']),'');assert.equal(validateOutcome(item({url:'http://legacy.example.invalid'}),[]),'');
 for(const patch of [{title:' '},{title:'长'.repeat(121)},{type:'certificate'},{stage:'verified'},{description:'x'.repeat(5001)},{url:'javascript:alert(1)'},{githubUrl:'https://user:pass@example.invalid'},{screenshotUrl:'file:///tmp/private'}])assert.ok(validateOutcome(item(patch),[]));
 assert.ok(validateOutcome(item(),['x'.repeat(25)]));
});
test('save/archive/restore retain optional fields, timestamps, unrelated records and workspace domains',()=>{
 const first=item({sourceProjectId:3}),second=item({title:'另一成果'}),state={tasks:[],notes:[{id:'private-note'}],favorites:[],checkIns:[],achievements:[first,second]},before=JSON.stringify(state);
 const edited={...first,title:'修改标题'},saved=saveOutcome(state,edited);assert.equal(saved.notes,state.notes);assert.equal(saved.achievements[1],second);
 const archived=archiveOutcome(saved,first.id,time);assert.deepEqual(archived.achievements[0],{...edited,deletedAt:time});assert.deepEqual(archiveOutcome(archived,first.id,null).achievements[0],{...edited,deletedAt:null});assert.equal(JSON.stringify(state),before);
});
test('private API preserves source/link/cover data through edit/archive/restore and enforces ownership/CAS',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'osl-outcomes-api-'));
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'isolated.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'outcomes-isolated-tests',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:''});
 const {db,row,run}=await import('../server/db.mjs'),{signUser}=await import('../server/auth.mjs'),{createApp}=await import('../server/index.mjs');
 const user=name=>{const id=Number(run('INSERT INTO users(email,password_hash,name,email_verified) VALUES(?,?,?,1)',[name+'@example.invalid','unused',name]).lastInsertRowid);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
 const owner=user('owner'),other=user('other'),project=Number(run("INSERT INTO practice_projects(slug,title,status) VALUES('outcome-project','实际关联项目','published')").lastInsertRowid);
 run('INSERT INTO project_runs(project_id,user_id) VALUES(?,?)',[project,owner.id]);
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port+'/api',request=async(user,body,version,route='/me/workspace')=>{const res=await fetch(base+route+(body?'/state':''),{method:body?'PUT':'GET',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.token}:{}),...(version?{'If-Match':version}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const original=item({sourceProjectId:project}),note={id:randomUUID(),title:'旧笔记',body:'保留内容',updatedAt:time},state={tasks:[],notes:[note],favorites:[],checkIns:[],achievements:[original]};
 let saved=await request(owner,state);assert.equal(saved.status,200);assert.deepEqual(saved.body.state,state);
 const version=saved.body.version;const edited=saveOutcome(state,{...original,title:'更新后的成果'});saved=await request(owner,edited,version);assert.equal(saved.status,200);assert.deepEqual(saved.body.state,edited);
 assert.equal((await request(owner,state,version)).status,409);assert.equal((await request(null)).status,401);assert.equal((await request(null,state)).status,401);
 assert.equal((await request(other)).body.state.achievements,undefined);assert.equal((await request(other,state)).status,400);
 assert.equal((await request(owner,saveOutcome(edited,{...original,sourceProjectId:99999}),saved.body.version)).status,400);
 for(const field of ['url','githubUrl','screenshotUrl'])assert.equal((await request(owner,saveOutcome(edited,{...original,[field]:'javascript:alert(1)'}),saved.body.version)).status,400);
 saved=await request(owner,archiveOutcome(edited,original.id,time),saved.body.version);assert.equal(saved.status,200);assert.equal(liveAchievements(saved.body.state).length,0);
 saved=await request(owner,archiveOutcome(saved.body.state,original.id,null),saved.body.version);assert.equal(saved.status,200);assert.deepEqual(saved.body.state.achievements[0],{...edited.achievements[0],deletedAt:null});assert.deepEqual(saved.body.state.notes,[note]);
 const ownProjects=await request(owner,undefined,undefined,'/learning/me/projects'),foreignProjects=await request(other,undefined,undefined,'/learning/me/projects');assert.equal(ownProjects.body.items[0].id,project);assert.equal(foreignProjects.body.items.length,0);assert.equal(row('SELECT COUNT(*) AS n FROM project_runs').n,1);
});
