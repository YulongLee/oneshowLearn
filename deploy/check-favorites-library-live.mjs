// Anonymous, read-only live verification. Authenticated features use isolated fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs'),{chromium}=require('playwright');
const base='https://oneshowlearn.com',hash=b=>createHash('sha256').update(b).digest('hex'),expected=hash(readFileSync('dist/client/index.html'));
const browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const output=path.resolve('artifacts/favorites-library/live');mkdirSync(output,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.url());return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));const response=await p.goto(base+'/favorites');check(hash(await response.body())===expected,'exact deployed entry');
 await p.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();check(await p.getByRole('heading',{name:'我的收藏',exact:true}).isVisible(),'favorites heading');check((await p.locator('.fs-heading').innerText()).includes('把值得再用的内容留下'),'new compact header');check(await p.locator('.fs-library-heading,.fs-card,.fs-tools').count()===0,'no private/seeded data or duplicated headings');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative price unchanged');check((await p.locator('.ws-sidebar').innerText()).includes('AI 导师'),'shared tutor/navigation unchanged');await p.screenshot({path:path.join(output,'favorites-guest-desktop.png'),fullPage:true});
 for(const width of [320,390,768,1440,1920]){await p.setViewportSize({width,height:844});await p.waitForTimeout(100);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);check(await p.locator('.fs-heading-actions button').evaluate(el=>el.getBoundingClientRect().height>=44),'touch discovery '+width);}
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(output,'favorites-guest-mobile.png'),fullPage:true});
 await p.getByRole('button',{name:'发现学习资源',exact:true}).click();await p.waitForURL(/\/resources$/);check(true,'real discovery route');await p.goto(base+'/favorites');await p.getByRole('button',{name:'登录学习账号',exact:true}).click();await p.waitForURL(/\/login$/);check(true,'private gate login');
 for(const route of ['/api/me/workspace','/api/learning/notes','/api/auth/profile','/api/commerce/orders','/api/learning/ai/conversations'])check((await c.request.get(base+route)).status()===401,'anonymous privacy '+route);
 await p.goto(base+'/notes?note=00000000-0000-4000-8000-000000000000');await p.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();check(await p.locator('.ns-document,.ns-writing,.ns-note').count()===0,'anonymous note deep link cannot expose records');check(writes.length===0,'zero mutations');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live favorites checks: exact entry/new heading/guest guards, shared offer ¥499/navigation, discovery/login, note-link privacy and responsive targets; no account creation, writes or provider calls.`);
}finally{await browser.close();}
