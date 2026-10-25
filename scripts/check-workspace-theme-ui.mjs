// Disposable localhost records only. The theme controls must never submit a
// form, mutate account/course records, or contact a provider.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import express from 'express';

const {chromium}=createRequire(import.meta.url)('playwright');
const dir=mkdtempSync(path.join(tmpdir(),'osl-workspace-theme-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'test.db'),UPLOAD_DIR:path.join(dir,'uploads'),JWT_SECRET:'isolated-workspace-theme-only',ASSET_STORAGE:'local',AI_ENABLED:'false',EMAIL_API_KEY:'',MINERU_API_TOKEN:'',PAYMENT_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)});
const {db,row,run}=await import('../server/db.mjs');
const {signUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const insert=(sql,args=[])=>Number(run(sql,args).lastInsertRowid);
const id=insert("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('theme@example.invalid','unused','外观检查学员','learner',1)");
const user=row('SELECT * FROM users WHERE id=?',[id]),token=signUser(user);
const adminId=insert("INSERT INTO users(email,password_hash,name,role,email_verified) VALUES('theme-admin@example.invalid','unused','外观管理检查','admin',1)");
const adminToken=signUser(row('SELECT * FROM users WHERE id=?',[adminId]));
const pathId=insert("INSERT INTO learning_paths(slug,title,status) VALUES('theme-path','隔离外观路径','published')");
const course=insert("INSERT INTO project_packs(path_id,slug,title,status) VALUES(?,'theme-course','隔离外观课程','published')",[pathId]);
run('INSERT INTO learning_entry_settings(id,course_id) VALUES(1,?)',[course]);
const chapter=insert("INSERT INTO project_steps(pack_id,title,summary,status,sort_order) VALUES(?,'第1章 产品与机会','隔离课程说明','published',1)",[course]);
run('INSERT INTO opc_stage_steps(step_id,phase) VALUES(?,1)',[chapter]);
const lesson=insert("INSERT INTO learning_lessons(title,subtitle,config,status) VALUES('外观示例课时','保留真实课程交互，仅检查外观',?,'published')",[JSON.stringify({isDemoMedia:true,slides:[],tasks:[],operations:[]})]);
const placement=insert("INSERT INTO lesson_placements(lesson_id,chapter_id,is_preview,sort_order,status) VALUES(?,?,1,0,'published')",[lesson,chapter]);
run("INSERT INTO entitlements(user_id,pack_id,status,source) VALUES(?,?,'active','isolated_fixture')",[id,course]);
const project=insert("INSERT INTO practice_projects(slug,title,description,category,status) VALUES('theme-project','隔离外观项目','只在临时数据库中展示的项目','saas','published')");
run('INSERT INTO practice_project_courses(project_id,pack_id) VALUES(?,?)',[project,course]);
run("INSERT INTO workspace_state(user_id,state_json) VALUES(?,?)",[id,JSON.stringify({tasks:[],notes:[],favorites:[],checkIns:[],achievements:[]})]);
run('UPDATE commercial_settings SET telemetry_enabled=0 WHERE id=1');
const backend=createApp({publicDocuments:false});
const {profileFor}=await import('../server/account-profile.mjs');profileFor(id);
const accountBefore=JSON.stringify(row('SELECT * FROM users WHERE id=?',[id]));
const stateBefore=JSON.stringify(row('SELECT * FROM workspace_state WHERE user_id=?',[id]));
const protectedBefore=JSON.stringify({entitlements:db.prepare('SELECT * FROM entitlements').all(),products:db.prepare('SELECT * FROM products').all(),settings:db.prepare('SELECT * FROM payment_configuration').all()});
const errors=[],external=[],browserWrites=[],serverWrites=[];
const app=express(),client=path.resolve('dist/client');
app.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)){serverWrites.push(req.method+' '+req.path);return res.status(405).end();}next();});
app.use(backend);app.use(express.static(client));app.get('/{*route}',(_req,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const out=path.resolve('artifacts/workspace-theme');mkdirSync(out,{recursive:true});
const key='oneshowlearn.workspace-theme.v1',sidebarKey='oneshowlearn.sidebar.v1';
const routes=[['工作台','/app','.wd-welcome'],['学习课程','/opc','.cl-lesson-heading'],['实战项目','/projects','.pd-hero'],['AI 导师','/tutor','.tc-heading'],['资源中心','/resources','.rd-heading'],['学习社区','/community','.ce-heading'],['学习笔记','/notes','.ns-heading'],['我的收藏','/favorites','.fs-heading'],['我的成果','/achievements','.ag-heading'],['设置中心','/account','.as-heading']];
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const context=async({theme,blockedStorage=false,admin=false,...options}={})=>{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',extraHTTPHeaders:{DNT:'1'},...options});
  await c.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(req.url());return route.abort();}if(!['GET','HEAD'].includes(req.method())){browserWrites.push(req.method()+' '+url.pathname);return route.abort();}return route.continue();});
  await c.addInitScript(({token,theme,key,sidebarKey,blockedStorage})=>{
    if(location.protocol!=='http:')return;
    localStorage.setItem('oneshowlearn_token',token);
    if(!localStorage.getItem('theme-fixture-initialized')){if(theme!==undefined)localStorage.setItem(key,theme);localStorage.setItem(sidebarKey,JSON.stringify({mode:'expanded',width:300}));localStorage.setItem('osl-playback-rate','1.5');localStorage.setItem('theme-fixture-initialized','1');}
    if(blockedStorage){const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k===key)throw Error('isolated theme storage blocked');return get.call(this,k);};Storage.prototype.setItem=function(k,value){if(k===key)throw Error('isolated theme storage blocked');return set.call(this,k,value);};}
  },{token:admin?adminToken:token,theme,key,sidebarKey,blockedStorage});
  c.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));return c;
};
const shell=p=>p.locator('.ws-unified-layout');
const nav=p=>p.getByRole('navigation',{name:'学习工作空间导航'});
const item=(p,name)=>nav(p).getByRole('button',{name,exact:true});
const settingsTab=(p,name)=>p.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:new RegExp('^'+name)});
const radio=(p,value)=>p.locator(`input[name="workspace-theme"][value="${value}"]`);
const ready=async(p,route='/account')=>{await p.goto(base+route);await p.getByRole('button',{name:'账号菜单：外观检查学员',exact:true}).waitFor();await p.locator('.ws-status-error').waitFor({state:'detached'});await p.evaluate(()=>document.fonts.ready);};
const preferences=async p=>{await settingsTab(p,'学习偏好').click();await p.getByRole('group',{name:'外观模式',exact:true}).waitFor();};
const themeIs=async(p,expected,label)=>{await p.waitForFunction(value=>document.querySelector('.ws-unified-layout')?.dataset.theme===value&&document.documentElement.dataset.workspaceTheme===value,expected);equal(await shell(p).getAttribute('data-theme'),expected,label+' shell');equal(await p.locator('html').getAttribute('data-workspace-theme'),expected,label+' document');equal(await shell(p).evaluate(e=>getComputedStyle(e).colorScheme),expected,label+' native control scheme');};
const luminance=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const colors=locator=>locator.evaluate(element=>{
  const parse=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [n[0],n[1],n[2],n.length>3?n[3]:1];};
  let background=[255,255,255],gradient=false;
  const chain=[];for(let e=element;e;e=e.parentElement)chain.unshift(e);
  for(const e of chain){const s=getComputedStyle(e),c=parse(s.backgroundColor);background=background.map((v,i)=>c[i]*c[3]+v*(1-c[3]));if(c[3]===1)gradient=false;if(s.backgroundImage!=='none')gradient=true;}
  const s=getComputedStyle(element),c=parse(s.color);return {foreground:background.map((v,i)=>c[i]*c[3]+v*(1-c[3])),background,gradient,color:s.color,backgroundColor:s.backgroundColor,text:element.textContent?.trim().slice(0,70)};
});
const contrast=async(locator,label,min=4.5)=>{const value=await colors(locator);check(!value.gradient,label+' has a known solid reading surface');check(ratio(value.foreground,value.background)>=min,label+' contrast '+ratio(value.foreground,value.background).toFixed(2));};
const gradientContrast=async(locator,label)=>{
  const value=await locator.evaluate(element=>{
    const parse=color=>{const n=color.match(/[\d.]+/g).map(Number);return[n[0],n[1],n[2],n.length>3?n[3]:1];};
    let opacity=1,host=null;
    for(let e=element;e;e=e.parentElement){const style=getComputedStyle(e);opacity*=Number(style.opacity);if(style.backgroundImage!=='none'){host=e;break;}}
    return{foreground:parse(getComputedStyle(element).color),opacity,stops:host?[...getComputedStyle(host).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match=>parse(match[0])):[]};
  });
  check(value.stops.length===2&&value.stops.every(c=>c[3]===1),label+' has two known opaque gradient endpoints');
  const alpha=value.foreground[3]*value.opacity;
  for(const [index,stop]of value.stops.entries()){
    const background=stop.slice(0,3),foreground=background.map((v,i)=>value.foreground[i]*alpha+v*(1-alpha));
    check(ratio(foreground,background)>=4.5,label+' endpoint '+index+' contrast '+ratio(foreground,background).toFixed(2));
  }
};
const fit=async(p,label)=>check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow '+label);
const headingSelectors=heading=>[heading==='.pd-hero'?'.pd-catalog .pd-section-heading h2':heading+' h1',heading==='.pd-hero'?'.pd-catalog .pd-section-heading p':heading+' p'];
const lightReadingStyles=async(p,heading)=>{
  // PendingLesson shares the heading selector but is not the real LessonSurface.
  // Wait for the actual fixture branch and its inline directory before sampling.
  const snapshot=await p.waitForFunction(({selectors,course})=>{
    const elements=selectors.map(selector=>document.querySelector(selector));
    if(elements.some(element=>!element?.isConnected||element.ownerDocument!==document))return false;
    if(course){
      const shell=document.querySelector('.ws-unified-layout'),page=shell?.querySelector('.cl-learning-space > .cr-lesson-page');
      const header=page?.querySelector('.cl-lesson-heading:not(.cs-pending-heading)'),title=header?.querySelector('h1'),chapter=header?.querySelector('p'),subtitle=title?.nextElementSibling;
      const navigation=shell?.querySelector('nav[aria-label="学习工作空间导航"]'),directory=page?.querySelector('.cs-directory-slot > .cl-inline-directory');
      if(!page?.isConnected||!header||elements[0]!==title||elements[1]!==chapter||title.textContent.trim()!=='外观示例课时'||!chapter.matches('.cs-chapter-label')||chapter.textContent.trim()!=='第1章 产品与机会'||subtitle?.tagName!=='P'||subtitle.textContent.trim()!=='保留真实课程交互，仅检查外观')return false;
      // Both real and pending course branches explicitly useLearningFocus(false).
      // The final directory is inline, not a portal into the global navigation.
      if(shell.hasAttribute('data-learning-focused')||!navigation||navigation.hidden||shell.querySelector('.ws-learning-directory-slot')||!directory?.isConnected)return false;
      const selected=directory.querySelector('.cl-lesson[aria-current="step"] > span[title]'),expanded=directory.querySelector('.cl-chapter-toggle[aria-expanded="true"] strong');
      if(selected?.getAttribute('title')!=='外观示例课时'||expanded?.textContent.trim()!=='第1章 产品与机会')return false;
      const s=getComputedStyle(page),contentWidth=page.getBoundingClientRect().width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth),compact=contentWidth<=960;
      if(directory.hasAttribute('data-compact')!==compact||directory.open===compact)return false;
    }
    const values=elements.map(element=>{const s=getComputedStyle(element);return{color:s.color,background:s.backgroundColor,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight};});
    return elements.every((element,index)=>element.isConnected&&document.querySelector(selectors[index])===element)&&values.every(value=>Object.values(value).every(part=>typeof part==='string'&&part.trim()!==''))?values:false;
  },{selectors:headingSelectors(heading),course:heading==='.cl-lesson-heading'});
  try{return await snapshot.jsonValue();}finally{await snapshot.dispose();}
};
const routeAppearance=async(p,heading,theme,label)=>{
  await lightReadingStyles(p,heading);await fit(p,label);
  // The project hero sits over actual artwork, not a flat reading panel. Its
  // catalogue heading provides the corresponding known-color reading sample.
  await contrast(p.locator(headingSelectors(heading)[0]).first(),label+' page title');
  // Broad body samples concern the new dark palette. Existing light-page body
  // colors are instead compared byte-for-byte with their pre-switch baseline;
  // this task must not silently redesign unrelated original light typography.
  if(theme==='dark')await contrast(p.locator(headingSelectors(heading)[1]).first(),label+' body description');
  await contrast(nav(p).locator('[aria-current="page"]').first(),label+' selected navigation',7);
  await contrast(nav(p).locator('button:not([aria-current])').first(),label+' normal navigation',7);
  await contrast(p.locator('.wb-nav-group>span').first(),label+' navigation caption',7);
  check(await nav(p).locator('button').evaluateAll(buttons=>buttons.length===10&&buttons.every(button=>{const s=getComputedStyle(button);return s.fontSize==='17px'&&s.lineHeight==='24px'&&s.fontWeight===(button.hasAttribute('aria-current')?'600':'500')&&button.getBoundingClientRect().height>=48;})),label+' larger menu typography in both themes');
  for(const selector of ['#workspace-sidebar','.ws-topbar','.ws-content']){
    const value=await colors(p.locator(selector));check(theme==='dark'?luminance(value.background)<.2:luminance(value.background)>.7,label+' '+selector+' surface follows theme');
  }
  const input=p.locator('.ws-content input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),.ws-content textarea,.ws-content select').filter({visible:true}).first();
  if(await input.count())await contrast(input,label+' form control');
  if(heading==='.cl-lesson-heading'&&theme==='dark'){
    await contrast(p.locator('.cs-directory .cl-chapter-toggle strong').first(),label+' expanded course directory heading');
    await contrast(p.locator('.cs-directory .cl-chapter-toggle small').first(),label+' course directory count');
  }
  if(heading==='.rd-heading'){
    const more=p.locator('.rl-more-categories summary');await contrast(more,label+' category dropdown trigger');await more.click();await p.locator('.rl-more-categories[open]>div>button').first().waitFor();await contrast(p.locator('.rl-more-categories[open]>div>button').first(),label+' open category dropdown');await more.press('Escape');
  }
  if(heading==='.ag-heading')for(const selector of ['.ca-certificates h2','.ca-certificates p','.ca-certificates small'])await contrast(p.locator(selector).first(),label+' certificate panel '+selector);
  if(heading==='.ce-heading'&&theme==='dark')for(const selector of ['.oc-group p','.oc-group>small'])await gradientContrast(p.locator(selector).first(),label+' community panel '+selector);
  check(await shell(p).locator('img,video').evaluateAll(items=>items.every(e=>{const s=getComputedStyle(e);return s.filter==='none'&&s.mixBlendMode==='normal';})),label+' media is not inverted or blended');
};

