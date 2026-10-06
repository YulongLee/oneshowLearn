// Fresh isolated CMS/account fixtures and local APIs only; never production seeding.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const dir=mkdtempSync(path.join(tmpdir(),'osl-project-catalog-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'isolated.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-project-catalog-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:''});
const {db,row,run}=await import('../server/db.mjs');
const {signUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const insert=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
const user=name=>{const id=insert("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'learner',1)",[name+'@example.invalid','unused',name]);return{id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
const learner=user('隔离新用户'),other=user('隔离另一用户');
const ids=[],placements=[];
const categories=['AI SaaS','工具网站','移动 App','小程序','AI Agent'].map((name,i)=>insert('INSERT INTO project_categories(slug,name,sort_order) VALUES(?,?,?)',['c'+i,name,i]));
for(const [i,title] of ['【演示】AI 面试助手','【演示】AI 工具聚合站','AI 健康饮食管理 App','【演示】微信 AI 小程序','AI Agent 自动化工作流'].entries()){
 const id=insert("INSERT INTO practice_projects(slug,title,description,deliverable,cover_url,status,sort_order) VALUES(?,?,?,?,?,'published',?)",['catalog-'+i,title,`隔离方向 ${i}：页面开发与产品流程。\n\n${i===0||i===1||i===3?'演示内容，非正式教学课程。当前共用示例素材。':''}`,'隔离真实成果说明',i===2?'/fixture-custom.webp':'',i]);ids.push(id);
 run('INSERT INTO practice_project_settings(project_id,category_id,tech_stack,difficulty,estimated_minutes,audience,access_type,is_recommended) VALUES(?,?,?,?,?,?,?,?)',[id,categories[i],JSON.stringify(['React','隔离技术'+i]),i+1,90,'隔离适合人群 '+i,i===3?'paid':i===4?'membership':'free',i===1?1:0]);
 if(i!==4){const stage=insert("INSERT INTO practice_project_stages(project_id,title,status) VALUES(?,'隔离阶段','published')",[id]);const lesson=insert("INSERT INTO learning_lessons(title,config,status) VALUES(?,?,'published')",['隔离课时 '+i,JSON.stringify({isDemoMedia:i!==2})]);placements.push(insert("INSERT INTO lesson_placements(lesson_id,stage_id,is_preview,status) VALUES(?,?,1,'published')",[lesson,stage]));}
}
const app=createApp(),client=path.resolve('dist/client');app.get('/fixture-custom.webp',(_q,res)=>res.sendFile(path.resolve('src/assets/project-mobile-cover-v1.webp')));app.use(express.static(client));app.get('/{*route}',(_q,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
run('UPDATE practice_projects SET cover_url=? WHERE id=?',[base+'/fixture-custom.webp',ids[2]]);
const errors=[],external=[],starts=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const context=async u=>{const c=await browser.newContext({viewport:{width:1700,height:1250},reducedMotion:'reduce'});await c.route('**/*',route=>{const req=route.request();if(!req.url().startsWith(base)){external.push(req.url());return route.abort();}if(req.method()==='POST'&&/\/start$/.test(req.url()))starts.push(req.url());return route.continue();});if(u)await c.addInitScript(token=>{if(location.protocol==='http:')localStorage.setItem('oneshowlearn_token',token);},u.token);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;};
const ready=async p=>{await p.locator('.pd-refined .pd-card').first().waitFor();};
const output=path.resolve('artifacts/project-catalog-refinement');mkdirSync(output,{recursive:true});
try {
 const c=await context(learner),p=await c.newPage();await p.goto(base+'/projects');await ready(p);
 await p.getByRole('heading',{name:'开始你的第一个项目',exact:true}).waitFor();
 check(await p.locator('.pd-card').count()===5,'all real catalogue entries');check(await p.locator('.pd-demo-status').count()===3,'demo flags preserved');
 check(await p.locator('.pd-card-recommended').count()===1,'only configured recommendation');
 check(await p.locator('.pd-card h2').first().innerText()==='AI 工具聚合站','configured sort and clean title');
 check(await p.getByText('0 个课件',{exact:true}).count()===0,'no misleading zero download metadata');check(await p.locator('.pd-card-resources').first().innerText()==='','no invented download resources');
 check(await p.locator('.pd-card').filter({hasText:'微信 AI 小程序'}).locator('.pd-access').innerText()==='可试看 · 完整学习需权限');
 const custom=p.locator('.pd-card').filter({has:p.getByRole('heading',{name:'AI 健康饮食管理 App',exact:true})});
 check((await custom.locator('.pd-art img').getAttribute('src'))===base+'/fixture-custom.webp','custom CMS cover preserved');check(await custom.locator('.pd-art>small').count()===0,'custom cover not relabeled generic');
 await p.locator('.pd-card img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
 for(const width of [1700,2560,1440,1024,768,390,320]){
  await p.setViewportSize({width,height:1250});await p.waitForTimeout(120);
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);
  check(await p.locator('.pd-card').evaluateAll(cards=>cards.every(card=>{const art=card.querySelector('.pd-art'),heading=card.querySelector('h2'),s=getComputedStyle(art);return s.position==='relative'&&s.opacity==='1'&&s.maskImage==='none'&&art.getBoundingClientRect().bottom<=heading.getBoundingClientRect().top;})),'covers never overlap text '+width);
  check(await p.locator('.pd-card-action').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),'touch targets '+width);
  if(width===1700||width===390)await p.screenshot({path:path.join(output,`catalog-${width}.png`),fullPage:true});
 }
 await p.setViewportSize({width:1700,height:1250});
 await p.getByRole('button',{name:'探索项目',exact:true}).click();check(await p.locator('.pd-catalog').evaluate(el=>document.activeElement===el),'starter focuses catalogue, not a run');
 check(starts.length===0);check(row('SELECT COUNT(*) n FROM project_runs').n===0);
 await p.getByLabel('搜索项目',{exact:true}).fill('面试');await p.waitForFunction(()=>document.querySelectorAll('.pd-card').length===1);check((await p.locator('.pd-card h2').innerText()).includes('面试'));
 await p.getByRole('button',{name:'清空搜索',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.pd-card').length===5);
 await p.getByRole('button',{name:'移动 App',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.pd-card').length===1);check(await p.locator('.pd-card h2').innerText()==='AI 健康饮食管理 App');
 await p.getByRole('button',{name:'全部',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.pd-card').length===5);
 await p.getByLabel('项目排序').selectOption('difficulty');await p.waitForFunction(()=>document.querySelector('.pd-card h2')?.textContent==='AI 面试助手');check(true);
 await p.getByLabel('搜索项目',{exact:true}).fill('不存在的项目');await p.getByRole('heading',{name:'没有找到匹配的项目',exact:true}).waitFor();check(true);await p.getByRole('button',{name:'重置筛选',exact:true}).click();await ready(p);
 await p.getByRole('button',{name:'查看项目详情：【演示】AI 面试助手',exact:true}).click();await p.waitForURL(base+'/projects/catalog-0');await p.getByRole('button',{name:'开始学习',exact:true}).waitFor();
 check(starts.length===0,'details are read-only');check(row('SELECT COUNT(*) n FROM project_runs').n===0,'no enrollment from comparison');
 check(await p.getByText('隔离真实成果说明',{exact:true}).isVisible(),'real deliverable');check(await p.getByRole('button',{name:'预览课程',exact:true}).isVisible());
 await p.getByRole('button',{name:'预览课程',exact:true}).click();await p.waitForURL(base+'/projects/catalog-0/preview/'+placements[0]);check(starts.length===0,'preview does not start a run');
 await p.goto(base+'/projects/catalog-0');await p.getByRole('button',{name:'开始学习',exact:true}).click();await p.waitForURL(base+'/projects/catalog-0/workspace');check(starts.length===1,'explicit start only');check(row('SELECT user_id FROM project_runs WHERE project_id=?',[ids[0]]).user_id===learner.id);
 await p.goto(base+'/projects');await ready(p);await p.getByRole('heading',{name:'继续你的项目',exact:true}).waitFor();check(await p.locator('.pd-continue-card').isVisible());
 await p.getByRole('button',{name:'继续学习：【演示】AI 面试助手',exact:true}).last().click();await p.waitForURL(base+'/projects/catalog-0/workspace');check(starts.length===1,'continue creates no second run');
 const oc=await context(other),o=await oc.newPage();await o.goto(base+'/projects');await ready(o);await o.getByRole('heading',{name:'开始你的第一个项目',exact:true}).waitFor();check(await o.locator('.pd-continue-card').count()===0,'private continuation isolated');
 const gc=await context(),g=await gc.newPage();await g.goto(base+'/projects');await ready(g);await g.getByRole('button',{name:'查看项目详情：【演示】微信 AI 小程序',exact:true}).click();await g.waitForURL(base+'/projects/catalog-3');check(await g.getByRole('button',{name:'需要项目权益',exact:true}).isDisabled());check(await g.getByRole('button',{name:'预览课程',exact:true}).isVisible());
 await g.goto(base+'/projects/catalog-0');await g.getByRole('button',{name:'登录后开始学习',exact:true}).click();await g.waitForURL(/\/login$/);check(true,'guest login entry');
 const errorContext=await context(learner),e=await errorContext.newPage();await e.route('**/api/learning/me/projects',route=>route.fulfill({status:503,json:{error:'隔离读取失败'}}));await e.goto(base+'/projects');await ready(e);await e.getByRole('heading',{name:'暂时无法读取学习进度',exact:true}).waitFor();check(await e.getByRole('button',{name:'重新加载',exact:true}).isVisible());
 // Long real CMS text must reflow without hiding the only usable details action.
 run('UPDATE practice_projects SET title=?,description=? WHERE id=?',['超长项目标题用于验证真实后台内容换行而不是遮挡按钮'.repeat(3),'很长的真实项目说明。'.repeat(100),ids[2]]);
 await o.goto(base+'/projects');await ready(o);await o.setViewportSize({width:390,height:844});await o.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);check(await o.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check(await o.locator('.pd-card-action').count()===5);
 run('UPDATE practice_projects SET cover_url=? WHERE id=?',[base+'/broken-cover.webp',ids[2]]);
 await o.route('**/broken-cover.webp',route=>route.fulfill({status:404,body:''}));await o.goto(base+'/projects');await ready(o);
 check(await o.locator('.pd-card').filter({hasText:'超长项目标题'}).locator('.pd-art>small').innerText()==='界面示意','failed cover has truthful fallback');
 for(let i=0;i<8;i++)insert("INSERT INTO practice_projects(slug,title,status,sort_order) VALUES(?,?,'published',?)",['extra-'+i,'隔离分页项目 '+i,10+i]);
 await o.goto(base+'/projects');await ready(o);await o.waitForFunction(()=>document.querySelectorAll('.pd-card').length===12);check(true,'page size retained');
 await o.getByRole('button',{name:'下一页',exact:true}).click();await o.waitForFunction(()=>document.querySelectorAll('.pd-card').length===1);check((await o.locator('.pd-pagination').innerText()).includes('2 / 2 页 · 13 个项目'),'last page actual total');
 await o.getByRole('button',{name:'上一页',exact:true}).click();await o.waitForFunction(()=>document.querySelectorAll('.pd-card').length===12);check(true);
 assert.deepEqual(errors,[]);assert.deepEqual(external.filter(url=>!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),[]);
 console.log(`PASS ${checks} isolated project catalogue checks: clear covers/real metadata, 320–2560px, filters/search/sort/empty, read-only details/preview, explicit start/continue/account isolation and guest/error states; zero script errors or provider calls.`);
} finally {await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
