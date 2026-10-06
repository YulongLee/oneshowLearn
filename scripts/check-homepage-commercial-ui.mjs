// Isolated homepage acceptance and persistent preview. Never production data or providers.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright'),temp=mkdtempSync(path.join(tmpdir(),'osl-homepage-commercial-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temp,'isolated.db'),UPLOAD_DIR:path.join(temp,'uploads'),JWT_SECRET:'isolated-homepage-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:'',PAYMENT_CONFIG_ENCRYPTION_KEY:'cd'.repeat(32)});
const {db,row,rows,run}=await import('../server/db.mjs'),{createApp}=await import('../server/index.mjs');
const {paymentConfiguration,savePaymentConfig}=await import('../server/payment-configuration.mjs');
const add=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
const owner=add("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('homepage@example.invalid','unused','隔离管理员','admin',1)");
const curriculum=JSON.parse(readFileSync('docs/curriculum/ai-opc-20261001.json','utf8'));
const lp=add("INSERT INTO learning_paths(slug,title,status) VALUES('homepage-isolated','隔离学习路线','published')");
const pack=add("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,?,?,'published')",[lp,curriculum.slug,curriculum.title]);
run('INSERT INTO learning_entry_settings(id,course_id) VALUES(1,?)',[pack]);
const product=add("INSERT INTO products(pack_id,sku,title,price_cents,status) VALUES(?,'HOME-ISOLATED',?,49900,'active')",[pack,curriculum.title]);
savePaymentConfig({id:owner,role:'admin'},0,{settings:{...paymentConfiguration().settings,productId:product,priceCents:49900,originalPriceCents:99900},secrets:{}});
const placements=[];
for(const chapter of curriculum.chapters){
 const id=add("INSERT INTO project_steps(pack_id,title,summary,status,sort_order) VALUES(?,?,?,'published',?)",[pack,'第 '+chapter.number+' 章 '+chapter.title,chapter.goal,chapter.number]);
 run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,?)',[id,chapter.number]);
 for(const [i,section] of chapter.sections.entries()){
  const lesson=add("INSERT INTO learning_lessons(title,subtitle,config,status) VALUES(?,?,?,'published')",[section.number+' '+section.title,'隔离预览课时，不用于生产上传。',JSON.stringify({isDemoMedia:true,tasks:[],operations:[],slides:[],mappings:[]})]);
  placements.push(add("INSERT INTO lesson_placements(lesson_id,chapter_id,is_preview,sort_order,status) VALUES(?,?,?,?,'published')",[lesson,id,chapter.number===1&&i<2?1:0,i]));
 }
}
for(const [i,p] of [
 {slug:'homepage-interview',title:'【演示】AI 面试助手',description:'以 AI 面试助手为例，演示需求梳理、页面开发与模型接入的学习流程。演示内容，非正式教学课程。',category:'saas',cover:'/assets/project-web-cover-v1.webp'},
 {slug:'homepage-agent',title:'【演示】AI Agent 自动化工作流',description:'以 AI Agent 工作流为例，演示任务拆解、工具调用和执行结果验收。演示内容，非正式教学课程。',category:'agent',cover:'/assets/project-agent-cover-v1.webp'},
 {slug:'homepage-private',title:'不应显示的草稿项目',description:'PRIVATE_PROJECT_BODY',category:'tools',cover:''},
].entries()){
 const id=add('INSERT INTO practice_projects(slug,title,description,category,cover_url,status,sort_order) VALUES(?,?,?,?,?,?,?)',[p.slug,p.title,p.description,p.category,p.cover,i===2?'draft':'published',i]);
 run('INSERT INTO practice_project_courses(project_id,pack_id) VALUES(?,?)',[id,pack]);
}
const app=createApp(),client=path.resolve('dist/client');
app.use('/assets',express.static(path.resolve('public/assets')));
app.use(express.static(client));app.get('/{*route}',(_q,res)=>res.sendFile(path.join(client,'index.html')));
const preview=process.argv.includes('--serve'),server=app.listen(preview?4186:0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
if(preview){
 console.log('Isolated local homepage preview: '+base+'/ (no production data/providers).');
 const close=()=>{server.close(()=>{db.close();rmSync(temp,{recursive:true,force:true});process.exit(0);});};
 process.on('SIGTERM',close);process.on('SIGINT',close);
}else{
 const browser=await chromium.launch({headless:true}),out=path.resolve('artifacts/homepage-commercial');mkdirSync(out,{recursive:true});
 const errors=[],requests=[],external=[];let checks=0;
 const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
 // Some schema names are version-specific; snapshot all existing business tables instead.
 const tables=rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(x=>x.name);
 const businessSnapshot=()=>JSON.stringify(tables.map(t=>[t,rows('SELECT * FROM "'+t+'"')]));
 const before=businessSnapshot();
 const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await c.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base)){external.push(q.url());return r.abort();}requests.push({url:q.url(),method:q.method()});if(!['GET','HEAD'].includes(q.method()))return r.abort();return r.continue();});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const p=await c.newPage(),ready=async()=>{await p.locator('.sales-hero-promises').getByText('40 节',{exact:true}).waitFor();await p.locator('.sales-case-copy').getByText('演示项目',{exact:true}).first().waitFor();};
 try{
  await p.goto(base+'/');await ready();
  check(await p.locator('.sales-phase').count()===5,'exactly five chapter directions');
  check(await p.locator('.sales-case-card').count()===3,'one live platform and two actual published projects');
  check(await p.locator('.sales-case-label.live').innerText()==='已上线产品','platform distinguished from demonstration projects');
  check((await p.locator('.sales-page').innerText()).includes('讲师介绍待补充'),'honest instructor placeholder');
  check((await p.locator('.sales-page').innerText()).includes('交互示意'),'AI display explicitly illustrative');
  check(!(await p.locator('.sales-page').innerText()).includes('PRIVATE_PROJECT_BODY'),'draft project never appears');
  check(await p.locator('.sales-price-slot strong').innerText()==='¥499','authoritative price');
  check(await p.locator('.sales-hero-buttons button').first().innerText().then(s=>s.includes('免费试看前 2 节')),'preview count from actual metadata');
  await p.locator('.sales-links').getByRole('button',{name:'AI 导师',exact:true}).click();
  check(await p.evaluate(()=>document.activeElement.id==='home-tutor'),'anchor transfers keyboard focus to tutor section');
  const faq=p.locator('.sales-faq details').first();await faq.locator('summary').focus();await p.keyboard.press('Enter');
  check(await faq.getAttribute('open')!==null,'native FAQ opens with Enter');await p.keyboard.press('Enter');check(await faq.getAttribute('open')===null,'native FAQ closes with Enter');
  const search=p.getByLabel('搜索课程',{exact:true});await search.fill('AI OPC');await p.locator('.sales-search-results>button').first().waitFor();
  check(await p.locator('.sales-search-results>button').count()===1,'search reads published course catalogue');
  await p.keyboard.press('Escape');check(await p.locator('.sales-search-results').count()===0,'Escape closes search');
  await search.fill('');await p.keyboard.press('Escape');
  for(const width of [320,390,600,768,1000,1024,1280,1440,1920,2560]){
   await p.setViewportSize({width,height:1000});await p.evaluate(()=>document.fonts.ready);
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+width);
   check(await p.locator('.sales-case-copy').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)),'card text fits '+width);
   check(await p.locator('.sales-hero-copy').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'hero fits '+width);
   check(await p.locator('.sales-hero-buttons button').evaluateAll(els=>els.every(e=>e.getBoundingClientRect().height>=44)),'touch targets '+width);
   if([390,1440,2560].includes(width)){await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.locator('.sales-example-art img').evaluateAll(els=>Promise.all(els.map(e=>e.decode().catch(()=>{}))));await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'homepage-'+width+'.png'),fullPage:true});}
  }
  await p.setViewportSize({width:390,height:800});await p.getByRole('button',{name:'打开导航'}).click();check(await p.locator('.sales-links').isVisible(),'mobile navigation opens');
  await p.locator('.sales-links').getByRole('button',{name:'课程体系',exact:true}).click();check(!await p.locator('.sales-links').isVisible(),'mobile anchor closes drawer');
  await p.setViewportSize({width:1440,height:1000});await p.locator('.sales-hero-buttons button').first().click();await p.waitForURL(base+'/learn/'+curriculum.slug+'/lessons/'+placements[0]);
  check(true,'preview opens exact actual lesson without selecting an unrelated course');
  await p.goto(base+'/');await ready();await p.locator('.sales-hero-buttons button').last().click();await p.waitForURL(base+'/membership');check(true,'purchase opens existing shared sales flow');
  await p.goto(base+'/');await ready();await p.locator('.sales-case-copy').getByRole('button',{name:'查看项目详情'}).first().click();await p.waitForURL(base+'/projects/homepage-interview');check(true,'project opens read-only details');check(row('SELECT COUNT(*) n FROM project_runs').n===0,'project details never create runs');
  await p.goto(base+'/');await ready();await p.locator('.sales-tutor-copy').getByRole('button',{name:'进入 AI 导师'}).click();await p.waitForURL(base+'/tutor');check(true,'AI entry opens tutor without sending a question');
  await c.route('**/api/commerce/offer',r=>r.fulfill({status:503,json:{error:'隔离价格读取失败'}}));await p.goto(base+'/');await p.getByText('课程或价格信息暂未完整读取。',{exact:false}).waitFor();
  check(!(await p.locator('.sales-price-slot strong').innerText()).includes('499'),'failed price never fabricated from marketing copy');
  check(!(await p.locator('.sales-hero-buttons').innerText()).includes('前 2'),'unknown offer does not claim a preview scope');
  await c.unroute('**/api/commerce/offer');await p.getByRole('button',{name:'重新读取',exact:true}).click();await ready();check(await p.locator('.sales-price-slot strong').innerText()==='¥499','metadata retry restores server price and course');
  await c.route('**/api/site/pages/public',async r=>{const response=await r.fetch();const d=await response.json();return r.fulfill({json:{...d,title:'自定义首页标题',description:'作者维护的介绍',ctaLabel:'作者入口',ctaPath:'/resources',secondaryLabel:'作者次入口',secondaryPath:'/community',footerTitle:'作者结尾标题',footerDescription:'作者结尾介绍',projects:[]}});});
  await p.goto(base+'/');await p.getByRole('heading',{name:'自定义首页标题',exact:true}).waitFor();check((await p.locator('.sales-lead').innerText())==='作者维护的介绍','custom authored CMS copy retained');
  check(await p.locator('.sales-hero-buttons button').first().innerText().then(s=>s.includes('作者次入口')),'custom secondary label retained');
  check(await p.locator('.sales-start').innerText().then(s=>s.includes('探索内容')),'custom destination is not mislabeled as free preview');
  check(await p.locator('.sales-price-card .sales-button').innerText().then(s=>s.includes('作者入口')),'custom final CTA label retained');
  check(await p.locator('.sales-case-label').allTextContents().then(s=>s.filter(x=>x==='学习方向').length===2),'empty project catalogue uses honest direction cards');
  await p.locator('.sales-hero-buttons button').last().click();await p.waitForURL(base+'/resources');check(true,'custom CMS purchase destination retained');
  await c.unroute('**/api/site/pages/public');
  await c.route('**/api/learning/entry',r=>r.fulfill({status:503,json:{error:'隔离目录读取失败'}}));await p.goto(base+'/');
  await p.getByText('课程或价格信息暂未完整读取。',{exact:false}).waitFor();
  check(!(await p.locator('.sales-hero-promises').innerText()).includes('40'),'failed catalogue does not invent lesson count');
  check(!(await p.locator('.sales-hero-buttons').innerText()).includes('前 2'),'failed catalogue does not invent preview count');
  await c.unroute('**/api/learning/entry');await p.getByRole('button',{name:'重新读取',exact:true}).click();await ready();check(true,'catalogue retry restores current course');
  await c.route('**/api/site/pages/public',async r=>{const response=await r.fetch(),d=await response.json();d.projects[0].cover_url='/assets/missing-homepage-cover.webp';return r.fulfill({json:d});});
  await p.goto(base+'/');await ready();await p.locator('.sales-case-card').nth(1).scrollIntoViewIfNeeded();
  await p.locator('.sales-case-card').nth(1).locator('.sales-example-art small').waitFor();
  check(await p.locator('.sales-case-card').nth(1).locator('img').evaluate(e=>e.complete&&e.naturalWidth>0),'failed custom cover recovers to labeled local illustration');
  await c.unroute('**/api/site/pages/public');
  check(requests.every(r=>['GET','HEAD'].includes(r.method)),'browsing has no writes, payment creation or AI requests');
  check(external.length===0,'no external provider or typography requests');
  check(businessSnapshot()===before,'all isolated business records unchanged by browsing');
  check(errors.length===0,'zero browser script errors');
  console.log('PASS '+checks+' isolated commercial homepage browser checks; screenshots: '+out);
 }finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});}
}
