import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homepageExamples,homepageOffer,homepagePresentation,homepageCourse,homepagePreviewText,homepageCommercialProjects,homepageDeliveryText,HOMEPAGE_INSTRUCTOR} from '../src/homepage-model.js';
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
test('platform capability scene backgrounds stay local, bounded and decorative',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/homepage.css',import.meta.url),'utf8');
  for(const topic of ['courses','ai','practice']){
    const asset=`homepage-capability-${topic}-soft-v1.webp`;
    assert.ok(source.includes(`./assets/${asset}`),'bundled local '+topic+' scene');
    const data=readFileSync(new URL('../src/assets/'+asset,import.meta.url));
    assert.ok(data.length>1000&&data.length<150000,'bounded '+topic+' background asset');
    assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
  }
  const component=source.slice(source.indexOf('function PlatformExample('),source.indexOf('function ',source.indexOf('function PlatformExample(')+1));
  assert.match(component,/className="sales-capability-background"/);
  assert.match(component,/src=\{feature\.background\}/);
  assert.match(component,/alt=""/);assert.match(component,/aria-hidden="true"/);
  assert.match(component,/loading="lazy"/);assert.match(component,/decoding="async"/);
  assert.match(component,/width="1536" height="1024"/);
  assert.match(component,/feature\.items\.map/);assert.match(component,/navigate\(feature\.path\)/);
  assert.match(css,/\.sales-capability-background\s*\{[^}]*position:absolute/);
  assert.match(css,/\.sales-capability-background\s*\{[^}]*object-fit:cover/);
  assert.match(css,/\.sales-capability-background\s*\{[^}]*pointer-events:none/);
  assert.doesNotMatch(css,/\.sales-capability-art(?:\s|\.[\w-]+)*\s*\{[^}]*filter:blur/);
});
test('platform capability feedback stays scoped, keyboard-accessible and motion-aware',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/homepage.css',import.meta.url),'utf8');
  const component=source.slice(source.indexOf('function PlatformExample('),source.indexOf('function ',source.indexOf('function PlatformExample(')+1));
  assert.match(component,/<article className="sales-case-card sales-platform-case">/);
  assert.doesNotMatch(component,/<article[^>]*(?:onClick|tabIndex|role=)/);
  assert.equal((component.match(/<button/g)||[]).length,1);
  assert.match(component,/<button onClick=\{\(\)=>navigate\(feature\.path\)\}/);
  assert.match(css,/\.sales-platform-case\s*\{[^}]*transition:[^}]*transform\s+\.18s[^}]*box-shadow\s+\.18s[^}]*border-color\s+\.18s/);
  assert.match(css,/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{\s*\.sales-platform-case:hover\s*,\s*\.sales-platform-case:focus-within\s*\{[^}]*transform:\s*translateY\(-3px\)/);
  assert.match(css,/\.sales-platform-case:active\s*\{[^}]*transform:\s*translateY\(-1px\)/);
  assert.match(css,/\.sales-platform-case\s+[^{}]*button:active\s*\{[^}]*transform:\s*translateY\(1px\)/);
  assert.match(css,/\.sales-platform-case\s+[^{}]*button:focus-visible\s*\{[^}]*outline:[^}]*outline-offset:/);
  assert.doesNotMatch(css,/\.sales-platform-case\s*\{[^}]*cursor:\s*pointer/);
  assert.doesNotMatch(css,/\.sales-case-card:(?:hover|focus-within|active)\s*\{/);
  const reduced=css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced,/\.sales-platform-case\s*,\s*\.sales-platform-case\s+[^{}]*button\s*\{[^}]*transform:\s*none\s*!important/);
  assert.match(reduced,/transition:\s*none\s*!important/);
});
test('audience stages add only bounded decorative backgrounds with a white failure fallback',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/homepage.css',import.meta.url),'utf8');
  let total=0;
  for(const topic of ['idea','build','launch']){
    const asset=`homepage-audience-${topic}-soft-v1.webp`;
    assert.ok(source.includes(`./assets/${asset}`),'bundled local '+topic+' audience scene');
    const data=readFileSync(new URL('../src/assets/'+asset,import.meta.url));total+=data.length;
    assert.ok(data.length>1000&&data.length<20000,'audience '+topic+' background stays below 20KB');
    assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
  }
  assert.ok(total<45000,'all three audience scenes stay below the 45KB aggregate budget');
  const provenance=JSON.parse(readFileSync(new URL('../src/assets/homepage-audience-soft-v1.prompts.json',import.meta.url),'utf8'));
  assert.match(provenance.method,/Built-in image_gen/);
  assert.deepEqual(provenance.assets.map(item=>item.name),['idea','build','launch']);
  for(const item of provenance.assets){
    assert.equal(item.asset,`src/assets/homepage-audience-${item.name}-soft-v1.webp`);
    assert.ok(item.prompt.length>500&&item.prompt.includes('no text'),'full text-free asset prompt retained '+item.name);
  }
  const component=source.slice(source.indexOf('function AudienceBackground('),source.indexOf('function ',source.indexOf('function AudienceBackground(')+1));
  assert.match(component,/useState\(false\)/);assert.match(component,/failed\s*\?\s*null\s*:/);
  assert.match(component,/className="sales-audience-background"/);assert.match(component,/src=\{src\}/);
  assert.match(component,/alt=""/);assert.match(component,/aria-hidden="true"/);
  assert.match(component,/loading="lazy"/);assert.match(component,/decoding="async"/);
  assert.match(component,/width="1536" height="1024"/);assert.match(component,/onError=\{\(\)=>setFailed\(true\)\}/);
  const audience=source.slice(source.indexOf('<section className="sales-audience'),source.indexOf('</section>',source.indexOf('<section className="sales-audience')));
  assert.match(audience,/<article[^>]*><AudienceBackground src=\{background\}\/>/);
  assert.doesNotMatch(audience,/<article[^>]*(?:onClick|tabIndex|role=)/);
  assert.match(audience,/<h3>\{title\}<\/h3><p>\{text\}<\/p><ul>/);
  assert.match(audience,/points\.map\(point=><li/);
  const data=source.slice(source.indexOf('const audiences=['),source.indexOf('const benefits=['));
  for(const preserved of ['从想法开始','边学边做','准备上线','有想法，却不知道先验证什么','想用 AI，把开发效率真正提起来','产品已在手上，差上线与商业化','发现值得做的机会','把想法拆成清晰的产品问题','从架构到 MVP 开发','按步骤留下自己的实践记录','上线与合规的关键环节','定价、支付与运营思路'])assert.ok(data.includes(preserved),'audience wording retained: '+preserved);
  assert.match(css,/\.sales-audience-card\s*\{[^}]*isolation:isolate/);
  assert.match(css,/\.sales-audience-background\s*\{[^}]*position:absolute/);
  assert.match(css,/\.sales-audience-background\s*\{[^}]*pointer-events:none/);
  assert.doesNotMatch(css,/\.sales-audience-card(?:\s+[^{}]+)?\s*\{[^}]*filter:\s*blur/);
  assert.doesNotMatch(css,/\}sales-/,'responsive selectors retain their class prefix');
  assert.match(css,/\.sales-tutor,\.sales-clarity\s*\{\s*grid-template-columns:1fr/,'shared narrow-screen learning layout is retained');
  assert.match(css,/\.sales-commercial \.sales-roadmap\s*\{\s*margin-block:30px/,'existing mobile roadmap geometry is retained');
});
test('homepage preserves backend configuration and has no fabricated testimonials or totals',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(source,/sharedRead\('\/commerce\/offer',\{force:true\}\)/);
  assert.match(source,/useSitePage\('public',configuration\)/);
  assert.match(source,/id="roadmap"/);assert.match(source,/id="hot-courses"/);
  assert.doesNotMatch(source,/10,000|10000|学员真实反馈|STUDENT VOICES|免费试听前2节/);
});

