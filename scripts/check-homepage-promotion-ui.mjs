// Isolated same-origin reads only. Offers and CMS changes exist solely in browser
// response memory; this script does not write configuration or create an order.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {homepageCourse,homepagePreviewText} from '../src/homepage-model.js';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.HOMEPAGE_PROMOTION_BASE||'http://127.0.0.1:4186';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'promotion acceptance must use an isolated loopback preview');
const origin=new URL(base).origin,out=path.resolve('artifacts/homepage-commercial/promotion-ui');
mkdirSync(out,{recursive:true});
const read=async route=>{const response=await fetch(base+route,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return response.json();};
const originalOffer=await read('/api/commerce/offer'),entry=await read('/api/learning/entry');
const course=homepageCourse(entry,originalOffer);assert.ok(course?.previewPath,'fixture must have a real offered-course preview');
const browser=await chromium.launch({headless:true}),errors=[],external=[],writes=[],reads=[];
let checks=0,offer={...originalOffer,priceCents:49900,originalPriceCents:499900},cms=null,failOffer=false;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);};
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(request.url());return route.abort();}
  if(!['GET','HEAD'].includes(request.method())){writes.push(request.url());return route.abort();}
  reads.push(url.pathname);
  if(url.pathname==='/api/commerce/offer')return route.fulfill(failOffer?{status:503,json:{error:'isolated offer read failure'}}:{json:offer});
  if(cms&&url.pathname==='/api/site/pages/public'){
    const response=await route.fetch();return route.fulfill({response,json:{...await response.json(),...cms}});
  }
  return route.continue();
});
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
const page=await context.newPage();
const home=async expected=>{
  await page.goto(base+'/');await page.locator('.sales-price-card').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(failOffer)await page.getByText('课程或价格信息暂未完整读取。',{exact:false}).waitFor();
  else await page.waitForFunction(value=>document.querySelector('.sales-price-slot strong')?.textContent===value,expected);
};
const assertOffer=async({price,saving=null,original=null,label})=>{
  equal(await page.locator('.sales-price-slot strong').innerText(),price,'authoritative sale price '+label);
  equal(await page.locator('.sales-saving').count(),saving===null?0:1,'truthful saving visibility '+label);
  equal(await page.locator('.sales-price-slot del').count(),original===null?0:1,'truthful original visibility '+label);
  if(saving!==null)equal(await page.locator('.sales-saving').innerText(),'立省 '+saving,'integer-cents saving '+label);
  if(original!==null)equal(await page.locator('.sales-price-slot del').innerText(),'原价 '+original,'explicit original-price label '+label);
  equal(await page.locator('.sales-faq summary').filter({hasText:'课程包含哪些内容？'}).count(),1,'price-independent inclusion question '+label);
  check(!/¥|￥|499|299|1999|4999/.test((await page.locator('.sales-faq summary').allTextContents()).join(' ')),'FAQ headings never freeze the offer price '+label);
};
try{
  await home('¥499');await assertOffer({price:'¥499',saving:'¥4,500',original:'¥4,999',label:'499 / 4999'});
  equal(await page.locator('.sales-hero-buttons button').count(),1,'default hero exposes only one primary action');
  check((await page.locator('.sales-hero-buttons').innerText()).includes('立即开始学习'),'default primary label remains 立即开始学习');
  check(!(await page.locator('.sales-hero-buttons').innerText()).includes('试看'),'hero no longer competes with a secondary preview CTA');
  check((await page.locator('.sales-bottom-preview').innerText()).includes(homepagePreviewText(course)),'footer preserves real preview scope');
  check((await page.locator('.sales-instructor-preview').innerText()).includes(homepagePreviewText(course)),'instructor preserves real preview scope');
  equal(await page.locator('.sales-bottom-note').count(),0,'promotion area removes competing handwritten decoration');
  check(!/限时|倒计时|仅剩|已有\s*\d+\s*人/.test(await page.locator('.sales-bottom').innerText()),'no invented urgency, scarcity or sales totals');
  const inclusion=page.locator('.sales-faq details').filter({hasText:'课程包含哪些内容？'});
  await inclusion.locator('summary').focus();await page.keyboard.press('Enter');
  check(await inclusion.evaluate(e=>e.open),'price-independent FAQ remains keyboard operable');
  check((await inclusion.innerText()).includes('具体内容、访问范围与服务规则'),'inclusion answer preserves actual entitlement scope');await page.keyboard.press('Enter');
  for(const width of [320,390,600,768,1000,1024,1180,1440,1920,2560]){
    await page.setViewportSize({width,height:1000});await page.locator('.sales-bottom').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page remains within viewport '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.sales-offer-heading,.sales-price-slot,strong,del,p,button')].every(n=>{const r=n.getBoundingClientRect();return n.scrollWidth<=n.clientWidth+1&&r.left>=b.left-1&&r.right<=b.right+1;});}),'price, original, saving and controls do not clip '+width);
    check(await page.locator('.sales-price-slot strong').evaluate(e=>{const s=getComputedStyle(e);return parseFloat(s.fontSize)>=36&&s.visibility==='visible'&&s.opacity==='1'&&s.filter==='none';}),'sale price has clear large sharp hierarchy '+width);
    check(await page.locator('.sales-price-slot del').evaluate(e=>{const s=getComputedStyle(e);return parseFloat(s.fontSize)>=13&&s.visibility==='visible'&&s.opacity==='1'&&s.textDecorationLine.includes('line-through');}),'original price remains readable and struck through '+width);
    check(await page.locator('.sales-saving').evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility==='visible'&&s.opacity==='1'&&parseFloat(s.fontSize)>=12&&r.width>60&&r.height>=14;}),'saving text remains visible and readable '+width);
    check(await page.locator('.sales-price-slot strong').evaluate(e=>{const c=getComputedStyle(e).color.match(/[\d.]+/g).map(Number);return c[0]>c[1]+40&&c[0]>c[2]+25;}),'sale price uses a red promotional accent '+width);
    check(await page.locator('.sales-saving').evaluate(e=>{const s=getComputedStyle(e),c=s.color.match(/[\d.]+/g).map(Number),b=s.backgroundColor.match(/[\d.]+/g).map(Number);return c[0]>c[1]+40&&c[0]>c[2]+25&&b[3]===0&&s.backgroundImage==='none';}),'saving uses only red text without a filled label '+width);
    check(await page.locator('.sales-price-card .sales-button').evaluate(e=>{const s=getComputedStyle(e),bg=s.backgroundColor.match(/[\d.]+/g).map(Number),fg=s.color.match(/[\d.]+/g).map(Number);return bg.slice(0,3).every(n=>n===255)&&s.backgroundImage==='none'&&fg[2]>fg[0]+30&&fg[2]>fg[1]+50;}),'purchase retains a white button with purple text, never a red button '+width);
    check(await page.locator('.sales-bottom').evaluate(e=>{const s=getComputedStyle(e),bg=s.backgroundColor.match(/[\d.]+/g).map(Number),colors=[...s.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].match(/[\d.]+/g).map(Number));return bg[2]>bg[0]+10&&bg.slice(0,3).every(n=>n<90)&&colors.length>0&&colors.filter(c=>c.length<4||c[3]>0).every(c=>c[2]>=c[0]+10);}),'banner retains its deep purple background without warm-red decoration '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{const transparent=n=>{const s=getComputedStyle(n),c=s.backgroundColor.match(/[\d.]+/g).map(Number);return c[3]===0&&s.backgroundImage==='none';},neutral=n=>{const c=getComputedStyle(n).color.match(/[\d.]+/g).map(Number);return c[2]>=c[0]&&c[2]>=c[1];};const preview=e.querySelector('.sales-bottom-preview');return transparent(e)&&transparent(e.querySelector('.sales-offer-heading'))&&transparent(preview)&&[preview,e.querySelector('.sales-offer-heading>span:not(.sales-saving)'),e.querySelector(':scope>p'),e.querySelector('del')].every(neutral);}),'price container, heading and preview stay transparent with purple-neutral labels '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{
      const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      // A transparent price panel inherits the purple banner. Treat every visible
      // gradient stop as a candidate at full opacity and use the worst contrast;
      // this is conservative for its composited radial gradients, not a white-card
      // assumption or a single convenient dark background sample.
      const backgrounds=node=>{const candidates=[];for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n),color=s.backgroundColor.match(/[\d.]+/g).map(Number);for(const stop of s.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)){const c=stop[1].match(/[\d.]+/g).map(Number);if(c.length<4||c[3]>0)candidates.push(c.slice(0,3));}if(color.length<4||color[3]>0)candidates.push(color.slice(0,3));if(color.length<4||color[3]===1)break;}return candidates.length?candidates:[[255,255,255]];};
      const worstContrast=node=>Math.min(...backgrounds(node).map(bg=>contrast(rgb(getComputedStyle(node).color),bg)));
      const price=e.querySelector('.sales-price-slot strong'),original=e.querySelector('del'),saving=e.querySelector('.sales-saving');
      return worstContrast(price)>=3&&worstContrast(original)>=4.5&&worstContrast(saving)>=4.5;
    }),'sale, original and saving meet conservative purple-gradient text contrast '+width);
    check(await page.locator('.sales-price-card button').evaluateAll(els=>els.length===2&&els.every(e=>e.getBoundingClientRect().height>=44)),'purchase and preview maintain usable targets '+width);
    const purchase=page.locator('.sales-price-card .sales-button');await purchase.focus();
    check(await purchase.evaluate(e=>document.activeElement===e&&getComputedStyle(e).outlineStyle!=='none'&&parseFloat(getComputedStyle(e).outlineWidth)>=2),'purchase keeps visible keyboard focus '+width);
    if([320,390,1180,1440,2560].includes(width))await page.locator('.sales-bottom').screenshot({path:path.join(out,'promotion-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.sales-hero-buttons button').click();await page.waitForURL(base+'/membership');check(true,'single hero action uses existing purchase route');
  await home('¥499');await page.locator('.sales-price-card .sales-button').click();await page.waitForURL(base+'/membership');check(true,'promotion uses existing purchase route without creating an order');
  await home('¥499');await page.locator('.sales-bottom-preview').click();await page.waitForURL(base+course.previewPath);check(true,'footer preview reaches the exact offered lesson');
  await home('¥499');await page.locator('.sales-instructor-preview').click();await page.waitForURL(base+course.previewPath);check(true,'instructor preview reaches the exact offered lesson');
  offer={...originalOffer,priceCents:29900,originalPriceCents:199900};await home('¥299');await assertOffer({price:'¥299',saving:'¥1,700',original:'¥1,999',label:'changed 299 / 1999'});
  offer={...originalOffer,priceCents:12999,originalPriceCents:34995};await home('¥129.99');await assertOffer({price:'¥129.99',saving:'¥219.96',original:'¥349.95',label:'fractional currency with integer cents'});
  for(const [label,patch,price] of [
    ['equal original',{priceCents:49900,originalPriceCents:49900},'¥499'],
    ['lower original',{priceCents:49900,originalPriceCents:29900},'¥499'],
    ['absent original',{priceCents:49900,originalPriceCents:undefined},'¥499'],
    ['free',{priceCents:0,originalPriceCents:499900},'¥0'],
    ['invalid original',{priceCents:49900,originalPriceCents:'499900'},'¥499'],
    ['negative original',{priceCents:49900,originalPriceCents:-1},'¥499'],
    ['fractional original cents',{priceCents:49900,originalPriceCents:499900.5},'¥499'],
    ['unsafe original',{priceCents:49900,originalPriceCents:Number.MAX_SAFE_INTEGER+1},'¥499'],
    ['negative sale',{priceCents:-1,originalPriceCents:499900},'查看课程与价格'],
    ['string sale',{priceCents:'49900',originalPriceCents:499900},'查看课程与价格'],
    ['fractional sale cents',{priceCents:49900.5,originalPriceCents:499900},'查看课程与价格'],
    ['unsafe sale',{priceCents:Number.MAX_SAFE_INTEGER+1,originalPriceCents:Number.MAX_SAFE_INTEGER+4},'查看课程与价格'],
    ['missing sale',{priceCents:undefined,originalPriceCents:499900},'查看课程与价格'],
  ]){
    offer={...originalOffer,...patch};await home(price);await assertOffer({price,label});
    equal(await page.locator('.sales-price-card>p').innerText(),'一次购买','no misleading offer caption '+label);
  }
  for(const [label,identity] of [['absent product',{productId:undefined}],['absent course',{slug:undefined}],['empty course',{slug:''}],['invalid product',{productId:0}]]){
    offer={...originalOffer,...identity,priceCents:49900,originalPriceCents:499900};await home('¥499');await assertOffer({price:'¥499',label});
  }
  offer={};await home('查看课程与价格');await assertOffer({price:'查看课程与价格',label:'missing offer'});
  failOffer=true;await home();await assertOffer({price:'查看课程与价格',label:'offer read failure'});
  offer={...originalOffer,priceCents:29900,originalPriceCents:199900};failOffer=false;
  await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sales-price-slot strong')?.textContent==='¥299');
  await assertOffer({price:'¥299',saving:'¥1,700',original:'¥1,999',label:'explicit retry restores current offer'});
  cms={title:'作者保留的首页标题',description:'作者保留的介绍',ctaLabel:'作者入口',ctaPath:'/resources',secondaryLabel:'作者次入口',secondaryPath:'/community',footerTitle:'作者结尾标题',footerDescription:'作者结尾介绍'};
  await home('¥299');equal(await page.locator('h1').innerText(),cms.title,'authored CMS heading retained');
  equal(await page.locator('.sales-hero-buttons button').count(),2,'authored CMS secondary CTA is not erased');
  check((await page.locator('.sales-hero-buttons button').last().innerText()).includes(cms.secondaryLabel),'authored secondary label retained');
  await page.locator('.sales-hero-buttons button').last().click();await page.waitForURL(base+'/community');check(true,'authored CMS secondary destination retained');
  await home('¥299');await page.locator('.sales-hero-buttons button').first().click();await page.waitForURL(base+'/resources');check(true,'authored CMS primary destination retained');
  await home('¥299');await page.locator('.sales-price-card .sales-button').click();await page.waitForURL(base+'/resources');check(true,'authored CMS footer purchase destination retained');
  await home('¥299');await page.locator('.sales-bottom-preview').click();await page.waitForURL(base+'/community');check(true,'authored CMS footer secondary destination retained');
  check(reads.includes('/api/commerce/offer')&&reads.includes('/api/learning/entry'),'offer and preview information are genuine API reads');
  equal(errors,[],'zero browser errors');equal(external,[],'zero external/provider requests');equal(writes,[],'zero writes or payment/model requests');
  console.log('PASS '+checks+' isolated homepage promotion checks: single default CTA, retained actual previews/CMS, dynamic cents-only promotion, no fake discounts, neutral FAQ, offer retry, red contrast and 320–2560px layout.');
}finally{await browser.close();}
