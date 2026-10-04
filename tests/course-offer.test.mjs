import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offerCurriculum,offerPrice,offerMoney} from '../src/course-offer-model.js';

test('cashier exposes direct channel switching, hides old QR while switching and ignores stale polling',()=>{
  const source=readFileSync(new URL('../src/CourseCheckout.jsx',import.meta.url),'utf8');
  assert.match(source,/aria-label="切换支付方式"/);
  assert.match(source,/action\('switch',c.id\)/);
  assert.match(source,/\/switch`/);
  assert.match(source,/if\(result.needsSwitch\)/);
  assert.match(source,/busyAction==='switch'\?/);
  assert.match(source,/current===generation.current/);
  assert.match(source,/if\(sending.current\|\|restoring\)return/);
  assert.match(source,/order.failureMessage/);
  assert.match(source,/action\('retry',order.provider\)/);
  assert.match(source,/error!==order\?\.failureMessage/,'Do not duplicate a provider failure in two panels');
  assert.match(source,/qrResult\?\.url===order\?\.qrUrl/,'Do not show a previous channel image during QR encoding');
  assert.match(source,/switchRequest.current.requestKey/,'Switch retry must retain its idempotency key');
  assert.doesNotMatch(source,/已有另一渠道的待支付订单/);
});

test('course offer preserves zero prices and never invents a promotional price',()=>{
  assert.equal(offerPrice({product_price_cents:0,price_cents:39900}),0);
  assert.equal(offerPrice({price_cents:39900}),39900);
  assert.equal(offerPrice({}),null);
  assert.equal(offerPrice({price_cents:-1}),null);
  assert.equal(offerMoney(null),'价格待配置');
  assert.match(offerMoney(39900),/399/);
});
test('offer curriculum groups actual published lessons with direct reader links',()=>{
  const pack={slug:'a b',steps:[{id:1,title:'旧章节',contents:[]}]};
  const lessons=[{id:7,chapter_id:2,chapter:'真实章节',title:'免费课',is_preview:true,locked:false},{id:8,chapter_id:2,chapter:'真实章节',title:'付费课',is_preview:false,locked:true}];
  const result=offerCurriculum(pack,lessons);
  assert.equal(result.length,1);
  assert.equal(result[0].items.length,2);
  assert.equal(result[0].items[0].href,'/learn/a%20b/lessons/7');
  assert.equal(result[0].items[1].locked,true);
  assert.equal(lessons[0].href,undefined);
});
test('offer keeps legacy published materials and honest empty directories',()=>{
  assert.deepEqual(offerCurriculum({slug:'empty'}),[]);
  const result=offerCurriculum({slug:'legacy',steps:[{id:1,title:'文档',contents:[{id:2,title:'资料',locked:true}]}]});
  assert.equal(result[0].items[0].href,'/learn/legacy');
  assert.equal(result[0].items[0].locked,true);
});

test('membership stays in the persistent workspace; public offer alone has sales navigation',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/CourseOffer.jsx',import.meta.url),'utf8');
  assert.match(app,/route === '\/course-offer' \|\| route === '\/course-offer\/'/);
  assert.doesNotMatch(app,/else if \(route === '\/membership'/);
  assert.match(app,/<CourseOfferPage navigate=\{navigate\} notify=\{notify\}/);
  assert.match(page,/aria-label="课程购买导航"/);
  assert.match(page,/export function CourseOfferPage/);
  assert.doesNotMatch(page,/<WorkspaceShell/);
  assert.match(app,/if \(route === "\/"\) content = <PublicHomepage/);
  const workspace=readFileSync(new URL('../src/WorkspacePages.jsx',import.meta.url),'utf8');
  assert.match(workspace,/route === '\/membership'\) return <CourseOffer model=\{model\} navigate=\{navigate\} embedded/);
  assert.match(page,/embedded \? 'div' : 'main'/,'No nested main landmark');
  assert.match(page,/embedded \? <nav className="co-breadcrumb"/,'No duplicate sales header inside workspace');
});

test('embedded offer responds to usable workspace width without overriding sidebar state',()=>{
  const css=readFileSync(new URL('../src/course-offer-workspace.css',import.meta.url),'utf8');
  assert.match(css,/container:offer-workspace \/ inline-size/);
  assert.match(css,/@container offer-workspace \(max-width:1050px\)/);
  assert.match(css,/@container offer-workspace \(max-width:360px\)/);
  assert.doesNotMatch(css,/--sidebar-width|\.ws-sidebar|zoom:|scale\(/);
});

// Included in the existing platform test entry, without changing dependencies.
import './sidebar-offer.test.mjs';
test('sidebar purchase and preview entries never create orders or invent prices',()=>{
  const card=readFileSync(new URL('../src/SidebarCourseOffer.jsx',import.meta.url),'utf8');
  assert.match(card,/api\('\/commerce\/offer'\)/);
  assert.match(card,/offer.originalPriceCents>offer.priceCents/);
  assert.match(card,/navigate\('\/membership'\)/);
  assert.doesNotMatch(card,/399|999|799|倒计时|永久|无限|commerce\/orders/);
  assert.match(card,/useState\(null\)/,'Initial load must not display an invented price');
  assert.equal((card.match(/<button/g)||[]).length,2);
  assert.match(card,/navigate\(summary.previewPath\)/);
  assert.match(card,/!learning&&summary.previewPath/);
  assert.match(card,/AI 导师 · 课程答疑/);
  assert.doesNotMatch(card,/试学用户|比原价省/);
});

test('sidebar revalidation preserves its last successful offer and ignores obsolete route requests',()=>{
  const card=readFileSync(new URL('../src/SidebarCourseOffer.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/sidebar-course-offer.css',import.meta.url),'utf8');
  assert.doesNotMatch(card,/setOffer\(null\)/,'Neither route changes nor temporary failures clear displayed prices');
  assert.match(card,/if\(active\)setOffer\(value\)/);
  assert.match(card,/return\(\)=>\{active=false;\}/,'A late response from the previous route cannot overwrite current pricing');
  assert.match(card,/\},\[route\]\)/,'Navigation still refreshes CMS pricing');
  assert.match(css,/\.ws-offer-price \{[^}]*min-height:39px/);
  assert.match(css,/\.ws-offer-billing \{ min-height:22px/);
});

test('simplified sidebar preserves tutor and preview without competing boxes or a second filled action',()=>{
  const card=readFileSync(new URL('../src/SidebarCourseOffer.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/sidebar-course-offer.css',import.meta.url),'utf8');
  assert.doesNotMatch(card,/ws-offer-eyebrow|Robot|Sparkle/);
  assert.match(card,/课件 · Prompt 模板/);
  assert.match(card,/className="ws-offer-ai"><CheckCircle size=\{15\} weight="fill"/);
  assert.match(css,/>button\.ws-offer-preview \{[^}]*background:transparent[^}]*border:0/);
  assert.match(css,/\.ws-offer-syllabus \{[^}]*font-size:13px/);
  assert.doesNotMatch(css,/li\.ws-offer-ai \{|\.ws-offer-benefits>li:not/);
  assert.match(css,/height:74px; opacity:\.22/);
});

test('sales reference keeps eight benefit cards without fabricated commerce claims',()=>{
  const page=readFileSync(new URL('../src/CourseOffer.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-offer.css',import.meta.url),'utf8');
  assert.match(css,/\.co-benefits \{[^}]*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/\.co-curriculum \{[^}]*repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(page,/course-sales-mascot-v2/);
  assert.match(page,/course-sales-banner-v1/);
  assert.doesNotMatch(page,/学员评价|1000\+|永久学习|7 天内|30天内/);
  assert.match(page,/originalPrice-price/);
  assert.match(page,/CourseCheckout offer=\{offer\}/);
  assert.match(page,/商户配置完成后开放/);
});

test('sales hero correction keeps transparent art and real four-column metrics',()=>{
  const page=readFileSync(new URL('../src/CourseOffer.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/course-offer.css',import.meta.url),'utf8');
  assert.match(page,/chapter.contents\?\.length/);
  assert.match(page,/\{materialCount\}<small>资料/);
  assert.match(page,/<details className="co-course-options"/);
  assert.match(css,/\.co-hero::before/);
  assert.doesNotMatch(css,/mix-blend-mode|mask-image/);
  assert.match(css,/font-size:\.94em/);
});
