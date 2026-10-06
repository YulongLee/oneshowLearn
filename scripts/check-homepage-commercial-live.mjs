// Anonymous production review: same-origin GET/HEAD only, no provider operations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {homepageCourse,homepagePreviewText} from '../src/homepage-model.js';
const {chromium}=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_live.cjs')('playwright');
const base='https://oneshowlearn.com',get=async p=>{const r=await fetch(base+p,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
const offer=await get('/api/commerce/offer'),entry=await get('/api/learning/entry'),course=homepageCourse(entry,offer);assert.ok(course?.previewPath);assert.equal(offer.priceCents,49900);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[],writes=[];
const out=path.resolve('artifacts/homepage-commercial/live');mkdirSync(out,{recursive:true});
await context.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base+'/')){external.push(q.url());return r.abort();}if(!['GET','HEAD'].includes(q.method())){writes.push(q.url());return r.abort();}return r.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let checks=0;
try {
 for(const width of [320,390,768,1024,1440,1920,2560]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节课程`,{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
  assert.match(await page.locator('.sales-price-slot').innerText(),/499/);checks++;
  assert.equal(await page.locator('.sales-audience article').count(),3);assert.equal(await page.locator('.sales-phase-grid>li').count(),5);assert.equal(await page.locator('.sales-case-card').count(),3);checks+=3;
  await page.getByRole('heading',{name:'讲师介绍待补充',exact:true}).waitFor();assert.match(await page.locator('.sales-demo-disclaimer').innerText(),/不调用 AI/);checks+=2;
  assert.equal(await page.locator('.sales-icp-link').getAttribute('href'),'https://beian.miit.gov.cn/');checks++;
  if([390,1440].includes(width))await page.screenshot({path:path.join(out,`homepage-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});const summary=page.locator('.sales-faq summary').first();await summary.focus();await page.keyboard.press('Enter');assert.equal(await summary.evaluate(s=>s.parentElement.open),true);checks++;
 await page.locator('#homepage-navigation').getByRole('button',{name:'课程体系',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'roadmap');checks++;
 await page.locator('.sales-hero-buttons').getByRole('button',{name:homepagePreviewText(course)}).click();await page.waitForURL(base+course.previewPath);checks++;
 await page.goto(base+'/account?section=orders');await page.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();checks++;
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);checks+=3;
 console.log(`PASS ${checks} live homepage checks: 320–2560px, actual course/price/preview, FAQ/focus/routes/privacy, zero browser errors/external/write/provider requests.`);
}finally{await browser.close();}
