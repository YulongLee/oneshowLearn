import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {activeWorkspaceNav} from '../src/workspace-navigation.js';
import {ACCOUNT_SECTIONS,accountSection,accountOrderState,accountOrderPath,accountOrderMatches} from '../src/account-center-model.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('learner settings keep the persistent shell and management account remains separate',()=>{
  const app=read('src/App.jsx'),shell=read('src/Workspace.jsx');
  assert.match(app,/if \(route === '\/account'\) return <AccountSettings/);
  assert.match(app,/else if \(route === "\/admin\/account"\)/);
  assert.match(shell,/\["\/achievements", "我的成果", Trophy\], \["\/account", "设置中心", GearSix\]/);
  assert.doesNotMatch(shell,/className="ws-management wb-settings"/);
  assert.equal(activeWorkspaceNav('/account'),'/account');
  assert.equal(activeWorkspaceNav('/account/'),'/account');
  assert.match(shell,/children\(\{\.\.\.model,sidebar\}\)/);
});
test('account center uses four responsive sections, a single avatar and mounted draft editors',()=>{
  const source=read('src/AccountSettings.jsx'),css=read('src/account-settings.css');
  assert.deepEqual(ACCOUNT_SECTIONS,['profile','security','preferences','orders']);
  for(const id of ACCOUNT_SECTIONS)assert.match(source,new RegExp(`id="account-${id}"`));
  assert.match(source,/hidden=\{tab!=='profile'\}/);assert.match(source,/hidden=\{tab!=='security'\}/);
  assert.doesNotMatch(source,/tab==='profile'&&|tab==='security'&&|as-identity/);
  assert.equal((source.match(/className="as-avatar"/g)||[]).length,1);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/@container\(max-width:480px\).*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
});
test('section switching permits returning to security without discarding any edited values',()=>{
  const handler=read('src/AccountSettings.jsx').match(/const chooseSection=id=>\{(.+)\};/)[1];
  const invoke=new Function('id','working','accountSection','setTab','conflict','setError',handler);
  let selected='security',error='';const draft={name:'Unsubmitted',bio:'Private draft'},password={currentPassword:'Draft only'};
  for(const id of ['preferences','security','profile','security','orders','security']){
    invoke(id,{current:false},accountSection,value=>selected=value,false,value=>error=value);
    assert.equal(selected,id);assert.equal(draft.name,'Unsubmitted');assert.equal(password.currentPassword,'Draft only');
  }
  invoke('orders',{current:true},accountSection,value=>selected=value,false,value=>error=value);assert.equal(selected,'security');
  error='Conflict must stay';invoke('profile',{current:false},accountSection,value=>selected=value,true,value=>error=value);assert.equal(error,'Conflict must stay');
  assert.equal(accountSection('unknown'),'profile');
});
test('current-browser logout never revokes all devices; both scopes require explicit confirmation UI',async()=>{
  const source=read('src/AccountSettings.jsx'),handler=source.match(/const logout=async\(\)=>\{(.+)\};/)[1];
  const invoke=new Function('working','setBusy','setError','logoutConfirm','api','bypass','setToken','navigate','setLogoutConfirm','alive',`return (async()=>{${handler}})()`);
  for(const scope of ['current','all']){
    let calls=0,token='existing',destination='';const bypass={current:false};
    await invoke({current:false},()=>{},()=>{},scope,async route=>{assert.equal(route,'/auth/logout');calls++;},bypass,value=>token=value,value=>destination=value,()=>{},{current:true});
    assert.equal(calls,scope==='all'?1:0);assert.equal(token,'');assert.equal(destination,'/login');assert.equal(bypass.current,true);
  }
  assert.match(source,/title=\{logoutConfirm==='all'\?'退出所有设备？':'退出当前浏览器？'\}/);
  assert.match(source,/if\(dirty\)\{setTab\('profile'\)/,'Changing password must not silently discard a dirty profile');
});
test('online order discovery is private/read-only, bounded and cannot mark expired attempts closed',()=>{
  const source=read('src/AccountOrders.jsx');
  assert.match(source,/api\('\/commerce\/orders'\)/);assert.doesNotMatch(source,/method:|\/sync|\/checkout|\/pay['"`]/);
  assert.match(source,/最近 20 笔在线支付订单/);assert.match(source,/历史人工确认订单不包含/);
  assert.equal(accountOrderState({status:'pending',expired:true}).label,'待核验');
  assert.equal(accountOrderState({status:'paid'}).label,'已支付');assert.equal(accountOrderState({status:'unknown'}).label,'状态待确认');
  assert.equal(accountOrderPath({id:8}),'/membership?paymentReturn=8');
  for(const id of ['8',-1,0,Infinity,1.5,'8&trade_status=TRADE_SUCCESS'])assert.equal(accountOrderPath({id}),null);
  assert.equal(accountOrderMatches({status:'pending',expired:true},'pending'),true);
  assert.equal(accountOrderMatches({status:'pending',expired:true},'closed'),false);
  assert.equal(accountOrderMatches({status:'refunded'},'closed'),true);
});
test('settings use private versioned writes, existing security APIs and real browser preferences',()=>{
  const source=read('src/AccountSettings.jsx');
  assert.match(source,/'If-Match':saved.version/);
  assert.match(source,/api\('\/auth\/password\/change'/);
  assert.match(source,/api\('\/auth\/logout'/);
  assert.match(source,/localStorage.setItem\('osl-playback-rate'/);
  assert.match(source,/model.sidebar.resize/);
  assert.match(source,/model.refresh\(\{preserve:true\}\)/);
  assert.match(source,/key=\{model.user\?\.id\}/);
});
test('unsaved settings block navigation without a native confirm or silent discard',()=>{
  const source=read('src/AccountSettings.jsx');
  assert.match(source,/working.current\|\|dirty\|\|passwordDirty/);
  assert.match(source,/oneshowlearn:before-navigate/);
  assert.match(source,/e.preventDefault\(\);setTab/);
  assert.doesNotMatch(source,/window.confirm/);
  assert.match(source,/beforeunload/);
});
test('navigation guard preserves edited profiles/passwords, allows clean navigation and bypasses completed logout',()=>{
  const source=read('src/AccountSettings.jsx');
  const handler=source.match(/const prevent=e=>\{(.+)\};/)[1];
  for(const scenario of [{dirty:true,passwordDirty:false,blocked:true,tab:'profile'}, {dirty:false,passwordDirty:true,blocked:true,tab:'security'}, {dirty:false,passwordDirty:false,blocked:false}, {dirty:true,passwordDirty:false,bypass:true,blocked:false}]){
    const event=new Event('oneshowlearn:before-navigate',{cancelable:true});let chosen='',error='';
    const invoke=new Function('e','bypass','working','dirty','passwordDirty','setTab','setError',handler);
    invoke(event,{current:Boolean(scenario.bypass)},{current:false},scenario.dirty,scenario.passwordDirty,value=>chosen=value,value=>error=value);
    assert.equal(event.defaultPrevented,scenario.blocked);
    if(scenario.blocked){assert.equal(chosen,scenario.tab);assert.match(error,/未保存/);}
  }
});
