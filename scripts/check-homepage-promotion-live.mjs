// Anonymous read-only acceptance for a production copy or the published frontend.
// Never replace public offers, create fixtures, authenticate or invoke providers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {homepageCourse,homepageDiscount,homepageOffer,homepagePreviewText} from '../src/homepage-model.js';
import {offerMoney} from '../src/course-offer-model.js';
import {currentPublicCopy} from '../server/site-defaults.mjs';
import {createPublicOfferReadiness} from './check-public-seo-ui.mjs';

const base=process.env.HOMEPAGE_PROMOTION_REVIEW_BASE||'http://127.0.0.1:4186';
assert.ok(base==='https://oneshowlearn.com'||/^http:\/\/127\.0\.0\.1:\d+$/.test(base),'acceptance is limited to the own public origin or an isolated loopback copy');
const origin=new URL(base).origin,isProduction=base==='https://oneshowlearn.com';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pace=()=>isProduction?pause(1800):Promise.resolve();
const get=async route=>{await pace();const response=await fetch(base+route,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.notEqual(response.status,429,'rate guard hit: stop and retry after its normal window, never bypass it');assert.equal(response.status,200,route);return response.json();};
const offer=await get('/api/commerce/offer'),entry=await get('/api/learning/entry'),site=currentPublicCopy(await get('/api/site/pages/public'));
const price=homepageOffer(offer),discount=homepageDiscount(offer),course=homepageCourse(entry,offer);
assert.ok(price.priced&&course?.previewPath,'published offer and actual preview metadata must be readable');
const bundledPreview=site.secondaryPath==='/opc'&&['查看课程与试听','查看课程介绍'].includes(site.secondaryLabel);
const purchaseLabel=site.ctaPath==='/membership'&&site.ctaLabel==='解锁完整课程'?'立即开始学习':site.ctaLabel;
const previewLabel=bundledPreview?homepagePreviewText(course):site.secondaryLabel;
const titles=['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'];
const bullets=['发现市场机会','用户需求分析','产品定位与规划','用 Codex 高效开发','产品架构设计','快速构建 MVP','域名与服务器','备案与数据合规','发布上线流程','微信 / 支付宝接入','海外支付方案','定价策略与商业模式','SEO / GEO 优化','内容与社群推广','数据分析与迭代'];
const out=path.resolve('artifacts/homepage-commercial/promotion-'+(isProduction?'live':'copy'));mkdirSync(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
const errors=[],external=[],writes=[],authenticated=[],limited=[],offerResponses=[];let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);};
await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(request.url());return route.abort();}
  if(!['GET','HEAD'].includes(request.method())){writes.push(request.url());return route.abort();}
  if(request.headers().authorization){authenticated.push(url.pathname);return route.abort();}
  // No fulfill/fetch response override: real public response bodies reach the UI.
  return route.continue();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const offerReadiness=createPublicOfferReadiness(page,base,offerResponses);
