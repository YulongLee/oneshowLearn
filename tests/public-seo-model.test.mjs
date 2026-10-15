import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_ORIGIN,describePublicRoute,documentMetadata,metadataHtml,safeJson,trustedPublicOrigin} from '../server/public-seo-model.mjs';
const course={kind:'course',slug:'ai-opc-product-company',course:{pack:{title:'AI OPC 学习目录',product_id:3},lessons:[{is_demo_media:true}]},offer:{slug:'ai-opc-product-company',productId:3,priceCents:49900}};
test('canonical dimensions retain only valid course slug and remove tracking',()=>{
  const meta=documentMetadata(describePublicRoute('/course-offer?course=ai-opc-product-company&utm_source=广告'),course);
  assert.equal(meta.canonical,PUBLIC_ORIGIN+'/course-offer?course=ai-opc-product-company');assert.match(meta.title,/AI OPC 学习目录/);
  assert.equal(meta.schema['@graph'].find(n=>n['@type']==='Course').offers.price,'499.00');
  assert.equal(meta.schema['@graph'].some(n=>['Product','FAQPage','HowTo','Review'].includes(n['@type'])),false);
});
test('course without loaded real data is temporarily noindex not invented schema',()=>{
  const meta=documentMetadata(describePublicRoute('/course-offer?course=unverified'));
  assert.match(meta.robots,/noindex/);assert.equal(meta.schema,undefined);assert.equal(meta.canonical,undefined);
});
test('payment return and private paths remove all inherited public structured data',()=>{
  for(const path of ['/course-offer?course=ai-opc-product-company&orderId=secret','/notes?token=secret','/admin/payments','/opc/lessons/1','/tools','/projects/project-example/workspace']){
    const meta=documentMetadata(describePublicRoute(path),course);assert.equal(meta.status,200);assert.match(meta.robots,/noindex/);assert.equal(meta.schema,undefined);assert.equal(meta.canonical,undefined);assert.doesNotMatch(metadataHtml(meta),/secret|Course|Offer|application\/ld\+json/);
  }
});
test('unknown malformed encoded and duplicate-course paths never become successful homepage',()=>{
  for(const path of ['/missing','//evil.example/','/course-offer?course=x&course=y','/course-offer?course=bad%2Fslug','/%2Fnotes','/%2e%2e/','/%25ZZ','/wrong%ZZ','/x\\notes','https://evil.example/','/x/../'])assert.equal(describePublicRoute(path).status,404,path);
  for(const path of ['/api/missing','/assets/missing.js','/uploads/private.pdf'])assert.equal(describePublicRoute(path).kind,'excluded');
});
test('trusted origin rejects unsafe roots and does not use a host header',()=>{
  for(const origin of ['http://site.example','https://user:pass@site.example','https://site.example/path','https://site.example?key=x','https://site.example/#x'])assert.throws(()=>trustedPublicOrigin(origin));
  assert.equal(describePublicRoute('/?host=evil.example').canonical,PUBLIC_ORIGIN+'/');
});
test('visible dynamic price only supplies valid matching cents, no invented stock or validity dates',()=>{
  for(const value of [null,0,-1,12.2,NaN,Number.MAX_SAFE_INTEGER+1]){
    const data={...course,offer:{...course.offer,priceCents:value}};const item=documentMetadata(describePublicRoute('/course-offer'),data).schema['@graph'].find(n=>n['@type']==='Course');assert.equal(item.offers,undefined);
  }
  const item=documentMetadata(describePublicRoute('/course-offer'),{...course,offer:{...course.offer,productId:4}}).schema['@graph'].find(n=>n['@type']==='Course');assert.equal(item.offers,undefined);
});
test('inert JSON and HTML attributes escape script-closing CMS content independently',()=>{
  const attack='</script><script>globalThis.secret=1</script> & "x"\u2028';
  assert.equal(JSON.parse(safeJson({attack})).attack,attack);assert.doesNotMatch(safeJson({attack}),/<\/script>|\u2028/);
  const meta=documentMetadata(describePublicRoute('/'),null,{image:'/assets/hero-abc.webp',logo:'/assets/logo-abc.svg'});meta.title=attack;
  const html=metadataHtml(meta);assert.match(html,/&lt;\/script&gt;/);assert.match(html,/og:image/);assert.doesNotMatch(html,/content="<\/script/);
});
