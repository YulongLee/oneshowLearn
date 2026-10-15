import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_THEME_KEY,workspaceTheme,createWorkspaceThemeStore} from '../src/workspace-theme.js';

function fixture(initial){
  const values=new Map(initial===undefined?[]:[[WORKSPACE_THEME_KEY,initial]]),listeners=new Set(),writes=[];
  let blockedRead=false,blockedWrite=false;
  const localStorage={getItem(key){if(blockedRead)throw Error('blocked');return values.get(key)??null;},setItem(key,value){if(blockedWrite)throw Error('blocked');writes.push([key,value]);values.set(key,value);}};
  const browser={localStorage,addEventListener(type,listener){assert.equal(type,'storage');listeners.add(listener);},removeEventListener(type,listener){assert.equal(type,'storage');listeners.delete(listener);}};
  return {browser,values,writes,listeners,block(read,write){blockedRead=read;blockedWrite=write;},event(patch){for(const listener of [...listeners])listener({key:WORKSPACE_THEME_KEY,newValue:'dark',storageArea:localStorage,...patch});}};
}

test('workspace appearance accepts exactly two values and defaults safely to light',()=>{
  assert.equal(WORKSPACE_THEME_KEY,'oneshowlearn.workspace-theme.v1');
  assert.equal(workspaceTheme('dark'),'dark');
  for(const value of ['light','system','Dark',' dark ','{"theme":"dark"}',null,undefined,{},0])assert.equal(workspaceTheme(value),'light');
});
test('initial selection reads only the browser preference without writing',()=>{
  for(const [value,expected] of [['dark','dark'],['light','light'],['bad','light'],[undefined,'light']]){
    const f=fixture(value),store=createWorkspaceThemeStore(f.browser);
    assert.equal(store.getSnapshot(),expected);assert.deepEqual(f.writes,[]);assert.equal(f.listeners.size,0);
  }
});
test('server and inaccessible storage fall back to light',()=>{
  assert.equal(createWorkspaceThemeStore(null).getSnapshot(),'light');
  const browser={get localStorage(){throw Error('blocked');},addEventListener(){},removeEventListener(){}};
  const store=createWorkspaceThemeStore(browser);assert.equal(store.getSnapshot(),'light');
  assert.deepEqual(store.setTheme('dark'),{theme:'dark',saved:false});assert.equal(store.getSnapshot(),'dark');
});
test('manual selection persists and synchronizes every mounted subscriber once',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser),seenA=[],seenB=[];
  const unsubscribeA=store.subscribe(()=>seenA.push(store.getSnapshot())),unsubscribeB=store.subscribe(()=>seenB.push(store.getSnapshot()));
  assert.equal(f.listeners.size,1);assert.deepEqual(store.setTheme('dark'),{theme:'dark',saved:true});
  assert.deepEqual(seenA,['dark']);assert.deepEqual(seenB,['dark']);assert.deepEqual(f.writes,[[WORKSPACE_THEME_KEY,'dark']]);
  store.setTheme('dark');assert.deepEqual(seenA,['dark']);assert.deepEqual(seenB,['dark']);
  unsubscribeA();assert.equal(f.listeners.size,1);unsubscribeB();assert.equal(f.listeners.size,0);
});
test('failed persistence preserves the immediate choice and reports failure',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser),seen=[];f.block(false,true);
  let unsubscribe=store.subscribe(()=>seen.push(store.getSnapshot()));
  assert.deepEqual(store.setTheme('dark'),{theme:'dark',saved:false});assert.deepEqual(seen,['dark']);assert.deepEqual(f.writes,[]);
  unsubscribe();unsubscribe=store.subscribe(()=>{});assert.equal(store.getSnapshot(),'dark');unsubscribe();
  f.block(true,true);unsubscribe=store.subscribe(()=>{});assert.equal(store.getSnapshot(),'dark');unsubscribe();
});
test('a later permitted manual choice resumes persistence after a failure',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser);f.block(false,true);store.setTheme('dark');
  f.block(false,false);assert.deepEqual(store.setTheme('dark'),{theme:'dark',saved:true});assert.equal(f.values.get(WORKSPACE_THEME_KEY),'dark');
  const unsubscribe=store.subscribe(()=>{});assert.equal(store.getSnapshot(),'dark');unsubscribe();
});
test('cross-tab selection and removal update without echo writes or loops',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser),seen=[];const unsubscribe=store.subscribe(()=>seen.push(store.getSnapshot()));
  f.event({newValue:'dark'});assert.equal(store.getSnapshot(),'dark');assert.deepEqual(f.writes,[]);
  f.event({newValue:'dark'});assert.deepEqual(seen,['dark']);
  f.event({newValue:null});assert.equal(store.getSnapshot(),'light');assert.deepEqual(seen,['dark','light']);
  f.event({newValue:'dark'});f.event({key:null,newValue:null});assert.equal(store.getSnapshot(),'light');assert.deepEqual(f.writes,[]);unsubscribe();
});
test('cross-tab invalid preference uses safe light while unrelated/session storage is ignored',()=>{
  const f=fixture('dark'),store=createWorkspaceThemeStore(f.browser);const unsubscribe=store.subscribe(()=>{});
  f.event({key:'unrelated',newValue:'light'});assert.equal(store.getSnapshot(),'dark');
  f.event({newValue:'light',storageArea:{}});assert.equal(store.getSnapshot(),'dark');
  f.event({newValue:'system'});assert.equal(store.getSnapshot(),'light');assert.deepEqual(f.writes,[]);unsubscribe();
});
test('unmounted consumers reconcile valid storage changes on next mount',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser);let unsubscribe=store.subscribe(()=>{});unsubscribe();
  f.values.set(WORKSPACE_THEME_KEY,'dark');assert.equal(store.getSnapshot(),'dark');unsubscribe=store.subscribe(()=>{});assert.equal(store.getSnapshot(),'dark');unsubscribe();
});
test('unmounted snapshots reconcile before subscription without notifications or writes',()=>{
  const f=fixture(),store=createWorkspaceThemeStore(f.browser),seen=[];const unsubscribe=store.subscribe(()=>seen.push(store.getSnapshot()));unsubscribe();
  f.values.set(WORKSPACE_THEME_KEY,'dark');assert.equal(store.getSnapshot(),'dark');assert.equal(store.getSnapshot(),'dark');
  f.values.delete(WORKSPACE_THEME_KEY);assert.equal(store.getSnapshot(),'light');
  assert.deepEqual(seen,[]);assert.deepEqual(f.writes,[]);assert.equal(f.listeners.size,0);
});
test('unmounted snapshots retain memory fallback when writes are blocked',()=>{
  const f=fixture('light'),store=createWorkspaceThemeStore(f.browser);f.block(false,true);
  assert.deepEqual(store.setTheme('dark'),{theme:'dark',saved:false});
  assert.equal(f.values.get(WORKSPACE_THEME_KEY),'light');assert.equal(store.getSnapshot(),'dark');assert.equal(store.getSnapshot(),'dark');
  let unsubscribe=store.subscribe(()=>{});assert.equal(store.getSnapshot(),'dark');unsubscribe();
  f.block(true,true);assert.equal(store.getSnapshot(),'dark');
  f.block(false,false);assert.equal(store.getSnapshot(),'dark');
  assert.deepEqual(store.setTheme('light'),{theme:'light',saved:true});assert.equal(store.getSnapshot(),'light');
  unsubscribe=store.subscribe(()=>{});unsubscribe();assert.deepEqual(f.writes,[[WORKSPACE_THEME_KEY,'light']]);
});
test('reset uses the same safe light preference without mutating other storage keys',()=>{
  const f=fixture('dark');f.values.set('oneshowlearn.sidebar.v1','existing');f.values.set('osl-playback-rate','1.5');
  const store=createWorkspaceThemeStore(f.browser);assert.deepEqual(store.setTheme('light'),{theme:'light',saved:true});
  assert.deepEqual(f.writes,[[WORKSPACE_THEME_KEY,'light']]);assert.equal(f.values.get('oneshowlearn.sidebar.v1'),'existing');assert.equal(f.values.get('osl-playback-rate'),'1.5');
});
test('appearance settings use native radio semantics, immediate scoped state and truthful storage feedback',()=>{
  const source=readFileSync(new URL('../src/AccountSettings.jsx',import.meta.url),'utf8');
  assert.match(source,/useWorkspaceTheme\(\)/);assert.match(source,/<fieldset className="as-theme-preference"[^>]*><legend>外观模式<\/legend>/);
  assert.match(source,/type="radio" name="workspace-theme" value=\{value\} checked=\{theme===value\}/);
  assert.match(source,/\['light','浅色'/);assert.match(source,/\['dark','深色'/);assert.match(source,/chooseTheme\('light'\);preference\(1\)/);
  assert.match(source,/const chooseTheme=next=>\{const result=setTheme\(next\);setThemeStatus\(result.saved\?/);
  assert.match(source,/当前浏览器未允许保存/);assert.match(source,/className="as-theme-status" role="status"/);
  const handler=source.slice(source.indexOf('const chooseTheme='),source.indexOf('  return <div className="as-layout">'));
  assert.doesNotMatch(handler,/api\(|setError\(|setDraft\(|setSaved\(|notify\(/);
});
test('theme preference helpers do not touch document, account APIs, network or system theme',()=>{
  const source=readFileSync(new URL('../src/workspace-theme.js',import.meta.url),'utf8');
  const hook=readFileSync(new URL('../src/useWorkspaceTheme.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/document\.|fetch\(|api\(|matchMedia\(|sessionStorage/);assert.match(hook,/useSyncExternalStore/);assert.doesNotMatch(hook,/document\.|fetch\(|api\(/);
});
