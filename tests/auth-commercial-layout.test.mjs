import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completeLogin,safeLoginReturn} from '../src/platforms.js';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('standalone learner authentication uses a balanced bounded two-column layout',()=>{
  const css=source('src/auth-commercial.css');
  assert.match(css,/\.user-auth-page\.auth-commercial\s*\{[^}]*grid-template-columns:[^;]*46(?:%|fr)/);
  assert.match(css,/\.auth-commercial \.auth-polished-card\s*\{[^}]*max-width:460px/);
  assert.doesNotMatch(css,/min-height:960px|grid-template-columns:420px|35\.2%/);
  assert.match(css,/@media\s*\(max-width:960px\)/);
  assert.match(css,/\.user-auth-page\.auth-commercial>\.auth-showcase\s*\{\s*display:none;/);
});

test('commercial brand and secondary registration are explicit without duplicating the footer',()=>{
  const auth=source('src/Auth.jsx');
  assert.match(auth,/className="auth-page-header"/);
  assert.match(auth,/className="auth-page-brand"><BrandIdentity\//);
  assert.match(auth,/data-auth-mode=\{(?:polished\?mode:undefined|mode)\}/);
  assert.match(auth,/!polished&&[\s\S]{0,80}className="auth-brand"/);
  assert.doesNotMatch(auth,/className="auth-column-footer"/);
  assert.match(auth,/没有账号？使用邮箱注册/);
  assert.match(auth,/className="auth-platform-switch"/);
  assert.match(auth,/polished \? "欢迎回来"/);
  assert.match(auth,/polished \? "登录并继续学习"/);
  assert.match(auth,/<details className="auth-platform-options"><summary>管理员入口<\/summary>/);
  assert.match(auth,/presentation === 'commercial' && !isAdmin/);
  assert.match(auth,/if \(!isAdmin\) return <main className="user-auth-page auth-commercial"/);
});

test('right showcase is concise and purely illustrative, with three truthful value points',()=>{
  const showcase=source('src/AuthShowcase.jsx');
  assert.match(showcase,/让每一次学习，/);
  assert.match(showcase,/都离产品更近一步。/);
  for(const title of ['系统课程','实战项目','AI 学习支持'])assert.ok(showcase.includes(title));
  assert.equal((showcase.match(/<WorkspaceIllustration\s*\/>/g)||[]).length,1);
  assert.match(showcase,/role="img" aria-label="学习工作台界面示意"/);
  assert.match(showcase,/产品界面示意/);
  assert.match(source('src/auth-commercial.css'),/\.auth-commercial \.auth-demo-brand \.osl-brand-copy[^}]*text-transform:none/);
  assert.doesNotMatch(showcase,/auth-handwriting|auth-brand-orbit|auth-showcase-footer|onClick|fetch\(|localStorage/);
});

test('existing authentication controls and endpoint contracts remain intact',()=>{
  const auth=source('src/Auth.jsx'),external=source('src/ExternalLogin.jsx');
  for(const endpoint of ['/auth/status','/auth/login','/auth/register/request-code','/auth/register/verify','/auth/password/request-code','/auth/password/reset'])assert.ok(auth.includes(endpoint),endpoint);
  assert.match(auth,/autoComplete=\{mode === "login" \? "current-password" : "new-password"\}/);
  assert.match(auth,/autoComplete="email"/);
  assert.match(auth,/autoComplete="one-time-code"/);
  assert.match(auth,/type="button" className="auth-password-toggle"/);
  assert.match(auth,/aria-pressed=\{showPassword\}/);
  assert.match(auth,/setCountdown\(data.cooldownSeconds \|\| 60\)/);
  assert.match(auth,/disabled=\{busy \|\| blocked/);
  assert.match(auth,/两次输入的密码不一致/);
  assert.match(auth,/new TextEncoder\(\)\.encode\(form.password\).length > 72/);
  assert.match(auth,/capabilities\.unavailable/);
  assert.match(auth,/<ExternalLogin key=\{channel\}/);
  assert.match(external,/capabilities\?\.phoneLoginEnabled/);
  assert.match(external,/\/auth\/phone\/request-code/);
  assert.match(external,/\/auth\/phone\/verify/);
});

test('safe return destinations preserve internal paths and reject cross-origin or privileged destinations',()=>{
  const learner={role:'learner'},admin={role:'admin'};
  assert.equal(safeLoginReturn('/legal/privacy?source=auth#details','user',learner),'/legal/privacy?source=auth#details');
  for(const bad of ['https://example.invalid/','//example.invalid/','/\\example.invalid','/login','/register','/forgot-password','/api/auth/me','/admin','/%2f%2fexample.invalid','/app\n','/%5c%5cexample.invalid'])assert.equal(safeLoginReturn(bad,'user',learner),null,bad);
  assert.equal(safeLoginReturn('/admin/orders','admin',admin),'/admin/orders');
  assert.equal(safeLoginReturn('/app','admin',admin),null);
  const saved=[],visited=[];
  completeLogin({token:'isolated-not-a-real-token',user:learner},{saveToken:t=>saved.push(t),navigate:p=>visited.push(p),returnTo:'//example.invalid/'});
  assert.deepEqual(saved,['isolated-not-a-real-token']);assert.deepEqual(visited,['/app']);
});

test('new acceptance is self-contained and cannot connect to a production backend or provider',()=>{
  const script=source('scripts/check-auth-commercial-ui.mjs');
  assert.match(script,/app\.listen\(0,'127\.0\.0\.1'\)/);
  assert.match(script,/serviceWorkers:'block'/);
  assert.match(script,/unexpectedApi/);
  assert.match(script,/routedWrites/);
  assert.doesNotMatch(script,/import\([^\n]*server\/|from ['"][^'"\n]*server\//);
  assert.doesNotMatch(script,/process\.env\.[A-Z_]*BASE|route\.fetch\(/);
  assert.ok(source('scripts/run-browser-checks.mjs').includes("'auth-commercial'"));
  for(const file of ['check-auth-commercial-ui.mjs','run-browser-checks.mjs']){
    assert.ok(source('.dockerignore').split('\n').includes('!scripts/'+file));
    assert.ok(source('Dockerfile').includes('scripts/'+file));
    assert.ok(source('deploy/portable/manage.mjs').includes("'scripts/"+file+"'"));
  }
});
