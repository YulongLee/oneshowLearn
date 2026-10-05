import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homepageExamples,homepageOffer} from '../src/homepage-model.js';
import {currentPublicCopy,SITE_DEFAULTS} from '../server/site-defaults.mjs';

test('homepage price only comes from a valid commerce offer',()=>{
  assert.deepEqual(homepageOffer(null),{priced:false,discounted:false});
  assert.equal(homepageOffer({priceCents:'39900'}).priced,false);
  assert.equal(homepageOffer({priceCents:-1}).priced,false);
  assert.deepEqual(homepageOffer({priceCents:39900,originalPriceCents:99900}),{priced:true,discounted:true});
  assert.equal(homepageOffer({priceCents:39900,originalPriceCents:29900}).discounted,false);
});
test('reference hero upgrades bundled text but preserves authored CMS fields',()=>{
  const old={title:'学会 AI。\n用好 AI。\n做出你的 AI 产品。',description:'Custom description',ctaLabel:'开始学习',ctaPath:'/login',secondaryLabel:'Custom button',secondaryPath:'/resources'};
  const value=currentPublicCopy(old);
  assert.equal(value.title,SITE_DEFAULTS.public.title);
  assert.equal(value.ctaPath,'/membership');
  assert.equal(value.description,'Custom description');
  assert.equal(value.secondaryPath,'/resources');
  assert.equal(old.ctaPath,'/login');
  const custom={title:'自定义标题',ctaPath:'/projects'};
  assert.deepEqual(currentPublicCopy(custom),custom);
});
test('cases retain published CMS project identities and never show drafts',()=>{
  const p={id:3,title:'【演示】工具项目',slug:'demo-tools',status:'published',courses:[{id:1}],tags:['Codex'],cover_url:'/assets/course-codex-v2.webp'};
  const result=homepageExamples({projects:[{...p,id:1,status:'draft'},{...p,id:2,courses:[]},p]});
  assert.equal(result.projects,true);assert.equal(result.items.length,1);
  assert.equal(result.items[0].title,p.title);assert.equal(result.items[0].path,'/projects/demo-tools');
});
test('missing cases use clearly named learning directions, not fabricated products',()=>{
  const result=homepageExamples({projects:[]});
  assert.equal(result.projects,false);assert.equal(result.items.length,3);
  assert.ok(result.items.every(item=>item.label==='学习方向'&&item.path.startsWith('/')));
});
test('homepage preserves backend configuration and has no fabricated testimonials or totals',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(source,/sharedRead\('\/commerce\/offer',\{force:true\}\)/);
  assert.match(source,/useSitePage\('public',configuration\)/);
  assert.match(source,/id="roadmap"/);assert.match(source,/id="hot-courses"/);
  assert.doesNotMatch(source,/10,000|10000|学员真实反馈|STUDENT VOICES|免费试听前2节/);
});
