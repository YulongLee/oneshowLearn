// Static localhost only. All authentication traffic is fulfilled in memory;
// this script never imports an application backend, database or mail/SMS provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import express from 'express';

const {chromium}=createRequire(import.meta.url)('playwright');
const app=express(),client=path.resolve('dist/client'),out=path.resolve('artifacts/auth-commercial');
const serverRequests=[],external=[],unexpectedApi=[],routedWrites=[],errors=[];
app.use((req,res,next)=>{serverRequests.push({method:req.method,path:req.path});if(req.path.startsWith('/api/')||!['GET','HEAD'].includes(req.method))return res.status(503).json({error:'No backend is attached to this isolated acceptance'});next();});
app.use(express.static(client));app.get('/{*route}',(_req,res)=>res.sendFile(path.join(client,'index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});mkdirSync(out,{recursive:true});
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS '+label);};
const equal=(value,expected,label)=>{assert.deepEqual(value,expected,label);checks++;console.log('PASS '+label);};
const widths=[320,390,768,960,1024,1180,1440,1920,2560];
const capabilityDefaults={registrationEnabled:true,passwordResetEnabled:true,phoneLoginEnabled:false,wechatLoginEnabled:false,externalRegistrationEnabled:true,deliveryMode:'email'};
const testUser={id:717,name:'隔离界面检查',email:'auth-layout@example.invalid',role:'learner'};
const payloads=[];
const makeContext=async({capabilities={},statusFailure=false,...options}={})=>{
  const state={capabilities:{...capabilityDefaults,...capabilities},statusFailure,loginError:'隔离检查：邮箱或密码不匹配',loginSuccess:false,holdLogin:null,registrationError:null};
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',...options});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base){external.push(request.url());return route.abort();}
    if(!url.pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(request.method())){unexpectedApi.push({url:request.url(),method:request.method()});return route.abort();}
      return route.continue();
    }
    const method=request.method(),endpoint=url.pathname;
    const respond=(json,status=200)=>route.fulfill({status,json});
    if(method==='GET'&&endpoint==='/api/auth/status')return state.statusFailure?respond({error:'隔离服务状态不可用'},503):respond(state.capabilities);
    if(method==='GET'&&endpoint==='/api/telemetry/config')return respond({enabled:false,retentionDays:90});
    if(method==='GET'&&endpoint==='/api/service/public')return respond({settings:{operatorName:'',supportEmail:'',updatedAt:null}});
    const allowed=['/api/auth/login','/api/auth/register/request-code','/api/auth/register/verify','/api/auth/password/request-code','/api/auth/password/reset','/api/auth/phone/request-code','/api/auth/phone/verify'];
    if(method!=='POST'||!allowed.includes(endpoint)){unexpectedApi.push({endpoint,method});return respond({error:'Unexpected isolated API endpoint'},503);}
    const body=request.postDataJSON();routedWrites.push({endpoint,method});payloads.push({endpoint,body});
    if(endpoint==='/api/auth/login'){
      if(state.holdLogin)await state.holdLogin;
      return state.loginSuccess?respond({token:'isolated-ui-token-not-real',user:testUser}):respond({error:state.loginError},401);
    }
    if(endpoint==='/api/auth/register/request-code')return state.registrationError?respond({error:state.registrationError},429):respond({cooldownSeconds:3,message:'隔离验证码已准备好，不发送真实邮件。'});
    if(endpoint==='/api/auth/register/verify')return respond({error:'隔离检查：验证码不正确'},400);
    if(endpoint==='/api/auth/password/request-code')return respond({cooldownSeconds:3,message:'隔离重置验证码已准备好，不发送真实邮件。'});
    if(endpoint==='/api/auth/password/reset')return respond({ok:true});
    if(endpoint==='/api/auth/phone/request-code')return respond({challengeId:'isolated-phone-challenge',cooldownSeconds:3,message:'隔离短信验证码已准备好，不发送真实短信。'});
    return respond({error:'隔离检查：手机验证码不正确'},400);
  });
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  return {context,state};
};
const card=page=>page.locator('.auth-polished-card');
const mode=async(page,name)=>{await page.locator(`.auth-polished-card[data-auth-mode="${name}"]`).waitFor();};
const ready=async(page,route='/login')=>{await page.goto(base+route);await card(page).waitFor();await page.evaluate(()=>document.fonts.ready);await page.locator('.auth-page-header .osl-brand-wordmark').waitFor();};
const submit=page=>card(page).locator('form .auth-submit');
const snapshot=async(page,name)=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
const brandGeometry=locator=>locator.evaluate(element=>{
  const symbol=element.querySelector('.osl-brand-symbol'),copy=element.querySelector('.osl-brand-copy');
  if(!symbol||!copy)return false;
  const icon=symbol.getBoundingClientRect(),text=copy.getBoundingClientRect(),box=element.getBoundingClientRect();
  return getComputedStyle(element).display==='flex'&&text.width>0&&icon.width>0&&text.left-icon.right>=0&&text.left-icon.right<=12&&Math.abs((text.top+text.bottom-icon.top-icon.bottom)/2)<=1&&Math.abs(box.left-icon.left)<=1&&Math.abs(box.right-text.right)<=1;
});
// Full-opacity gradient endpoints are conservative bounds for these two simple
// purple controls. Alpha or an unrecognized background fails instead of guessing.
const contrast=locator=>locator.evaluate(element=>{
  const style=getComputedStyle(element),parse=value=>{const parts=value.match(/[\d.]+/g)?.map(Number);return parts&&parts.length>=3?[...parts.slice(0,3),parts[3]??1]:null;};
  const foreground=parse(style.color),matches=style.backgroundImage==='none'?[style.backgroundColor]:(style.backgroundImage.match(/rgba?\([^)]+\)/g)||[]),backgrounds=matches.map(parse);
  if(style.opacity!=='1'||!foreground||foreground[3]!==1||!backgrounds.length||backgrounds.some(color=>!color||color[3]!==1))return 0;
  const luminance=color=>color.slice(0,3).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0),front=luminance(foreground);
  return Math.min(...backgrounds.map(color=>{const back=luminance(color);return (Math.max(front,back)+.05)/(Math.min(front,back)+.05);}));
});
const fit=async(page,label)=>{
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document horizontal overflow '+label);
  check(await card(page).evaluate(element=>{const box=element.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1&&element.scrollWidth<=element.clientWidth+1;}),'form fits '+label);
  check(await card(page).locator('input:visible:not([type=checkbox])').evaluateAll(elements=>elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=16)),'inputs avoid mobile zoom '+label);
};
const reachable=async(page,selector,label)=>{
  const control=page.locator(selector);await control.scrollIntoViewIfNeeded();
  check(await control.evaluate(element=>{const r=element.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;}),label);
};
const fillLogin=async page=>{await card(page).locator('input[type=email]').fill('auth-layout@example.invalid');await page.getByLabel('密码',{exact:true}).fill('IsolatedPassword12');};
const register=async page=>{
  await card(page).locator('.auth-switch').click();await mode(page,'register');
  await page.getByLabel('你的称呼',{exact:true}).fill('隔离学员');await card(page).locator('input[type=email]').fill('auth-layout@example.invalid');
  await page.getByLabel('密码',{exact:true}).fill('IsolatedPassword12');await page.getByLabel('确认密码',{exact:true}).fill('IsolatedPassword12');
};

