// Ephemeral owner/learner JWTs arrive only on stdin. All live traffic is same-origin GET/HEAD.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const sessions=JSON.parse(readFileSync(0,'utf8')),base='https://oneshowlearn.com';
assert.ok(typeof sessions.owner==='string'&&sessions.owner.length>40);
const browser=await chromium.launch({headless:true}),errors=[],writes=[],external=[],failedResponses=[],output=path.resolve('artifacts/commercial-completion/live');mkdirSync(output,{recursive:true});let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
// Full reloads share production's 10-auth-requests/minute IP guard. Pace GETs,
// rather than changing or bypassing that guard for a browser acceptance sweep.
let authQueue=Promise.resolve(),nextAuthAt=0;
function paceAuth(){const task=authQueue.then(async()=>{await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextAuthAt-Date.now())));nextAuthAt=Date.now()+6300;});authQueue=task.catch(()=>{});return task;}
async function context(token){const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.route('**/*',async r=>{const q=r.request();if(!q.url().startsWith(base+'/')){external.push(new URL(q.url()).hostname);return r.abort();}if(!['GET','HEAD'].includes(q.method())){writes.push(new URL(q.url()).pathname);return r.abort();}if(new URL(q.url()).pathname.startsWith('/api/auth/'))await paceAuth();return r.continue();});if(token)await c.addInitScript(t=>{if(location.origin==='https://oneshowlearn.com')localStorage.setItem('oneshowlearn_token',t);},token);c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failedResponses.push({path:new URL(r.url()).pathname,status:r.status(),authenticated:Boolean(token)});});});return c;}
try{
 const admin=await context(sessions.owner),page=await admin.newPage();
 const pages=[['/admin/analytics','经营与体验监测'],['/admin/parsing','资料自动解析'],['/admin/certificates','课程结业证书']];
 for(const width of [320,390,768,1440,1920])for(const [route,title] of pages){await page.setViewportSize({width,height:1100});await page.goto(base+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.ca-page p[role=status]'));check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'responsive '+route);check(await page.getByRole('alert').count()===0,'no admin read error '+route);if([390,1440].includes(width))await page.screenshot({path:path.join(output,route.split('/').at(-1)+'-'+width+'.png'),fullPage:true});}
 await page.goto(base+'/admin/parsing');await page.getByText('服务器密钥：已配置',{exact:false}).waitFor();check((await page.locator('.ca-switch').innerText()).includes('已暂停'),'parser explicitly off');check(await page.getByRole('button',{name:'开始解析',exact:true}).isDisabled(),'no implicit submission');
 await page.goto(base+'/admin/analytics');await page.getByRole('heading',{name:'新注册学员转化'}).waitFor();check((await page.locator('.ca-switch').innerText()).includes('已暂停'),'telemetry explicitly off');
 await page.goto(base+'/admin/certificates');await page.getByRole('heading',{name:'发证课程与目录'}).waitFor();check(await page.getByText('暂无颁发记录，完成全部正式课时后自动发放。',{exact:true}).count()===1,'no initial production certificate');
 if(sessions.learner){const learner=await context(sessions.learner),p=await learner.newPage();for(const width of [390,1440]){await p.setViewportSize({width,height:1000});await p.goto(base+'/achievements');await p.getByRole('heading',{name:'我的课程结业证书'}).waitFor();await p.waitForFunction(()=>!document.querySelector('.ca-certificates p[role=status]'));check(await p.locator('.ca-certificates [role=alert]').count()===0,'private learner read succeeds');check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'learner responsive');await p.locator('.ca-certificates').screenshot({path:path.join(output,'learner-certificate-'+width+'.png')});}await learner.close();}
 const guest=await context(),g=await guest.newPage();for(const [route] of pages){await g.goto(base+route);await g.getByRole('heading',{name:'登录管理平台',exact:true}).waitFor();check(await g.locator('.ca-page').count()===0,'anonymous admin gate');}
 await g.goto(base+'/course-offer');await g.locator('.co-price').waitFor();check((await g.locator('.co-price').innerText()).includes('499'),'authoritative unchanged offer');
 check(errors.length===0,'no script exceptions');check(writes.length===0,'no attempted writes');check(external.length===0,'no external/provider traffic');
 check(!failedResponses.some(r=>r.authenticated||r.status===429||r.status>=500),'no authenticated or infrastructure read failure');
 console.log(JSON.stringify({checks,browserErrors:errors.length,writeRequests:writes.length,externalRequests:external.length,screenshots:output}));
 await guest.close();await admin.close();
}catch(e){for(const [i,c] of browser.contexts().entries())for(const [j,p] of c.pages().entries())await p.screenshot({path:path.join(output,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});console.error(JSON.stringify({completedChecks:checks,failedResponses,browserErrors:errors.length}));throw e;}finally{await browser.close();}
