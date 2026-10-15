// Disposable localhost account/catalogue only. Every browser/server write and
// every off-origin request is rejected; no live identities or providers exist.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';

const {chromium}=createRequire(import.meta.url)('playwright');
const dir=mkdtempSync(path.join(tmpdir(),'osl-sidebar-ui-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-sidebar-layout-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:'',MINERU_API_TOKEN:'',PAYMENT_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)});
const {db,row,run}=await import('../server/db.mjs');
const {signUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const id=Number(run("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('sidebar@example.invalid','unused','侧栏检查学员','learner',1)").lastInsertRowid);
const token=signUser(row('SELECT * FROM users WHERE id=?',[id]));
const state={tasks:[],notes:[],favorites:[],checkIns:[],achievements:[]};
run('INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)',[id,JSON.stringify(state)]);
run('UPDATE commercial_settings SET telemetry_enabled=0 WHERE id=1');
const accountBefore=JSON.stringify(row('SELECT * FROM users WHERE id=?',[id]));
const workspaceBefore=JSON.stringify(row('SELECT * FROM workspace_state WHERE user_id=?',[id]));
const serverWrites=[],browserWrites=[],external=[],errors=[];
const client=path.resolve('dist/client'),app=express();
app.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)){serverWrites.push(req.method+' '+req.path);return res.status(405).end();}next();});
app.use(createApp({publicDocuments:false}));app.use(express.static(client));app.get('/{*route}',(_req,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const out=path.resolve('artifacts/sidebar-refinement');mkdirSync(out,{recursive:true});
const routes=[['工作台','/app'],['学习课程','/opc'],['实战项目','/projects'],['AI 导师','/tutor'],['资源中心','/resources'],['学习社区','/community'],['学习笔记','/notes'],['我的收藏','/favorites'],['我的成果','/achievements'],['设置中心','/account']];
const widths=[320,390,768,960,1024,1180,1440,1920,2560];
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const context=async({preference,blockedStorage=false,...options}={})=>{
  const c=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block',extraHTTPHeaders:{DNT:'1'},...options});
  await c.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base){external.push(request.url());return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){browserWrites.push(request.method()+' '+url.pathname);return route.abort();}
    return route.continue();
  });
  await c.addInitScript(({token,preference,blockedStorage})=>{
    if(location.protocol!=='http:')return;
    localStorage.setItem('oneshowlearn_token',token);
    // Initialize a saved preference once; a reload must test the actual saved result.
    if(!sessionStorage.getItem('sidebar-fixture-ready')){if(preference!==undefined)localStorage.setItem('oneshowlearn.sidebar.v1',JSON.stringify(preference));sessionStorage.setItem('sidebar-fixture-ready','1');}
    if(blockedStorage){const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(key==='oneshowlearn.sidebar.v1')throw Error('isolated preference storage blocked');return originalGet.call(this,key);};Storage.prototype.setItem=function(key,value){if(key==='oneshowlearn.sidebar.v1')throw Error('isolated preference storage blocked');return originalSet.call(this,key,value);};}
  },{token,preference,blockedStorage});
  c.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));return c;
};
const nav=p=>p.getByRole('navigation',{name:'学习工作空间导航'});
const item=(p,label)=>nav(p).getByRole('button',{name:label,exact:true});
const shell=p=>p.locator('.ws-unified-layout');
const sidebar=p=>p.locator('#workspace-sidebar');
const separator=p=>p.getByRole('separator',{name:'调整侧栏宽度'});
const identity=p=>p.getByRole('button',{name:'账号菜单：侧栏检查学员',exact:true});
const ready=async(p,route='/app')=>{await p.goto(base+route);await identity(p).waitFor();await p.locator('.ws-status-error').waitFor({state:'detached'});await p.evaluate(()=>document.fonts.ready);};
const pref=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('oneshowlearn.sidebar.v1')));
const width=async(p,expected,label)=>{await p.waitForFunction(value=>Number(document.querySelector('.ws-unified-layout')?.style.getPropertyValue('--sidebar-width').replace('px',''))===value,expected);equal(await separator(p).getAttribute('aria-valuenow'),String(expected),label+' accessible width');check(Math.abs((await sidebar(p).boundingBox()).width-expected)<1,label+' actual width');};
const fit=async(p,label)=>{check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow '+label);};
const geometry=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};});
const contrast=(foreground,background)=>{
  const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const front=luminance(foreground),back=luminance(background);return (Math.max(front,back)+.05)/(Math.min(front,back)+.05);
};
const typography=async(p,label)=>{
  const values=await nav(p).locator('button').evaluateAll(buttons=>buttons.map(button=>{const s=getComputedStyle(button),icon=button.querySelector('svg'),r=button.getBoundingClientRect(),is=getComputedStyle(icon),text=button.querySelector('span').getBoundingClientRect();return {active:button.hasAttribute('aria-current'),size:s.fontSize,line:s.lineHeight,weight:s.fontWeight,gap:s.gap,radius:s.borderRadius,height:r.height,icon:[is.width,is.height],fits:text.right<=r.right-10,background:s.backgroundColor,color:s.color,transform:s.transform};}));
  equal(values.length,10,'ten navigation destinations '+label);
  check(await nav(p).evaluate(e=>getComputedStyle(e).fontFamily.startsWith('system-ui')),'navigation uses scoped system typeface '+label);
  equal(await sidebar(p).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)','known opaque navigation background '+label);
  check(values.every(v=>contrast(v.color,v.active?v.background:'rgb(255, 255, 255)')>=4.5)&&contrast('rgb(107, 114, 128)','rgb(255, 255, 255)')>=4.5,'menu and caption contrast on actual surfaces '+label);
  for(const [i,v] of values.entries()){
    equal([v.size,v.line,v.weight,v.gap,v.radius],['16px','24px',v.active?'600':'500','12px','10px'],'stable menu typography '+label+' '+i);
    equal(v.icon,['20px','20px'],'restrained icon size '+label+' '+i);
    check(v.height>=48&&v.fits&&v.transform==='none','target and label fit '+label+' '+i);
    if(v.active)equal([v.background,v.color],['rgb(243, 239, 255)','rgb(112, 66, 255)'],'selected tone '+label+' '+i);
  }
  equal(await p.locator('.wb-nav-group>span').evaluateAll(elements=>elements.map(e=>{const s=getComputedStyle(e);return [s.fontSize,s.lineHeight,s.fontWeight,s.color];})),Array(4).fill(['12px','20px','500','rgb(107, 114, 128)']),'muted group caption hierarchy '+label);
};

