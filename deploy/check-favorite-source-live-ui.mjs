// Anonymous browser checks: no production bookmarks or other mutations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright'),base='https://oneshowlearn.com';
const expected=createHash('sha256').update(readFileSync('dist/client/index.html')).digest('hex');
const browser=await chromium.launch({headless:true}),errors=[],writes=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
mkdirSync('artifacts/favorite-integration/live',{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await c.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base)return route.abort();if(!['GET','HEAD'].includes(r.method())){writes.push(r.url());return route.abort();}return route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const entry=await(await c.request.get(base+'/api/learning/entry')).json(),preview=entry.lessons.find(l=>l.is_preview&&!l.locked);check(Boolean(preview),'real preview lesson');
 let r=await p.goto(base+`/opc/lessons/${preview.id}`);check(createHash('sha256').update(await r.body()).digest('hex')===expected,'exact new entry');
 await p.locator('.cr-lesson-page .learning-player').waitFor();
 const bookmarks=p.locator('.favorite-entry-button');check(await bookmarks.count()>=3,'course/lesson/courseware entries');
 for(const width of [320,390,768,1440]){
  await p.setViewportSize({width,height:900});await p.waitForTimeout(120);
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'course no overflow '+width);
  check(await bookmarks.evaluateAll(bs=>bs.filter(b=>b.getBoundingClientRect().width>0).every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)),'bookmark touch targets '+width);
 }
 await p.screenshot({path:'artifacts/favorite-integration/live/course-mobile.png',fullPage:true});
 await bookmarks.first().click();await p.waitForURL(/\/login\?returnTo=/);check(new URL(p.url()).searchParams.get('returnTo')===`/opc/lessons/${preview.id}`,'guest bookmark returns to exact lesson');
 await p.goto(base+'/projects');await p.locator('.pd-card').first().waitFor();
 const catalogue=await(await c.request.get(base+'/api/learning/projects')).json();
 check(await p.locator('.pd-card .favorite-entry-button').count()===catalogue.items.length,'every actual project has source action');
 await p.locator('.pd-card-action').first().click();await p.waitForURL(/\/projects\/[^/]+$/);await p.locator('.ls-project-hero').waitFor();
 check(await p.locator('.ls-project-hero .favorite-entry-button').count()===1,'read-only project detail action');
 await p.goto(base+'/resources');await p.locator('.rl-page .favorite-entry-button').first().waitFor();
 check(await p.locator('.favorite-entry-button').count()>0,'resource source actions');
 await p.goto(base+'/favorites');await p.getByRole('heading',{name:'登录后保存你的学习记录',exact:true}).waitFor();
 check(await p.locator('.fs-card').count()===0,'no anonymous private bookmarks');
 await p.locator('.ws-offer-price').waitFor();check((await p.locator('.ws-offer-price').innerText()).includes('¥499'),'unchanged formal price');
 for(const route of ['/api/me/favorites/contents','/api/me/workspace','/api/learning/notes','/api/commerce/orders'])check((await c.request.get(base+route)).status()===401,'anonymous privacy '+route);
 check(writes.length===0,'no writes/runs/orders');assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} live source-entry browser checks: exact entry, course/project/resource bookmarks, guest return, private guards, responsive targets and unchanged ¥499; no production mutations/provider requests.`);
}finally{await browser.close();}