page.on('response',response=>{if(response.status()===429)limited.push(new URL(response.url()).pathname);});
const financialIdentity=value=>({productId:value.productId,slug:value.slug,priceCents:value.priceCents,originalPriceCents:value.originalPriceCents});
const clearFocus=async()=>{await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(220);};
const arrowGeometry=()=>page.locator('.sales-phase').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect(),a=e.querySelector(':scope>.sales-phase-arrow'),b=a?.getBoundingClientRect();return {left:r.left,right:r.right,centerY:r.y+r.height/2,arrow:b?{left:b.left,right:b.right,x:b.x+b.width/2,y:b.y+b.height/2}:null};}));
const openHome=async()=>{await pace();await offerReadiness.homeNavigation(()=>page.goto(base+'/'));await page.waitForFunction(expected=>document.querySelector('.sales-price-slot strong')?.textContent===expected,offerMoney(offer.priceCents));await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节`,{exact:true}).waitFor();};
const follow=async(selector,destination)=>{assert.ok(destination.startsWith('/')&&!destination.startsWith('//')&&new URL(destination,base).origin===origin,'actual destination must remain on the own origin');await pace();await offerReadiness.beforeNavigation();await page.locator(selector).click();await page.waitForURL(base+destination);};
try{
  equal(await context.cookies(),[],'anonymous context has no imported account cookies');
  await pace();await offerReadiness.homeNavigation(()=>page.goto(base+'/'));await page.waitForFunction(expected=>document.querySelector('.sales-price-slot strong')?.textContent===expected,offerMoney(offer.priceCents));
  await page.locator('.sales-hero-promises').getByText(`${course.lessonCount} 节`,{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  check(await page.evaluate(()=>!localStorage.getItem('oneshowlearn_token')),'no account token is installed');
  equal(await page.locator('.sales-hero-buttons a').count(),bundledPreview?1:2,'default hero has one action while authored secondary actions survive');
  check((await page.locator('.sales-hero-buttons a').first().innerText()).includes(purchaseLabel),'primary label follows the actual CMS scope');
  equal(await page.locator('.sales-bottom-preview').innerText(),previewLabel,'footer preview label follows actual course metadata or authored CMS');
  equal(await page.locator('.sales-instructor-preview').innerText(),previewLabel,'instructor preview remains genuinely available');
  equal(await page.locator('.sales-faq summary').filter({hasText:'课程包含哪些内容？'}).count(),1,'inclusion FAQ has a stable price-independent question');
  check(!/¥|￥|\d+\s*元/.test((await page.locator('.sales-faq summary').allTextContents()).join(' ')),'FAQ headings do not freeze a configured price');
  equal(await page.locator('.sales-price-slot strong').innerText(),offerMoney(offer.priceCents),'displayed current price equals the real public offer');
  equal(await page.locator('.sales-saving').count(),discount?1:0,'saving visibility is derived from the actual valid offer');
  equal(await page.locator('.sales-price-slot del').count(),discount?1:0,'original-price visibility is derived from the actual valid offer');
  if(discount){equal(await page.locator('.sales-saving').innerText(),'立省 '+offerMoney(discount.savingCents),'displayed saving is the actual integer-cents difference');equal(await page.locator('.sales-price-slot del').innerText(),'原价 '+offerMoney(offer.originalPriceCents),'displayed original price equals the real public offer');equal(await page.locator('.sales-price-slot del').getAttribute('aria-label'),'原价 '+offerMoney(offer.originalPriceCents),'accessible original amount is dynamic');}
  equal(await page.locator('.sales-bottom-note').count(),0,'no competing handwritten promotional ornament');
  check(!/限时|倒计时|仅剩|已有\s*\d+\s*人/.test(await page.locator('.sales-bottom').innerText()),'no invented urgency or demand claims');
  equal(await page.locator('.sales-phase-card h3').allTextContents(),titles,'five approved route titles remain exact');
  equal(await page.locator('.sales-phase-card ul>li').allTextContents(),bullets,'fifteen approved learning directions remain exact');
  equal(await page.locator('.sales-phase-number').allTextContents(),['01','02','03','04','05'],'five original ordered phase numbers remain');
  check(await page.locator('.sales-phase-grid').evaluate(e=>e.tagName==='OL'&&e.getAttribute('aria-label')==='五阶段学习路径'&&[...e.children].every(n=>n.tagName==='LI')),'learning route retains real ordered-list semantics');
  check(await page.locator('.sales-phase').evaluateAll(els=>els.length===5&&els.every(e=>!e.hasAttribute('tabindex')&&!e.hasAttribute('role')&&!e.querySelector('button,a,input'))),'phase entries remain descriptive content, not new actions');
  check(await page.locator('.sales-phase-arrow').evaluateAll(els=>els.length===4&&els.every(e=>e.parentElement.matches('li.sales-phase')&&e.getAttribute('aria-hidden')==='true'&&getComputedStyle(e).pointerEvents==='none')),'four decorative connectors remain outside the moving visual cards');
  const scenes=page.locator('.sales-phase-background');equal(await scenes.count(),5,'five actual roadmap scene elements are present');
  check(await scenes.evaluateAll(els=>els.every(e=>e.alt===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1024'&&e.getAttribute('height')==='1536'&&new URL(e.src).origin===location.origin)),'scenes remain local decorative lazy/async assets with portrait sizing');
  for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  check(await scenes.evaluateAll(els=>els.every(e=>e.complete&&e.naturalWidth===1024&&e.naturalHeight===1536)),'all five real roadmap scenes decode at 1024×1536');
  for(const width of [320,390,600,768,1000,1024,1180,1440,1920,2560]){
    await page.setViewportSize({width,height:1000});await page.locator('.sales-bottom').scrollIntoViewIfNeeded();await clearFocus();
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page has no horizontal overflow '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.sales-offer-heading,.sales-price-slot,strong,del,p,a')].every(n=>{const r=n.getBoundingClientRect();return n.scrollWidth<=n.clientWidth+1&&r.left>=b.left-1&&r.right<=b.right+1;});}),'actual current/original/saving text and controls fit '+width);
    check(await page.locator('.sales-price-slot strong').evaluate(e=>{const s=getComputedStyle(e),c=s.color.match(/[\d.]+/g).map(Number);return parseFloat(s.fontSize)>=36&&s.filter==='none'&&c[0]>c[1]+40&&c[0]>c[2]+25;}),'only current amount uses a sharp large red text accent '+width);
    if(discount){check(await page.locator('.sales-saving').evaluate(e=>{const s=getComputedStyle(e),c=s.color.match(/[\d.]+/g).map(Number),b=s.backgroundColor.match(/[\d.]+/g).map(Number);return c[0]>c[1]+40&&c[0]>c[2]+25&&b[3]===0&&s.backgroundImage==='none';}),'saving is red text on a transparent label '+width);check(await page.locator('.sales-price-slot del').evaluate(e=>{const s=getComputedStyle(e);return parseFloat(s.fontSize)>=13&&s.textDecorationLine.includes('line-through');}),'actual original remains readable and struck through '+width);}
    check(await page.locator('.sales-price-card .sales-button').evaluate(e=>{const s=getComputedStyle(e),bg=s.backgroundColor.match(/[\d.]+/g).map(Number),fg=s.color.match(/[\d.]+/g).map(Number);return bg.slice(0,3).every(n=>n===255)&&s.backgroundImage==='none'&&fg[2]>fg[0]+30&&fg[2]>fg[1]+50;}),'purchase retains white background and purple text '+width);
    check(await page.locator('.sales-bottom').evaluate(e=>{const s=getComputedStyle(e),bg=s.backgroundColor.match(/[\d.]+/g).map(Number),colors=[...s.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].match(/[\d.]+/g).map(Number));return bg[2]>bg[0]+10&&bg.slice(0,3).every(n=>n<90)&&colors.length>0&&colors.filter(c=>c.length<4||c[3]>0).every(c=>c[2]>=c[0]+10);}),'banner keeps its original deep-purple gradients '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{const transparent=n=>{const s=getComputedStyle(n),c=s.backgroundColor.match(/[\d.]+/g).map(Number);return c[3]===0&&s.backgroundImage==='none';},neutral=n=>{const c=getComputedStyle(n).color.match(/[\d.]+/g).map(Number);return c[2]>=c[0]&&c[2]>=c[1];};const preview=e.querySelector('.sales-bottom-preview');return transparent(e)&&transparent(e.querySelector('.sales-offer-heading'))&&transparent(preview)&&[preview,e.querySelector('.sales-offer-heading>span:not(.sales-saving)'),e.querySelector(':scope>p'),e.querySelector('del')].filter(Boolean).every(neutral);}),'panel, labels and preview retain transparent purple-neutral styling '+width);
    check(await page.locator('.sales-price-card').evaluate(e=>{const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0),contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};const backgrounds=node=>{const candidates=[];for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n),color=s.backgroundColor.match(/[\d.]+/g).map(Number);for(const stop of s.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)){const c=stop[1].match(/[\d.]+/g).map(Number);if(c.length<4||c[3]>0)candidates.push(c.slice(0,3));}if(color.length<4||color[3]>0)candidates.push(color.slice(0,3));if(color.length<4||color[3]===1)break;}return candidates.length?candidates:[[255,255,255]];};const ratio=node=>Math.min(...backgrounds(node).map(bg=>contrast(rgb(getComputedStyle(node).color),bg)));return ratio(e.querySelector('.sales-price-slot strong'))>=3&&[e.querySelector('del'),e.querySelector('.sales-saving')].filter(Boolean).every(n=>ratio(n)>=4.5);}),'amounts meet worst visible purple-gradient text contrast '+width);
    check(await page.locator('.sales-price-card a').evaluateAll(els=>els.length===2&&els.every(e=>e.getBoundingClientRect().height>=44)),'purchase and real preview retain usable targets '+width);
    const purchase=page.locator('.sales-price-card .sales-button');await purchase.focus();check(await purchase.evaluate(e=>document.activeElement===e&&getComputedStyle(e).outlineStyle!=='none'&&parseFloat(getComputedStyle(e).outlineWidth)>=2),'purchase keeps a visible keyboard focus ring '+width);await clearFocus();
    if([320,390,1180,1440,2560].includes(width))await page.locator('.sales-bottom').screenshot({path:path.join(out,'promotion-'+width+'.png')});
    await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearFocus();
    check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('h3,ul,ul>li')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;});})),'five actual roadmap titles and fifteen facts fit '+width);
    check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>{const image=e.querySelector('img'),iz=Number(getComputedStyle(image).zIndex)||0;return getComputedStyle(e).filter==='none'&&[...e.children].filter(n=>n.tagName!=='IMG').every(n=>{const s=getComputedStyle(n);return s.filter==='none'&&s.opacity==='1'&&s.visibility==='visible'&&(Number(s.zIndex)||0)>iz;});})),'sharp roadmap foreground stays above its five backgrounds '+width);
    if(width<=1000)check(await page.locator('.sales-phase-arrow').evaluateAll(els=>els.length===4&&els.every(e=>getComputedStyle(e).display==='none')),'desktop arrows hide before the route wraps '+width);
    else{const positions=await arrowGeometry();check(positions.slice(0,4).every((p,i)=>p.arrow&&Math.abs(p.arrow.x-(p.right+positions[i+1].left)/2)<=1&&Math.abs(p.arrow.y-p.centerY)<=1&&p.arrow.left>=p.right&&p.arrow.right<=positions[i+1].left&&positions[i+1].left-p.right>=30&&positions[i+1].left-p.right<=32.5),'four arrows stay centered inside stable 32px desktop gaps '+width);}
    if(width<=600){check(await page.locator('.sales-phase-grid').evaluate(e=>{const s=getComputedStyle(e,'::before');return s.display!=='none'&&parseFloat(s.width)===2&&parseFloat(s.height)>200&&s.top==='20px'&&s.bottom==='20px'&&s.backgroundImage.includes('gradient');}),'narrow screens retain the visible vertical learning timeline '+width);check(await page.locator('.sales-phase-grid').evaluate(e=>{const s=getComputedStyle(e,'::before'),b=e.getBoundingClientRect(),x=b.left+parseFloat(s.left)+parseFloat(s.width)/2;return [...e.querySelectorAll('.sales-phase-number')].every(n=>{const r=n.getBoundingClientRect();return Math.abs(r.left+r.width/2-x)<=3;});}),'five mobile phase numbers align with the timeline '+width);}
    if([320,390,1180,1440,2560].includes(width))await page.locator('#roadmap').screenshot({path:path.join(out,'roadmap-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearFocus();const fixed=await arrowGeometry();await page.locator('.sales-phase-card').nth(2).hover();await page.waitForTimeout(240);equal(await arrowGeometry(),fixed,'inner-card hover does not move any outer desktop arrow');
  await page.emulateMedia({reducedMotion:'reduce'});check(await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),'reduced-motion preference is actually active');await page.locator('.sales-phase-card').nth(2).hover();await page.waitForTimeout(220);check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>getComputedStyle(e).transform==='none'&&getComputedStyle(e).transitionDuration==='0s')),'reduced-motion preference keeps all five inner cards still');await page.emulateMedia({reducedMotion:'no-preference'});
  await clearFocus();const faq=page.locator('.sales-faq details').filter({hasText:'课程包含哪些内容？'});await faq.locator('summary').focus();await page.keyboard.press('Enter');check(await faq.evaluate(e=>e.open),'neutral inclusion FAQ opens with keyboard');await page.keyboard.press('Enter');check(!await faq.evaluate(e=>e.open),'neutral inclusion FAQ closes with keyboard');
  if(!isProduction){const urls=await scenes.evaluateAll(els=>els.map(e=>e.src)),before=await page.locator('.sales-phase').evaluateAll(els=>els.map(e=>({width:e.offsetWidth,height:e.offsetHeight})));for(const url of urls)await context.route(url,route=>route.abort());await offerReadiness.homeNavigation(()=>page.reload());await page.locator('#roadmap').scrollIntoViewIfNeeded();for(const card of await page.locator('.sales-phase-card').all())await card.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.sales-phase-background').length===0);await page.evaluate(()=>document.fonts.ready);equal(await page.locator('.sales-phase').evaluateAll(els=>els.map(e=>({width:e.offsetWidth,height:e.offsetHeight}))),before,'copy-only failed decorative scenes retain exact phase dimensions');equal(await page.locator('.sales-phase-card h3').allTextContents(),titles,'copy-only failed scenes retain all five real titles');check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)')),'copy-only failure returns to original white cards');}
  await openHome();await follow('.sales-price-card .sales-button',site.ctaPath);equal(new URL(page.url()).pathname,new URL(site.ctaPath,base).pathname,'actual purchase callback opens its CMS destination without payment creation');
  await openHome();const previewDestination=bundledPreview?course.previewPath:site.secondaryPath;await follow('.sales-bottom-preview',previewDestination);equal(new URL(page.url()).pathname,new URL(previewDestination,base).pathname,'actual footer preview opens the offered lesson or authored destination without playback');
  await openHome();await follow('.sales-roadmap-actions>a','/paths');equal(new URL(page.url()).pathname,'/paths','actual learning-route action opens the existing path catalogue');
  await offerReadiness.beforeNavigation();
  for(const captured of await Promise.all(offerResponses)){assert.ok(!captured.error,'real public offer response must be captured before navigation');assert.equal(captured.status,200);equal(financialIdentity(captured.value),financialIdentity(offer),'every real browser offer response matches the actual initial offer');}
  equal(financialIdentity(await get('/api/commerce/offer')),financialIdentity(offer),'real public financial offer remained stable throughout review');
  equal(errors,[],'zero browser errors');equal(external,[],'zero external/provider requests');equal(writes,[],'zero writes/payment/model requests');equal(authenticated,[],'zero authenticated requests');equal(limited,[],'no rate-limit guard hit or bypass');
  console.log('PASS '+checks+' '+(isProduction?'live':'production-copy compatible')+' read-only promotion/roadmap checks; actual public offer/course only, no response override, 320–2560px, purple font-only promotion, exact route/scenes/connectors and anonymous GET/HEAD.');
}finally{await browser.close();}
