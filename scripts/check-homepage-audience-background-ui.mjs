// Existing isolated loopback fixture only: public GET/HEAD reads, no production or providers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.HOMEPAGE_AUDIENCE_BACKGROUND_BASE||'http://127.0.0.1:4186';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'audience scene acceptance requires an isolated loopback preview');
const out=path.resolve('artifacts/homepage-commercial/audience-background-ui');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],external=[],writes=[];let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);};
const pause=page=>page.waitForTimeout(240);
const clearPointer=async page=>{await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await pause(page);};
const expected={labels:['从想法开始','边学边做','准备上线'],titles:['有想法，却不知道先验证什么','想用 AI，把开发效率真正提起来','产品已在手上，差上线与商业化'],text:['你想做一个真实产品，但还在需求、用户和方向之间犹豫。','你有一定基础，想把 AI 放进产品开发流程，练习独立做出可运行的 MVP。','你已经有雏形或开发经验，正在补齐部署、收款与增长的方法。'],points:['发现值得做的机会','把想法拆成清晰的产品问题','从架构到 MVP 开发','按步骤留下自己的实践记录','上线与合规的关键环节','定价、支付与运营思路']};
const cardGeometry=page=>page.locator('.sales-audience-card').evaluateAll(els=>els.map(e=>({width:e.offsetWidth,height:e.offsetHeight,left:e.offsetLeft,top:e.offsetTop,children:[...e.children].filter(n=>n.tagName!=='IMG').map(n=>({width:n.offsetWidth,height:n.offsetHeight,left:n.offsetLeft,top:n.offsetTop}))})));
const context=async(options={},overrides={})=>{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference',...options});
  await c.route('**/*',async route=>{
    const request=route.request(),url=request.url();
    if(!url.startsWith(base+'/')){external.push(url);return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){writes.push(url);return route.abort();}
    if(new URL(url).pathname==='/api/site/pages/public'){
      const response=await route.fetch();return route.fulfill({response,json:{...await response.json(),projects:[],...overrides}});
    }
    return route.continue();
  });
  c.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));return c;
};
const home=async(page,decode=true)=>{
  await page.goto(base+'/');await page.locator('.sales-audience-card').nth(2).waitFor();await page.evaluate(()=>document.fonts.ready);
  if(decode)for(const scene of await page.locator('.sales-audience-background').all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  await clearPointer(page);
};
const exactCopy=async(page,suffix='')=>{
  equal(await page.locator('.sales-audience-label').allTextContents(),expected.labels,'existing audience stage badges retained'+suffix);
  equal(await page.locator('.sales-audience-card h3').allTextContents(),expected.titles,'existing audience titles retained'+suffix);
  equal(await page.locator('.sales-audience-card>p').allTextContents(),expected.text,'existing current-need descriptions retained'+suffix);
  equal(await page.locator('.sales-audience-card>ul li').allTextContents(),expected.points,'all six truthful audience outcomes retained'+suffix);
};
try{
  const desktop=await context(),page=await desktop.newPage();await home(page);
  equal(await page.locator('.sales-audience-card').count(),3,'exactly three existing audience stages');
  await exactCopy(page);
  check(await page.locator('.sales-audience-card').evaluateAll(els=>els.every(e=>e.tagName==='ARTICLE'&&!e.hasAttribute('tabindex')&&!e.hasAttribute('role')&&!e.querySelector('button,a'))),'audience cards remain descriptive articles, not new purchase actions');
  equal(await page.locator('.sales-audience-route span').allTextContents(),['想法','开发','上线','增长'],'four-step audience journey remains unchanged');
  check(await page.evaluate(()=>{const audience=document.querySelector('.sales-audience'),hero=document.querySelector('.sales-hero-rail'),capabilities=document.querySelector('#hot-courses'),roadmap=document.querySelector('#roadmap');return hero.compareDocumentPosition(audience)&Node.DOCUMENT_POSITION_FOLLOWING&&audience.compareDocumentPosition(capabilities)&Node.DOCUMENT_POSITION_FOLLOWING&&capabilities.compareDocumentPosition(roadmap)&Node.DOCUMENT_POSITION_FOLLOWING;}),'existing hero, audience, capability and roadmap order retained');
  const scenes=page.locator('.sales-audience-background');
  equal(await scenes.count(),3,'each audience stage has its own actual scene');
  check(await scenes.evaluateAll(els=>els.every(e=>e.alt===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1536'&&e.getAttribute('height')==='1024')),'audience backgrounds stay decorative, lazy, asynchronous and intrinsically sized');
  const sceneUrls=await scenes.evaluateAll(els=>els.map(e=>e.src));
  check(new Set(sceneUrls).size===3&&sceneUrls.every(url=>url.startsWith(base+'/assets/')),'three distinct local bundled audience scenes, no remote assets');
  for(const width of [320,390,600,768,1000,1024,1180,1440,1920,2560]){
    await page.setViewportSize({width,height:1000});await clearPointer(page);
    for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
    check(await scenes.evaluateAll(els=>els.length===3&&els.every(e=>e.complete&&e.naturalWidth===1536&&e.naturalHeight===1024)),'all three audience scenes decode '+width);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'audience backgrounds keep document within viewport '+width);
    check(await scenes.evaluateAll(els=>els.every(e=>{const s=getComputedStyle(e),card=e.parentElement,b=card.getBoundingClientRect(),r=e.getBoundingClientRect();return s.position==='absolute'&&s.pointerEvents==='none'&&getComputedStyle(card).isolation==='isolate'&&r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;})),'scenes stay isolated and clipped inside their cards without intercepting input '+width);
    check(await page.locator('.sales-audience-card').evaluateAll(els=>els.every(e=>{const image=e.querySelector('img'),iz=Number(getComputedStyle(image).zIndex)||0;return [...e.children].filter(n=>n.tagName!=='IMG').every(n=>{const s=getComputedStyle(n);return s.filter==='none'&&s.opacity==='1'&&s.visibility==='visible'&&(Number(s.zIndex)||0)>iz;});})),'sharp foreground stays above decorative artwork '+width);
    check(await page.locator('.sales-audience-card').evaluateAll(els=>els.every(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('header,h3,p,ul,li')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;});})),'all stage text and badges fit without clipping '+width);
    check(await page.locator('.sales-audience-card').evaluateAll(els=>els.every(e=>{const s=getComputedStyle(e,'::after');return s.pointerEvents==='none'&&s.backgroundImage.includes('gradient');})),'white reading-area protection stays non-interactive '+width);
    const before=await cardGeometry(page);await scenes.evaluateAll(els=>els.forEach(e=>e.style.display='none'));equal(await cardGeometry(page),before,'scene visibility never changes card or text layout '+width);await scenes.evaluateAll(els=>els.forEach(e=>e.style.removeProperty('display')));
    if([320,390,1180,1440,2560].includes(width)){await clearPointer(page);await page.locator('.sales-audience').screenshot({path:path.join(out,'audience-'+width+'.png')});}
  }
  await page.setViewportSize({width:1440,height:1000});await clearPointer(page);const withScenes=await cardGeometry(page);
  for(const url of sceneUrls)await desktop.route(url,route=>route.abort());await home(page,false);for(const card of await page.locator('.sales-audience-card').all())await card.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.sales-audience-background').length===0);
  equal(await cardGeometry(page),withScenes,'failed scene removal retains exact card and foreground geometry');
  equal(await page.locator('.sales-audience-background').count(),0,'failed decorative images are removed rather than leaving broken-image indicators');
  check(await page.locator('.sales-audience-card').evaluateAll(els=>els.every(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgb(255, 255, 255)'&&[...e.querySelectorAll('h3,p,li')].every(n=>{const t=getComputedStyle(n);return t.filter==='none'&&t.visibility==='visible'&&t.opacity==='1';});})),'failed scenes retain the original white card and clear foreground');await exactCopy(page,' after failed backgrounds');
  await page.locator('.sales-audience').screenshot({path:path.join(out,'audience-fallback.png')});for(const url of sceneUrls)await desktop.unroute(url);await home(page);
  await page.locator('.sales-hero-buttons button').first().click();await page.waitForURL(base+'/membership');equal(new URL(page.url()).pathname,'/membership','existing server-offer purchase route is unchanged');await home(page);
  await page.locator('.sales-hero-buttons button').last().click();await page.waitForURL(/\/learn\/[^/]+\/lessons\/\d+$/);check(new URL(page.url()).pathname.startsWith('/learn/'),'existing real offered-course preview remains available without creating an order');await desktop.close();

  const reduced=await context({reducedMotion:'reduce'}),still=await reduced.newPage();await home(still);check(await still.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),'reduced-motion preference is actually enabled');
  for(let index=0;index<3;index++){const card=still.locator('.sales-audience-card').nth(index);await card.hover();await pause(still);check(await card.evaluate(e=>{const s=getComputedStyle(e);return s.transform==='none'&&s.transitionDuration==='0s'&&getComputedStyle(e.querySelector('img')).animationName==='none';}),'audience stage has no motion under reduced preference '+index);}
  await reduced.close();
  const authored=await context({}, {title:'作者保留的首页标题',description:'作者保留的介绍',ctaLabel:'作者入口',ctaPath:'/resources',secondaryLabel:'作者次入口',secondaryPath:'/community'}),cms=await authored.newPage();await home(cms);equal(await cms.locator('h1').innerText(),'作者保留的首页标题','authored CMS title remains unchanged');equal(await cms.locator('.sales-lead').innerText(),'作者保留的介绍','authored CMS description remains unchanged');await exactCopy(cms,' with authored CMS');
  await cms.locator('.sales-hero-buttons button').first().click();await cms.waitForURL(base+'/resources');equal(new URL(cms.url()).pathname,'/resources','authored CMS main destination retained');await home(cms);await cms.locator('.sales-hero-buttons button').last().click();await cms.waitForURL(base+'/community');equal(new URL(cms.url()).pathname,'/community','authored CMS secondary destination retained');await authored.close();
  equal(errors,[],'zero browser errors');equal(external,[],'zero external/provider requests');equal(writes,[],'zero write requests');
  console.log('PASS '+checks+' isolated audience-background checks: 320–2560px, decorative decode/layers/failure/layout, reduced motion, purchase/preview and CMS; GET/HEAD only.');
}finally{await browser.close();}
