// Production browser acceptance: anonymous, same-origin GET/HEAD only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const base='https://oneshowlearn.com',offer=await(await fetch(base+'/api/commerce/offer')).json();
assert.equal(offer.priceCents,49900);assert.ok(offer.slug);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[],writes=[],out=path.resolve('artifacts/functional-hardening/live');mkdirSync(out,{recursive:true});
await context.route('**/*',r=>{const q=r.request();if(!q.url().startsWith(base+'/')){external.push(q.url());return r.abort();}if(!['GET','HEAD'].includes(q.method())){writes.push(q.url());return r.abort();}return r.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let checks=0;
try{
 for(const width of [320,768,1440])for(const route of ['/','/app','/notes','/account?section=orders','/course-offer?course='+encodeURIComponent(offer.slug),'/not-a-real-hardening-page']){
  await page.setViewportSize({width,height:1000});await page.goto(base+route);await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' at '+width);checks++;
  if(route.includes('not-a-real')){await page.getByRole('heading',{name:'这个页面不存在',exact:true}).waitFor();checks++;}
  if(route.startsWith('/account')||route==='/notes'){await page.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();checks++;}
 }
 await page.goto(base+'/packs/'+encodeURIComponent(offer.slug));await page.waitForURL(base+'/course-offer?course='+encodeURIComponent(offer.slug));checks++;
 await page.locator('.co-price').waitFor();assert.match(await page.locator('.co-price').innerText(),/499/);checks++;
 await page.screenshot({path:path.join(out,'offer-1440.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);checks+=3;
 console.log(`PASS ${checks} live anonymous browser checks: known/unknown/legacy routes, private guest gates, unchanged 499 price, 320–1440px, zero script errors/external/write/provider requests.`);
}finally{await browser.close();}
