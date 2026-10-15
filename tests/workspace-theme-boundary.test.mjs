import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=postcss.parse(source('src/workspace-theme.css'));
const dark='.ws-layout.ws-unified-layout[data-theme=dark]';
test('appearance colors are restricted to the mounted learner scope',()=>{
  const native=['html[data-workspace-theme=light]','html[data-workspace-theme=dark]','html[data-workspace-theme=dark] body','.ws-layout.ws-unified-layout[data-theme=light]'];
  css.walkRules(rule=>{for(const selector of postcss.list.comma(rule.selector))assert.ok(selector.startsWith(dark)||native.includes(selector),selector);});
  assert.doesNotMatch(source('src/workspace-theme.css'),/url\(|@import|@font-face|prefers-color-scheme/);
});
test('dark appearance never changes dimensions, fonts, media or transformations',()=>{
  const forbidden=new Set(['display','position','width','height','min-width','min-height','max-width','max-height','padding','padding-inline','padding-block','margin','gap','font','font-size','font-family','font-weight','line-height','letter-spacing','border-radius','zoom','transform','filter','mix-blend-mode','opacity']);
  css.walkDecls(decl=>{const opaquePlaceholder=decl.prop==='opacity'&&decl.value==='1'&&postcss.list.comma(decl.parent.selector||'').every(selector=>selector.endsWith('::placeholder'));assert.ok(!forbidden.has(decl.prop)||opaquePlaceholder,decl.prop);assert.ok(!['--sidebar-width','--study-directory','--study-notes'].includes(decl.prop));});
});
test('light mode only makes native form appearance explicit',()=>{
  let rules=0;css.walkRules(rule=>{if(rule.selector.includes('[data-theme=light]')||rule.selector.includes('[data-workspace-theme=light]')){rules++;rule.walkDecls(decl=>{assert.equal(decl.prop,'color-scheme');assert.equal(decl.value,'light');});}});assert.equal(rules,1);
});
test('learner theme owns document scope without remounting account or note editors',()=>{
  const workspace=source('src/Workspace.jsx');
  assert.match(workspace,/useLayoutEffect\(\(\)=>\{/);assert.match(workspace,/root\.setAttribute\('data-workspace-theme',theme\)/);
  assert.match(workspace,/root\.removeAttribute\('data-workspace-theme'\)/);assert.match(workspace,/data-theme=\{theme\}/);
  assert.doesNotMatch(workspace,/key=\{theme\}/);assert.match(workspace,/import '\.\/workspace-theme\.css'/);
  for(const file of ['src/main.jsx','src/PublicHomepage.jsx','src/public-metadata.js'])assert.doesNotMatch(source(file),/workspace-theme|data-workspace-theme/);
});
test('appearance CSS stays deferred instead of increasing the public initial stylesheet',()=>{
  const manifest=JSON.parse(source('dist/client/.vite/manifest.json')),initial=new Set();
  const visit=key=>{if(initial.has(key))return;initial.add(key);for(const item of manifest[key].imports||[])visit(item);};visit(Object.keys(manifest).find(key=>manifest[key].isEntry));
  const eager=new Set([...initial].flatMap(key=>manifest[key].css||[]));
  const themed=[...new Set(Object.values(manifest).flatMap(item=>item.css||[]))].filter(file=>/\[data-theme=(?:dark|"dark")\]/.test(source('dist/client/'+file)));
  assert.ok(themed.length>0);for(const file of themed)assert.ok(!eager.has(file),'Dark palette must load with learner workspace, not public homepage');
});
test('appearance radio visuals cannot leak into ordinary account inputs',()=>{
  const picker=postcss.parse(source('src/workspace-theme-picker.css'));
  picker.walkRules(rule=>{if(rule.selector.includes('input'))assert.ok(rule.selector.includes('.as-theme-option input[type=radio]')||rule.selector.includes(':has(input:focus-visible)'),rule.selector);});
  assert.match(source('src/AccountSettings.jsx'),/import '\.\/workspace-theme-picker\.css'/);
});
