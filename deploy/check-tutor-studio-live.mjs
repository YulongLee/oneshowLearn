// Read-only anonymous acceptance; block all browser mutations and external calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright'),base='https://oneshowlearn.com';
const expected=createHash('sha256').update(readFileSync('dist/client/index.html')).digest('hex');
const browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const output=path.resolve('artifacts/tutor-studio/live');mkdirSync(output,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const response=await p.goto(base+'/tutor');check(createHash('sha256').update(await response.body()).digest('hex')===expected,'exact entry');
 await p.locator('.tc-course-studio .tc-welcome').waitFor();await p.getByRole('button',{name:'登录后使用',exact:true}).waitFor();
 check((await p.locator('.tc-welcome h2').innerText()).includes('学习难点'),'new course-aware welcome');
 check(await p.getByLabel('选择课程',{exact:true}).count()===1,'single visible selector');
 check(await p.getByLabel('选择课程',{exact:true}).isDisabled(),'guest course guard');
 check(await p.getByRole('button',{name:'发送给 AI 导师',exact:true}).isDisabled(),'guest send guard');
 check(await p.locator('.tc-recent-row').count()===0,'no fabricated guest histories');
 check(await p.locator('.tc-suggestions button').count()===4,'four draft shortcuts');
 await p.getByRole('button',{name:'排查开发问题',exact:false}).click();await p.waitForFunction(()=>document.querySelector('.tc-scope-copy')?.textContent.includes('通用建议'));check((await p.locator('.tc-scope-copy').innerText()).includes('通用建议'),'general clearly distinct');
 check(await p.getByText('联网回答暂不可用',{exact:true}).count()===0,'general not blocked by web mode');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'authoritative price unchanged');
 await p.screenshot({path:path.join(output,'tutor-desktop.png'),fullPage:true});
 for(const width of [390,320]){await p.setViewportSize({width,height:844});await p.waitForTimeout(120);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);check(await p.locator('.tc-suggestions button').evaluateAll(items=>items.every(i=>i.getBoundingClientRect().height>=44)),'touch shortcuts '+width);check(await p.locator('.tc-course-picker').evaluate(el=>el.getBoundingClientRect().height>=44),'picker touch target '+width);}
 await p.screenshot({path:path.join(output,'tutor-mobile.png'),fullPage:true});
 await p.getByRole('button',{name:'常见问题',exact:true}).click();await p.getByRole('button',{name:'常见问题',exact:true}).press('Escape');check(await p.locator('.tc-faq.is-open').count()===0,'FAQ keyboard dismissal');
 for(const route of ['/api/auth/profile','/api/commerce/orders','/api/learning/ai/conversations'])check((await c.request.get(base+route)).status()===401,'anonymous private route '+route);
 await p.getByRole('button',{name:'登录后使用',exact:true}).click();await p.waitForURL(/\/login/);check(true,'guest login navigation');
 check(writes.length===0,'zero mutation attempts');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live tutor checks: exact entry, real guest/privacy states, unchanged ¥499, keyboard/mobile and login; zero script errors or mutations/provider calls.`);
}finally{await browser.close();}
