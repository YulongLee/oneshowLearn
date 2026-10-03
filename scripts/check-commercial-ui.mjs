// Fresh local fixtures + bundled browser. No production identities or gateways.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire('/Users/liyulong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_audit.cjs');
const {chromium}=require('playwright');
const dir=mkdtempSync(path.join(tmpdir(),'osl-commercial-ui-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-commercial-browser',ADMIN_EMAIL:'owner@example.invalid',ADMIN_PASSWORD:'Isolated-Only-2026',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:''});
const {db,row,run}=await import('../server/db.mjs');
await import('../server/seed.mjs');
const {signUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const aId=Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('learner@example.invalid','unused','学习测试','learner',1)").lastInsertRowid);
run("INSERT INTO orders(order_no,user_id,status,amount_cents) VALUES('BROWSER-PAID',?,'paid',49900)",[aId]);
const learner=signUser(row('SELECT * FROM users WHERE id=?',[aId])),owner=signUser(row("SELECT * FROM users WHERE role='admin' LIMIT 1"));
const app=createApp(),client=path.resolve('dist/client');app.use(express.static(client));app.get('/{*route}',(_q,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const errors=[];let checks=0;
const context=async token=>{const c=await browser.newContext({viewport:{width:1440,height:1000}});await c.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());if(token)await c.addInitScript(t=>{if(location.protocol==='http:')localStorage.setItem('oneshowlearn_token',t);},token);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;};
const overflow=async p=>{await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${p.url()}`);checks++;};
try{
 const guest=await context(),g=await guest.newPage();
 for(const width of [390,768,1440,1920]){await g.setViewportSize({width,height:1000});for(const route of ['/','/course-offer','/login','/legal/terms','/legal/privacy','/legal/purchase','/support','/community']){await g.goto(base+route);await g.waitForTimeout(180);await overflow(g);}}
 await g.goto(base+'/legal/privacy');await g.getByRole('heading',{name:'隐私说明',exact:true}).waitFor();
 await g.goto(base+'/community');await g.getByRole('heading',{name:'登录后，加入学习社区'}).waitFor();checks+=2;
 const ac=await context(learner),a=await ac.newPage();await a.goto(base+'/support');
 await a.getByLabel('问题类别').selectOption('refund');await a.getByLabel(/关联订单/).selectOption({label:'BROWSER-PAID · ¥499 · 已支付'});
 await a.getByLabel('问题标题').fill('浏览器售后测试');await a.getByLabel('详细说明').fill('这是隔离测试。<img src=x onerror=alert(1)> 应当作为文字显示。');
 await a.getByRole('button',{name:'提交申请',exact:true}).click();await a.getByText('申请已提交。',{exact:false}).waitFor();
 await a.getByLabel('补充说明').fill('补充：我的课程权益需要核实。');await a.getByRole('button',{name:'发送补充说明',exact:true}).click();await a.getByText('补充：我的课程权益需要核实。',{exact:true}).waitFor();
 assert.equal(await a.locator('.support-messages img').count(),0);checks+=4;
 const oc=await context(owner),o=await oc.newPage();o.on('dialog',d=>d.accept());await o.goto(base+'/admin/support');
 await o.getByRole('button',{name:/浏览器售后测试/}).click();await o.getByLabel('官方回复').fill('已收到，待人工核实，不代表已退款。');await o.getByLabel('处理状态').selectOption('resolved');await o.getByRole('button',{name:'发送回复并更新状态'}).click();await o.getByText('已收到，待人工核实，不代表已退款。',{exact:true}).waitFor();
 await a.getByRole('button',{name:'刷新',exact:true}).click();await a.getByText('已收到，待人工核实，不代表已退款。',{exact:true}).waitFor();checks+=2;
 await o.goto(base+'/admin/service');await o.getByLabel('运营主体',{exact:true}).fill('隔离浏览器测试主体');await o.getByLabel('客服邮箱',{exact:true}).fill('service@example.invalid');await o.getByRole('button',{name:'保存草稿',exact:true}).click();await o.getByText('草稿已保存，前台仍使用此前发布的说明。').waitFor();
 assert.equal((await (await fetch(base+'/api/service/public')).json()).settings.operatorName,'');
 await o.getByRole('button',{name:'发布说明',exact:true}).click();await o.getByText('服务说明已发布。').waitFor();await g.goto(base+'/legal/terms');await g.getByText('运营主体：隔离浏览器测试主体').waitFor();checks+=3;
 for(const p of [a,o]){for(const width of [390,768,1440]){await p.setViewportSize({width,height:1000});await overflow(p);}}
 for(const route of ['/admin/learning','/admin/assets','/admin/payments','/admin/login-settings','/admin/ai','/admin/community','/admin/pages']){await o.goto(base+route);await o.waitForTimeout(300);assert.equal(await o.getByText('正在加载管理页面…').count(),0);await overflow(o);}
 assert.equal(row('SELECT status FROM orders WHERE order_no=?',['BROWSER-PAID']).status,'paid');
 assert.deepEqual(errors,[]);console.log(`PASS ${checks} browser checks: private support, manual response, publication, lazy admin loading, guest paths, 390–1920px; zero script errors.`);
}finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
