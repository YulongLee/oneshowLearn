import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAcceptance} from '../deploy/check-public-seo-release.mjs';
const expected={stage:'/tmp/isolated-stage',backup:'/isolated-private-backup',manifest:'a'.repeat(64),assets:156};
const proof=()=>({...expected,releaseManifest:expected.manifest,gitCommit:'b'.repeat(40),ciId:123,ciSuccess:true,providerRequests:0,writeRequests:0,copyBrowser:307,counts:{staticAssets:156,seo:307,promotion:190,anonymous:32}});
test('final receipt requires a paired CI/browser/complete-asset proof',()=>{assert.doesNotThrow(()=>validateAcceptance(proof(),expected));});
test('final receipt cannot be issued for a different stage, backup, manifest or missing assets',()=>{for(const [field,value] of [['stage','/different'],['backup','/different'],['releaseManifest','c'.repeat(64)],['gitCommit','unknown']])assert.throws(()=>validateAcceptance({...proof(),[field]:value},expected));const p=proof();p.counts.staticAssets--;assert.throws(()=>validateAcceptance(p,expected));});
test('unfinished, noninteger or mutating acceptance never disarms recovery',()=>{for(const [field,value] of [['ciSuccess',false],['ciId',0],['copyBrowser',0],['providerRequests',1],['writeRequests',1]])assert.throws(()=>validateAcceptance({...proof(),[field]:value},expected));for(const field of ['anonymous','promotion','seo','staticAssets'])for(const value of [0,NaN,1.5]){const p=proof();p.counts[field]=value;assert.throws(()=>validateAcceptance(p,expected));}const p=proof();delete p.counts.seo;assert.throws(()=>validateAcceptance(p,expected));});
const authProof=()=>{const p=proof();return {...p,feature:'learner-auth',counts:{...p.counts,auth:196}};};
test('learner authentication receipts require the original paired proof plus a positive authentication count',()=>{
  assert.doesNotThrow(()=>validateAcceptance(authProof(),expected));
  const reversed=authProof();reversed.counts=Object.fromEntries(Object.entries(reversed.counts).reverse());assert.doesNotThrow(()=>validateAcceptance(reversed,expected));
  assert.doesNotThrow(()=>validateAcceptance(proof(),expected),'Existing four-count SEO receipts remain compatible');
});
test('learner authentication receipts reject missing, zero, fractional, nonnumeric or unsafe counts',()=>{
  for(const value of [undefined,null,0,-1,NaN,Infinity,1.5,'196',true,Number.MAX_SAFE_INTEGER+1]){const p=authProof();p.counts.auth=value;assert.throws(()=>validateAcceptance(p,expected),'Invalid authentication count '+String(value));}
  const missing=authProof();delete missing.counts.auth;assert.throws(()=>validateAcceptance(missing,expected));
  for(const field of ['anonymous','promotion','seo','staticAssets']){
    const omitted=authProof();delete omitted.counts[field];assert.throws(()=>validateAcceptance(omitted,expected),'Original evidence cannot be omitted: '+field);
    for(const value of [0,-1,1.5,NaN]){const p=authProof();p.counts[field]=value;assert.throws(()=>validateAcceptance(p,expected),'Original evidence remains strict: '+field);}
  }
  const incomplete=authProof();incomplete.counts.staticAssets--;assert.throws(()=>validateAcceptance(incomplete,expected),'Every staged asset still requires acceptance');
});
test('receipt features and count keys are closed lists, with no unknown or unmarked authentication evidence',()=>{
  for(const feature of ['',null,false,0,'auth','learner-auth-v2','public-seo'])for(const p of [proof(),authProof()])assert.throws(()=>validateAcceptance({...p,feature},expected),'Unknown receipt feature '+String(feature));
  const unmarked=authProof();delete unmarked.feature;assert.throws(()=>validateAcceptance(unmarked,expected),'Authentication count must have an explicit recognized feature');
  for(const p of [proof(),authProof()]){p.counts.unreviewed=1;assert.throws(()=>validateAcceptance(p,expected),'No unrelated count keys');}
});
test('learner authentication evidence cannot bypass CI, immutable-stage, provider or write acceptance',()=>{
  for(const [field,value] of [['stage','/different'],['backup','/different'],['releaseManifest','c'.repeat(64)],['gitCommit','unknown'],['ciSuccess',false],['ciId',0],['copyBrowser',0],['providerRequests',1],['writeRequests',1]])assert.throws(()=>validateAcceptance({...authProof(),[field]:value},expected),'Original paired acceptance remains required: '+field);
});
