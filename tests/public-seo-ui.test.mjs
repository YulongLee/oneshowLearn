import test from 'node:test';
import assert from 'node:assert/strict';
import {seoJsonBlocks,seoRequestAllowed,waitForSeoNativeDocument} from '../scripts/check-public-seo-ui.mjs';

test('native SEO tab readiness waits for the exact original URL before its document state, not the initial blank document',async()=>{
  const expected='http://127.0.0.1:4186/membership',calls=[];let acknowledge,complete=false;
  const page={waitForURL(url,options){calls.push(['url',url,options]);return new Promise(resolve=>{acknowledge=resolve;});},async waitForLoadState(state){calls.push(['load',state]);}};
  const pending=waitForSeoNativeDocument(page,expected).then(()=>{complete=true;});
  await Promise.resolve();assert.equal(complete,false);assert.deepEqual(calls,[['url',expected,{waitUntil:'domcontentloaded'}]]);
  acknowledge();await pending;assert.equal(complete,true);assert.deepEqual(calls,[['url',expected,{waitUntil:'domcontentloaded'}],['load','domcontentloaded']]);
});

test('native SEO readiness preserves the original URL/load failures without retry or a fallback navigation',async()=>{
  const expected='http://127.0.0.1:4186/membership';
  for(const failed of ['url','load']){const error=Error('isolated '+failed+' failure'),calls=[];const page={async waitForURL(url,options){calls.push(['url',url,options]);if(failed==='url')throw error;},async waitForLoadState(state){calls.push(['load',state]);throw error;}};
    await assert.rejects(waitForSeoNativeDocument(page,expected),actual=>actual===error);assert.deepEqual(calls,failed==='url'?[['url',expected,{waitUntil:'domcontentloaded'}]]:[['url',expected,{waitUntil:'domcontentloaded'}],['load','domcontentloaded']]);
  }
});

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
