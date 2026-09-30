import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareNavigation,createRouteNavigation} from '../src/navigation-save.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('navigation awaits both writers and rechecks edits made while another save is pending',async()=>{
  const target=new EventTarget(),gate=deferred();let dirty=true,noteCalls=0,started=false;
  target.addEventListener('oneshowlearn:before-navigate',e=>{
    e.detail.waitUntil(async()=>{await gate.promise;return true;});
    e.detail.waitUntil(async()=>{noteCalls++;dirty=false;return true;},()=>dirty);
  });
  const done=prepareNavigation(target,()=>{started=true;});
  assert.equal(started,true);await turn();dirty=true;gate.resolve();
  assert.equal((await done).ok,true);assert.equal(noteCalls,2);
});
test('failed and conflicting saves block navigation without discarding input',async()=>{
  for(const save of [async()=>false,async()=>{throw Error('409 conflict');}]){
    const target=new EventTarget();target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(save,()=>true));
    assert.deepEqual(await prepareNavigation(target),{ok:false,reason:'save-failed'});
  }
});
test('legacy admin guards can cancel before any deferred write starts',async()=>{
  const target=new EventTarget();let writes=0;
  target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(async()=>{writes++;return true;}));
  target.addEventListener('oneshowlearn:before-navigate',e=>e.preventDefault());
  assert.deepEqual(await prepareNavigation(target),{ok:false,reason:'cancelled'});assert.equal(writes,0);
});
test('continuously changing drafts do not lead to an infinite navigation loop',async()=>{
  const target=new EventTarget();let attempts=0;
  target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(async()=>{attempts++;return true;},()=>true));
  assert.equal((await prepareNavigation(target)).reason,'still-editing');assert.equal(attempts,3);
});
function browser(){
  const target=new EventTarget(),entries=[{url:'/opc',state:{}}];let position=0;
  const sync=()=>{const url=new URL(entries[position].url,'https://example.test');target.location={pathname:url.pathname,search:url.search,hash:url.hash};};
  target.history={get state(){return entries[position].state;},replaceState(state,_title,url){entries[position]={state,url};sync();},pushState(state,_title,url){entries.splice(position+1);entries.push({state,url});position++;sync();},go(delta){position+=delta;assert.ok(position>=0&&position<entries.length);sync();queueMicrotask(()=>target.dispatchEvent(new Event('popstate')));}};
  target.scrollTo=()=>{};sync();return {target,entries};
}
test('rapid menu clicks share no competing saves and commit only once after success',async()=>{
  const {target,entries}=browser(),gate=deferred();const routes=[];
  target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(()=>gate.promise));
  const router=createRouteNavigation(target,route=>routes.push(route),()=>{});
  const first=router.navigate('/projects');assert.equal(target.location.pathname,'/opc');
  assert.equal(await router.navigate('/notes'),false);assert.equal(routes.length,0);
  gate.resolve(true);assert.equal(await first,true);assert.deepEqual(routes,['/projects']);assert.equal(entries.length,2);router.dispose();
});
test('back cancellation restores history without duplicating entries; forward remains usable',async()=>{
  const {target,entries}=browser();let route='/opc',allowed=true;
  target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(async()=>allowed));
  const router=createRouteNavigation(target,value=>{route=value;},()=>{});
  await router.navigate('/projects');await router.navigate('/notes');allowed=false;
  target.history.go(-1);await turn();await turn();
  assert.equal(route,'/notes');assert.equal(target.location.pathname,'/notes');assert.equal(entries.length,3);
  allowed=true;target.history.go(-1);await turn();assert.equal(route,'/projects');
  target.history.go(1);await turn();assert.equal(route,'/notes');assert.equal(entries.length,3);router.dispose();
});
test('back during a pending menu save wins over the obsolete menu destination',async()=>{
  const {target,entries}=browser();let route='/opc';const router=createRouteNavigation(target,v=>{route=v;},()=>{});
  await router.navigate('/projects');const gate=deferred();
  target.addEventListener('oneshowlearn:before-navigate',e=>e.detail.waitUntil(()=>gate.promise));
  const pending=router.navigate('/notes');target.history.go(-1);await turn();gate.resolve(true);await pending;
  assert.equal(route,'/opc');assert.equal(target.location.pathname,'/opc');assert.equal(entries.length,2);router.dispose();
});
test('course and project readers join note writes, pause media and retain unload protection',()=>{
  const source=readFileSync(new URL('../src/LessonWorkspace.jsx',import.meta.url),'utf8');
  assert.match(source,/media\.pause\(\)/);assert.match(source,/await inFlight\.current/);
  assert.match(source,/e\.detail\.waitUntil\(save, dirty\)/);
  assert.match(source,/AbortSignal\.timeout\(15000\)/);
  assert.match(source,/e\.type === "beforeunload"/);
  assert.doesNotMatch(source,/window\.confirm\("(?:还有学习进度未保存|笔记尚未保存)/);
  assert.match(source,/const go = \(lesson\) => navigate\(lessonLink\(lesson\)\)/);
});
