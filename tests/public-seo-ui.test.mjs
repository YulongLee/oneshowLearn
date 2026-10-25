import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seoJsonBlocks,seoRequestAllowed,waitForSeoNativeDocument,createPublicOfferReadiness} from '../scripts/check-public-seo-ui.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
class FakeOfferPage {
  constructor(){this.url='about:blank';this.frame={url:()=>this.url};this.listeners=new Map();this.waiters=[];this.calls=[];}
  mainFrame(){return this.frame;}
  on(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list);return this;}
  emit(type,value){for(const listener of this.listeners.get(type)||[])listener(value);if(type==='response')for(const waiter of [...this.waiters])if(waiter.predicate(value)){this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(value);}}
  documentRequest(url){const request={url:()=>url,method:()=> 'GET',frame:()=>this.frame,isNavigationRequest:()=>true,resourceType:()=> 'document'};this.emit('request',request);return request;}
  documentHeaders(request){this.emit('response',{request:()=>request,status:()=>200});}
  commit(url){const request=this.documentRequest(url);this.documentHeaders(request);this.url=url;this.emit('framenavigated',this.frame);}
  replace(url){this.url=url;this.emit('framenavigated',this.frame);}
  waitForResponse(predicate){this.calls.push('arm');const pending=deferred();this.waiters.push({...pending,predicate});return pending.promise;}
  request({url='http://127.0.0.1:4186/api/commerce/offer',method='GET',frame=this.frame}={}){const pending=deferred(),request={url:()=>url,method:()=>method,frame:()=>frame,isNavigationRequest:()=>false,resourceType:()=> 'fetch',responseCalls:0,response(){this.responseCalls++;return pending.promise;}};this.emit('request',request);return {request,pending};}
  respond(read,{status=200,value,error}={}){const parsed=deferred(),started=deferred(),response={request:()=>read.request,status:()=>status,jsonCalls:0,json(){this.jsonCalls++;started.resolve();return parsed.promise;}};read.pending.resolve(response);this.emit('response',response);if(error)parsed.reject(error);else if(value!==undefined)parsed.resolve(value);return {response,parsed,started};}
}
const offerIdentity={productId:17,slug:'public-course',priceCents:49900,originalPriceCents:499900};

test('actual offer readiness does not confuse successful SSR price/lesson predicates with the current document body acknowledgement',async()=>{
  const page=new FakeOfferPage(),captures=[],readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186',captures),rendered=deferred();let ssrReady=false,complete=false,actionCalls=0,read,reply;
  const pending=readiness.homeNavigation(async()=>{actionCalls++;page.calls.push('goto');page.commit('http://127.0.0.1:4186/');page.replace('http://127.0.0.1:4186/');read=page.request();reply=page.respond(read,{value:undefined});ssrReady=true;rendered.resolve();}).then(()=>{complete=true;});
  await rendered.promise;await reply.started.promise;
  assert.equal(ssrReady,true);assert.equal(complete,false);assert.deepEqual(page.calls,['arm','goto']);assert.equal(captures.length,1);
  reply.parsed.resolve(offerIdentity);await pending;assert.equal(complete,true);assert.equal(actionCalls,1);assert.equal(read.request.responseCalls,1);assert.equal(reply.response.jsonCalls,1);assert.deepEqual(await Promise.all(captures),[{status:200,value:offerIdentity}]);
});

test('same-document replaceState does not advance a document, while a same-URL reload excludes the prior request epoch',async()=>{
  const page=new FakeOfferPage(),captures=[],readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186',captures),rendered=deferred();page.commit('http://127.0.0.1:4186/');let fresh,complete=false;
  const pending=readiness.homeNavigation(async()=>{const navigation=page.documentRequest('http://127.0.0.1:4186/');page.replace('http://127.0.0.1:4186/');const old=page.request();page.documentHeaders(navigation);page.replace('http://127.0.0.1:4186/');page.respond(old,{value:offerIdentity});assert.equal(page.waiters.length,1,'old document response must not satisfy the new epoch');fresh=page.respond(page.request(),{value:undefined});rendered.resolve();}).then(()=>{complete=true;});
  await rendered.promise;await fresh.started.promise;assert.equal(complete,false);assert.equal(captures.length,2);fresh.parsed.resolve(offerIdentity);await pending;assert.equal(complete,true);assert.deepEqual(await Promise.all(captures),[{status:200,value:offerIdentity},{status:200,value:offerIdentity}]);
});

