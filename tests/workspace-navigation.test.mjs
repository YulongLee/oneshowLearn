import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeWorkspaceNav,normalizeWorkspaceRoute} from '../src/workspace-navigation.js';
import {sidebarPreferences,sidebarWidth,readSidebarPreferences,saveSidebarPreferences,SIDEBAR_KEY} from '../src/sidebar-preferences.js';

test('learner navigation typography stays legible and does not jump on selection',()=>{
  const css=readFileSync(new URL('../src/workspace-shell.css',import.meta.url),'utf8');
  assert.match(css,/\.ws-unified-layout \.wb-nav-group > button \{[^}]*min-height:48px;[^}]*font-size:16px; line-height:24px/);
  assert.match(css,/\.ws-unified-layout \.wb-nav-group > button\.is-active \{[^}]*font-size:16px/);
  assert.match(css,/\.ws-unified-layout \.wb-nav-group > span \{[^}]*font-size:13px;[^}]*color:#59657d/);
  assert.match(css,/\.ws-unified-layout \.wb-settings>svg \{ width:22px; height:22px/);
  assert.match(css,/\.ws-unified-layout \.wb-settings \{[^}]*font-size:16px/);
});

test('sidebar preferences validate modes, bounds and unavailable storage',()=>{
  assert.deepEqual(sidebarPreferences(),{mode:'expanded',width:228});
  assert.deepEqual(sidebarPreferences({mode:'unexpected',width:NaN}),{mode:'expanded',width:228});
  assert.equal(sidebarWidth(9999),360);assert.equal(sidebarWidth(-1),228);assert.equal(sidebarWidth(300.4),300);assert.equal(sidebarWidth('300'),228);
  for(const mode of ['expanded','icons','hidden'])assert.equal(sidebarPreferences({mode,width:310}).mode,mode);
  const previous=globalThis.localStorage;
  try {
    const store=new Map();globalThis.localStorage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
    saveSidebarPreferences({mode:'icons',width:320});assert.deepEqual(readSidebarPreferences(),{mode:'icons',width:320});
    store.set(SIDEBAR_KEY,'broken');assert.deepEqual(readSidebarPreferences(),{mode:'expanded',width:228});
    globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
    assert.doesNotThrow(()=>saveSidebarPreferences({mode:'hidden',width:320}));assert.deepEqual(readSidebarPreferences(),{mode:'expanded',width:228});
  } finally {if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('sidebar controls retain accessible restore, icon labels and pointer/keyboard resize',()=>{
  const shell=readFileSync(new URL('../src/Workspace.jsx',import.meta.url),'utf8');
  assert.match(shell,/aria-label=\{title\}/);assert.match(shell,/显示侧栏/);assert.match(shell,/隐藏侧栏/);
  assert.match(shell,/useSidebarLayout\(\)/);
  const hook=readFileSync(new URL('../src/useSidebarLayout.js',import.meta.url),'utf8');
  for(const behavior of ['setPointerCapture','releasePointerCapture','onPointerCancel','onLostPointerCapture','ArrowLeft','ArrowRight','onDoubleClick'])assert.ok(hook.includes(behavior));
  assert.match(hook,/max-width:1000px/);
});

test('shared navigation handles trailing slashes and nested learner destinations',()=>{
  for(const [route,item] of [['/app/','/app'],['/opc/phase/2','/opc'],['/paths/','/opc'],['/paths/ai-coding','/opc'],['/packs/test','/opc'],['/learn/test','/opc'],['/projects/test','/projects'],['/resources/','/resources'],['/notes','/notes'],['/favorites','/favorites'],['/achievements','/achievements'],['/community','/community'],['/tutor','/tutor'],['/tools','/tutor'],['/certificates','/achievements']]) assert.equal(activeWorkspaceNav(route),item);
  assert.equal(normalizeWorkspaceRoute('/'),'/');
  assert.equal(activeWorkspaceNav('/courses'),'/opc');
});
test('all learner content mounts through a single persistent shell',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.equal((app.match(/<WorkspaceShell\b/g)||[]).length,1);
  for(const file of ['PersonalWorkspace.jsx','ResourceCenter.jsx']) assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/WorkspaceShell/);
  const shell=readFileSync(new URL('../src/Workspace.jsx',import.meta.url),'utf8');
  assert.match(shell,/className="ws-layout ws-reference-layout ws-unified-layout"/);
  assert.doesNotMatch(shell,/isModern|isCompact|ws-opc-layout|ws-personal-layout/);
});
test('page styles cannot change shared sidebar or header geometry',()=>{
  for(const file of ['workbench.css','opc-learning.css','ai-tutor.css','resources.css','personal-workspace.css','projects.css','learning-routes.css']) assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/\.ws-(?:layout|reference-layout|sidebar|topbar|brand|content|opc-layout|personal-layout|resource-layout|tutor-layout)/,file);
});
test('responsive content has one scoped container-query contract after the chrome',()=>{
  const entry=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(entry.indexOf('workspace-responsive.css')>entry.indexOf('workspace-shell.css'));
  const shell=readFileSync(new URL('../src/workspace-shell.css',import.meta.url),'utf8');
  assert.match(shell,/container:learner\s*\/\s*inline-size/);
  const css=readFileSync(new URL('../src/workspace-responsive.css',import.meta.url),'utf8');
  assert.match(css,/@container learner \(max-width:1199px\)/);
  assert.match(css,/@container workspace-main \(max-width:759px\)/);
  assert.match(css,/\.fv-grid\.fv-list \{ grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(css,/\.ws-(?:sidebar|topbar|brand|content)\b|zoom\s*:|scale\(/);
  for(const line of css.split('\n').filter(line=>line.trim().startsWith('.'))) assert.ok(line.trim().startsWith('.ws-unified-layout'),line);
});
