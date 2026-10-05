import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountMenuRequest} from '../src/account-center-model.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('account menu routes permit only real sections and current-browser confirmation',()=>{
  assert.deepEqual(accountMenuRequest('?section=orders'),{section:'orders',logout:''});
  assert.deepEqual(accountMenuRequest('?section=security&confirmLogout=current'),{section:'security',logout:'current'});
  for(const query of ['', '?section=wrong&confirmLogout=current','?section=orders&confirmLogout=current','?section=security&confirmLogout=all'])assert.equal(accountMenuRequest(query).logout,'');
  assert.equal(accountMenuRequest('?section=wrong').section,'profile');
});
test('account menu preserves scope, actual role and existing guarded destinations',()=>{
  const source=read('src/WorkspaceAccountMenu.jsx');
  for(const label of ['我的课程','学习计划','账号设置','我的订单','帮助与售后','返回官网','退出登录'])assert.ok(source.includes(label));
  assert.match(source,/canManage\(user\)/);assert.match(source,/!model.loading&&!model.error/);
  assert.match(source,/route==='\/account'/);assert.match(source,/userId:user.id/);
  assert.doesNotMatch(source,/setToken|fetch\(|api\(|localStorage|账号设置与退出|VIP|会员已解锁/);
  const settings=read('src/AccountSettings.jsx');assert.match(settings,/e.detail\?\.userId!==model.user.id\|\|working.current/);
  assert.match(settings,/chooseSection\(e.detail.section\)/);
});
test('account menu is a grouped bounded disclosure with keyboard and pointer dismissal',()=>{
  const source=read('src/WorkspaceAccountMenu.jsx'),css=read('src/workspace-account-menu.css');
  for(const key of ['ArrowDown','ArrowUp','Home','End','Escape','relatedTarget','pointerdown','aria-expanded','aria-controls'])assert.ok(source.includes(key));
  assert.match(css,/max-height:calc\(100dvh/);assert.match(css,/overflow-y:auto/);
  assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/button:focus-visible/);
  assert.match(read('src/Workspace.jsx'),/<WorkspaceAccountMenu model=\{model\}/);
});
