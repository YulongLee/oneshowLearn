// Anonymous production review: same-origin GET/HEAD only, no provider operations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {homepageCourse,homepagePreviewText,homepageDeliveryText,homepageCommercialProjects} from '../src/homepage-model.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.HOMEPAGE_REVIEW_BASE||'https://oneshowlearn.com';assert.ok(base==='https://oneshowlearn.com'||/^http:\/\/127\.0\.0\.1:\d+$/.test(base));
const get=async p=>{const r=await fetch(base+p,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
const offer=await get('/api/commerce/offer'),entry=await get('/api/learning/entry'),site=await get('/api/site/pages/public'),course=homepageCourse(entry,offer);assert.ok(course?.previewPath);assert.ok(Number.isInteger(offer.priceCents));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[],writes=[];
const isProduction=base==='https://oneshowlearn.com';
const audienceLabels=['从想法开始','边学边做','准备上线'],audienceTitles=['有想法，却不知道先验证什么','想用 AI，把开发效率真正提起来','产品已在手上，差上线与商业化'],audiencePoints=['发现值得做的机会','把想法拆成清晰的产品问题','从架构到 MVP 开发','按步骤留下自己的实践记录','上线与合规的关键环节','定价、支付与运营思路'];
const out=path.resolve('artifacts/homepage-commercial/'+(isProduction?'live':'local-formal'));mkdirSync(out,{recursive:true});
await context.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base+'/')){external.push(q.url());return r.abort();}if(!['GET','HEAD'].includes(q.method())){writes.push(q.url());return r.abort();}return r.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let checks=0;
try {
 for(const width of [320,390,768,1024,1180,1440,1920,2560]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节`,{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
  assert.deepEqual(await page.locator('.sales-hero-rail strong').allTextContents(),['系统课程','实战项目','AI 导师','学习交流']);checks++;
  assert.ok(await page.locator('.sales-hero-rail strong').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)));checks++;
  assert.ok(await page.evaluate(()=>document.querySelector('.sales-hero-rail').getBoundingClientRect().bottom+7<=document.querySelector('.sales-audience').getBoundingClientRect().top));checks++;
  assert.ok(await page.locator('.sales-hero-callouts').evaluate(e=>{if(!e.getClientRects().length)return true;const growth=e.querySelector('.sales-hero-growth').getBoundingClientRect(),note=e.querySelector('.sales-hero-note').getBoundingClientRect(),title=document.querySelector('h1').getBoundingClientRect();return note.top-growth.bottom>=20&&Math.min(growth.left,note.left)>title.right;}));checks++;
  if(width>=768&&await page.locator('.sales-hero-bundled').count()){assert.ok(await page.locator('h1>.sales-hero-title-line').evaluateAll(els=>els.length===2&&els.every(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1)));checks++;}
  assert.ok((await page.locator('.sales-price-slot').innerText()).includes(String(offer.priceCents/100)));checks++;
  assert.equal(await page.locator('.sales-audience article').count(),3);assert.equal(await page.locator('.sales-phase-grid>li').count(),5);assert.equal(await page.locator('.sales-case-card').count(),homepageCommercialProjects(site).length?homepageCommercialProjects(site).length+1:3);checks+=3;
  const audience=page.locator('.sales-audience-card'),audienceScenes=audience.locator('.sales-audience-background');
  assert.deepEqual(await audience.locator('.sales-audience-label').allTextContents(),audienceLabels);checks++;
  assert.deepEqual(await audience.locator('h3').allTextContents(),audienceTitles);checks++;
  assert.deepEqual(await audience.locator('li').allTextContents(),audiencePoints);checks++;
  assert.equal(await audienceScenes.count(),3);checks++;
  assert.ok(await audienceScenes.evaluateAll(els=>els.every(e=>e.getAttribute('alt')===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1536'&&e.getAttribute('height')==='1024'&&getComputedStyle(e).position==='absolute'&&getComputedStyle(e).pointerEvents==='none')));checks++;
  for(const scene of await audienceScenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  assert.ok(await audienceScenes.evaluateAll(els=>els.every(e=>e.complete&&e.naturalWidth===1536&&e.naturalHeight===1024&&new URL(e.src).origin===location.origin)));checks++;
  assert.ok(await audience.evaluateAll(els=>els.every(e=>[e,...e.querySelectorAll('header,h3,p,ul,li')].every(n=>{const s=getComputedStyle(n);return s.filter==='none'&&s.visibility==='visible'&&s.opacity==='1';}))));checks++;
  assert.ok(await audience.evaluateAll(els=>els.every(e=>{const bounds=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('header,h3,p,ul,li')].every(n=>{const b=n.getBoundingClientRect();return b.left>=bounds.left-1&&b.right<=bounds.right+1&&b.top>=bounds.top-1&&b.bottom<=bounds.bottom+1;});})));checks++;
  assert.ok(await audienceScenes.evaluateAll(els=>els.every(e=>{const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return Math.abs(b.left-p.left)<=2&&Math.abs(b.right-p.right)<=2&&Math.abs(b.top-p.top)<=2&&Math.abs(b.bottom-p.bottom)<=2;})));checks++;
  if([390,1180,1440,2560].includes(width))await page.locator('.sales-audience-grid').screenshot({path:path.join(out,`audience-scenes-${width}.png`)});
  const sceneCount=homepageCommercialProjects(site).length?1:3,scenes=page.locator('.sales-capability-background'),panels=page.locator('.sales-capability-art');
  assert.equal(await scenes.count(),sceneCount);checks++;
  assert.ok(await scenes.evaluateAll(els=>els.every(e=>e.getAttribute('alt')===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1536'&&e.getAttribute('height')==='1024')));checks++;
  for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  assert.ok(await scenes.evaluateAll(els=>els.every(e=>e.complete&&e.naturalWidth===1536&&e.naturalHeight===1024)));checks++;
  assert.ok(await panels.evaluateAll(els=>els.every(e=>[e,...e.querySelectorAll('.sales-capability-icon,strong,ul,li,.sales-art-label')].every(n=>getComputedStyle(n).filter==='none'))));checks++;
  assert.ok(await panels.evaluateAll(els=>els.every(e=>{const bounds=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.sales-capability-icon,strong,ul,li,.sales-art-label')].every(n=>{const b=n.getBoundingClientRect();return b.left>=bounds.left-1&&b.right<=bounds.right+1&&b.top>=bounds.top-1&&b.bottom<=bounds.bottom+1;});})));checks++;
  assert.equal(await panels.locator('li').count(),sceneCount*3);checks++;
  assert.deepEqual(await panels.locator(':scope>strong').allTextContents(),sceneCount===3?['课程与资料','AI 辅助学习','实践与沉淀']:['课程与资料']);checks++;
  if([390,1440].includes(width))await page.locator('.sales-example-grid').screenshot({path:path.join(out,`capability-scenes-${width}.png`)});
  await page.locator('.sales-instructor-bio h3').waitFor();assert.match(await page.locator('.sales-instructor-bio h3').innerText(),/Cody老师/);assert.equal(await page.locator('.sales-tutor-guide ol li').count(),3);assert.equal(await page.locator('.sales-demo-answer').count(),0);checks+=4;
  assert.doesNotMatch(await page.locator('.sales-page').innerText(),/背书|过往任职经历/);checks++;
  assert.equal(await page.locator('.sales-icp-link').getAttribute('href'),'https://beian.miit.gov.cn/');checks++;
  await page.locator('.sales-instructor-photo').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.sales-instructor-photo img').evaluate(async e=>{await e.decode();return e.naturalWidth===1536;}));checks++;
  if([390,1440].includes(width)){
   await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
   await page.locator('.sales-page img').evaluateAll(els=>Promise.all(els.map(e=>e.decode().catch(()=>{}))));
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(out,`homepage-${width}.png`),fullPage:true});
  }
 }
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await page.locator('.sales-audience-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const audience=page.locator('.sales-audience-card'),scenes=audience.locator('.sales-audience-background');for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  const dimensions=await audience.evaluateAll(els=>els.map(e=>({width:e.clientWidth,height:e.clientHeight}))),sceneUrls=new Set(await scenes.evaluateAll(els=>els.map(e=>e.src)));
  const failureRoute=r=>sceneUrls.has(r.request().url())?r.abort():r.fallback();await page.route('**/*',failureRoute);
  try{
   await page.reload();await page.locator('.sales-audience-grid').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.sales-audience-background').length===0);await page.evaluate(()=>document.fonts.ready);
   assert.deepEqual(await audience.evaluateAll(els=>els.map(e=>({width:e.clientWidth,height:e.clientHeight}))),dimensions);checks++;
   assert.deepEqual(await audience.locator('.sales-audience-label').allTextContents(),audienceLabels);assert.deepEqual(await audience.locator('h3').allTextContents(),audienceTitles);assert.deepEqual(await audience.locator('li').allTextContents(),audiencePoints);checks+=3;
   assert.ok(await audience.evaluateAll(els=>els.every(e=>[...e.querySelectorAll('header,h3,p,ul,li')].every(n=>{const s=getComputedStyle(n);return s.filter==='none'&&s.visibility==='visible'&&s.opacity==='1'&&n.getClientRects().length;}))));checks++;
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
   await page.locator('.sales-audience-grid').screenshot({path:path.join(out,`audience-fallback-${width}.png`)});
  }finally{await page.unroute('**/*',failureRoute);}
 }
 await page.goto(base+'/');await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节`,{exact:true}).waitFor();await page.locator('.sales-faq summary').first().waitFor();
 await page.setViewportSize({width:1440,height:1000});const summary=page.locator('.sales-faq summary').first();await summary.focus();await page.keyboard.press('Enter');assert.equal(await summary.evaluate(s=>s.parentElement.open),true);checks++;
 const delivery=page.locator('.sales-faq details').filter({hasText:'课程内容和更新如何查看？'});await delivery.locator('summary').click();assert.ok((await delivery.innerText()).includes(homepageDeliveryText(course)));checks++;await delivery.locator('summary').click();
 await page.locator('#homepage-navigation').getByRole('link',{name:'课程体系',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'roadmap');checks++;
 assert.ok((await page.locator('.sales-bottom-preview').innerText()).includes(homepagePreviewText(course)));checks++;await page.locator('.sales-bottom-preview').click();await page.waitForURL(base+course.previewPath);checks++;
 await page.goto(base+'/account?section=orders');await page.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();checks++;
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);checks+=3;
 console.log(`PASS ${checks} ${isProduction?'live':'local read-only'} homepage checks: 320–2560px, actual course/price/preview, decoded decorative audience/capability scenes with sharp foreground and audience failure fallback, FAQ/focus/routes/privacy, zero browser errors/external/write/provider requests.`);
}finally{await browser.close();}
