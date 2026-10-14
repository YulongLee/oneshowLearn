// Existing isolated fixture preview only: no production, provider, database or write request.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.HOMEPAGE_MOTION_BASE||'http://127.0.0.1:4186';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'motion acceptance uses only an isolated loopback preview');
const out=path.resolve('artifacts/homepage-commercial/card-motion');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],external=[],writes=[];
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);};
const pause=page=>page.waitForTimeout(240);
const transform=locator=>locator.evaluate(e=>{const s=getComputedStyle(e),m=s.transform==='none'?null:new DOMMatrixReadOnly(s.transform);return {x:m?.m41||0,y:m?.m42||0,scaleX:m?.m11||1,scaleY:m?.m22||1,raw:s.transform,transition:s.transitionDuration};});
const geometry=page=>page.locator('.sales-case-card').evaluateAll(els=>els.map(e=>({width:e.offsetWidth,height:e.offsetHeight,left:e.offsetLeft,top:e.offsetTop})));
const clearPointer=async page=>{await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await pause(page);};
const context=async(options={},emptyProjects=true)=>{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference',...options});
  await c.route('**/*',async route=>{
    const request=route.request(),url=request.url();
    if(!url.startsWith(base+'/')){external.push(url);return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){writes.push(url);return route.abort();}
    if(emptyProjects&&new URL(url).pathname==='/api/site/pages/public'){
      const response=await route.fetch();
      return route.fulfill({response,json:{...await response.json(),projects:[]}});
    }
    return route.continue();
  });
  c.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  return c;
};
const home=async page=>{
  await page.goto(base+'/');
  await page.locator('.sales-platform-case').nth(2).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  for(const image of await page.locator('.sales-capability-background').all()){
    await image.scrollIntoViewIfNeeded();await image.evaluate(e=>e.decode());
  }
  await clearPointer(page);
};
const pressBody=async(page,card)=>{
  await card.scrollIntoViewIfNeeded();
  const box=await card.locator('.sales-capability-art').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await pause(page);await page.mouse.down();await pause(page);
};
const focusByKeyboard=async(page,button)=>{
  // Move onto the actual button with keyboard input, rather than synthesizing :focus-visible.
  await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await pause(page);
  check(await button.evaluate(e=>e===document.activeElement&&e.matches(':focus-visible')),'actual keyboard focus is visibly indicated');
};
try{
  const desktop=await context(),page=await desktop.newPage();
  await home(page);
  check(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),'desktop fine-pointer hover is available');
  equal(await page.locator('.sales-platform-case').count(),3,'exactly three capability cards');
  equal(await page.locator('.sales-capability-art>strong').allTextContents(),['课程与资料','AI 辅助学习','实践与沉淀'],'existing three capability titles retained');
  equal(await page.locator('.sales-capability-art li').count(),9,'all nine capability facts retained');
  check(await page.locator('.sales-capability-background').evaluateAll(els=>els.length===3&&els.every(e=>e.complete&&e.naturalWidth===1536&&e.naturalHeight===1024&&e.alt===''&&e.getAttribute('aria-hidden')==='true')),'all three decorative scenes decode without changing semantics');
  check(await page.locator('.sales-platform-case').evaluateAll(els=>els.every(e=>e.tagName==='ARTICLE'&&!e.hasAttribute('tabindex')&&!e.hasAttribute('role')&&e.querySelectorAll('button').length===1&&getComputedStyle(e).cursor!=='pointer')),'only the existing CTA is interactive; article remains non-navigation content');

  for(const width of [320,390,600,768,1000,1024,1180,1440,1920,2560]){
    await page.setViewportSize({width,height:1000});await clearPointer(page);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'unchanged responsive document bounds '+width);
    check(await page.locator('.sales-platform-case').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)),'card content fits '+width);
    const before=await geometry(page),card=page.locator('.sales-platform-case').first();
    await card.hover({position:{x:30,y:30}});await pause(page);
    const hovered=await transform(card);
    check(Math.abs(hovered.y+3)<.05&&hovered.x===0&&hovered.scaleX===1&&hovered.scaleY===1,'whole card gently lifts without scale '+width);
    equal(await geometry(page),before,'hover preserves layout sizes and neighboring positions '+width);
    await clearPointer(page);check((await transform(card)).y===0,'card returns after pointer leaves '+width);
  }

  await page.setViewportSize({width:1440,height:1000});await clearPointer(page);
  const routePaths=['/opc','/tutor','/achievements'];
  for(let index=0;index<3;index++){
    const card=page.locator('.sales-platform-case').nth(index),button=card.locator('button');
    const baseline=await card.evaluate(e=>({shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderColor}));
    await card.hover({position:{x:30,y:30}});await pause(page);
    const lifted=await card.evaluate(e=>({shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderColor}));
    check(baseline.shadow!==lifted.shadow&&baseline.border!==lifted.border,'card '+index+' enhances shadow and border on hover');
    await pressBody(page,card);check(Math.abs((await transform(card)).y+1)<.05,'card '+index+' press settles to minus one pixel');
    await page.mouse.up();await pause(page);check(Math.abs((await transform(card)).y+3)<.05,'card '+index+' release smoothly returns to hover');
    equal(new URL(page.url()).pathname,'/','pressing card content does not navigate '+index);
    await clearPointer(page);
    await focusByKeyboard(page,button);
    check(Math.abs((await transform(card)).y+3)<.05,'keyboard CTA focuses the whole fine-pointer card '+index);
    check(await button.evaluate(e=>{const s=getComputedStyle(e);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2&&parseFloat(s.outlineOffset)>=2;}),'CTA '+index+' has a clear offset focus ring');
    await page.keyboard.press('Enter');await page.waitForURL(base+routePaths[index]);equal(new URL(page.url()).pathname,routePaths[index],'keyboard CTA keeps exact existing route '+index);
    await home(page);
    const current=page.locator('.sales-platform-case').nth(index),cta=current.locator('button');
    await cta.scrollIntoViewIfNeeded();const box=await cta.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await pause(page);await page.mouse.down();await pause(page);
    check(Math.abs((await transform(current)).y+1)<.05&&Math.abs((await transform(cta)).y-1)<.05,'nested CTA press keeps stable card and one-pixel button feedback '+index);
    await page.mouse.up();await page.waitForURL(base+routePaths[index]);equal(new URL(page.url()).pathname,routePaths[index],'pointer CTA keeps exact existing route '+index);await home(page);
  }
  await page.locator('.sales-example-grid').screenshot({path:path.join(out,'desktop-rest.png')});
  await page.locator('.sales-platform-case').nth(1).hover({position:{x:30,y:30}});await pause(page);
  await page.locator('.sales-example-grid').screenshot({path:path.join(out,'desktop-hover.png')});
  await clearPointer(page);await desktop.close();

  const touch=await context({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),mobile=await touch.newPage();
  await home(mobile);
  check(await mobile.evaluate(()=>matchMedia('(hover:none) and (pointer:coarse)').matches),'touch fixture uses a real coarse pointer');
  for(let index=0;index<3;index++){
    const card=mobile.locator('.sales-platform-case').nth(index);
    await card.locator('.sales-capability-art').tap();await pause(mobile);
    check((await transform(card)).y===0,'touch body tap never leaves sticky card lift '+index);
    equal(new URL(mobile.url()).pathname,'/','touch body tap never turns article into navigation '+index);
    const button=card.locator('button');await focusByKeyboard(mobile,button);
    check((await transform(card)).y===0,'coarse-pointer keyboard focus does not retain hover lift '+index);
    check(await button.evaluate(e=>getComputedStyle(e).outlineStyle!=='none'),'coarse-pointer keyboard still has visible focus '+index);
    await button.tap();await mobile.waitForURL(base+routePaths[index]);equal(new URL(mobile.url()).pathname,routePaths[index],'touch CTA keeps exact route '+index);await home(mobile);
  }
  await mobile.locator('.sales-example-grid').screenshot({path:path.join(out,'touch-rest.png')});await touch.close();

  const reduced=await context({reducedMotion:'reduce'}),still=await reduced.newPage();await home(still);
  check(await still.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),'reduced-motion preference is enabled');
  for(let index=0;index<3;index++){
    const card=still.locator('.sales-platform-case').nth(index),button=card.locator('button');
    await card.hover({position:{x:30,y:30}});await pause(still);
    check((await transform(card)).raw==='none'&&(await transform(card)).transition==='0s','reduced-motion card hover has no translation or transition '+index);
    await pressBody(still,card);check((await transform(card)).raw==='none','reduced-motion content press has no translation '+index);await still.mouse.up();
    await clearPointer(still);await focusByKeyboard(still,button);
    check((await transform(card)).raw==='none','reduced-motion keyboard card focus has no translation '+index);
    const box=await button.boundingBox();await still.mouse.move(box.x+box.width/2,box.y+box.height/2);await still.mouse.down();await pause(still);
    check((await transform(card)).raw==='none'&&(await transform(button)).raw==='none'&&(await transform(button)).transition==='0s','reduced-motion nested CTA press is still '+index);
    // Release outside the CTA to verify cancellation rather than opening another route.
    await still.mouse.move(0,0);await still.mouse.up();await clearPointer(still);
  }
  await reduced.close();

  // Use the unmodified real isolated CMS response for the formal-project branch.
  const authored=await context({},false),cms=await authored.newPage();await cms.goto(base+'/');
  await cms.locator('.sales-case-card:not(.sales-platform-case)').first().waitFor();
  equal(await cms.locator('.sales-platform-case').count(),1,'formal CMS catalogue still shows just the existing course capability');
  const formal=cms.locator('.sales-case-card:not(.sales-platform-case)');
  equal(await formal.count(),2,'both formal published CMS project cards remain');
  equal(await formal.locator('.sales-case-copy h3').allTextContents(),['AI 面试助手','AI Agent 自动化工作流'],'formal project identities unchanged');
  const covers=await formal.locator('.sales-example-art img').evaluateAll(els=>els.map(e=>e.getAttribute('src')));
  check(covers[0].includes('/assets/workbench-interview-v1-')&&covers[1].includes('/assets/project-agent-cover-v1-'),'formal projects retain the existing CMS cover/fallback branch');
  equal(await formal.locator('.sales-capability-background').count(),0,'capability scenes never replace formal CMS project art');
  const sizes=await geometry(cms),project=formal.first();await project.hover({position:{x:30,y:30}});await pause(cms);
  check((await transform(project)).raw==='none','motion does not leak onto formal project cards');equal(await geometry(cms),sizes,'formal CMS card dimensions and positions unchanged');await authored.close();

  equal(errors,[],'zero browser errors');equal(external,[],'zero external/provider requests');equal(writes,[],'zero write requests');
  console.log('PASS '+checks+' isolated card-motion checks: three scenes, pointer/keyboard/touch/reduced-motion, 320–2560px and preserved CMS projects; GET/HEAD only.');
}finally{await browser.close();}