try{
  const c=await context(),p=await c.newPage();await ready(p);await preferences(p);await themeIs(p,'light','new-browser default');
  equal(await radio(p,'light').isChecked(),true,'native light choice selected');equal(await radio(p,'dark').isChecked(),false,'native dark choice unselected');
  equal(await p.locator('input[name="workspace-theme"]').count(),2,'exactly two requested appearance choices');
  check(await p.getByRole('group',{name:'外观模式',exact:true}).getAttribute('aria-describedby')==='account-theme-help','appearance help is associated');
  const lightBaseline=new Map();for(const[label,destination,heading]of routes){await item(p,label).click();await p.waitForURL(base+destination);await p.locator(heading+' h1').waitFor();lightBaseline.set(destination,await lightReadingStyles(p,heading));}await preferences(p);
  await radio(p,'light').focus();await p.keyboard.press('ArrowRight');await themeIs(p,'dark','native keyboard switches appearance');
  check(await radio(p,'dark').evaluate(e=>e===document.activeElement),'keyboard focus retained on selected radio');
  check(await radio(p,'dark').evaluate(e=>{const s=getComputedStyle(e),label=e.closest('label'),l=getComputedStyle(label);return s.outlineStyle!=='none'||s.boxShadow!=='none'||l.outlineStyle!=='none'||l.boxShadow!=='none';}),'appearance selector has a visible focus treatment');
  equal(await p.evaluate(key=>localStorage.getItem(key),key),'dark','choice persists in dedicated key');
  equal(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),sidebarKey),{mode:'expanded',width:300},'theme choice preserves saved sidebar');
  equal(await p.evaluate(()=>localStorage.getItem('osl-playback-rate')),'1.5','theme choice preserves saved playback rate');
  await p.screenshot({path:path.join(out,'settings-dark-1440.png'),fullPage:true});
  await p.reload();await p.getByRole('button',{name:'账号菜单：外观检查学员',exact:true}).waitFor();await themeIs(p,'dark','reload retains saved choice');
  const second=await c.newPage();await ready(second);await preferences(second);await radio(second,'light').check();await themeIs(p,'light','real storage event updates existing tab');
  await radio(second,'dark').check();await themeIs(p,'dark','second tab dark synchronizes');
  for(const theme of ['dark','light']){
    await radio(second,theme).check();await themeIs(p,theme,'route pass '+theme);
    for(const [label,destination,heading] of routes){await item(p,label).click();await p.waitForURL(base+destination);await themeIs(p,theme,destination+' '+theme);await routeAppearance(p,heading,theme,destination+' '+theme);if(theme==='dark')await p.screenshot({path:path.join(out,destination.slice(1)+'-dark-1440.png'),fullPage:false});else equal(await lightReadingStyles(p,heading),lightBaseline.get(destination),'original light heading/body styles restored exactly '+destination);}
    await preferences(p);await contrast(p.locator('.as-theme-copy strong').first(),theme+' appearance label');await contrast(p.locator('.as-theme-copy>span').first(),theme+' appearance description');
    if(theme==='light')await p.screenshot({path:path.join(out,'settings-light-1440.png'),fullPage:true});
  }
  await settingsTab(p,'个人资料').click();await p.getByLabel('昵称',{exact:true}).fill('未保存的外观昵称');await p.getByLabel('个人简介',{exact:true}).fill('切换外观时保留的个人简介草稿');
  await radio(second,'dark').check();await themeIs(p,'dark','theme update does not remount profile');equal(await p.getByLabel('昵称',{exact:true}).inputValue(),'未保存的外观昵称','profile name draft retained');equal(await p.getByLabel('个人简介',{exact:true}).inputValue(),'切换外观时保留的个人简介草稿','profile description draft retained');
  await settingsTab(p,'登录与安全').click();await p.getByLabel('当前密码',{exact:true}).fill('unsaved-password-fixture');await radio(second,'light').check();await themeIs(p,'light','theme update while password is edited');equal(await p.getByLabel('当前密码',{exact:true}).inputValue(),'unsaved-password-fixture','password draft retained');
  await p.getByRole('button',{name:'清空输入',exact:true}).click();await settingsTab(p,'个人资料').click();await p.getByRole('button',{name:'撤销修改',exact:true}).click();
  await radio(second,'dark').check();await themeIs(p,'dark','dark overlays');await p.locator('.ws-profile').click();await p.locator('.ws-user-menu').waitFor();
  await contrast(p.locator('.ws-user-menu-identity strong'),'dark account menu identity');await contrast(p.locator('.ws-user-menu').getByRole('button',{name:'账号设置',exact:true}),'dark account menu action');
  await p.locator('.ws-user-menu').getByRole('button',{name:'退出登录',exact:true}).click();await p.getByRole('heading',{name:'退出当前浏览器？',exact:true}).waitFor();
  check(await p.locator('dialog[open]').evaluate(e=>e.closest('.ws-unified-layout')!==null),'top-layer dialog remains scoped to workspace theme');await p.screenshot({path:path.join(out,'logout-modal-dark-1440.png'),fullPage:false});await contrast(p.locator('dialog[open] h2'),'dark modal heading');await contrast(p.locator('dialog[open] p'),'dark modal description');await contrast(p.locator('dialog[open]').getByRole('button',{name:'取消',exact:true}),'dark modal cancel');
  await p.getByRole('button',{name:'取消',exact:true}).click();equal(await p.evaluate(()=>Boolean(localStorage.getItem('oneshowlearn_token'))),true,'dismissed preview leaves actual local fixture session intact');
  await item(p,'我的成果').click();await p.waitForURL(base+'/achievements');await p.getByRole('button',{name:'新建成果',exact:true}).click();await p.getByRole('heading',{name:'新建成果',exact:true}).waitFor();await contrast(p.locator('dialog[open] h2'),'dark form modal heading');await contrast(p.locator('.ag-form label').first(),'dark form modal native label');await contrast(p.getByLabel('成果名称',{exact:true}),'dark form modal input');await p.getByRole('button',{name:'取消编辑',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'detached'});
  await item(p,'学习笔记').click();await p.waitForURL(base+'/notes');await p.getByRole('button',{name:'新建笔记',exact:true}).click();await p.getByLabel('笔记标题',{exact:true}).fill('切换外观不丢失笔记');await p.getByLabel('笔记正文',{exact:true}).fill('本地编辑中的笔记正文，不保存到账号。');
  await radio(second,'light').check();await themeIs(p,'light','note editor cross-tab light update');await radio(second,'dark').check();await themeIs(p,'dark','note editor cross-tab dark update');equal(await p.getByLabel('笔记正文',{exact:true}).inputValue(),'本地编辑中的笔记正文，不保存到账号。','personal note body survives both theme changes');equal(await p.getByLabel('笔记标题',{exact:true}).inputValue(),'切换外观不丢失笔记','personal note title survives both theme changes');await contrast(p.getByLabel('笔记正文',{exact:true}),'dark notes editor');
  await p.getByRole('button',{name:'取消编辑',exact:true}).click();await p.getByRole('button',{name:'放弃修改',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'detached'});
  await p.goto(base+`/learn/theme-course/lessons/${placement}`);await p.locator('.cr-lesson-page .cl-video-empty').waitFor();await themeIs(p,'dark','real lesson dark');await fit(p,'real lesson');await contrast(p.locator('.cl-lesson-heading h1'),'dark course heading');await contrast(p.getByLabel('向 AI 提问'),'dark course AI input');
  check(await p.locator('.cl-video-empty').isVisible(),'actual text-only lesson is honest and does not fake playable media');await p.screenshot({path:path.join(out,'lesson-dark-1440.png'),fullPage:true});
  await ready(p);await preferences(p);await radio(p,'dark').check();
  for(const width of [320,390,768,1024,1440,1920,2560]){
    await p.setViewportSize({width,height:900});await p.waitForTimeout(80);await fit(p,'preferences '+width);check(await radio(p,'dark').isVisible()&&await radio(p,'light').isVisible(),'both theme choices visible '+width);
    check(await p.locator('.as-theme-option').evaluateAll(items=>items.every(e=>{const r=e.getBoundingClientRect();return r.width>=100&&r.height>=44;})),'appearance options are usable targets '+width);
    if(width===390)await p.screenshot({path:path.join(out,'settings-dark-390.png'),fullPage:true});
    if(width<=1000){await p.getByRole('button',{name:'打开工作空间导航'}).click();await contrast(nav(p).locator('[aria-current="page"]'),'dark mobile selected menu '+width,7);await contrast(p.locator('.wb-nav-group>span').first(),'dark mobile caption '+width,7);await p.getByRole('button',{name:'关闭侧边导航'}).last().click();}
  }
  await p.setViewportSize({width:390,height:360});await radio(p,'light').check();await themeIs(p,'light','short screen light');await fit(p,'short screen preferences');await radio(p,'dark').check();await themeIs(p,'dark','short screen dark');
  await p.setViewportSize({width:1440,height:1000});await p.getByRole('button',{name:'恢复默认偏好',exact:true}).click();await themeIs(p,'light','reset restores light explicitly');equal(await p.evaluate(key=>localStorage.getItem(key),key),'light','reset stores light');equal(await p.getByLabel('默认播放速度',{exact:true}).inputValue(),'1','existing playback reset retained');equal(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),sidebarKey),{mode:'expanded',width:248},'existing sidebar default retained');
  await radio(p,'dark').check();await p.locator('.ws-profile').click();await p.locator('.ws-user-menu').getByRole('button',{name:'返回官网',exact:true}).click();await p.waitForURL(base+'/');await p.locator('.sales-page').waitFor();
  equal(await p.locator('html').getAttribute('data-workspace-theme'),null,'SPA workspace exit removes document theme');check(await p.locator('body').evaluate(e=>getComputedStyle(e).colorScheme!=='dark'),'marketing native controls remain light');
  await radio(second,'light').check();await p.evaluate(()=>{window.__themeFirstWorkspaceMount=null;const observer=new MutationObserver(()=>{const shell=document.querySelector('.ws-unified-layout');if(shell){window.__themeFirstWorkspaceMount=shell.dataset.theme;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});});
  await p.goBack();await themeIs(p,'light','SPA re-entry reads a change made while workspace was unmounted');equal(await p.evaluate(()=>window.__themeFirstWorkspaceMount),'light','first mounted workspace DOM uses the current cross-tab preference');
  await radio(second,'dark').check();await themeIs(p,'dark','re-entered workspace still synchronizes');await p.locator('.ws-profile').click();await p.locator('.ws-user-menu').getByRole('button',{name:'返回官网',exact:true}).click();await p.waitForURL(base+'/');equal(await p.locator('html').getAttribute('data-workspace-theme'),null,'second SPA exit also cleans native scope');
  for(const destination of ['/login','/register','/admin/login']){await p.goto(base+destination);await p.locator('input').first().waitFor();equal(await p.locator('html').getAttribute('data-workspace-theme'),null,destination+' never installs workspace scope');check(await shell(p).count()===0,destination+' never receives workspace wrapper');check(await p.locator('body').evaluate(e=>getComputedStyle(e).colorScheme!=='dark'),destination+' native controls remain light');}
  await ready(p);await themeIs(p,'dark','re-enter workspace restores preference after public routes');await c.close();
  const adminContext=await context({theme:'dark',admin:true}),admin=await adminContext.newPage();await admin.goto(base+'/admin');await admin.locator('.admin-layout .admin-page-head h1').waitFor();equal(await admin.locator('html').getAttribute('data-workspace-theme'),null,'real management platform ignores learner theme preference');check(await admin.locator('.ws-unified-layout').count()===0,'real management platform has no learner wrapper');check(luminance((await colors(admin.locator('.admin-content'))).background)>.7,'management platform keeps its original light surface');await adminContext.close();
  const touchContext=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),touch=await touchContext.newPage();await ready(touch);await preferences(touch);
  check(await touch.evaluate(()=>matchMedia('(pointer:coarse)').matches),'actual mobile coarse-pointer context');await touch.locator('.as-theme-option').filter({has:radio(touch,'dark')}).getByText('深色',{exact:true}).tap();await themeIs(touch,'dark','whole appearance label is a touch target');await fit(touch,'actual touch preferences');await touch.screenshot({path:path.join(out,'settings-dark-touch-390.png'),fullPage:true});
  await touch.getByRole('button',{name:'打开工作空间导航'}).tap();await item(touch,'我的收藏').tap();await touch.waitForURL(base+'/favorites');await themeIs(touch,'dark','touch navigation preserves theme');check(!await touch.locator('#workspace-sidebar').isVisible(),'touch route closes drawer normally');await touchContext.close();
  const invalid=await context({theme:'sepia'}),ip=await invalid.newPage();await ready(ip);await themeIs(ip,'light','invalid stored value safely falls back to light');await invalid.close();
  const blocked=await context({blockedStorage:true}),bp=await blocked.newPage();await ready(bp);await preferences(bp);await themeIs(bp,'light','blocked storage defaults to light');await radio(bp,'dark').check();await themeIs(bp,'dark','blocked storage still allows immediate in-memory dark');check((await bp.locator('.as-theme-status').innerText()).includes('未允许保存'),'blocked storage status never claims persistence');await item(bp,'工作台').click();await bp.waitForURL(base+'/app');await themeIs(bp,'dark','memory-only choice survives workspace navigation');await blocked.close();
  equal(JSON.stringify(row('SELECT * FROM users WHERE id=?',[id])),accountBefore,'fixture account is unchanged');equal(JSON.stringify(row('SELECT * FROM workspace_state WHERE user_id=?',[id])),stateBefore,'private workspace remains unchanged');equal(JSON.stringify({entitlements:db.prepare('SELECT * FROM entitlements').all(),products:db.prepare('SELECT * FROM products').all(),settings:db.prepare('SELECT * FROM payment_configuration').all()}),protectedBefore,'entitlement/product/payment fixture settings unchanged');
  equal(row('SELECT COUNT(*) n FROM orders').n,0,'no orders created');equal(row('SELECT COUNT(*) n FROM telemetry_events').n,0,'no telemetry created');equal(errors,[],'zero browser script errors');equal(external,[],'zero external/provider requests');equal(browserWrites,[],'zero browser API writes');equal(serverWrites,[],'zero server write attempts');
  console.log(`PASS ${checks} isolated workspace-theme checks: two native accessible modes, ten routes/real lesson, solid-surface contrast, responsive 320–2560px, actual cross-tab/reload persistence, unchanged sidebar/playback and private drafts, scoped menus/dialogs, clean public/auth/admin exits and storage failure; zero writes/providers.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
