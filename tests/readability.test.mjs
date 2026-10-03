import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const css=readFileSync(new URL('../src/readability.css',import.meta.url),'utf8');
const sheet=postcss.parse(css);
test('shared readability stylesheet loads after all baseline shell styles',()=>{
  const entry=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(entry.indexOf('./readability.css')>entry.indexOf('./workspace-responsive.css'));
  const tokens={};sheet.walkRules(':root',rule=>rule.walkDecls(d=>tokens[d.prop]=d.value));
  assert.equal(tokens['--type-meta'],'13px');assert.equal(tokens['--type-body'],'15px');
  assert.equal(tokens['--type-reading'],'16px');assert.equal(tokens['--type-card'],'17px');
});
test('readability changes never scale the page or reset shared navigation widths',()=>{
  sheet.walkDecls(d=>{
    assert.notEqual(d.prop,'zoom');assert.ok(!(d.prop==='transform'&&/scale/.test(d.value)));
    assert.ok(!['--sidebar-width','--study-directory','--study-notes'].includes(d.prop));
  });
  assert.ok(!/\.ws-sidebar\s*\{/.test(css));
  assert.ok(!/\.co-price\s+strong\s*\{/.test(css),'Price hierarchy remains unchanged');
});
test('commercial cards and course names reflow instead of shrinking text',()=>{
  const declarations=[];sheet.walkRules(r=>r.walkDecls(d=>declarations.push([r.selector,d.prop,d.value])));
  assert.ok(declarations.some(([s,p,v])=>s==='.co-site .co-curriculum li button>span'&&p==='white-space'&&v==='normal'));
  assert.ok(declarations.some(([s,p,v])=>s==='.co-site .co-benefits'&&p==='grid-template-columns'&&v==='repeat(4,minmax(0,1fr))'));
  assert.ok(declarations.some(([s,p,v])=>s==='.co-site .co-benefits'&&p==='grid-template-columns'&&v==='repeat(2,minmax(0,1fr))'));
  assert.ok(declarations.some(([s,p,v])=>s==='.ws-unified-layout .ls-note-toolbar'&&p==='flex-wrap'&&v==='wrap'));
  assert.ok(declarations.some(([s,p,v])=>s.includes('.co-preview')&&p==='min-height'&&v==='48px'));
});
