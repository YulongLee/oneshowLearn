// Anonymous, read-only production smoke: no authentication, mocks or provider calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright');
const base='https://oneshowlearn.com';
const expected=createHash('sha256').update(readFileSync('dist/client/index.html')).digest('hex');
const browser=await chromium.launch({headless:true});
const errors=[],writes=[],blocked=[];
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const output=path.resolve('artifacts/course-refinement/live');mkdirSync(output,{recursive:true});
try {
 const context=await browser.newContext({viewport:{width:1600,height:1150},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==base){blocked.push(url.origin);return route.abort();}
  if(!['GET','HEAD'].includes(request.method())){writes.push(request.method()+' '+url.pathname);return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const entryResponse=await context.request.get(base+'/api/learning/entry');assert.equal(entryResponse.status(),200);
 const entry=await entryResponse.json(),preview=entry.lessons.find(lesson=>lesson.is_preview&&!lesson.locked);
 assert.ok(preview,'actual published preview');
 const response=await page.goto(base+`/opc/lessons/${preview.id}`);
 check(createHash('sha256').update(await response.body()).digest('hex')===expected,'exact published entry');
 await page.locator('.cr-lesson-page .learning-player').waitFor();
 await page.locator('.cr-ai-composer').waitFor();
 check(await page.locator('.cs-directory .cl-chapter').count()===5,'five actual chapters');
 const input=page.getByLabel('向 AI 提问'),send=page.getByRole('button',{name:'发送问题',exact:true});
 const focus=async()=>{
  check(await input.evaluate(el=>{const s=getComputedStyle(el);return s.resize==='none'&&s.outlineStyle==='none'&&s.borderTopWidth==='0px';}),'no inner outline or resize handle');
  check(await page.locator('.cr-ai-composer').evaluate(el=>getComputedStyle(el).borderColor==='rgb(147, 108, 226)'&&getComputedStyle(el).boxShadow!=='none'),'single visible outer focus ring');
 };
 await input.click();await focus();
 await page.locator('.cr-ai-response').focus();await page.keyboard.press('Tab');
 check(await input.evaluate(el=>document.activeElement===el),'keyboard focus reaches input');await focus();
 await input.fill(Array.from({length:12},(_,i)=>`第 ${i+1} 行：只读界面核验，不发送给 AI。`).join('\n'));
 check(await input.evaluate(el=>el.clientHeight===132&&el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto'),'bounded multiline growth');
 check(await send.isDisabled(),'anonymous input cannot send');
 await page.getByRole('button',{name:'隐藏学习助手',exact:true}).click();await page.getByRole('button',{name:'显示学习助手',exact:true}).click();
 check((await input.inputValue()).includes('第 12 行'),'local draft survives toggles');
 await input.fill('短问题');check(await input.evaluate(el=>el.clientHeight===68),'shrinks after shortening');
 await input.focus();await page.locator('.cs-assistant-panel').screenshot({path:path.join(output,'desktop-assistant.png')});
 await page.setViewportSize({width:390,height:844});await input.fill('移动端只读界面检查。'.repeat(40));await input.focus();await focus();
 check(await input.evaluate(el=>el.clientHeight===132&&el.scrollHeight>el.clientHeight),'mobile bounded composer');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile no horizontal overflow');
 await page.locator('.cr-ai-composer').screenshot({path:path.join(output,'mobile-composer.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log(`PASS ${checks} live anonymous composer checks; exact entry, focus/growth/draft/mobile, zero script errors or write/provider calls; ${blocked.length} external requests blocked.`);
} finally {await browser.close();}
