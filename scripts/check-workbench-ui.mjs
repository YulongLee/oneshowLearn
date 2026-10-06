// Disposable local accounts/catalog only. Never reads production data or calls providers.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire(import.meta.url);
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
for(const [i,title] of ['[演示] AI 面试助手','[演示] AI 工具聚合站','[演示] AI 健康饮食管理 App','[演示] AI Agent 自动化工作流','[演示] 微信 AI 小程序'].entries()){
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
 const c=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:options.reducedMotion||'no-preference'});
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
 check(await f.locator('.wd-project-slide:not([data-copy]) .wd-project-card').count()===5);
 check(await f.locator('.wd-project-slide:not([data-copy]) .wd-demo-badge').count()===5);
 check(await f.locator('.wd-phase-icon').count()===5);
 check(await f.locator('.wd-course-preview').isVisible());
 check(await f.locator('.wd-preview-brand .osl-brand-wordmark').evaluate(el=>getComputedStyle(el).color)==='rgb(255, 255, 255)');
 check(await f.locator('.wd-preview-brand .osl-brand-tagline').evaluate(el=>getComputedStyle(el).display)==='none');
 check(await f.locator('.wd-preview-brand .osl-brand-wordmark em').evaluate(el=>getComputedStyle(el).color)==='rgb(195, 164, 255)');
 await f.locator('.wd-course-preview>img').evaluate(img=>img.decode());check(await f.locator('.wd-course-preview>img').evaluate(img=>img.naturalWidth>0));
 const covers=await f.locator('.wd-project-card .wd-cover img').evaluateAll(imgs=>imgs.slice(0,3).map(img=>img.src));check(new Set(covers).size===3);
 const cc=await context(),custom=await cc.newPage();
 await cc.route('**/api/learning/entry',async route=>{const response=await route.fetch(),data=await response.json();data.courses=data.courses.map(course=>({...course,cover_url:covers[0]}));await route.fulfill({json:data});});
 await custom.goto(base+'/app');await ready(custom);check(await custom.locator('.wd-course-preview>img').getAttribute('src')===covers[0]);check(await custom.locator('.wd-preview-copy').count()===0);await cc.close();
 check(await f.locator('.wd-project-carousel').getAttribute('data-visible')==='3');
 const widths=[320,390,768,1024,1440,1920,2560];
 for(const width of widths){await f.setViewportSize({width,height:1100});await overflow(f);check(await f.locator('.wd-primary').isVisible());check(await f.locator('.wd-learning-phases li').count()===5);check(await f.locator('.wd-inspiration').evaluate(el=>{const s=getComputedStyle(el,'::after');return el.getBoundingClientRect().height-parseFloat(s.height)>=95.5;}));if([390,1440,1920].includes(width))await f.screenshot({path:path.join(output,'fresh-'+width+'.png'),fullPage:true});}
 await f.setViewportSize({width:390,height:844});check(await f.locator('.wd-rail').evaluate(el=>getComputedStyle(el).position)==='static');
 const railBottom=async(p,name)=>{
  await p.setViewportSize({width:1536,height:900});
  await p.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await p.waitForTimeout(150);
  check(await p.locator('.wd-rail').evaluate(el=>getComputedStyle(el).position)==='static');
  const [rail,main]=await Promise.all([p.locator('.wd-rail').boundingBox(),p.locator('.wd-main').boundingBox()]);
  check(Math.abs(rail.y+rail.height-main.y-main.height)<3);check(rail.y+rail.height<=880);
  check(await p.locator('.wd-inspiration').isVisible());
  const [poster,last]=await Promise.all([p.locator('.wd-inspiration').boundingBox(),p.locator('.wd-growth-entry').boundingBox()]);
  check(Math.abs(poster.y+poster.height-last.y-last.height)<3);check(poster.height>=155);
  const scene=await p.locator('.wd-inspiration').evaluate(el=>{const s=getComputedStyle(el,'::after');return {opacity:s.opacity,height:parseFloat(s.height),filter:s.filter,mask:s.maskImage,position:s.backgroundPosition};});
  check(scene.opacity==='1'&&scene.filter==='none');check(scene.height<=380&&scene.height>0&&scene.position==='82% 65%');
  await p.locator('.wd-inspiration').screenshot({path:path.join(output,name+'-mountain.png')});
  await p.screenshot({path:path.join(output,name+'.png'),fullPage:false});
  await p.evaluate(()=>window.scrollTo(0,0));
 };
 await railBottom(f,'rail-bottom-fresh-1536');
 await f.locator('.wd-tasks .wd-secondary').focus();check((await f.locator('.wd-tasks .wd-secondary').boundingBox()).y>=58);
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
 await railBottom(r,'rail-bottom-returning-1536');await r.setViewportSize({width:1440,height:1100});
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
 await t.locator('.ws-offer-syllabus').filter({hasText:'5 章 · 40 节'}).waitFor();
 check(await t.locator('.ws-offer-benefits li').count()===3);check((await t.locator('.ws-offer-ai').innerText()).includes('AI 导师 · 课程答疑'));
 check(await t.locator('.ws-offer-eyebrow').count()===0);
 check(await t.locator('.ws-offer-syllabus').evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(el).borderTopWidth==='0px'));
 check(await t.locator('.ws-offer-benefits').evaluate(el=>[...el.children].every(row=>{const s=getComputedStyle(row);return s.borderTopWidth==='0px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.fontSize===getComputedStyle(el.firstElementChild).fontSize;})));
 check(await t.locator('.ws-offer-preview').evaluate(el=>{const s=getComputedStyle(el);return s.borderTopWidth==='0px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&el.getBoundingClientRect().height>=44;}));
 check(await t.locator('.ws-offer-benefits li').evaluateAll(rows=>rows.every(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)+1)));
 check(await t.locator('.ws-course-offer').evaluate(el=>parseFloat(getComputedStyle(el,'::before').height)<=74&&parseFloat(getComputedStyle(el,'::before').opacity)<=.25));
 check(await t.locator('.ws-offer-preview').innerText()==='免费试看前 2 节');check(await t.locator('.ws-offer-account,.ws-offer-saving').count()===0);
 check((await t.locator('.ws-offer-payment').innerText()).includes('以收银台为准'));
 await t.setViewportSize({width:1536,height:1152});await t.screenshot({path:path.join(output,'trial-1536.png'),fullPage:true});
 await t.locator('.ws-course-offer').screenshot({path:path.join(output,'sidebar-offer-trial.png')});
 for(const [width,height] of [[1024,900],[1440,720],[390,667],[320,480]]){
   await t.setViewportSize({width,height});
   if(width<1000&&!await t.locator('.ws-sidebar').isVisible())await t.locator('.ws-mobile-menu').click();
   await overflow(t);check(await t.locator('.ws-sidebar').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1));
   check(await t.locator('.ws-sidebar>nav').evaluate(el=>el.clientHeight>20));
   await t.locator('.ws-offer-primary').focus();await t.keyboard.press('Tab');
   check(await t.locator('.ws-offer-preview').evaluate(el=>el===document.activeElement));
   const previewBounds=await t.locator('.ws-offer-preview').boundingBox(),cardBounds=await t.locator('.ws-course-offer').boundingBox();
   assert.ok(previewBounds.y>=Math.max(0,cardBounds.y)-1&&previewBounds.y+previewBounds.height<=Math.min(height,cardBounds.y+cardBounds.height)+1,JSON.stringify({width,height,previewBounds,cardBounds}));checks++;
   if(width===390)await t.screenshot({path:path.join(output,'sidebar-offer-mobile.png'),fullPage:false});
 }
 await t.setViewportSize({width:1536,height:900});await t.locator('.ws-offer-preview').click();await t.waitForURL(base+`/learn/${curriculum.slug}/lessons/${placements[0]}`);checks++;
 await t.goto(base+'/app');await ready(t);
 const wideContext=await context(trial,{sidebar:{mode:'expanded',width:320}}),wide=await wideContext.newPage();
 await wideContext.route('**/api/commerce/offer',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({json:{...data,channels:data.channels.map(c=>({...c,available:true}))}});});
 await wide.goto(base+'/app');await ready(wide);await wide.locator('.ws-offer-syllabus').filter({hasText:'40 节'}).waitFor();
 check((await wide.locator('.ws-offer-payment').innerText()).includes('微信'));check((await wide.locator('.ws-offer-payment').innerText()).includes('支付宝'));
 check(await wide.locator('.ws-offer-ai').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14));
 await wide.locator('.ws-course-offer').screenshot({path:path.join(output,'sidebar-offer-wide.png')});
 await wideContext.route('**/api/learning/entry',route=>route.fulfill({status:503,json:{error:'隔离目录重验证失败'}}));
 await wide.getByRole('button',{name:'学习笔记',exact:true}).click();await wide.waitForURL(base+'/notes');
 check((await wide.locator('.ws-offer-syllabus').innerText()).includes('40 节'));check(await wide.locator('.ws-offer-preview').isVisible());await wideContext.close();
 // Simulate verified fulfillment in this disposable DB, then checkout's refresh
 // path by reloading the account snapshot. No payment gateway/order is called.
 run("INSERT INTO entitlements(user_id,pack_id,status) VALUES(?,?,'active')",[trial.id,pack]);await t.reload();await ready(t);check(await t.locator('.ws-course-offer').getAttribute('data-access')==='unlocked');
 check(await t.locator('.ws-offer-preview,.ws-offer-price,.ws-offer-benefits').count()===0);
 const oc=await context(admin),o=await oc.newPage();await o.goto(base+'/app');await ready(o);check(await o.locator('.ws-course-offer').getAttribute('data-access')==='management');
 check((await o.locator('.ws-course-offer').innerText()).includes('管理员预览'));check((await o.locator('.ws-offer-price').innerText()).includes('¥499'));
 await o.locator('.ws-offer-primary').click();await o.waitForURL(base+'/membership');checks++;
 const gc=await context(),g=await gc.newPage();await g.goto(base+'/app');await ready(g);await g.locator('.wd-primary').click();await g.waitForURL(base+'/login');checks++;
 const ec=await context(fresh),e=await ec.newPage();await ec.route('**/api/learning/entry',route=>route.fulfill({status:503,json:{error:'隔离测试不可用'}}));await e.goto(base+'/app');await ready(e);check(await e.locator('.wd-primary').isDisabled());check(await e.locator('.wd-learning-phases .unavailable').count()===5);
 const nc=await context(fresh,{ai:false}),n=await nc.newPage();await n.goto(base+'/app');await ready(n);await n.getByRole('button',{name:'我该如何开始实践',exact:false}).click();await n.getByRole('button',{name:'保存为学习笔记',exact:false}).click();await n.locator('.wd-dialog').waitFor({state:'hidden'});check(JSON.parse(row('SELECT state_json FROM workspace_state WHERE user_id=?',[fresh.id]).state_json).notes.length===1);
 for(const mode of ['expanded','icons','hidden']){
  const c=await context(fresh,{sidebar:{mode,width:360}}),p=await c.newPage();await p.goto(base+'/app');await ready(p);for(const width of [1024,1440]){await p.setViewportSize({width,height:1100});await overflow(p);}await c.close();
 }
 // Route revalidation failure retains the last public price and purchased state.
 await t.route('**/api/commerce/offer',route=>route.fulfill({status:503,json:{error:'隔离网络故障'}}));await t.getByRole('button',{name:'学习笔记',exact:true}).click();await t.waitForURL(base+'/notes');check(await t.locator('.ws-course-offer').getAttribute('data-access')==='unlocked');
 await o.route('**/api/commerce/offer',route=>route.fulfill({status:503,json:{error:'隔离网络故障'}}));await o.getByRole('button',{name:'学习笔记',exact:true}).click();await o.waitForURL(base+'/notes');check((await o.locator('.ws-offer-price').innerText()).includes('¥499'));
 // Continuous flow: small displacements every frame, no eight-second stops or
 // visible technical footer. All identities/catalogues are disposable local fixtures.
 const pc=await context(fresh),p=await pc.newPage();await p.clock.install();await p.goto(base+'/app');await ready(p);
 const region=p.locator('.wd-project-carousel');await region.scrollIntoViewIfNeeded();await p.mouse.move(0,0);await p.locator('.wd-project-carousel[data-rotating="true"]').waitFor();
 const offset=page=>page.locator('.wd-project-carousel').evaluate(el=>el.scrollLeft);
 check(await p.locator('.wd-carousel-footer,.wd-carousel-controls,.wd-carousel-caption').count()===0);
 check(await p.locator('.wd-project-slide[data-copy]').count()===5);
 check(await p.locator('.wd-project-slide[data-copy] .wd-project-card').evaluateAll(cards=>cards.every(card=>card.tabIndex===-1)));
 const a=await offset(p);await p.clock.runFor(1000);const b=await offset(p);await p.clock.runFor(1000);const c=await offset(p);
 check(b-a>20&&b-a<28);check(c-b>20&&c-b<28);check(Math.abs((b-a)-(c-b))<3);
 await p.screenshot({path:path.join(output,'project-flow-desktop-1440.png'),fullPage:false});
 await region.hover();const held=await offset(p);await p.clock.runFor(2000);check(Math.abs(await offset(p)-held)<1);check(await region.getAttribute('data-rotating')==='false');
 await p.mouse.move(0,0);await p.clock.runFor(1000);check(await offset(p)>held+20);
 await p.getByRole('button',{name:'暂停项目流动'}).focus();await p.getByRole('button',{name:'暂停项目流动'}).press('Enter');await p.locator('.ws-search input').focus();await region.scrollIntoViewIfNeeded();await p.mouse.move(0,0);const stopped=await offset(p);await p.clock.runFor(1000);check(Math.abs(await offset(p)-stopped)<1);
 await p.getByRole('button',{name:'恢复项目流动'}).focus();await p.getByRole('button',{name:'恢复项目流动'}).press('Enter');await p.locator('.ws-search input').focus();await region.scrollIntoViewIfNeeded();await p.mouse.move(0,0);await p.locator('.wd-project-carousel[data-rotating="true"]').waitFor();
 // Set an isolated fixture close to the seam, then let real animation frames wrap.
 const cycle=await region.evaluate(el=>{const track=el.querySelector('.wd-project-grid'),card=track.firstElementChild;return (card.getBoundingClientRect().width+14)*5;});
 await region.hover();await region.evaluate((el,cycle)=>{el.scrollLeft=cycle-10;},cycle);await p.mouse.move(0,0);await p.clock.runFor(1000);check(await offset(p)<25);
 const originals=p.locator('.wd-project-slide:not([data-copy]) .wd-project-card');await originals.nth(3).focus();const focused=await offset(p);await p.clock.runFor(1000);check(Math.abs(await offset(p)-focused)<1);
 await p.setViewportSize({width:390,height:844});await region.scrollIntoViewIfNeeded();await overflow(p);check(await region.getAttribute('data-visible')==='1');check(await originals.nth(3).evaluate(el=>el===document.activeElement));
 check(await originals.nth(3).evaluate(el=>{const card=el.getBoundingClientRect(),viewport=el.closest('.wd-project-carousel').getBoundingClientRect();return card.left>=viewport.left-1&&card.right<=viewport.right+1;}));
 await p.screenshot({path:path.join(output,'project-flow-mobile-390.png'),fullPage:false});await originals.nth(3).click();await p.waitForURL(base+'/projects/qa-project-3');checks++;
 const motionContext=await context(fresh,{reducedMotion:'reduce'}),rp=await motionContext.newPage();await rp.clock.install();await rp.goto(base+'/app');await ready(rp);await rp.locator('.wd-project-carousel').scrollIntoViewIfNeeded();const still=await offset(rp);await rp.clock.runFor(1000);check(await offset(rp)===still);check(await rp.locator('.wd-project-slide[data-copy],.wd-flow-control').count()===0);
 await rp.locator('.wd-project-card').nth(4).focus();check(await offset(rp)>still);await rp.locator('.wd-project-card').nth(4).press('Enter');await rp.waitForURL(base+'/projects/qa-project-4');checks++;
 const copyContext=await context(fresh),cp=await copyContext.newPage();await cp.goto(base+'/app');await ready(cp);const cr=cp.locator('.wd-project-carousel');await cr.scrollIntoViewIfNeeded();await cr.hover();await cr.evaluate(el=>{const card=el.querySelector('.wd-project-slide'),step=card.getBoundingClientRect().width+14;el.scrollLeft=step*5-100;});await cp.locator('.wd-project-slide[data-copy] .wd-project-card').first().click();await cp.waitForURL(base+'/projects/qa-project-0');checks++;
 for(const total of [1,2]){const sc=await context(fresh),sp=await sc.newPage();await sc.route('**/api/learning/projects?*',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({json:{...data,items:data.items.slice(0,total),total}});});await sp.goto(base+'/app');await ready(sp);check(await sp.locator('.wd-project-card').count()===total);check(await sp.locator('.wd-project-carousel').getAttribute('data-flow')==='false');await sp.setViewportSize({width:390,height:844});await sp.locator('.wd-project-carousel').scrollIntoViewIfNeeded();await overflow(sp);check(await sp.locator('.wd-project-carousel').getAttribute('data-visible')==='1');}
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(`PASS ${checks} checks: 4 account states, 320–2560px, all sidebar modes, continuous frame speed/seam, hidden footer, pause/resume, original/copy project navigation, reduced motion, focused resize and rail alignment; zero script errors/provider calls.`);
 if(process.argv.includes('--preview')){console.log(`Local isolated preview: ${base}/app`);await browser.close();await new Promise(()=>{});}
}finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
