// Anonymous read-only live verification; no account creation or private writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright'),base='https://oneshowlearn.com',hash=b=>createHash('sha256').update(b).digest('hex');
const expected=hash(readFileSync('dist/client/index.html')),browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};const output=path.resolve('artifacts/notes-library/live');mkdirSync(output,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.url());return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const response=await p.goto(base+'/notes');check(hash(await response.body())===expected,'exact published entry');
 await p.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();check(await p.getByRole('heading',{name:'学习笔记',exact:true}).isVisible(),'notes heading preserved');check((await p.locator('.ns-heading').innerText()).includes('把课程知识，变成自己的实践方法。'),'new compact notes copy');check(await p.locator('.nl-starters,.ns-note,.ns-document,.ns-writing').count()===0,'guest no private records/drafts');check(await p.getByRole('button',{name:'导入文本',exact:true}).isDisabled(),'guest import guard');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative offer unchanged');await p.screenshot({path:path.join(output,'notes-guest-desktop.png'),fullPage:true});
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});await p.waitForTimeout(120);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);check(await p.getByRole('button',{name:'新建笔记',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44),'touch entry '+width);}
 await p.screenshot({path:path.join(output,'notes-guest-mobile.png'),fullPage:true});
 await p.getByRole('button',{name:'新建笔记',exact:true}).click();await p.waitForURL(/\/login/);check(true,'guest new-note enters real login');await p.goto(base+'/notes');await p.getByRole('button',{name:'登录学习账号',exact:true}).click();await p.waitForURL(/\/login/);check(true,'private gate login');
 for(const route of ['/api/learning/notes','/api/me/workspace','/api/auth/profile','/api/commerce/orders','/api/learning/ai/conversations'])check((await c.request.get(base+route)).status()===401,'anonymous privacy '+route);
 check((await c.request.get(base+'/api/learning/notes',{headers:{Authorization:'Bearer invalid'}})).status()===401,'invalid session guard');check(writes.length===0,'no mutations');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live notes checks: exact entry/new header, private guest/login/import guards, mobile/touch, unchanged ¥499; zero writes/provider calls or script errors. Authenticated records/editing tested only in isolated fixtures.`);
}finally{await browser.close();}
