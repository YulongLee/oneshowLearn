import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('product preview stays upright and bounded instead of stretching outside the panel',()=>{
  const css=source('auth-commercial.css');
  assert.match(css,/\.auth-demo-window \{ width:100%;[^}]*transform:none;/);
  assert.match(css,/\.auth-workspace-illustration \{[^}]*width:100%;[^}]*min-width:0;[^}]*flex:none;/);
  assert.doesNotMatch(css,/perspective\(|rotate[XYZ]\(/);
  assert.doesNotMatch(css,/\.auth-demo-window\s*\{[^}]*calc\(100%\s*\+/);
  assert.doesNotMatch(css,/\.auth-workspace-illustration\s*\{[^}]*margin-left:-/);
});

test('learner login opts into the reference while management and embedded login keep default presentation',()=>{
  const code=source('Auth.jsx');
  assert.match(code,/presentation = "default"/);
  assert.match(code,/presentation === 'commercial' && !isAdmin/);
  assert.match(code,/if \(!isAdmin\) return <main className="user-auth-page auth-commercial"/);
  assert.match(code,/onSuccess, navigate \}\)/);
  assert.match(code,/onPlatformSwitch=\{\(\)=>navigate\(getPlatform\('admin'\).login\)\}/);
});

test('password visibility is a non-submitting accessible control and does not replace credential validation',()=>{
  const code=source('Auth.jsx');
  assert.match(code,/type=\{showPassword\?'text':'password'\}/);
  assert.match(code,/type="button" className="auth-password-toggle"/);
  assert.match(code,/aria-pressed=\{showPassword\}/);
  assert.match(code,/autoComplete=\{mode === "login" \? "current-password" : "new-password"\}/);
  assert.match(code,/setShowPassword\(false\)/);
  for(const path of ['/auth/login','/auth/register/verify','/auth/password/reset'])assert.ok(code.includes(path));
  assert.match(code,/<ExternalLogin key=\{channel\}/);
});

test('login showcase is clearly illustrative and contains no fictional accounts or provider sign-in',()=>{
  const code=source('AuthShowcase.jsx');
  assert.match(code,/产品界面示意/);
  assert.match(code,/不代表真实账号数据/);
  assert.doesNotMatch(code,/10,000|60\+|100\+|42%|GitHub|Google|Apple|onClick|localStorage|fetch\(/);
  const css=source('auth-commercial.css');
  assert.match(css,/@media\(max-width:960px\)/);
  assert.match(css,/\.user-auth-page.auth-commercial>\.auth-showcase \{ display:none; \}/);
  assert.match(css,/\.auth-commercial.*auth-submit.*min-height:52px/);
  assert.doesNotMatch(css,/(?:^|\n)(?:body|\.ws-sidebar|\.admin-login)\s*\{/);
});
