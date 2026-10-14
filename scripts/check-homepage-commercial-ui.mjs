// Isolated homepage acceptance and persistent preview. Never production data or providers.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire(import.meta.url);
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
 {slug:'homepage-interview',title:'AI 面试助手',description:'以 AI 面试助手为例，练习需求梳理、页面开发与模型接入的学习流程。',category:'saas',cover:'/assets/project-web-cover-v1.webp'},
 {slug:'homepage-agent',title:'AI Agent 自动化工作流',description:'以 AI Agent 工作流为例，练习任务拆解、工具调用和执行结果验收。',category:'agent',cover:'/assets/project-agent-cover-v1.webp'},
 {slug:'homepage-demo',title:'【演示】保留在项目目录',description:'演示内容，非正式教学课程',category:'tools',cover:''},
 {slug:'homepage-private',title:'不应显示的草稿项目',description:'PRIVATE_PROJECT_BODY',category:'tools',cover:''},
].entries()){
 const id=add('INSERT INTO practice_projects(slug,title,description,category,cover_url,status,sort_order) VALUES(?,?,?,?,?,?,?)',[p.slug,p.title,p.description,p.category,p.cover,i===3?'draft':'published',i]);
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
 const p=await c.newPage(),ready=async()=>{await p.locator('.sales-hero-promises').getByText('40 节',{exact:true}).waitFor();await p.locator('.sales-case-copy').getByText('项目教程',{exact:true}).first().waitFor();};
 try{
  await p.goto(base+'/');await ready();
  check(await p.locator('.sales-phase').count()===5,'exactly five chapter directions');
  check(await p.locator('.sales-case-card').count()===3,'one platform capability and two formal published projects');
  check(await p.locator('.sales-case-label.live').innerText()==='OneShowLearn','platform capability honestly labeled');
  check(await p.locator('.sales-platform-case .sales-capability-background').count()===1,'real published projects retain their CMS covers beside one capability scene');
  check(!(await p.locator('.sales-page').innerText()).includes('【演示】保留在项目目录'),'demo projects not presented as public commercial proof');
  check(row("SELECT COUNT(*) n FROM practice_projects WHERE slug='homepage-demo' AND status='published'").n===1,'demo project publication preserved in actual catalogue');
  check((await p.locator('.sales-instructor-profile').innerText()).includes('大模型算法专家'),'owner biography replaces placeholder');
  check((await p.locator('.sales-instructor-profile').innerText()).includes('百度、科大讯飞、阿里'),'owner supplied experience retained without company logos');
  check(!(await p.locator('.sales-page').innerText()).includes('讲师介绍待补充'),'no unfinished instructor placeholder');
  check(!(await p.locator('.sales-page').innerText()).includes('背书'),'no gratuitous employer disclaimer in commercial page');
  check(await p.locator('.sales-tutor-guide ol li').count()===3,'AI capability workflow instead of fabricated chat');
  check(await p.locator('.sales-demo-answer').count()===0,'no simulated AI answer or citation');
  check(await p.locator('.sales-faq').innerText().then(s=>s.includes('40 节使用演示素材'))===false,'delivery detail collapsed until requested');
  const delivery=p.locator('.sales-faq details').filter({hasText:'课程内容和更新如何查看？'});await delivery.locator('summary').click();
  check((await delivery.innerText()).includes('40 节使用演示素材'),'actual outstanding delivery shown in purchase FAQ');await delivery.locator('summary').click();
  check(!(await p.locator('.sales-page').innerText()).includes('PRIVATE_PROJECT_BODY'),'draft project never appears');
  check(await p.locator('.sales-price-slot strong').innerText()==='¥499','authoritative price');
  check(await p.locator('.sales-hero-buttons button').count()===1,'default hero has one clear learning action');
  check(await p.locator('.sales-bottom-preview').innerText().then(s=>s.includes('免费试看前 2 节')),'retained preview count from actual metadata');
  await p.locator('.sales-links').getByRole('button',{name:'AI 导师',exact:true}).click();
  check(await p.evaluate(()=>document.activeElement.id==='home-tutor'),'anchor transfers keyboard focus to tutor section');
  const faq=p.locator('.sales-faq details').first();await faq.locator('summary').focus();await p.keyboard.press('Enter');
  check(await faq.getAttribute('open')!==null,'native FAQ opens with Enter');await p.keyboard.press('Enter');check(await faq.getAttribute('open')===null,'native FAQ closes with Enter');
  const search=p.getByLabel('搜索课程',{exact:true});await search.fill('AI OPC');await p.locator('.sales-search-results>button').first().waitFor();
  check(await p.locator('.sales-search-results>button').count()===1,'search reads published course catalogue');
  await p.keyboard.press('Escape');check(await p.locator('.sales-search-results').count()===0,'Escape closes search');
  await search.fill('');await p.keyboard.press('Escape');
  for(const width of [320,390,600,768,1000,1024,1180,1280,1440,1920,2560]){
   await p.setViewportSize({width,height:1000});await p.evaluate(()=>document.fonts.ready);
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+width);
   check(await p.locator('.sales-case-copy').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)),'card text fits '+width);
   check(await p.locator('.sales-hero-copy').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'hero fits '+width);
   check(await p.locator('.sales-hero-title-tail').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'product phrase remains whole and visible '+width);
   if(width>=768)check(await p.locator('h1>.sales-hero-title-line').evaluateAll(els=>els.length===2&&els.every(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1)),'desktop headline stays on two lines '+width);
   check(await p.locator('.sales-hero-rail strong').evaluateAll(els=>els.length===4&&els.every(e=>e.scrollWidth<=e.clientWidth+1)),'all four capability labels fit '+width);
   check(await p.evaluate(()=>document.querySelector('.sales-hero-rail').getBoundingClientRect().bottom+7<=document.querySelector('.sales-audience').getBoundingClientRect().top),'capability rail clears following section '+width);
   check(await p.locator('.sales-hero-callouts').evaluate(e=>{if(!e.getClientRects().length)return true;const growth=e.querySelector('.sales-hero-growth').getBoundingClientRect(),note=e.querySelector('.sales-hero-note').getBoundingClientRect(),title=document.querySelector('h1').getBoundingClientRect();return note.top-growth.bottom>=20&&Math.min(growth.left,note.left)>title.right;}),'helper cards stay separated from title and each other '+width);
   check(await p.locator('.sales-hero-buttons button').evaluateAll(els=>els.every(e=>e.getBoundingClientRect().height>=44)),'touch targets '+width);
   check(await p.locator('.sales-instructor-copy').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'instructor value and biography fit '+width);
   check(await p.locator('.sales-instructor-photo').evaluate(e=>e.getBoundingClientRect().height>=280),'portrait reserves stable space '+width);
   if([390,1440].includes(width)){await p.locator('.sales-instructor-profile').scrollIntoViewIfNeeded();await p.locator('.sales-instructor-photo img').evaluate(e=>e.decode());await p.locator('.sales-instructor-profile').screenshot({path:path.join(out,'instructor-v2-'+width+'.png')});}
   if([390,1440,2560].includes(width)){await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.locator('.sales-example-art img').evaluateAll(els=>Promise.all(els.map(e=>e.decode().catch(()=>{}))));await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'homepage-'+width+'.png'),fullPage:true});}
   if([390,1180,1440,2560].includes(width)){await p.evaluate(()=>scrollTo(0,0));await p.locator('.sales-hero-image').evaluate(e=>e.decode());const rail=await p.locator('.sales-hero-rail').boundingBox();await p.screenshot({path:path.join(out,'hero-first-'+width+'.png'),clip:{x:0,y:0,width,height:Math.min(1000,Math.ceil(rail.y+rail.height+24))}});}
  }
  await p.setViewportSize({width:390,height:800});await p.getByRole('button',{name:'打开导航'}).click();check(await p.locator('.sales-links').isVisible(),'mobile navigation opens');
  await p.locator('.sales-links').getByRole('button',{name:'课程体系',exact:true}).click();check(!await p.locator('.sales-links').isVisible(),'mobile anchor closes drawer');
  await p.setViewportSize({width:1440,height:1000});await p.locator('.sales-bottom-preview').click();await p.waitForURL(base+'/learn/'+curriculum.slug+'/lessons/'+placements[0]);
  check(true,'preview opens exact actual lesson without selecting an unrelated course');
  await p.goto(base+'/');await ready();await p.locator('.sales-hero-buttons button').first().click();await p.waitForURL(base+'/membership');check(true,'purchase opens existing shared sales flow');
  await p.goto(base+'/');await ready();await p.locator('.sales-instructor-preview').click();await p.waitForURL(base+'/learn/'+curriculum.slug+'/lessons/'+placements[0]);check(true,'instructor preview opens exact authorized lesson');
  await p.goto(base+'/');await ready();await p.locator('.sales-case-copy').getByRole('button',{name:'查看项目详情'}).first().click();await p.waitForURL(base+'/projects/homepage-interview');check(true,'project opens read-only details');check(row('SELECT COUNT(*) n FROM project_runs').n===0,'project details never create runs');
  await p.goto(base+'/');await ready();await p.locator('.sales-tutor-guide').getByRole('button',{name:'进入 AI 导师'}).click();await p.waitForURL(base+'/tutor');check(true,'AI entry opens tutor without sending a question');
  await c.route('**/api/commerce/offer',r=>r.fulfill({status:503,json:{error:'隔离价格读取失败'}}));await p.goto(base+'/');await p.getByText('课程或价格信息暂未完整读取。',{exact:false}).waitFor();
  check(!(await p.locator('.sales-price-slot strong').innerText()).includes('499'),'failed price never fabricated from marketing copy');
  check(!(await p.locator('.sales-bottom-preview').innerText()).includes('前 2'),'unknown offer does not claim a preview scope');
  await c.unroute('**/api/commerce/offer');await p.getByRole('button',{name:'重新读取',exact:true}).click();await ready();check(await p.locator('.sales-price-slot strong').innerText()==='¥499','metadata retry restores server price and course');
  await c.route('**/api/site/pages/public',async r=>{const response=await r.fetch();const d=await response.json();return r.fulfill({json:{...d,title:'自定义首页标题',description:'作者维护的介绍',ctaLabel:'作者入口',ctaPath:'/resources',secondaryLabel:'作者次入口',secondaryPath:'/community',footerTitle:'作者结尾标题',footerDescription:'作者结尾介绍',projects:[]}});});
  await p.goto(base+'/');await p.getByRole('heading',{name:'自定义首页标题',exact:true}).waitFor();check((await p.locator('.sales-lead').innerText())==='作者维护的介绍','custom authored CMS copy retained');
  check(await p.locator('.sales-hero-buttons button').last().innerText().then(s=>s.includes('作者次入口')),'custom secondary label retained');
  check(await p.locator('.sales-start').innerText().then(s=>s.includes('作者入口')),'custom navigation purchase label retained');
  check(await p.locator('.sales-price-card .sales-button').innerText().then(s=>s.includes('作者入口')),'custom final CTA label retained');
  check(await p.locator('.sales-platform-case').count()===3,'empty formal catalogue presents only actual platform capabilities');
  const scenes=p.locator('.sales-capability-background'),art=p.locator('.sales-capability-art');
  check(await scenes.count()===3,'three actual platform capabilities have individual soft-focus scenes');
  check(await scenes.evaluateAll(els=>els.every(e=>e.getAttribute('alt')===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1536'&&e.getAttribute('height')==='1024')),'scene backgrounds remain lazy, decorative and intrinsically sized');
  const sceneUrls=await scenes.evaluateAll(els=>els.map(e=>e.src));
  check(new Set(sceneUrls).size===3&&sceneUrls.every(url=>url.startsWith(base+'/assets/')),'three distinct bundled scenes use only the local asset origin');
  check(JSON.stringify(await art.locator(':scope>strong').allTextContents())===JSON.stringify(['课程与资料','AI 辅助学习','实践与沉淀']),'backgrounds preserve all three platform capability titles');
  check(await art.locator('li').count()===9,'backgrounds preserve all nine capability facts');
  for(const width of [320,390,600,768,1000,1024,1180,1440,1920,2560]){
   await p.setViewportSize({width,height:1000});await p.evaluate(()=>document.fonts.ready);
   for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
   check(await scenes.evaluateAll(els=>els.every(e=>e.complete&&e.naturalWidth===1536&&e.naturalHeight===1024)),'all three scene assets decode '+width);
   check(await art.evaluateAll(els=>els.every(e=>[e,...e.querySelectorAll('.sales-capability-icon,strong,ul,li,.sales-art-label')].every(n=>getComputedStyle(n).filter==='none'))),'soft-focus treatment never blurs foreground text or icons '+width);
   check(await art.evaluateAll(els=>els.every(e=>{const bounds=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.sales-capability-icon,strong,ul,li,.sales-art-label')].every(n=>{const b=n.getBoundingClientRect();return b.left>=bounds.left-1&&b.right<=bounds.right+1&&b.top>=bounds.top-1&&b.bottom<=bounds.bottom+1;});})),'scene panel foreground fits without clipping '+width);
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'scene cards keep document within viewport '+width);
  }
  await p.setViewportSize({width:1440,height:1000});
  const sceneCardSize=()=>p.locator('.sales-platform-case').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height};}));
  const withScenes=await sceneCardSize();
  await scenes.evaluateAll(els=>els.forEach(e=>e.style.display='none'));
  check(JSON.stringify(await sceneCardSize())===JSON.stringify(withScenes),'decorative scene visibility does not alter card dimensions');
  await scenes.evaluateAll(els=>els.forEach(e=>e.style.removeProperty('display')));
  // Block only the three captured decorative URLs, never CMS covers or other imagery.
  for(const url of sceneUrls)await c.route(url,r=>r.abort());
  await p.goto(base+'/');await p.locator('.sales-platform-case').nth(2).waitFor();
  for(const panel of await art.all())await panel.scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>[...document.querySelectorAll('.sales-capability-background')].every(e=>e.complete&&e.naturalWidth===0));
  check(JSON.stringify(await sceneCardSize())===JSON.stringify(withScenes),'failed background images retain exact card dimensions');
  check(await art.locator(':scope>strong').evaluateAll(els=>els.length===3&&els.every(e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.filter==='none'&&s.visibility==='visible'&&s.opacity==='1';})),'failed scenes leave all foreground titles visible and sharp');
  check(await p.locator('.sales-platform-case .sales-case-copy button').evaluateAll(els=>els.length===3&&els.every(e=>e.getClientRects().length&&e.getBoundingClientRect().height>=44)),'failed scenes preserve three usable capability destinations');
  for(const url of sceneUrls)await c.unroute(url);
  for(const [index,destination] of ['/opc','/tutor','/achievements'].entries()){
   await p.locator('.sales-platform-case .sales-case-copy button').nth(index).click();await p.waitForURL(base+destination);check(true,'capability scene preserves destination '+destination);
   await p.goto(base+'/');await p.locator('.sales-platform-case').nth(2).waitFor();
  }
  await p.locator('.sales-hero-buttons button').first().click();await p.waitForURL(base+'/resources');check(true,'custom CMS purchase destination retained');
  await c.unroute('**/api/site/pages/public');
  await c.route('**/api/learning/entry',r=>r.fulfill({status:503,json:{error:'隔离目录读取失败'}}));await p.goto(base+'/');
  await p.getByText('课程或价格信息暂未完整读取。',{exact:false}).waitFor();
  check(!(await p.locator('.sales-hero-promises').innerText()).includes('40'),'failed catalogue does not invent lesson count');
  check(!(await p.locator('.sales-bottom-preview').innerText()).includes('前 2'),'failed catalogue does not invent preview count');
  await c.unroute('**/api/learning/entry');await p.getByRole('button',{name:'重新读取',exact:true}).click();await ready();check(true,'catalogue retry restores current course');
  await c.route('**/api/site/pages/public',async r=>{const response=await r.fetch(),d=await response.json();d.projects[0].cover_url='/assets/missing-homepage-cover.webp';return r.fulfill({json:d});});
  await p.goto(base+'/');await ready();await p.locator('.sales-case-card').nth(1).scrollIntoViewIfNeeded();
  await p.locator('.sales-case-card').nth(1).locator('.sales-example-art small').waitFor();
  check(await p.locator('.sales-case-card').nth(1).locator('img').evaluate(e=>e.complete&&e.naturalWidth>0),'failed custom cover recovers to labeled local illustration');
  await c.unroute('**/api/site/pages/public');
  await p.locator('.sales-instructor-photo').scrollIntoViewIfNeeded();
  check(await p.locator('.sales-instructor-photo img').evaluate(async e=>{await e.decode();return e.naturalWidth===1536;}),'original brand portrait sharp and fully loaded');
  const portraitUrl=await p.locator('.sales-instructor-photo img').getAttribute('src');
  await c.route(base+portraitUrl,r=>r.abort());await p.goto(base+'/');await ready();await p.locator('.sales-instructor-photo').scrollIntoViewIfNeeded();await p.locator('.sales-portrait-fallback').waitFor();
  check((await p.locator('.sales-portrait-fallback').innerText()).includes('Cody老师'),'portrait failure keeps identity and layout');
  await c.unroute(base+portraitUrl);
  await c.route('**/api/site/pages/public',async r=>{const response=await r.fetch(),d=await response.json();d.projects=d.projects.map(p=>({...p,title:'【演示】'+p.title}));return r.fulfill({json:d});});
  await p.goto(base+'/');await p.locator('.sales-platform-case').nth(2).waitFor();
  check(await p.locator('.sales-public-project').count()===0,'all-demo catalogue does not fabricate commercial case studies');
  await c.unroute('**/api/site/pages/public');
  check(requests.every(r=>['GET','HEAD'].includes(r.method)),'browsing has no writes, payment creation or AI requests');
  check(external.length===0,'no external provider or typography requests');
  check(businessSnapshot()===before,'all isolated business records unchanged by browsing');
  check(errors.length===0,'zero browser script errors');
  console.log('PASS '+checks+' isolated commercial homepage browser checks; screenshots: '+out);
 }finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});}
}
