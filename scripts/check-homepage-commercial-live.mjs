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
const out=path.resolve('artifacts/homepage-commercial/'+(isProduction?'live':'local-formal'));mkdirSync(out,{recursive:true});
await context.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base+'/')){external.push(q.url());return r.abort();}if(!['GET','HEAD'].includes(q.method())){writes.push(q.url());return r.abort();}return r.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let checks=0;
try {
 for(const width of [320,390,768,1024,1440,1920,2560]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节`,{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
  assert.ok((await page.locator('.sales-price-slot').innerText()).includes(String(offer.priceCents/100)));checks++;
  assert.equal(await page.locator('.sales-audience article').count(),3);assert.equal(await page.locator('.sales-phase-grid>li').count(),5);assert.equal(await page.locator('.sales-case-card').count(),homepageCommercialProjects(site).length?homepageCommercialProjects(site).length+1:3);checks+=3;
  await page.locator('.sales-instructor-bio h3').waitFor();assert.match(await page.locator('.sales-instructor-bio h3').innerText(),/Yulong Lee/);assert.equal(await page.locator('.sales-tutor-guide ol li').count(),3);assert.equal(await page.locator('.sales-demo-answer').count(),0);checks+=4;
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
 await page.setViewportSize({width:1440,height:1000});const summary=page.locator('.sales-faq summary').first();await summary.focus();await page.keyboard.press('Enter');assert.equal(await summary.evaluate(s=>s.parentElement.open),true);checks++;
 const delivery=page.locator('.sales-faq details').filter({hasText:'课程内容和更新如何查看？'});await delivery.locator('summary').click();assert.ok((await delivery.innerText()).includes(homepageDeliveryText(course)));checks++;await delivery.locator('summary').click();
 await page.locator('#homepage-navigation').getByRole('button',{name:'课程体系',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'roadmap');checks++;
 await page.locator('.sales-hero-buttons').getByRole('button',{name:homepagePreviewText(course)}).click();await page.waitForURL(base+course.previewPath);checks++;
 await page.goto(base+'/account?section=orders');await page.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();checks++;
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);checks+=3;
 console.log(`PASS ${checks} ${isProduction?'live':'local read-only'} homepage checks: 320–2560px, actual course/price/preview, FAQ/focus/routes/privacy, zero browser errors/external/write/provider requests.`);
}finally{await browser.close();}