test('new-home acknowledgement requires the exact same-origin GET and main-document source, but all other observed responses remain recorded',async t=>{
  for(const options of [{method:'HEAD'},{method:'POST'},{url:'http://127.0.0.1:4186/api/commerce/offer?stale=1'},{url:'http://127.0.0.1:4187/api/commerce/offer'},{frame:{url:()=> 'http://127.0.0.1:4186/'}}])await t.test(JSON.stringify(options),async()=>{
    const page=new FakeOfferPage(),captures=[],readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186',captures),rendered=deferred();let fresh;
    const pending=readiness.homeNavigation(async()=>{page.commit('http://127.0.0.1:4186/');page.respond(page.request(options),{value:offerIdentity});assert.equal(page.waiters.length,1);fresh=page.respond(page.request(),{value:undefined});rendered.resolve();});
    await rendered.promise;await fresh.started.promise;fresh.parsed.resolve(offerIdentity);await pending;assert.equal(captures.length,2);assert.deepEqual(await Promise.all(captures),[{status:200,value:offerIdentity},{status:200,value:offerIdentity}]);
  });
});

test('before-navigation drains every already-started offer read including a body arriving while an earlier body is pending',async()=>{
  const page=new FakeOfferPage(),captures=[],readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186',captures);page.commit('http://127.0.0.1:4186/');const first=page.respond(page.request(),{value:undefined});let complete=false;
  const pending=readiness.beforeNavigation().then(()=>{complete=true;});await first.started.promise;const second=page.respond(page.request(),{value:undefined});await second.started.promise;first.parsed.resolve(offerIdentity);await Promise.resolve();assert.equal(complete,false);second.parsed.resolve(offerIdentity);await pending;assert.equal(complete,true);assert.equal(captures.length,2);
});

test('offer status and body failures stay in the complete capture set and emit only bounded diagnostic categories',async t=>{
  for(const [name,reply]of [['status429',{status:429,value:offerIdentity}],['json',{error:new SyntaxError('Unexpected token PRIVATE_BODY token=PRIVATE_SECRET')}],['body',{error:Error('Protocol error (Network.getResponseBody): No resource with given identifier PRIVATE_SECRET')}],['failed request',null]])await t.test(name,async()=>{
    const page=new FakeOfferPage(),captures=[],readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186',captures);page.commit('http://127.0.0.1:4186/');const read=page.request();if(reply)page.respond(read,reply);else read.pending.resolve(null);
    await assert.rejects(readiness.beforeNavigation(),error=>!error.message.includes('PRIVATE_')&&error.message.length<240);assert.equal(captures.length,1);const [captured]=await Promise.all(captures);if(name==='status429'){assert.equal(captured.status,429);assert.deepEqual(captured.value,offerIdentity);}else{assert.ok(captured.error);assert.ok(captured.error.length<160);assert.doesNotMatch(captured.error,/PRIVATE_|token=/);}
  });
});

test('home navigation retains original navigation/response-wait failures and observes both promises without retry',async()=>{
  const page=new FakeOfferPage(),readiness=createPublicOfferReadiness(page,'http://127.0.0.1:4186'),failure=Error('isolated goto failure');let actions=0;
  await assert.rejects(readiness.homeNavigation(()=>{actions++;throw failure;}),error=>error===failure);assert.equal(actions,1);page.waiters[0].reject(Error('later response timeout'));await Promise.resolve();
  const other=new FakeOfferPage(),second=createPublicOfferReadiness(other,'http://127.0.0.1:4186');let started;
  const action=deferred(),armed=deferred(),pending=second.homeNavigation(()=>{started=true;armed.resolve();return action.promise;});await armed.promise;const responseFailure=Error('isolated response wait failure');other.waiters[0].reject(responseFailure);await assert.rejects(pending,error=>error===responseFailure);action.reject(Error('later goto failure'));await Promise.resolve();assert.equal(started,true);assert.deepEqual(other.calls,['arm']);
});

test('promotion acceptance retains the exact final complete-capture error/status/financial identity loop and all original read-only guards',()=>{
  const live=readFileSync(new URL('../scripts/check-homepage-promotion-live.mjs',import.meta.url),'utf8');
  assert.ok(live.includes("for(const captured of await Promise.all(offerResponses)){assert.ok(!captured.error,'real public offer response must be captured before navigation');assert.equal(captured.status,200);equal(financialIdentity(captured.value),financialIdentity(offer),'every real browser offer response matches the actual initial offer');}"));
  assert.ok(live.includes('await offerReadiness.beforeNavigation();\n  for(const captured of await Promise.all(offerResponses))'));
  assert.match(live,/if\(!\['GET','HEAD'\]\.includes\(request.method\(\)\)\)/);assert.match(live,/if\(request.headers\(\).authorization\)/);assert.match(live,/equal\(limited,\[\]/);assert.match(live,/offerReadiness\.homeNavigation\(\(\)=>page\.reload\(\)\)/);assert.match(live,/offerReadiness\.beforeNavigation\(\)/);
});

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