try{
  const desktop=await makeContext(),page=await desktop.context.newPage();await ready(page);await mode(page,'login');
  equal(await card(page).locator('h1').innerText(),'欢迎回来','learner-facing welcome replaces platform terminology');
  check((await submit(page).innerText()).includes('登录并继续学习'),'primary action describes the learner task');
  check(!await card(page).locator('.auth-platform-switch').isVisible(),'admin switch is secondary, not a competing default action');
  const adminOptions=card(page).locator('.auth-platform-options>summary');await adminOptions.focus();await adminOptions.press('Enter');
  check(await card(page).locator('.auth-platform-switch').isVisible(),'admin entry remains keyboard-discoverable');await adminOptions.press('Enter');
  equal(await page.locator('.auth-page-header .osl-brand-wordmark').count(),1,'one standalone brand in the header');
  equal(await card(page).locator('.auth-brand').count(),0,'standalone card does not repeat brand');
  equal(await page.locator('.auth-showcase .auth-benefits>div').count(),3,'showcase contains exactly three value points');
  equal(await page.locator('.auth-workspace-illustration').count(),1,'one front-facing product illustration');
  check(await page.locator('.auth-demo-caption').innerText().then(text=>text.includes('产品界面示意')),'illustration explicitly identified as product demonstration');
  equal(await page.locator('.auth-handwriting,.auth-brand-orbit,.auth-showcase-footer,.auth-column-footer').count(),0,'no repeated marketing/footer decoration');
  const showcaseText=await page.locator('.auth-showcase-copy h2').innerText();
  check(showcaseText.replace(/\s/g,'').includes('让每一次学习，都离产品更近一步。'),'showcase headline is short and factual');
  equal(await card(page).locator('input[type=email]').getAttribute('autocomplete'),'email','email autocomplete preserved');
  equal(await page.getByLabel('密码',{exact:true}).getAttribute('autocomplete'),'current-password','login password autocomplete preserved');
  check(await card(page).locator('.auth-switch').evaluate(element=>{const style=getComputedStyle(element);return element.getBoundingClientRect().height>=44&&style.borderStyle!=='none'&&parseFloat(style.borderWidth)>=1;}),'registration entry is a clear full-size outlined secondary action');
  check(await submit(page).evaluate(element=>{
    const style=getComputedStyle(element),colors=(style.backgroundImage+' '+style.backgroundColor).match(/rgba?\([^)]+\)/g)||[];
    return colors.some(color=>{const [r,g,b]=color.match(/[\d.]+/g).map(Number);return b>r*1.15&&r>g*1.2&&b-g>45;});
  }),'primary submit uses brand purple rather than black');

  for(const width of widths){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(70);await fit(page,'login '+width);
    check(await brandGeometry(page.locator('.auth-page-brand')),'header icon and wordmark stay tightly grouped on one row '+width);
    check(await contrast(submit(page))>=4.5,'primary CTA text meets 4.5 contrast across all gradient endpoints '+width);
    check(await contrast(card(page).locator('.auth-switch'))>=4.5,'secondary registration text meets 4.5 contrast '+width);
    if(width<=960){check(!await page.locator('.auth-showcase').isVisible(),'single column without promotional panel '+width);}
    else{
      const layout=await page.evaluate(()=>{const left=document.querySelector('.auth-form-column').getBoundingClientRect(),right=document.querySelector('.auth-showcase').getBoundingClientRect(),form=document.querySelector('.auth-polished-card').getBoundingClientRect(),style=getComputedStyle(document.querySelector('.auth-form-column'));return {left:left.width,right:right.width,form:form.width,spaceLeft:form.left-left.left,spaceRight:left.right-form.right,padLeft:parseFloat(style.paddingLeft),padRight:parseFloat(style.paddingRight)};});
      check(Math.abs(layout.left-width*.46)<=1&&Math.abs(layout.right-width*.54)<=1,'balanced 46/54 desktop panels '+width);
      check(layout.form<=460.5&&layout.form>=Math.min(340,width*.46-96),'larger but bounded form '+width);
      check(Math.abs(layout.padLeft-layout.padRight)<=1&&Math.abs(layout.spaceLeft-layout.spaceRight)<=1,'symmetric form whitespace '+width);
      check(await page.locator('.auth-workspace-illustration').evaluate(element=>{const r=element.getBoundingClientRect(),panel=element.closest('.auth-showcase').getBoundingClientRect();return r.left>=panel.left&&r.right<=panel.right&&element.scrollWidth<=element.clientWidth+1;}),'illustration fits its own panel '+width);
      check(await brandGeometry(page.locator('.auth-demo-brand')),'illustrated brand icon and wordmark stay tightly grouped on one row '+width);
    }
    check(await submit(page).evaluate(element=>element.getBoundingClientRect().height>=52),'large primary touch target '+width);
    if([320,390,960,1024,1440,1920,2560].includes(width))await snapshot(page,'login-'+width);
  }
  await page.setViewportSize({width:1440,height:1200});await page.waitForTimeout(70);
  check(await card(page).evaluate(element=>{const box=element.getBoundingClientRect();return box.top>160&&Math.abs((box.top+box.bottom)/2-innerHeight/2)<85;}),'login card is visually centered on tall desktop');
  await snapshot(page,'login-1440-tall');

  // The same semantic controls continue to work with an actual keyboard.
  await fillLogin(page);await page.getByRole('button',{name:'显示密码',exact:true}).focus();await page.keyboard.press('Space');
  equal(await page.getByLabel('密码',{exact:true}).getAttribute('type'),'text','password revealed by a non-submitting keyboard control');
  check(await page.getByRole('button',{name:'隐藏密码',exact:true}).getAttribute('aria-pressed')==='true','visibility control exposes pressed state');
  await page.keyboard.press('Space');equal(await page.getByLabel('密码',{exact:true}).getAttribute('type'),'password','password can be hidden again');
  const signup=card(page).locator('.auth-switch');await signup.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  check(await signup.evaluate(element=>element===document.activeElement&&element.matches(':focus-visible')&&getComputedStyle(element).outlineStyle!=='none'),'keyboard registration has a visible focus indicator');
  let release;desktop.state.holdLogin=new Promise(resolve=>release=resolve);
  await submit(page).click();await page.waitForFunction(()=>document.querySelector('.auth-polished-card form .auth-submit')?.disabled);
  check(await submit(page).isDisabled()&&await card(page).locator('.auth-switch').isDisabled(),'pending login disables submit and signup');
  check(await page.getByRole('button',{name:'邮箱登录',exact:true}).isDisabled()&&await page.getByRole('button',{name:'手机验证码登录',exact:true}).isDisabled(),'pending login disables method switching');
  check((await submit(page).innerText()).includes('请稍候'),'pending state remains truthful');release();desktop.state.holdLogin=null;
  await page.getByRole('alert').getByText(desktop.state.loginError,{exact:true}).waitFor();check(!await submit(page).isDisabled(),'failed login restores submit');
  equal(await page.getByLabel('密码',{exact:true}).inputValue(),'IsolatedPassword12','failed login preserves entered password');

  desktop.state.loginError='隔离超长错误说明：'+('账号验证暂时失败，请确认输入并稍后重试。').repeat(35)+'x'.repeat(240);
  await page.setViewportSize({width:320,height:568});await submit(page).click();await page.getByRole('alert').getByText(desktop.state.loginError,{exact:true}).waitFor();await fit(page,'long server error at 320');
  await reachable(page,'.auth-polished-card .auth-switch','registration remains reachable below a very long error');
  await snapshot(page,'login-320-long-error');
  await page.setViewportSize({width:1440,height:520});await page.reload();await card(page).waitFor();await mode(page,'login');
  check(await page.locator('.auth-page-header').evaluate(element=>element.getBoundingClientRect().top>=0),'short desktop never clips header above document');
  await reachable(page,'.auth-polished-card .auth-switch','short desktop can scroll to registration');await snapshot(page,'login-1440-short');

  await ready(page);await register(page);
  equal(await page.getByLabel('你的称呼',{exact:true}).getAttribute('autocomplete'),'nickname','registration nickname autocomplete preserved');
  equal(await page.getByLabel('密码',{exact:true}).getAttribute('autocomplete'),'new-password','registration uses new-password autocomplete');
  for(const width of widths){await page.setViewportSize({width,height:844});await page.waitForTimeout(60);await fit(page,'register '+width);if([320,390,1440].includes(width))await snapshot(page,'register-'+width);}
  await page.setViewportSize({width:390,height:568});await page.evaluate(()=>scrollTo(0,0));
  check(await card(page).evaluate(element=>element.getBoundingClientRect().top>=0),'registration content begins in document on short mobile');
  await reachable(page,'.auth-polished-card .auth-submit','registration submit reachable on short mobile');
  const registrationsBefore=routedWrites.filter(item=>item.endpoint==='/api/auth/register/request-code').length;
  await page.getByLabel('确认密码',{exact:true}).fill('DifferentPassword12');await submit(page).click();
  await page.getByRole('alert').getByText('两次输入的密码不一致',{exact:true}).waitFor();
  equal(routedWrites.filter(item=>item.endpoint==='/api/auth/register/request-code').length,registrationsBefore,'password mismatch is rejected before any mocked request');
  const multibyte='学'.repeat(25);await page.getByLabel('密码',{exact:true}).fill(multibyte);await page.getByLabel('确认密码',{exact:true}).fill(multibyte);await submit(page).click();
  await page.getByRole('alert').getByText('密码不能超过 72 字节（中文字符占多个字节）',{exact:true}).waitFor();
  equal(routedWrites.filter(item=>item.endpoint==='/api/auth/register/request-code').length,registrationsBefore,'72-byte password guard remains before request');
  await page.getByLabel('密码',{exact:true}).fill('IsolatedPassword12');await page.getByLabel('确认密码',{exact:true}).fill('IsolatedPassword12');await submit(page).click();await mode(page,'verify');
  const code=card(page).locator('input[autocomplete="one-time-code"]');
  check(await code.evaluate(element=>element===document.activeElement),'registration verification automatically focuses one-time code');
  equal(await code.getAttribute('inputmode'),'numeric','email verification retains numeric input mode');
  await code.fill('a1b2c3');equal(await code.inputValue(),'123','email verification strips non-digits');
  check(await card(page).getByRole('button',{name:/秒后可重发/}).isDisabled(),'registration resend honors server cooldown');
  await fit(page,'verification mobile');await snapshot(page,'verify-390');
  await card(page).getByRole('button',{name:'重新发送验证码',exact:true}).waitFor({state:'visible',timeout:6000});
  await card(page).getByRole('button',{name:'重新发送验证码',exact:true}).click();check(await card(page).getByRole('button',{name:/秒后可重发/}).isDisabled(),'resend restores server cooldown');
  await code.fill('123456');await submit(page).click();await page.getByRole('alert').getByText('隔离检查：验证码不正确',{exact:true}).waitFor();check(await code.inputValue()==='123456','verification failure retains entered code');
  await card(page).getByRole('button',{name:'修改邮箱',exact:true}).click();await mode(page,'register');check(await card(page).locator('input[type=email]').inputValue()==='auth-layout@example.invalid','modify email returns to retained registration details');

  await ready(page,'/forgot-password');await mode(page,'forgot');
  equal(await card(page).locator('input').count(),1,'forgot mode asks only for email');
  await card(page).locator('input[type=email]').fill('auth-layout@example.invalid');await snapshot(page,'forgot-390');await submit(page).click();await mode(page,'reset');
  check(await page.getByLabel('新密码',{exact:true}).inputValue()===''&&await page.getByLabel('确认密码',{exact:true}).inputValue()==='','reset begins with cleared password fields');
  equal(await page.getByLabel('新密码',{exact:true}).getAttribute('autocomplete'),'new-password','reset retains secure autocomplete');
  await page.getByLabel('新密码',{exact:true}).fill('ReplacementPassword12');await page.getByLabel('确认密码',{exact:true}).fill('ReplacementPassword12');await card(page).locator('input[autocomplete="one-time-code"]').fill('123456');
  await fit(page,'reset mobile');await snapshot(page,'reset-390');await page.evaluate(()=>localStorage.setItem('oneshowlearn_token','isolated-stale-reset-token'));await submit(page).click();await mode(page,'login');
  await card(page).getByRole('status').getByText('密码已更新，所有设备已退出。请使用新密码登录。',{exact:true}).waitFor();
  check(!await page.evaluate(()=>localStorage.getItem('oneshowlearn_token')),'reset clears any browser session');
  equal(await page.getByLabel('密码',{exact:true}).inputValue(),'','reset clears password after success');

  await ready(page);await page.getByRole('button',{name:'手机验证码登录',exact:true}).click();
  await page.getByRole('status').getByText('手机号登录暂未开放',{exact:true}).waitFor();
  equal(await card(page).locator('input[type=tel]').count(),0,'disabled capability never invents a phone form');
  await snapshot(page,'phone-unavailable-390');await page.getByRole('button',{name:'邮箱登录',exact:true}).click();check(await page.getByLabel('密码',{exact:true}).isVisible(),'email remains available when SMS is disabled');

  const unavailable=await makeContext({statusFailure:true}),offline=await unavailable.context.newPage();await ready(offline,'/register');
  await card(offline).getByRole('status').getByText('暂时无法连接账号服务，请刷新重试。',{exact:true}).waitFor();check(await submit(offline).isDisabled(),'capability failure honestly disables registration');
  await unavailable.context.close();
  const closed=await makeContext({capabilities:{registrationEnabled:false,passwordResetEnabled:false}}),cp=await closed.context.newPage();await ready(cp,'/register');
  await card(cp).getByRole('status').getByText('邮箱服务暂未开放，请稍后再试或联系管理员。',{exact:true}).waitFor();
  check(await submit(cp).isDisabled(),'registration respects disabled service capability');await ready(cp,'/forgot-password');
  await card(cp).getByRole('status').getByText('邮箱服务暂未开放，请稍后再试或联系管理员。',{exact:true}).waitFor();
  check(await submit(cp).isDisabled(),'reset respects disabled service capability');await closed.context.close();

  const phone=await makeContext({capabilities:{phoneLoginEnabled:true},viewport:{width:390,height:844},hasTouch:true,isMobile:true}),touch=await phone.context.newPage();await ready(touch);
  check(await touch.evaluate(()=>matchMedia('(pointer:coarse)').matches),'touch acceptance uses actual coarse pointer');
  await touch.getByRole('button',{name:'手机验证码登录',exact:true}).tap();const tel=card(touch).locator('input[type=tel]');await tel.waitFor();
  equal(await tel.getAttribute('autocomplete'),'tel-national','phone autocomplete retained');await tel.fill('13800000000');
  await card(touch).getByRole('button',{name:'获取验证码',exact:true}).tap();check(await card(touch).getByRole('button',{name:/s 后重发/}).isDisabled(),'phone cooldown respects mocked provider response');
  await card(touch).locator('input[autocomplete="one-time-code"]').fill('123456');await submit(touch).tap();await touch.getByRole('alert').getByText('隔离检查：手机验证码不正确',{exact:true}).waitFor();
  await fit(touch,'phone touch');await snapshot(touch,'phone-touch-390');
  await touch.getByRole('button',{name:'邮箱登录',exact:true}).tap();await card(touch).locator('.auth-switch').tap();await mode(touch,'register');check(true,'touch registration entry works');await phone.context.close();

  // Successful login verifies the real safe destination handler without mounting
  // a private workspace. This destination is a public local legal route.
  const success=await makeContext(),sp=await success.context.newPage();success.state.loginSuccess=true;
  await ready(sp,'/login?returnTo='+encodeURIComponent('/legal/privacy?source=auth#details'));await fillLogin(sp);await submit(sp).click();
  await sp.waitForURL(base+'/legal/privacy?source=auth#details');check(true,'successful login preserves a safe internal returnTo');
  equal(await sp.evaluate(()=>localStorage.getItem('oneshowlearn_token')),'isolated-ui-token-not-real','successful mock login stores only isolated session token');await success.context.close();

  await page.goto(base+'/admin/login');await page.getByRole('heading',{name:'登录管理平台',exact:true}).waitFor();
  equal(await page.locator('.auth-commercial,.auth-showcase,.auth-polished-card,.auth-page-header').count(),0,'management login remains independent from commercial learner styling');
  check(await page.locator('.user-auth-card .auth-brand').isVisible(),'management retains its own brand');
  check(await page.locator('.auth-methods,.auth-password-toggle').count()===0,'management controls remain unchanged');
  await snapshot(page,'admin-390');await desktop.context.close();

  check(payloads.some(item=>item.endpoint==='/api/auth/login'&&item.body.email==='auth-layout@example.invalid'&&item.body.password==='IsolatedPassword12'),'email login contract preserved');
  check(payloads.some(item=>item.endpoint==='/api/auth/register/request-code'&&item.body.name==='隔离学员'&&item.body.password==='IsolatedPassword12'),'registration request contract preserved');
  check(payloads.some(item=>item.endpoint==='/api/auth/password/reset'&&item.body.code==='123456'&&item.body.newPassword==='ReplacementPassword12'),'password reset request contract preserved');
  check(payloads.some(item=>item.endpoint==='/api/auth/phone/verify'&&item.body.challengeId==='isolated-phone-challenge'),'phone challenge verification contract preserved');
  equal(errors,[],'zero browser script errors');equal(external,[],'zero external/provider requests');equal(unexpectedApi,[],'zero unexpected API requests');
  equal(serverRequests.filter(item=>item.path.startsWith('/api/')||!['GET','HEAD'].includes(item.method)),[],'static server receives no backend or write requests');
  check(routedWrites.length>0,'all explicit authentication requests were handled only by isolated in-memory routes');
  console.log(`PASS ${checks} isolated authentication checks: 320–2560px, 46/54 layout, five email modes, capability states, phone, keyboard/touch, short screens, safe returnTo; zero backend/provider requests.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
