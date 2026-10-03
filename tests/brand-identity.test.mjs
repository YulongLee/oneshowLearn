import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('brand entries share one vector identity without changing destinations',()=>{
  for(const file of ['Workspace','PublicHomepage','WorkspaceLanding','CourseOffer','Auth','Admin']){
    const source=read(`src/${file}.jsx`);
    assert.match(source,/import \{BrandIdentity\} from '.\/BrandIdentity.jsx'/);
    assert.match(source,/<BrandIdentity[\s/>]/);
    assert.doesNotMatch(source,/oneshowlearn-brandmark\.png/);
  }
  assert.match(read('src/Workspace.jsx'),/onClick=\{\(\) => go\("\/app"\)\} aria-label="OneShowLearn 工作台"/);
  assert.match(read('src/Admin.jsx'),/<BrandIdentity tagline="运营管理后台"/);
  assert.match(read('src/CommunityWorkspace.jsx'),/<BrandSymbol\/>/);
});
test('new symbol is self-contained and reused by the favicon',()=>{
  const svg=read('src/assets/oneshowlearn-symbol.svg');
  assert.match(svg,/viewBox="0 0 100 100"/);
  assert.equal((svg.match(/<path /g)||[]).length,2);
  assert.doesNotMatch(svg,/<script|<image|href=/);
  assert.match(read('index.html'),/rel="icon" type="image\/svg\+xml" href="\/src\/assets\/oneshowlearn-symbol.svg"/);
  assert.match(read('src/BrandIdentity.jsx'),/OneShow<em>Learn<\/em>/);
  assert.match(read('src/BrandIdentity.jsx'),/Learn · Build · Grow/);
});
test('brand retains icon-only sidebar and dark admin contrast',()=>{
  const css=read('src/brand-identity.css');
  assert.match(css,/\.admin-brand \.osl-brand-wordmark \{ color:#f7f5ff/);
  assert.match(css,/\.admin-brand \.osl-brand-wordmark em \{ color:#c2a6ff/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(read('src/workspace-shell.css'),/data-sidebar="icons"\] \.ws-brand>span/);
});
