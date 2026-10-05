// Disposable local CMS/accounts only. No cloud storage, payment or AI calls.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import path from 'node:path';
import express from 'express';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright'),dir=mkdtempSync(path.join(tmpdir(),'osl-resource-library-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'isolated.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-resource-browser-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:''});
const {db,row,run}=await import('../server/db.mjs'),{signUser}=await import('../server/auth.mjs'),{createApp}=await import('../server/index.mjs');
const insert=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
const user=name=>{const id=insert("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES(?,?,?,'learner',1)",[name+'@example.invalid','unused',name]);return {id,token:signUser(row('SELECT * FROM users WHERE id=?',[id]))};};
const owner=user('隔离资源学员'),other=user('隔离未购学员');
const pathId=insert("INSERT INTO learning_paths(slug,title,status) VALUES('resource-path','隔离学习路径','published')");
const pack=insert("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'resource-pack','隔离 AI OPC 课程','published')",[pathId]);
const chapters=[],outlines=[];
for(const [i,title] of ['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'].entries()){
 const step=insert("INSERT INTO project_steps(pack_id,title,summary,status,sort_order) VALUES(?,?,?,'published',?)",[pack,`第 ${i+1} 章 ${title}`,`了解${title}的课程方法 核心问题：课程知识如何应用？`,i]);chapters.push(step);
 outlines.push(insert("INSERT INTO content_items(step_id,type,title,body,status,is_preview) VALUES(?,'document',?,?,'published',1)",[step,`第 ${i+1} 章 ${title}｜章节大纲`,`隔离公开大纲 ${i+1}，只用于本地资源测试。`]));
}
const add=(step,type,title,preview=0,status='published')=>insert('INSERT INTO content_items(step_id,type,title,body,status,is_preview) VALUES(?,?,?,?,?,?)',[step,type,title,'隔离私人正文：'+title,status,preview]);
const prompt=add(chapters[1],'prompt','隔离开发 Prompt'),template=add(chapters[0],'template','隔离 PRD 模板'),checklist=add(chapters[2],'checklist','隔离上线检查清单'),code=add(chapters[1],'code','隔离项目源码'),skill=add(chapters[1],'document','隔离 Skill 技能包'),video=add(chapters[2],'video','隔离部署视频');
const draft=add(chapters[0],'document','不能公开的草稿',0,'draft');
run("INSERT INTO entitlements(user_id,pack_id,status,starts_at) VALUES(?,?,'active','2000-01-01')",[owner.id,pack]);
const app=createApp(),client=path.resolve('dist/client');app.use(express.static(client));app.get('/{*route}',(_q,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true}),errors=[],external=[],requests=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const output=path.resolve('artifacts/resource-library');mkdirSync(output,{recursive:true});
const context=async u=>{const c=await browser.newContext({viewport:{width:1700,height:1150},reducedMotion:'reduce'});await c.route('**/*',route=>{const req=route.request();if(!req.url().startsWith(base)){external.push(req.url());return route.abort();}requests.push({url:req.url(),method:req.method()});return route.continue();});if(u)await c.addInitScript(token=>{if(location.protocol==='http:')localStorage.setItem('oneshowlearn_token',token);},u.token);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;};
const ready=async p=>{await p.waitForFunction(()=>!localStorage.getItem('oneshowlearn_token')||document.querySelector('.ws-profile')?.getAttribute('aria-label')?.startsWith('账号菜单：'));await p.waitForFunction(()=>document.querySelectorAll('.rl-page .rd-card').length===3&&document.querySelector('.rd-table tbody tr'));};
const close=async p=>{await p.getByRole('button',{name:'关闭资源窗口',exact:true}).click();await p.locator('.rc-dialog').waitFor({state:'detached'});};
try{
 const c=await context(owner),p=await c.newPage();await p.goto(base+'/resources');await ready(p);
 check(await p.locator('.rd-card').count()===3,'only three real highlights');check(await p.locator('.rd-table tbody tr').count()===5,'page size unchanged');
 check(await p.getByText('不能公开的草稿',{exact:true}).count()===0,'draft not exposed');check(await p.getByRole('heading',{name:'从课程资料开始',exact:true}).isVisible(),'no false recommendation');
 check(await p.locator('.rl-phases button').count()===6,'five phases and reset');check(requests.filter(r=>r.method!=='GET').length===0,'viewing causes no mutation');
 for(const width of [320,390,768,1024,1440,1920,2560]){
  await p.setViewportSize({width,height:1150});await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);
  check(await p.locator('.rd-card').evaluateAll(cards=>cards.every(card=>card.querySelector('.rl-cover').getBoundingClientRect().bottom<=card.querySelector('h3').getBoundingClientRect().top)),'separate sharp cover '+width);
  check(await p.locator('.rd-card footer button,.rl-phases button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),'touch controls '+width);
  check(await p.locator('.rd-table td:last-child button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),'touch table actions '+width);
  if([390,1440,1920].includes(width))await p.screenshot({path:path.join(output,'resource-'+width+'.png'),fullPage:true});
 }
 await p.setViewportSize({width:1700,height:1150});
 await p.getByRole('button',{name:'AI 产品开发',exact:true}).click();await p.getByRole('heading',{name:'筛选结果',exact:true}).waitFor();check(await p.locator('.rd-table tbody tr').count()===4,'phase actual matching resources');
 await p.getByRole('button',{name:'Prompt 模板',exact:true}).click();check(await p.locator('.rd-table tbody tr').count()===1,'combined phase and category');
 await p.getByLabel('搜索资源关键词').fill('隔离 开发');check(await p.locator('.rd-table tbody tr').count()===1,'multi-term search');
 await p.getByRole('button',{name:'搜索',exact:true}).click();check(await p.locator('.rd-catalog').evaluate(el=>document.activeElement===el),'search submits focus catalogue');
 await p.getByLabel('搜索资源关键词').fill('无匹配资源');await p.getByRole('heading',{name:'暂未找到匹配的资源',exact:true}).waitFor();check(await p.getByRole('button',{name:'查看全部资源',exact:true}).isVisible(),'honest empty reset');
 await p.getByRole('button',{name:'查看全部资源',exact:true}).click();await ready(p);
 await p.locator('.rl-more-categories summary').click();await p.locator('.rl-more-categories summary').press('Escape');check(await p.locator('.rl-more-categories').evaluate(el=>!el.open),'more categories Escape');
 await p.locator('.rl-more-categories summary').click();await p.locator('.rl-more-categories').getByRole('button',{name:'视频',exact:true}).click();check(await p.locator('.rd-table tbody tr').count()===1,'extra category remains discoverable');check((await p.locator('.rd-table').innerText()).includes('隔离部署视频'),'actual video record');
 await p.getByRole('button',{name:'清除筛选',exact:true}).click();await ready(p);await p.getByLabel('资源排序').selectOption('newest');check((await p.locator('.rd-table tbody tr').first().innerText()).includes('隔离部署视频'),'latest sort');
 await p.getByLabel('资源排序').selectOption('chapter');await p.getByRole('button',{name:/加载更多/}).click();check(await p.locator('.rd-table tbody tr').count()===11,'pagination all published entries');
 await p.getByRole('button',{name:'打开资源：隔离开发 Prompt',exact:true}).click();await p.locator('.rc-document').waitFor();check((await p.locator('.rc-document').innerText()).includes('隔离私人正文'),'authorized body');
 const download=await Promise.all([p.waitForEvent('download'),p.getByRole('link',{name:'导出文档',exact:true}).click()]);check(download[0].suggestedFilename().endsWith('.md'),'real body exported');
 await p.getByRole('button',{name:'收藏这项资源',exact:true}).click();await p.getByRole('button',{name:'已收藏 · 取消',exact:true}).waitFor();check(JSON.parse(row('SELECT state_json FROM workspace_state WHERE user_id=?',[owner.id]).state_json).resourceFavorites.some(r=>r.id===prompt),'private favorite persisted');
 await p.getByRole('button',{name:'标记为已学习',exact:true}).click();await p.getByRole('button',{name:'已完成学习',exact:true}).waitFor();check(row('SELECT status FROM progress WHERE user_id=? AND content_item_id=?',[owner.id,prompt]).status==='completed','real progress persisted');await close(p);
 await p.locator('.rl-favorites').click();await p.waitForURL(/\/favorites$/);await p.getByText('隔离开发 Prompt',{exact:true}).waitFor();check(true,'existing favorites destination');
 const oc=await context(other),o=await oc.newPage();await o.goto(base+'/resources');await ready(o);await o.getByRole('button',{name:'AI 产品开发',exact:true}).click();await o.getByRole('button',{name:'Prompt 模板',exact:true}).click();check((await o.locator('.rd-table').innerText()).includes('课程专享'),'other user locked');
 await o.getByRole('button',{name:'打开资源：隔离开发 Prompt',exact:true}).click();await o.getByRole('heading',{name:'这项资源需要课程权限',exact:true}).waitFor();check(await o.locator('.rc-document').count()===0,'locked body absent');check(await o.getByRole('link',{name:'导出文档',exact:true}).count()===0,'locked download absent');check(await o.getByRole('button',{name:'已收藏 · 取消',exact:true}).count()===0,'foreign favorites not displayed');await close(o);
 check((await oc.request.get(base+`/api/projects/resource-pack/content/${prompt}`,{headers:{Authorization:'Bearer '+other.token}})).status()===403,'backend body guard');
 const gc=await context(),g=await gc.newPage();await g.goto(base+'/resources');await ready(g);await g.getByRole('button',{name:'打开资源：第 1 章 产品与机会｜章节大纲',exact:true}).click();await g.locator('.rc-document').waitFor();check((await g.locator('.rc-document').innerText()).includes('隔离公开大纲'),'real anonymous preview');await g.getByRole('button',{name:'登录后保存学习进度',exact:true}).click();await g.waitForURL(/\/login$/);check(true,'guest action asks login');
 const ec=await context(),e=await ec.newPage();let fail=true;await ec.route('**/api/resources',route=>fail?route.fulfill({status:503,json:{error:'隔离目录不可用'}}):route.continue());await e.goto(base+'/resources');await e.getByRole('heading',{name:'资源暂时无法加载',exact:true}).waitFor();check(await e.locator('.rd-card').count()===0,'no fixture fallback on failure');fail=false;await e.getByRole('button',{name:'重新加载',exact:true}).click();await ready(e);check(true,'recover load');
 const nc=await context(),n=await nc.newPage();await nc.route('**/api/resources',route=>route.fulfill({json:{items:[]}}));await n.goto(base+'/resources');await n.getByRole('heading',{name:'资源内容正在准备中',exact:true}).waitFor();check(await n.locator('.rd-card').count()===0,'empty catalogue never invented');
 run('UPDATE content_items SET title=? WHERE id=?',['超长真实资源标题用于检查移动端布局'.repeat(8),outlines[0]]);await o.goto(base+'/resources');await ready(o);await o.setViewportSize({width:320,height:844});await o.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);check(true,'long real titles reflow');
 run("UPDATE entitlements SET status='revoked' WHERE user_id=?",[owner.id]);await p.goto(base+'/resources');await ready(p);await p.getByRole('button',{name:'AI 产品开发',exact:true}).click();await p.getByRole('button',{name:'Prompt 模板',exact:true}).click();check((await p.locator('.rd-table').innerText()).includes('课程专享'),'revoked permission refreshed');
 assert.deepEqual(errors,[]);assert.deepEqual(external.filter(url=>!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),[]);
 console.log(`PASS ${checks} isolated resource checks: actual catalogue/phase/type/search/sort, 320–2560px sharp covers, safe previews/private body/export/favorite/progress, owner/guest/revoked/empty/error states; zero script errors or real providers.`);
 if(process.env.RESOURCE_PREVIEW_HOLD==='true'){console.log('Isolated preview: '+base+'/resources');await new Promise(resolve=>process.once('SIGINT',resolve));}
}finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