try{
  const c=await context(),p=await c.newPage();await ready(p);await width(p,248,'new desktop default');
  equal(await pref(p),{mode:'expanded',width:248},'new default is saved without changing the storage key');
  await typography(p,'desktop');await p.screenshot({path:path.join(out,'sidebar-desktop-1440.png'),fullPage:false});
  const stable=await geometry(item(p,'工作台'));await sidebar(p).evaluate(e=>{e.dataset.acceptanceIdentity='same-sidebar';});
  for(const [label,destination] of routes){
    await item(p,label).click();await p.waitForURL(base+destination);equal(await nav(p).locator('[aria-current="page"]').getAttribute('aria-label'),label,'exact selected destination '+destination);
    equal(await geometry(item(p,label)),stable,'selection does not resize menu row '+destination);
    equal(await sidebar(p).getAttribute('data-acceptance-identity'),'same-sidebar','persistent sidebar '+destination);
    check(Math.abs((await sidebar(p).boundingBox()).width-248)<1,'stable sidebar width '+destination);
  }
  await p.getByRole('button',{name:'学习偏好',exact:true}).click();
  const range=p.getByRole('slider',{name:'侧栏展开宽度',exact:true});
  equal([await range.getAttribute('min'),await range.getAttribute('max')],['228','360'],'settings retain full existing width range');
  await range.press('End');await width(p,360,'settings maximum');await range.press('Home');await width(p,228,'settings minimum');
  await p.getByRole('button',{name:'恢复默认偏好',exact:true}).click();await width(p,248,'settings reset uses new default');
  equal(await pref(p),{mode:'expanded',width:248},'settings reset persists expanded default');
  await item(p,'工作台').click();await p.waitForURL(base+'/app');
  const hover=item(p,'资源中心'),before=await geometry(hover);await hover.hover();
  check(await hover.evaluate(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),'restrained hover surface');equal(await geometry(hover),before,'hover never moves or scales a row');
  await hover.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');
  check(await hover.evaluate(e=>e===document.activeElement&&getComputedStyle(e).outlineStyle!=='none'&&parseFloat(getComputedStyle(e).outlineWidth)>=2),'keyboard focus visible');
  equal(await geometry(hover),before,'keyboard focus never shifts layout');
  for(const viewport of widths){
    await p.setViewportSize({width:viewport,height:1100});await p.waitForTimeout(80);await fit(p,String(viewport));
    if(viewport<=1000){await p.getByRole('button',{name:'打开工作空间导航'}).click();check(Math.abs((await sidebar(p).boundingBox()).width-228)<1,'fixed 228px mobile drawer '+viewport);check(await separator(p).count()===0,'no mobile resize handle '+viewport);await typography(p,'drawer '+viewport);await p.getByRole('button',{name:'关闭侧边导航'}).last().click();check(!await sidebar(p).isVisible(),'drawer closes '+viewport);}
    else{check(Math.abs((await sidebar(p).boundingBox()).width-248)<1,'default desktop retained '+viewport);await typography(p,'desktop '+viewport);}
  }
  await p.setViewportSize({width:1440,height:1100});await separator(p).focus();
  for(const [key,expected] of [['Home',228],['ArrowRight',244],['ArrowLeft',228],['End',360],['ArrowRight',360],['Enter',248]]){await p.keyboard.press(key);await width(p,expected,'keyboard '+key);}
  await separator(p).press('Home');await separator(p).dblclick();await width(p,248,'double-click reset');
  const box=await separator(p).boundingBox(),x=box.x+box.width/2,y=box.y+Math.min(200,box.height/2);
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+40,y,{steps:5});await p.mouse.up();await width(p,288,'pointer resize');
  equal(await pref(p),{mode:'expanded',width:288},'pointer release persists actual width');
  await p.reload();await identity(p).waitFor();await width(p,288,'reload retains pointer width');
  await separator(p).press('Enter');
  const cancelBox=await separator(p).boundingBox();await p.mouse.move(cancelBox.x+4,150);await p.mouse.down();await p.mouse.move(cancelBox.x+74,150,{steps:3});
  await separator(p).dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true});await p.mouse.up();await width(p,248,'cancelled pointer restores original');
  await p.getByRole('button',{name:'折叠侧栏为图标',exact:true}).click();equal(await shell(p).getAttribute('data-sidebar'),'icons','collapse uses icon mode');
  check(Math.abs((await sidebar(p).boundingBox()).width-72)<1,'icon rail remains 72px');check(await separator(p).count()===0,'icon rail has no resize handle');
  for(const [label] of routes)check(await item(p,label).getAttribute('title')===label,'icon-mode accessible label '+label);
  await item(p,'学习笔记').focus();await item(p,'学习笔记').press('Enter');await p.waitForURL(base+'/notes');equal(await shell(p).getAttribute('data-sidebar'),'icons','mode survives keyboard navigation');
  await p.getByRole('button',{name:'隐藏侧栏',exact:true}).click();equal(await shell(p).getAttribute('data-sidebar'),'hidden','hide retains mode');check(!await sidebar(p).isVisible(),'hidden rail removed from layout');
  check(await p.getByRole('button',{name:'显示侧栏',exact:true}).evaluate(e=>e===document.activeElement),'hide returns focus to restore action');
  await p.getByRole('button',{name:'显示侧栏',exact:true}).press('Enter');await width(p,248,'keyboard restore');
  await c.close();

  for(const savedWidth of [228,360])for(const mode of ['expanded','icons','hidden']){
    const saved=await context({preference:{mode,width:savedWidth}}),sp=await saved.newPage();await ready(sp);
    equal(await shell(sp).getAttribute('data-sidebar'),mode,'existing mode '+mode+' '+savedWidth);equal(await pref(sp),{mode,width:savedWidth},'existing saved width preserved '+mode+' '+savedWidth);
    if(mode==='expanded')await width(sp,savedWidth,'existing expanded '+savedWidth);
    await sp.setViewportSize({width:390,height:844});await sp.getByRole('button',{name:'打开工作空间导航'}).click();check(Math.abs((await sidebar(sp).boundingBox()).width-228)<1,'saved preference does not widen mobile drawer '+mode+' '+savedWidth);
    await sp.getByRole('button',{name:'关闭侧边导航'}).last().click();await sp.setViewportSize({width:1440,height:1100});
    equal(await pref(sp),{mode,width:savedWidth},'responsive resize never overwrites stored mode/width '+mode+' '+savedWidth);
    if(mode==='expanded')await width(sp,savedWidth,'desktop returns exact saved '+savedWidth);
    else if(mode==='icons')check(Math.abs((await sidebar(sp).boundingBox()).width-72)<1,'saved icon rail restores 72px');
    else check(!await sidebar(sp).isVisible(),'saved hidden rail remains hidden');await saved.close();
  }

  const touchContext=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),touch=await touchContext.newPage();await ready(touch);
  check(await touch.evaluate(()=>matchMedia('(pointer:coarse)').matches),'actual coarse pointer touch context');await touch.getByRole('button',{name:'打开工作空间导航'}).tap();
  await typography(touch,'touch');await touch.screenshot({path:path.join(out,'sidebar-mobile-390.png'),fullPage:false});
  await item(touch,'我的收藏').tap();await touch.waitForURL(base+'/favorites');check(!await sidebar(touch).isVisible(),'touch navigation dismisses drawer');
  await touch.setViewportSize({width:390,height:360});await touch.getByRole('button',{name:'打开工作空间导航'}).tap();await item(touch,'设置中心').scrollIntoViewIfNeeded();
  check(await item(touch,'设置中心').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'last navigation reachable on short touch screen');
  await item(touch,'设置中心').tap();await touch.waitForURL(base+'/account');await fit(touch,'short touch screen');await touchContext.close();

  const reducedContext=await context({reducedMotion:'reduce'}),reduced=await reducedContext.newPage();await ready(reduced);await item(reduced,'资源中心').hover();
  check(await item(reduced,'资源中心').evaluate(e=>getComputedStyle(e).transform==='none'),'reduced motion has no row transform');
  await reduced.setViewportSize({width:390,height:844});await reduced.getByRole('button',{name:'打开工作空间导航'}).click();
  equal(await sidebar(reduced).evaluate(e=>getComputedStyle(e).transitionDuration),'0s','reduced motion removes drawer transition');await reducedContext.close();

  const blocked=await context({blockedStorage:true}),bp=await blocked.newPage();await ready(bp);await width(bp,248,'unavailable storage default');
  await bp.getByRole('button',{name:'折叠侧栏为图标',exact:true}).click();check(Math.abs((await sidebar(bp).boundingBox()).width-72)<1,'storage failure never disables navigation controls');await blocked.close();
  equal(JSON.stringify(row('SELECT * FROM users WHERE id=?',[id])),accountBefore,'isolated account unchanged');
  equal(JSON.stringify(row('SELECT * FROM workspace_state WHERE user_id=?',[id])),workspaceBefore,'isolated private workspace unchanged');
  equal(row('SELECT COUNT(*) n FROM orders').n,0,'no orders created');equal(row('SELECT COUNT(*) n FROM telemetry_events').n,0,'no telemetry records');
  equal(errors,[],'zero script errors');equal(external,[],'zero external/provider requests');equal(browserWrites,[],'zero browser write requests');equal(serverWrites,[],'zero server write requests');
  console.log(`PASS ${checks} isolated sidebar checks: exact typography, ten unchanged routes, persistent shell, 320–2560px, saved 228/360px modes, keyboard/pointer resize/reset/cancel, focus/hover, touch/short screens and reduced motion; zero write/provider operations.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
