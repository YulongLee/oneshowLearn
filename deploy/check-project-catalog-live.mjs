// Anonymous production UI verification: block every mutation and external request.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright'),base='https://oneshowlearn.com';
const expected=createHash('sha256').update(readFileSync('dist/client/index.html')).digest('hex');
const browser=await chromium.launch({headless:true});const errors=[],writes=[];let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const output=path.resolve('artifacts/project-catalog-refinement/live');mkdirSync(output,{recursive:true});
try {
 const c=await browser.newContext({viewport:{width:1700,height:1200},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}return route.continue();});
 const data=await(await c.request.get(base+'/api/learning/projects')).json();
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const response=await p.goto(base+'/projects');check(createHash('sha256').update(await response.body()).digest('hex')===expected,'exact released entry');
 await p.locator('.pd-refined .pd-card').first().waitFor();
 check(await p.locator('.pd-card').count()===data.items.length,'actual published catalogue count');
 check(await p.locator('.pd-demo-status').count()===data.items.filter(i=>/[【\[]演示[】\]]/.test(i.title)).length,'real demo status');
 check(await p.locator('.pd-card-recommended').count()===data.items.filter(i=>i.settings?.is_recommended).length,'configured recommendations only');
 await p.locator('.pd-card img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
 check(await p.locator('.pd-card').evaluateAll(cards=>cards.every(card=>card.querySelector('.pd-art').getBoundingClientRect().bottom<=card.querySelector('h2').getBoundingClientRect().top)),'independent covers above readable titles');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative offer unchanged');
 await p.screenshot({path:path.join(output,'projects-desktop.png'),fullPage:true});
 for(const width of [390,320]){await p.setViewportSize({width,height:844});await p.waitForTimeout(100);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);check(await p.locator('.pd-card-action').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),'touch entry '+width);}
 await p.screenshot({path:path.join(output,'projects-mobile.png'),fullPage:true});
 await p.locator('.pd-card-action').first().click();await p.waitForURL(/\/projects\/[^/]+$/);await p.locator('.ls-project-hero').waitFor();check(true,'details opens before starting');
 check(writes.length===0,'comparison creates no run/order');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live project catalogue checks: exact entry, actual metadata/covers/recommendations, unchanged ¥499, mobile and read-only details; zero script errors or write/provider calls.`);
} finally {await browser.close();}
