// Existing isolated loopback preview only. All browser requests are bounded GET/HEAD reads;
// authored-CMS variations exist only in response memory, never in a database or production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.HOMEPAGE_ROADMAP_BASE||'http://127.0.0.1:4186';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'roadmap acceptance uses an existing isolated loopback preview');
const origin=new URL(base).origin,out=path.resolve('artifacts/homepage-commercial/roadmap-background-ui');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],external=[],writes=[];let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);};
const widths=[320,390,600,768,1000,1024,1180,1440,1920,2560];
const titles=['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'];
const items=['发现市场机会','用户需求分析','产品定位与规划','用 Codex 高效开发','产品架构设计','快速构建 MVP','域名与服务器','备案与数据合规','发布上线流程','微信 / 支付宝接入','海外支付方案','定价策略与商业模式','SEO / GEO 优化','内容与社群推广','数据分析与迭代'];
const pause=page=>page.waitForTimeout(240);
const clearPointer=async page=>{await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await pause(page);};
const transform=locator=>locator.evaluate(e=>{const s=getComputedStyle(e),m=s.transform==='none'?null:new DOMMatrixReadOnly(s.transform);return {x:m?.m41||0,y:m?.m42||0,scaleX:m?.m11||1,scaleY:m?.m22||1,raw:s.transform,transition:s.transitionDuration};});
const geometry=page=>page.locator('.sales-phase-grid > .sales-phase').evaluateAll(els=>els.map(e=>({width:e.offsetWidth,height:e.offsetHeight,left:e.offsetLeft,top:e.offsetTop,card:[...e.querySelectorAll('.sales-phase-card,.sales-phase-top,h3,ul,ul>li')].map(n=>({width:n.offsetWidth,height:n.offsetHeight,left:n.offsetLeft,top:n.offsetTop}))})));
const arrows=page=>page.locator('.sales-phase-arrow').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
const context=async(options={},overrides=null)=>{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference',...options});
  await c.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){external.push(request.url());return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){writes.push(request.url());return route.abort();}
    if(overrides&&url.pathname==='/api/site/pages/public'){
      const response=await route.fetch();return route.fulfill({response,json:{...await response.json(),...overrides}});
    }
    return route.continue();
  });
  c.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));return c;
};
const home=async(page,decode=true)=>{
  await page.goto(base+'/');await page.locator('.sales-phase-card').nth(4).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.sales-hero-promises').getByText('40 节',{exact:true}).waitFor();
  await page.locator('.sales-case-card:not(.sales-platform-case)').nth(1).waitFor();
  if(decode)for(const scene of await page.locator('.sales-phase-background').all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
  await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearPointer(page);
};
const copy=async(page,suffix='')=>{
  equal(await page.locator('.sales-phase-card h3').allTextContents(),titles,'five original phase titles retained'+suffix);
  equal(await page.locator('.sales-phase-card ul>li').allTextContents(),items,'all fifteen original learning directions retained'+suffix);
  equal(await page.locator('.sales-phase-number').allTextContents(),['01','02','03','04','05'],'ordered stage markers retained'+suffix);
};
const arrowGeometry=async(page,width)=>{
  if(width<=1000){
    check(await page.locator('.sales-phase-arrow').evaluateAll(els=>els.length===4&&els.every(e=>getComputedStyle(e).display==='none')),'desktop connectors are hidden before the route wraps '+width);
    return;
  }
  const positions=await page.locator('.sales-phase-grid > .sales-phase').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect(),a=e.querySelector(':scope > .sales-phase-arrow'),ar=a?.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,centerY:r.top+r.height/2,arrow:ar?{left:ar.left,right:ar.right,centerX:ar.left+ar.width/2,centerY:ar.top+ar.height/2}:null};}));
  check(positions.length===5&&positions.slice(0,4).every((p,i)=>p.arrow&&Math.abs(p.arrow.centerX-(p.right+positions[i+1].left)/2)<=1),'four connector centers sit precisely between adjacent cards '+width);
  check(positions.slice(0,4).every(p=>Math.abs(p.arrow.centerY-p.centerY)<=1)&&positions.slice(1).every(p=>Math.abs(p.centerY-positions[0].centerY)<=1),'connectors share the stable horizontal card centerline '+width);
  check(positions.slice(0,4).every((p,i)=>p.arrow.left>=p.right&&p.arrow.right<=positions[i+1].left&&positions[i+1].left-p.right>=30&&positions[i+1].left-p.right<=32.5),'connectors never overlap either card inside a 30–32px route gap '+width);
};
try{
  const desktop=await context(),page=await desktop.newPage();await home(page);
  equal(await page.locator('.sales-phase-grid > li.sales-phase').count(),5,'five original top-level ordered phase entries');
  await copy(page);
  check(await page.locator('.sales-phase-grid').evaluate(e=>e.tagName==='OL'&&e.getAttribute('aria-label')==='五阶段学习路径'),'learning route retains ordered-list semantics and accessible name');
  check(await page.locator('.sales-phase-grid > .sales-phase').evaluateAll(els=>els.every(e=>e.tagName==='LI'&&e.querySelector(':scope > .sales-phase-card')&&!e.hasAttribute('tabindex')&&!e.hasAttribute('role')&&!e.querySelector('button,a,input'))),'phase entries remain read-only learning content with no new controls');
  check(await page.locator('.sales-phase-arrow').evaluateAll(els=>els.length===4&&els.every(e=>e.parentElement.matches('li.sales-phase')&&e.getAttribute('aria-hidden')==='true'&&getComputedStyle(e).pointerEvents==='none')),'only four outer decorative arrows connect the five stages');
  check(await page.evaluate(()=>{const capability=document.querySelector('#hot-courses'),roadmap=document.querySelector('#roadmap'),instructor=document.querySelector('#home-instructor');return capability.compareDocumentPosition(roadmap)&Node.DOCUMENT_POSITION_FOLLOWING&&roadmap.compareDocumentPosition(instructor)&Node.DOCUMENT_POSITION_FOLLOWING;}),'approved capability, roadmap and instructor section order is preserved');
  const scenes=page.locator('.sales-phase-background');equal(await scenes.count(),5,'one actual scene per phase');
  check(await scenes.evaluateAll(els=>els.every(e=>e.alt===''&&e.getAttribute('aria-hidden')==='true'&&e.loading==='lazy'&&e.decoding==='async'&&e.getAttribute('width')==='1024'&&e.getAttribute('height')==='1536')),'five backgrounds remain decorative, lazy, async and intrinsically portrait-sized');
  const sceneUrls=await scenes.evaluateAll(els=>els.map(e=>e.src));
  check(new Set(sceneUrls).size===5&&sceneUrls.every(url=>url.startsWith(base+'/assets/')),'five distinct bundled local scenes, never remote provider assets');
  const baseline=new Map();
  for(const width of widths){
    await page.setViewportSize({width,height:1000});await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearPointer(page);
    for(const scene of await scenes.all()){await scene.scrollIntoViewIfNeeded();await scene.evaluate(e=>e.decode());}
    await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearPointer(page);
    check(await scenes.evaluateAll(els=>els.length===5&&els.every(e=>e.complete&&e.naturalWidth===1024&&e.naturalHeight===1536)),'all five real portrait scenes decode '+width);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'route and scenes stay within the viewport '+width);
    check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('h3,ul,ul>li')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;});})),'all five titles and fifteen facts fit without clipping '+width);
    check(await scenes.evaluateAll(els=>els.every(e=>{const s=getComputedStyle(e),card=e.parentElement,b=card.getBoundingClientRect(),r=e.getBoundingClientRect();return card.matches('.sales-phase-card')&&s.position==='absolute'&&s.pointerEvents==='none'&&getComputedStyle(card).isolation==='isolate'&&r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;})),'scene layers are isolated within their inner card and cannot intercept input '+width);
    check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>{const image=e.querySelector('img'),iz=Number(getComputedStyle(image).zIndex)||0;return getComputedStyle(e).filter==='none'&&[...e.children].filter(n=>n.tagName!=='IMG').every(n=>{const s=getComputedStyle(n);return s.filter==='none'&&s.opacity==='1'&&s.visibility==='visible'&&(Number(s.zIndex)||0)>iz;});})),'sharp unchanged HTML foreground paints above decoration '+width);
    check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>['::before','::after'].some(p=>{const s=getComputedStyle(e,p);return s.content!=='none'&&s.pointerEvents==='none'&&s.backgroundImage.includes('gradient');}))),'white reading-area layer protects title and facts '+width);
    check(await page.locator('.sales-phase-grid > .sales-phase').evaluateAll(els=>els.every(e=>getComputedStyle(e).transform==='none')),'outer route nodes remain fixed '+width);
    const before=await geometry(page);baseline.set(width,before);await scenes.evaluateAll(els=>els.forEach(e=>e.style.display='none'));equal(await geometry(page),before,'hiding decoration causes no card or foreground layout shift '+width);await scenes.evaluateAll(els=>els.forEach(e=>e.style.removeProperty('display')));
    await arrowGeometry(page,width);
    if(width<=600){
      // Chromium omits the default 180deg in computed gradients. Verify the actual
      // vertical rail geometry and tone gradient instead of a serialization detail.
      check(await page.locator('.sales-phase-grid').evaluate(e=>{const s=getComputedStyle(e,'::before');return s.display!=='none'&&parseFloat(s.width)===2&&parseFloat(s.height)>200&&s.top==='20px'&&s.bottom==='20px'&&/^linear-gradient\((?:180deg,|to bottom,|rgba?\()/.test(s.backgroundImage);}),'mobile learning route retains its vertical timeline '+width);
      check(await page.locator('.sales-phase-grid > .sales-phase').evaluateAll(els=>els.slice(1).every((e,i)=>e.getBoundingClientRect().top>=els[i].getBoundingClientRect().bottom+10)),'mobile phases remain in one sequential column '+width);
      check(await page.locator('.sales-phase-grid').evaluate(e=>{const s=getComputedStyle(e,'::before'),b=e.getBoundingClientRect(),x=b.left+parseFloat(s.left)+parseFloat(s.width)/2;return [...e.querySelectorAll('.sales-phase-number')].every(n=>{const r=n.getBoundingClientRect();return Math.abs(r.left+r.width/2-x)<=3;});}),'five mobile numbers sit on the visible vertical route axis '+width);
      check(await page.locator('.sales-phase-number').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,first=els[0].getBoundingClientRect();if(Math.abs(x-(first.x+first.width/2))>1)return false;for(let a=e.parentElement;a&&!a.matches('.sales-phase-grid');a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect();if(['hidden','clip'].includes(s.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return false;}return true;})),'all five mobile numbers align on the route and are not clipped by inner-card decoration '+width);
    }
    if([320,390,1180,1440,2560].includes(width))await page.locator('#roadmap').screenshot({path:path.join(out,'roadmap-'+width+'.png')});
  }

  for(const width of [1024,1180,1440,2560]){
    await page.setViewportSize({width,height:1000});await page.locator('#roadmap').scrollIntoViewIfNeeded();await clearPointer(page);
    for(let index=0;index<5;index++){
      const outer=page.locator('.sales-phase-grid > .sales-phase').nth(index),card=outer.locator('.sales-phase-card'),before=await arrows(page),size=await geometry(page);
      await card.hover({position:{x:20,y:20}});await pause(page);
      const moved=await transform(card);check(Math.abs(moved.y+3)<.1&&moved.x===0&&moved.scaleX===1&&moved.scaleY===1,'inner stage card receives restrained 3px lift '+width+'/'+index);
      check((await transform(outer)).raw==='none','outer route node never follows the hover '+width+'/'+index);
      equal(await arrows(page),before,'all connector positions stay fixed during inner-card hover '+width+'/'+index);
      equal(await geometry(page),size,'hover never changes route layout dimensions '+width+'/'+index);
      await clearPointer(page);
    }
  }
  await page.setViewportSize({width:1440,height:1000});await clearPointer(page);
  const pathButton=page.locator('.sales-roadmap-actions>button');
  check(await pathButton.evaluate(e=>e.getBoundingClientRect().height>=44),'existing course-route CTA retains a touch-sized target');
  await pathButton.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');check(await pathButton.evaluate(e=>e===document.activeElement&&e.matches(':focus-visible')),'course-route CTA remains reachable by real keyboard focus');
  await page.keyboard.press('Enter');await page.waitForURL(base+'/paths');equal(new URL(page.url()).pathname,'/paths','keyboard CTA keeps the original /paths destination');await home(page);

  for(const url of sceneUrls)await desktop.route(url,route=>route.abort());await home(page,false);
  for(const card of await page.locator('.sales-phase-card').all())await card.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.sales-phase-background').length===0);
  equal(await page.locator('.sales-phase-background').count(),0,'failed images disappear without broken-image indicators');await copy(page,' after scene failures');
  check(await page.locator('.sales-phase-card').evaluateAll(els=>els.every(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'&&[...e.querySelectorAll('h3,li')].every(n=>getComputedStyle(n).filter==='none'&&getComputedStyle(n).visibility==='visible'))),'failed scenes return to white cards with intact sharp text');
  for(const width of widths){await page.setViewportSize({width,height:1000});await clearPointer(page);equal(await geometry(page),baseline.get(width),'actual failed-scene removal preserves all foreground/card geometry '+width);await arrowGeometry(page,width);}
  await page.setViewportSize({width:1440,height:1000});await page.locator('#roadmap').screenshot({path:path.join(out,'roadmap-fallback.png')});await desktop.close();

  const reduced=await context({reducedMotion:'reduce'}),still=await reduced.newPage();await home(still);
  check(await still.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),'reduced-motion setting is actually enabled');
  for(let index=0;index<5;index++){const outer=still.locator('.sales-phase-grid > .sales-phase').nth(index),card=outer.locator('.sales-phase-card');await card.hover({position:{x:20,y:20}});await pause(still);check((await transform(card)).raw==='none'&&(await transform(card)).transition==='0s'&&(await transform(outer)).raw==='none','reduced-motion keeps card and route node still '+index);check(await card.locator('img').evaluate(e=>getComputedStyle(e).animationName==='none'),'background scene itself never animates '+index);}await reduced.close();

  const authored=await context({}, {title:'作者保留的首页标题',description:'作者保留的首页介绍',ctaLabel:'作者入口',ctaPath:'/resources',secondaryLabel:'作者次入口',secondaryPath:'/community'}),cms=await authored.newPage();await home(cms);await copy(cms,' with authored CMS');
  equal(await cms.locator('h1').innerText(),'作者保留的首页标题','authored CMS heading remains unchanged');equal(await cms.locator('.sales-lead').innerText(),'作者保留的首页介绍','authored CMS description remains unchanged');
  equal(await cms.locator('.sales-case-card:not(.sales-platform-case) .sales-case-copy h3').allTextContents(),['AI 面试助手','AI Agent 自动化工作流'],'both published CMS project identities remain unchanged');
  equal(await cms.locator('.sales-case-card:not(.sales-platform-case) .sales-phase-background').count(),0,'roadmap scenes never replace CMS project covers');
  await cms.locator('.sales-roadmap-actions>button').click();await cms.waitForURL(base+'/paths');equal(new URL(cms.url()).pathname,'/paths','authored CMS does not alter the existing course-route destination');await home(cms);
  await cms.locator('.sales-hero-buttons button').first().click();await cms.waitForURL(base+'/resources');equal(new URL(cms.url()).pathname,'/resources','authored CMS main action is retained');await home(cms);await cms.locator('.sales-hero-buttons button').last().click();await cms.waitForURL(base+'/community');equal(new URL(cms.url()).pathname,'/community','authored CMS secondary action is retained');await authored.close();
  equal(errors,[],'zero browser errors');equal(external,[],'zero external/provider requests');equal(writes,[],'zero write requests');
  console.log('PASS '+checks+' isolated roadmap checks: five decoded scenes, preserved ordered route/copy, centered fixed connectors, 320–2560px, mobile timeline, failure geometry, keyboard/reduced motion and CMS; GET/HEAD only.');
}finally{await browser.close();}
