// Anonymous, read-only production acceptance; no browser writes or provider calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright'),base='https://oneshowlearn.com',hash=data=>createHash('sha256').update(data).digest('hex');
const expected=hash(readFileSync('dist/client/index.html')),browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};const output=path.resolve('artifacts/community-editorial/live');mkdirSync(output,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));const response=await p.goto(base+'/community');check(hash(await response.body())===expected,'exact entry');
 await p.getByRole('heading',{name:'登录后，加入学习社区',exact:true}).waitFor();check(await p.locator('.ce-page .oc-guest-prompt').count()===1,'new guest presentation');check(await p.locator('.ce-featured,.oc-card,.oc-group-dialog img').count()===0,'no private article or QR exposed');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative offer unchanged');
 await p.screenshot({path:path.join(output,'guest-desktop.png'),fullPage:true});
 for(const width of [390,320]){await p.setViewportSize({width,height:844});await p.waitForTimeout(140);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'guest mobile overflow '+width);check(await p.getByRole('button',{name:'登录我的学习账号',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44),'guest touch target '+width);}
 await p.screenshot({path:path.join(output,'guest-mobile.png'),fullPage:true});
 for(const route of ['/api/community','/api/community/articles/1','/api/admin/community','/api/auth/profile','/api/commerce/orders','/api/me/workspace'])check((await c.request.get(base+route)).status()===401,'private API '+route);
 await p.getByRole('button',{name:'登录我的学习账号',exact:true}).click();await p.waitForURL(/\/login/);check(true,'login navigation');check(writes.length===0,'zero mutation attempts');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live community checks: exact entry, guest/mobile/login, private articles/QR/admin/account/orders and unchanged ¥499; zero script errors, mutations or providers.`);
}finally{await browser.close();}
