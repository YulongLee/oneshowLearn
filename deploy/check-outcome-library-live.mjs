// Anonymous, read-only live checks. Editing is tested only in disposable fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const base='https://oneshowlearn.com',hash=b=>createHash('sha256').update(b).digest('hex'),expected=hash(readFileSync('dist/client/index.html'));
const browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;},out=path.resolve('artifacts/achievement-library/live');mkdirSync(out,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1100},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.url());return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));const res=await p.goto(base+'/achievements');check(hash(await res.body())===expected,'Exact deployed entry');
 await p.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();check(await p.getByRole('heading',{name:'我的成果',exact:true}).isVisible(),'Outcome heading');
 check((await p.locator('.ag-heading').innerText()).includes('把想法、原型和上线过程'),'New compact outcome composition');check(await p.locator('.ag-card,.ag-summary,.ag-starters,.ag-toolbar,.ps-rail').count()===0,'No anonymous private/fake data or duplicate rail');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'Authoritative ¥499 unchanged');check((await p.locator('.ws-sidebar').innerText()).includes('AI 导师'),'Shared tutor navigation');
 await p.screenshot({path:path.join(out,'outcomes-guest-desktop.png'),fullPage:true});
 for(const width of [320,390,768,1440,1920,2560]){await p.setViewportSize({width,height:900});await p.waitForTimeout(100);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow '+width);check(await p.locator('.ag-primary').evaluate(el=>el.getBoundingClientRect().height>=44),'Touch target '+width);}
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'outcomes-guest-mobile.png'),fullPage:true});
 await p.getByRole('button',{name:'新建成果',exact:true}).click();await p.waitForURL(/\/login\?returnTo=/);check(new URL(p.url()).searchParams.get('returnTo')==='/achievements','Guest create returns to outcomes after login');
 for(const route of ['/api/me/workspace','/api/me/opc/product','/api/learning/me/projects','/api/learning/notes','/api/auth/profile','/api/commerce/orders'])check((await c.request.get(base+route)).status()===401,'Anonymous privacy '+route);
 check(writes.length===0,'Zero mutations');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live outcome checks: exact entry/new composition, guest ownership/privacy/login return, 320–2560px targets and unchanged shared ¥499 offer; no production writes or providers`);
}finally{await browser.close();}
