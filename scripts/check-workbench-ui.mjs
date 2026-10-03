// Disposable local accounts/catalog only. Never reads production data or calls providers.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright');
const dir=mkdtempSync(path.join(tmpdir(),'osl-workbench-ui-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-workbench-browser-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:'',PAYMENT_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)});
const {db,row,run}=await import('../server/db.mjs');
const {signUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const {paymentConfiguration,savePaymentConfig}=await import('../server/payment-configuration.mjs');
const insert=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
const user=(name,role='learner')=>{const id=insert('INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,?,1)',[name+'@example.invalid','unused',name,role]);return {...row('SELECT * FROM users WHERE id=?',[id]),token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
const fresh=user('新学员'),returning=user('续学测试'),trial=user('试听测试'),admin=user('管理测试','admin');
const curriculum=JSON.parse(readFileSync('docs/curriculum/ai-opc-20261001.json','utf8'));
const pathId=insert("INSERT INTO learning_paths(slug,title,status) VALUES('ai-product','AI 产品开发','published')");
const pack=insert("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,?,?,'published')",[pathId,curriculum.slug,curriculum.title]);
run('INSERT INTO learning_entry_settings(id,course_id) VALUES(1,?)',[pack]);
const placements=[];
for(const chapter of curriculum.chapters){
 const id=insert("INSERT INTO project_steps(pack_id,title,summary,status,sort_order) VALUES(?,?,?,'published',?)",[pack,chapter.title,chapter.goal,chapter.number]);
 run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,?)',[id,chapter.number]);
 for(const [i,section] of chapter.sections.entries()){
  const lesson=insert("INSERT INTO learning_lessons(title,subtitle,config,status) VALUES(?,?,?,'published')",[section.number+' '+section.title,chapter.goal,JSON.stringify({isDemoMedia:true})]);
  placements.push(insert("INSERT INTO lesson_placements(lesson_id,chapter_id,is_preview,sort_order,status) VALUES(?,?,?,?,'published')",[lesson,id,chapter.number===1&&i<2?1:0,i]));
 }
}
for(const u of [fresh,returning])run("INSERT INTO entitlements(user_id,pack_id,status,starts_at) VALUES(?,?,'active','2000-01-01')",[u.id,pack]);
run('INSERT INTO learning_progress(user_id,placement_id,video_time,video_duration,completed_at) VALUES(?,?,600,600,CURRENT_TIMESTAMP)',[returning.id,placements[0]]);
run('INSERT INTO learning_progress(user_id,placement_id,video_time,video_duration,updated_at) VALUES(?,?,180,600,?)',[returning.id,placements[1],new Date().toISOString()]);
const product=insert("INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,'workbench-test','隔离课程',49900,'active')",[pack]);
savePaymentConfig(admin,0,{settings:{...paymentConfiguration().settings,productId:product,priceCents:49900,originalPriceCents:99900},secrets:{}});
const projects=[];
for(const [i,title] of ['[演示] AI 面试助手','[演示] AI 工具聚合站','[演示] AI 健康饮食管理 App'].entries()){
 const id=insert("INSERT INTO practice_projects(slug,title,description,cover_url,status,sort_order) VALUES(?,?,?,?,'published',?)",['qa-project-'+i,title,'隔离测试案例，了解需求、开发与上线过程。',i<2?'/assets/project-web-cover-v1-A1b2.webp':'',i]);projects.push(id);
 run("INSERT INTO practice_project_settings(project_id,access_type) VALUES(?,'free')",[id]);
 const stage=insert("INSERT INTO practice_project_stages(project_id,title,status) VALUES(?,'项目准备','published')",[id]);
 run("INSERT INTO lesson_placements(lesson_id,stage_id,status) VALUES(?,?,'published')",[row('SELECT lesson_id FROM lesson_placements WHERE id=?',[placements[0]]).lesson_id,stage]);
}
run('INSERT INTO project_runs(user_id,project_id) VALUES(?,?)',[returning.id,projects[1]]);
const date=new Date().toISOString();
run('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)',[returning.id,JSON.stringify({tasks:[],notes:[],favorites:[],checkIns:[],achievements:[{id:'personal-product',title:'我的隔离记账产品',description:'私人产品进展，不属于其他账号。',type:'product',stage:'building',url:'',tags:[],createdAt:date,updatedAt:date}]})]);
const app=createApp(),client=path.resolve('dist/client');app.use(express.static(client));app.get('/{*route}',(_q,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const errors=[],requests=[];let checks=0;
const context=async(u,options={})=>{
 const c=await browser.newContext({viewport:{width:1440,height:1100}});
 await c.route('**/*',async route=>{
  const url=route.request().url();if(!url.startsWith(base))return route.abort();
  if(url.includes('/api/learning/ai/')&&route.request().method()!=='GET'){requests.push(url);return route.abort();}
  if(url.endsWith('/api/learning/ai/capabilities'))return route.fulfill({json:{available:options.ai!==false,features:{tutor:true,web:false}}});
  return route.continue();
 });
 if(u)await c.addInitScript(({token,id,draft,sidebar})=>{if(location.protocol!=='http:')return;localStorage.setItem('oneshowlearn_token',token);if(draft){sessionStorage.setItem(`oneshowlearn:tutor:${id}:active`,'new');sessionStorage.setItem(`oneshowlearn:tutor:${id}:draft:new`,draft);}if(sidebar)localStorage.setItem('oneshowlearn.sidebar.v1',JSON.stringify(sidebar));},{token:u.token,id:u.id,...options});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
};
const ready=async p=>{await p.locator('.wd-refined[aria-busy="false"]').waitFor();await p.locator('.ws-course-offer:not([data-access="checking"])').waitFor({state:'attached'});};
const check=condition=>{assert.ok(condition);checks++;};
const overflow=async p=>{await p.waitForTimeout(100);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));};
const output=path.resolve('artifacts/workbench-refinement');mkdirSync(output,{recursive:true});
try{
 const fc=await context(fresh),f=await fc.newPage();await f.goto(base+'/app');await ready(f);
 check((await f.locator('#wd-current-lesson').textContent()).includes('1.1'));
 check((await f.locator('#wd-hero-title').textContent()).includes('第一个 AI 产品'));
 check(await f.locator('.wd-course-meter').innerText().then(t=>t.includes('0 / 40 节')));
 check(await f.locator('.ws-course-offer').getAttribute('data-access')==='unlocked');
 check(await f.locator('.ws-course-offer .ws-offer-price').count()===0);
 check(await f.locator('.ws-course-offer').evaluate(el=>getComputedStyle(el).backgroundImage.includes('linear-gradient')));
 check(await f.locator('.wd-recent,.wd-current-project,.wd-personal-products').count()===0);
 check(await f.locator('.wd-project-card').count()===3);
 check(await f.locator('.wd-demo-badge').count()===3);
 check(await f.locator('.wd-phase-icon').count()===5);
 check(await f.locator('.wd-course-preview').isVisible());
 check(await f.locator('.wd-preview-brand .osl-brand-wordmark').evaluate(el=>getComputedStyle(el).color)==='rgb(255, 255, 255)');
 check(await f.locator('.wd-preview-brand .osl-brand-tagline').evaluate(el=>getComputedStyle(el).display)==='none');
 check(await f.locator('.wd-preview-brand .osl-brand-wordmark em').evaluate(el=>getComputedStyle(el).color)==='rgb(195, 164, 255)');
 await f.locator('.wd-course-preview>img').evaluate(img=>img.decode());check(await f.locator('.wd-course-preview>img').evaluate(img=>img.naturalWidth>0));
 const covers=await f.locator('.wd-project-card .wd-cover img').evaluateAll(imgs=>imgs.map(img=>img.src));check(new Set(covers).size===3);
 const cc=await context(),custom=await cc.newPage();
 await cc.route('**/api/learning/entry',async route=>{const response=await route.fetch(),data=await response.json();data.courses=data.courses.map(course=>({...course,cover_url:covers[0]}));await route.fulfill({json:data});});
 await custom.goto(base+'/app');await ready(custom);check(await custom.locator('.wd-course-preview>img').getAttribute('src')===covers[0]);check(await custom.locator('.wd-preview-copy').count()===0);await cc.close();
 check(await f.locator('.wd-project-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)===3);
 const widths=[320,390,768,1024,1440,1920,2560];
 for(const width of widths){await f.setViewportSize({width,height:1100});await overflow(f);check(await f.locator('.wd-primary').isVisible());check(await f.locator('.wd-learning-phases li').count()===5);if([390,1440,1920].includes(width))await f.screenshot({path:path.join(output,'fresh-'+width+'.png'),fullPage:true});}
 await f.setViewportSize({width:1440,height:1100});await f.getByRole('button',{name:'加入今日计划',exact:false}).click();
 await f.locator('.wd-task-count').filter({hasText:'0 / 1'}).waitFor();check(JSON.parse(row('SELECT state_json FROM workspace_state WHERE user_id=?',[fresh.id]).state_json).tasks.length===1);
 await f.locator('.wd-task-list input').click();await f.locator('.wd-task-count').filter({hasText:'1 / 1'}).waitFor();check(await f.locator('.wd-task-list input').isChecked());
 await f.getByRole('button',{name:'解释本节核心概念',exact:false}).click();await f.locator('.tc-composer textarea').waitFor();
 await f.waitForFunction(()=>document.querySelector('.tc-composer textarea')?.value.includes('1.1 AI OPC'));
 check((await f.locator('.tc-composer textarea').inputValue()).includes('1.1 AI OPC'));
 check(await f.getByLabel('选择课程',{exact:true}).inputValue()===String(pack));
 check(requests.length===0);
 const dc=await context(fresh,{draft:'保留我尚未发送的原问题'}),d=await dc.newPage();await d.goto(base+'/app');await ready(d);await d.getByRole('button',{name:'梳理本节学习重点',exact:false}).click();
 await d.getByRole('button',{name:'使用工作台问题',exact:true}).waitFor();check(await d.locator('.tc-composer textarea').inputValue()==='保留我尚未发送的原问题');
 await d.getByRole('button',{name:'使用工作台问题',exact:true}).click();check((await d.locator('.tc-composer textarea').inputValue()).includes('梳理本节学习重点'));check(requests.length===0);
 const rc=await context(returning),r=await rc.newPage();await r.goto(base+'/app');await ready(r);
 check((await r.locator('#wd-current-lesson').textContent()).includes('1.2'));check(await r.locator('.wd-recent-row').count()===2);check(await r.locator('.wd-current-project').count()===1);check(await r.getByText('我的隔离记账产品',{exact:true}).count()===1);
 await r.screenshot({path:path.join(output,'returning-1440.png'),fullPage:true});
 await r.locator('.wd-primary').click();await r.waitForURL(base+`/learn/${curriculum.slug}/lessons/${placements[1]}`);checks++;
 await r.goto(base+'/app');await ready(r);await r.locator('.wd-learning-phases button').nth(4).click();await r.waitForURL(base+'/opc/phase/5');checks++;
 await r.goto(base+'/app');await ready(r);
 // A session change must clear the previous account's private workbench instantly.
 await r.evaluate(token=>{localStorage.setItem('oneshowlearn_token',token);window.dispatchEvent(new Event('oneshowlearn:session'));},fresh.token);
 await r.getByRole('heading',{name:/欢迎回来.*新学员/}).waitFor();await ready(r);check(await r.getByText('我的隔离记账产品',{exact:true}).count()===0);check(await r.locator('.wd-current-project,.wd-recent').count()===0);
 const tc=await context(trial),t=await tc.newPage();await t.goto(base+'/app');await ready(t);
 check(await t.locator('.ws-course-offer').getAttribute('data-access')==='purchase');check((await t.locator('.wd-study-status').first().innerText()).includes('免费'));check(await t.getByText('我的隔离记账产品',{exact:true}).count()===0);
 check((await t.locator('.ws-offer-price').innerText()).includes('¥499'));check((await t.locator('.ws-offer-price del').innerText()).includes('¥999'));
 await t.setViewportSize({width:1536,height:1152});await t.screenshot({path:path.join(output,'trial-1536.png'),fullPage:true});
 await t.locator('.wd-course-preview').click();await t.waitForURL(base+`/learn/${curriculum.slug}/lessons/${placements[0]}`);checks++;
 await t.goto(base+'/app');await ready(t);
 // Simulate verified fulfillment in this disposable DB, then checkout's refresh
 // path by reloading the account snapshot. No payment gateway/order is called.
 run("INSERT INTO entitlements(user_id,pack_id,status) VALUES(?,?,'active')",[trial.id,pack]);await t.reload();await ready(t);check(await t.locator('.ws-course-offer').getAttribute('data-access')==='unlocked');
 const oc=await context(admin),o=await oc.newPage();await o.goto(base+'/app');await ready(o);check(await o.locator('.ws-course-offer').getAttribute('data-access')==='management');
 check((await o.locator('.ws-course-offer').innerText()).includes('管理员预览'));check((await o.locator('.ws-offer-price').innerText()).includes('¥499'));
 await o.locator('.ws-course-offer>button').click();await o.waitForURL(base+'/membership');checks++;
 const gc=await context(),g=await gc.newPage();await g.goto(base+'/app');await ready(g);await g.locator('.wd-primary').click();await g.waitForURL(base+'/login');checks++;
 const ec=await context(fresh),e=await ec.newPage();await ec.route('**/api/learning/entry',route=>route.fulfill({status:503,json:{error:'隔离测试不可用'}}));await e.goto(base+'/app');await ready(e);check(await e.locator('.wd-primary').isDisabled());check(await e.locator('.wd-learning-phases .unavailable').count()===5);
 const nc=await context(fresh,{ai:false}),n=await nc.newPage();await n.goto(base+'/app');await ready(n);await n.getByRole('button',{name:'我该如何开始实践',exact:false}).click();await n.getByRole('button',{name:'保存为学习笔记',exact:false}).click();await n.locator('.wd-dialog').waitFor({state:'hidden'});check(JSON.parse(row('SELECT state_json FROM workspace_state WHERE user_id=?',[fresh.id]).state_json).notes.length===1);
 for(const mode of ['expanded','icons','hidden']){
  const c=await context(fresh,{sidebar:{mode,width:360}}),p=await c.newPage();await p.goto(base+'/app');await ready(p);for(const width of [1024,1440]){await p.setViewportSize({width,height:1100});await overflow(p);}await c.close();
 }
 // Route revalidation failure retains the last public price and purchased state.
 await t.route('**/api/commerce/offer',route=>route.fulfill({status:503,json:{error:'隔离网络故障'}}));await t.getByRole('button',{name:'学习笔记',exact:true}).click();await t.waitForURL(base+'/notes');check(await t.locator('.ws-course-offer').getAttribute('data-access')==='unlocked');
 await o.route('**/api/commerce/offer',route=>route.fulfill({status:503,json:{error:'隔离网络故障'}}));await o.getByRole('button',{name:'学习笔记',exact:true}).click();await o.waitForURL(base+'/notes');check((await o.locator('.ws-offer-price').innerText()).includes('¥499'));
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(`PASS ${checks} checks: 4 account states, 320–2560px, all sidebar modes, current lesson/progress, task save, private records, AI draft/context, unavailable/route-failure states; zero script errors/provider calls.`);
 if(process.argv.includes('--preview')){console.log(`Local isolated preview: ${base}/app`);await browser.close();await new Promise(()=>{});}
}finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
