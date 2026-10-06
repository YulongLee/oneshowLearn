// Read-only, anonymous live acceptance. Never save content/settings or call providers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {resourceLibraryItems,resourceHighlights} from '../src/resource-library-model.js';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright'),base='https://oneshowlearn.com';
const hash=data=>createHash('sha256').update(data).digest('hex'),expected=hash(readFileSync('dist/client/index.html'));
const browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const output=path.resolve('artifacts/resource-library/live');mkdirSync(output,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const response=await p.goto(base+'/resources');check(hash(await response.body())===expected,'exact entry');
 const result=await c.request.get(base+'/api/resources');check(result.status()===200,'real catalogue');const {items}=await result.json();
 await p.waitForFunction(()=>document.querySelectorAll('.rl-page .rd-card').length===3&&document.querySelector('.rd-table tbody tr'));
 check(items.length===5,'five existing published outlines, no mock import');
 check(await p.locator('.rd-card').count()===Math.min(items.length,3),'three actual cards');
 assert.deepEqual(await p.locator('.rd-card h3').allTextContents(),resourceHighlights(items).map(i=>i.title));checks++;
 assert.deepEqual(await p.locator('.rd-table tbody .rd-resource-name strong').allTextContents(),resourceLibraryItems(items).map(i=>i.title));checks++;
 check(await p.locator('.rl-phases button').count()===6,'five course phases and reset');
 check(await p.getByRole('heading',{name:'从课程资料开始',exact:true}).isVisible(),'honest non-curated heading');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative price preserved');
 check(await p.locator('.rd-card').evaluateAll(cards=>cards.every(card=>card.querySelector('.rl-cover').getBoundingClientRect().bottom<=card.querySelector('h3').getBoundingClientRect().top)),'cover separate from text');
 await p.screenshot({path:path.join(output,'resource-desktop.png'),fullPage:true});
 for(const width of [390,320]){
  await p.setViewportSize({width,height:844});await p.waitForTimeout(180);
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile no overflow '+width);
  check(await p.locator('.rd-card footer button,.rl-phases button,.rd-table td:last-child button').evaluateAll(items=>items.every(i=>i.getBoundingClientRect().height>=44)),'mobile touch targets '+width);
 }
 await p.screenshot({path:path.join(output,'resource-mobile.png'),fullPage:true});
 await p.setViewportSize({width:1700,height:1150});
 await p.getByRole('button',{name:'AI 产品开发',exact:true}).click();await p.getByRole('heading',{name:'筛选结果',exact:true}).waitFor();
 check(await p.locator('.rd-table tbody tr').count()===1,'actual chapter filter');
 await p.getByLabel('搜索资源关键词').fill('收款');await p.getByRole('heading',{name:'暂未找到匹配的资源',exact:true}).waitFor();check(true,'combined filter truthful empty');
 await p.getByRole('button',{name:'查看全部资源',exact:true}).click();await p.locator('.rd-card').first().waitFor();
 await p.locator('.rl-more-categories summary').click();await p.locator('.rl-more-categories summary').press('Escape');check(await p.locator('.rl-more-categories').evaluate(el=>!el.open),'keyboard disclosure');
 const first=resourceLibraryItems(items)[0];await p.getByRole('button',{name:'打开资源：'+first.title,exact:true}).click();await p.locator('.rc-document').waitFor();
 check((await p.locator('.rc-document').innerText()).length>0,'actual anonymous outline body');check(await p.getByRole('button',{name:'登录后保存学习进度',exact:true}).isVisible(),'guest progress guard');
 await p.getByRole('button',{name:'关闭资源窗口',exact:true}).click();
 for(const route of ['/api/auth/profile','/api/commerce/orders','/api/learning/ai/conversations','/api/me/workspace'])check((await c.request.get(base+route)).status()===401,'anonymous private guard '+route);
 check(writes.length===0,'zero mutation attempts');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live resource checks: exact entry, five existing outlines/three cards, chapter/search/keyboard/mobile/reader, unchanged ¥499 and private guards; zero script errors, writes or providers.`);
}finally{await browser.close();}
