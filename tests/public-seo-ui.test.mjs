import test from 'node:test';
import assert from 'node:assert/strict';
import {seoJsonBlocks,seoRequestAllowed} from '../scripts/check-public-seo-ui.mjs';

test('SEO browser acceptance allows only exact-origin GET/HEAD and does not mistake a prefix for loopback',()=>{
  const base='http://127.0.0.1:4186';
  for(const method of ['GET','HEAD'])assert.equal(seoRequestAllowed(base+'/course-offer?course=published',method,base),true);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(seoRequestAllowed(base+'/api/write',method,base),false);
  for(const url of ['http://127.0.0.1:41860/','http://127.0.0.1:4186.example.invalid/','http://127.0.0.1:4187/','https://127.0.0.1:4186/','https://example.invalid/','javascript:alert(1)','broken'])assert.equal(seoRequestAllowed(url,'GET',base),false);
});

test('SEO evidence parses inert JSON in either quote style/attribute order and never executes script text',()=>{
  const html='<script type="module">globalThis.__seoShouldNeverExecute=1</script><script type="application/json" id="public-bootstrap">{"site":{"title":"安全 \\u003c/script\\u003e"}}</script><script id=\'graph\' type=\'application/ld+json\'>{"@type":"Course","name":"真实课程"}</script>';
  assert.deepEqual(seoJsonBlocks(html,{id:'public-bootstrap'}),[{site:{title:'安全 </script>'}}]);
  assert.deepEqual(seoJsonBlocks(html,{type:'application/ld+json'}),[{'@type':'Course',name:'真实课程'}]);
  assert.equal(globalThis.__seoShouldNeverExecute,undefined);
});

test('SEO evidence fails on damaged or prematurely closed data instead of reporting a false successful parse',()=>{
  for(const body of ['{broken','{"title":"</script><script>bad</script>"}','null extra'])assert.throws(()=>seoJsonBlocks('<script id="public-bootstrap" type="application/json">'+body+'</script>',{id:'public-bootstrap'}),SyntaxError);
  assert.deepEqual(seoJsonBlocks('<script id="another">{broken</script>',{id:'public-bootstrap'}),[]);
});