test('commercial copy only replaces bundled defaults without changing CMS routes or source',()=>{
  const before=structuredClone(SITE_DEFAULTS.public),after=homepagePresentation(before);
  assert.match(after.description,/从 0 到 1/);assert.match(after.footerTitle,/真正的开始/);
  assert.deepEqual(before,SITE_DEFAULTS.public);
  const authored={...before,description:'作者介绍',footerTitle:'作者标题',footerDescription:'作者结尾',ctaLabel:'自定义入口',secondaryPath:'/resources'};
  assert.deepEqual(homepagePresentation(authored),authored);
});
test('homepage counts and free preview use only the authoritative offered course',()=>{
  const entry={courses:[{id:7,slug:'actual-course'},{id:8,slug:'other'}],chapters:[{pack_id:7,id:1},{pack_id:8,id:2}],lessons:[
    {id:9,kind:'course',owner_id:7,is_preview:true,locked:false},
    {id:10,kind:'course',owner_id:7,is_preview:true,locked:false},
    {id:11,kind:'course',owner_id:7,is_preview:false,locked:false},
    {id:12,kind:'project',owner_id:7,is_preview:true,locked:false},
    {id:13,kind:'course',owner_id:8,is_preview:true,locked:false},
  ]};
  const summary=homepageCourse(entry,{slug:'actual-course'});
  assert.equal(summary.chapterCount,1);assert.equal(summary.lessonCount,3);assert.equal(summary.previewCount,2);
  assert.equal(summary.previewPath,'/learn/actual-course/lessons/9');assert.equal(homepagePreviewText(summary),'免费试看前 2 节');
  assert.equal(homepageCourse(entry,null),null);assert.equal(homepageCourse(entry,{slug:'unpublished'}),null);
  assert.equal(homepagePreviewText(null),'查看课程与试看');
  entry.lessons[0].locked=true;assert.equal(homepageCourse(entry,{slug:'actual-course'}).previewCount,1);
  assert.equal(homepagePreviewText({previewCount:1}),'免费试看1 节');
});
test('formal homepage has native FAQ and owner biography without illustrative chat or missing-instructor placeholders',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(source,/<details key=\{i\}>/);assert.match(source,/homepageDeliveryText\(course\)/);
  assert.match(source,/HOMEPAGE_INSTRUCTOR\.background/);assert.doesNotMatch(source,/背书|过往任职经历|不代表相关企业/);
  assert.match(source,/分类示意/);assert.match(source,/sales-tutor-guide/);
  assert.doesNotMatch(source,/讲师介绍待补充|人物品牌图不代表讲师本人|sales-demo-answer|示意问答|已上线产品/);
  assert.doesNotMatch(source,/api\([^\n]+method\s*:\s*['"](?:POST|PUT|DELETE)/);
  assert.doesNotMatch(source,/无限(?:次|量)|保证收入|自动部署|退款保证/);
});
test('homepage footer exposes the owner-provided police internet filing number with official query link',()=>{
  const source=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(source,/浙公网安备33010602014974号/);
  assert.match(source,/beian\.mps\.gov\.cn\/#\/query\/webSearch\?code=33010602014974/);
  assert.match(source,/sales-record-links/);
});

test('homepage proof excludes explicit demo projects without mutating the original catalogue',()=>{
  const original=[{id:1,title:'【演示】AI 工具',description:'展示',slug:'demo',status:'published',courses:[{}]},
    {id:2,title:'正式工具项目',description:'项目课程内容',slug:'real',status:'published',courses:[{}]},
    {id:3,title:'隐私草稿',status:'draft',courses:[{}]},
    {id:4,title:'旧项目',description:'演示内容，非正式教学课程',status:'published',courses:[{}]},
    {id:5,title:'标记项目',settings:{isDemo:true},status:'published',courses:[{}]}];
  const before=structuredClone(original),result=homepageCommercialProjects({projects:original});
  assert.equal(result.length,1);assert.equal(result[0].path,'/projects/real');assert.equal(result[0].label,'项目教程');assert.deepEqual(original,before);
  assert.deepEqual(homepageCommercialProjects({projects:[original[0]]}),[]);
  assert.equal(homepageExamples({projects:original}).items[0].title,'【演示】AI 工具');
});
test('biography uses owner supplied identity and experience without invented employers or credentials',()=>{
  assert.equal(HOMEPAGE_INSTRUCTOR.name,'Cody老师');assert.equal(HOMEPAGE_INSTRUCTOR.expertise,'大模型算法专家');
  assert.match(HOMEPAGE_INSTRUCTOR.experience,/10 年以上/);assert.match(HOMEPAGE_INSTRUCTOR.background,/百度、科大讯飞、阿里/);
  assert.doesNotMatch(JSON.stringify(HOMEPAGE_INSTRUCTOR),/博士|首席|教授|认证|腾讯|字节/);
});
test('learner copy explains actual scope and next actions without gratuitous negative disclaimers',()=>{
  for(const file of ['PublicHomepage.jsx','SidebarCourseOffer.jsx','Workbench.jsx','AuthShowcase.jsx','WorkspaceNotifications.jsx','LessonWorkspace.jsx','community-editorial-model.js','CommunityWorkspace.jsx','ProjectDiscovery.jsx','ProjectsCatalog.jsx','AchievementsWorkspace.jsx','ProjectsHub.jsx','ServiceCenter.jsx']){
    const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/不代表|过往任职经历|课程的背书/,file);
  }
  const home=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(home,/已授权、可检索的课程文字资料/);assert.match(home,/核对和继续实践/);
  const outcomes=readFileSync(new URL('../src/AchievementsWorkspace.jsx',import.meta.url),'utf8');
  assert.match(outcomes,/成果仅自己可见/);assert.match(outcomes,/项目阶段由你记录和更新/);
  const support=readFileSync(new URL('../src/ServiceCenter.jsx',import.meta.url),'utf8');
  assert.match(support,/管理员人工核实/);assert.match(support,/款项退回以实际到账为准/);
  const checkout=readFileSync(new URL('../src/CourseCheckout.jsx',import.meta.url),'utf8');
  assert.match(checkout,/服务器核验到账/);
});
test('delivery FAQ derives only actual offered-course demo metadata, never asserts complete delivery',()=>{
  const e={courses:[{id:8,slug:'op'}],chapters:[],lessons:[{id:1,kind:'course',owner_id:8,is_demo_media:true},{id:2,kind:'course',owner_id:8,is_demo_media:false},{id:3,kind:'course',owner_id:9,is_demo_media:true}]};
  const c=homepageCourse(e,{slug:'op'});assert.equal(c.demoCount,1);assert.match(homepageDeliveryText(c),/1 节使用演示素材/);
  assert.match(homepageDeliveryText(null),/实际发布内容/);assert.doesNotMatch(homepageDeliveryText({demoCount:0}),/完整交付|全部完成/);
});
test('portrait remains local, bounded and lazy loaded with a non-destructive failure fallback',()=>{
  const src=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  assert.match(src,/import founderPortrait from '\.\/assets\/yulong-lee-instructor-lavender-v2\.webp'/);
  assert.match(src,/width="1536" height="1024"/);assert.match(src,/sales-portrait-fallback/);
  assert.ok(readFileSync(new URL('../src/assets/yulong-lee-instructor-lavender-v2.webp',import.meta.url)).length<150000);
});
test('instructor section leads with learner value and exact scoped preview instead of a resume panel',()=>{
  const src=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/homepage.css',import.meta.url),'utf8');
  assert.match(src,/不只学 AI 工具/);assert.match(src,/sales-instructor-method/);
  assert.match(src,/onPreview=\{\(\)=>go\(bundledPreview\?previewPath:site.secondaryPath\)\}/);
  assert.match(src,/背景经 AI 合成/);assert.doesNotMatch(src,/sales-instructor-experience|不止学会一个工具/);
  assert.match(css,/\.sales-instructor-photo img[^}]*object-fit:cover/);
  assert.match(css,/\.sales-instructor-copy h2[^}]*clamp/);
});
test('owner rollback restores prior hero and section order while retaining the lavender instructor',()=>{
  const src=readFileSync(new URL('../src/PublicHomepage.jsx',import.meta.url),'utf8');
  const body=src.slice(src.indexOf('return <main'));
  assert.ok(body.indexOf('id="hot-courses"')<body.indexOf('id="roadmap"'));
  assert.ok(body.indexOf('id="roadmap"')<body.indexOf('id="home-instructor"'));
  assert.match(src,/\?hero:site.image/);assert.match(src,/yulong-lee-instructor-lavender-v2\.webp/);
  assert.doesNotMatch(src,/LearningRoadmap|HeroArtwork|sales-phase-practice|sales-founder-hero/);
  assert.match(body,/className="sales-hero-note"/);
});
