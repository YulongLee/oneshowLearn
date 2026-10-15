import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAcceptance} from '../deploy/check-public-seo-release.mjs';
const expected={stage:'/tmp/isolated-stage',backup:'/isolated-private-backup',manifest:'a'.repeat(64),assets:156};
const proof=()=>({...expected,releaseManifest:expected.manifest,gitCommit:'b'.repeat(40),ciId:123,ciSuccess:true,providerRequests:0,writeRequests:0,copyBrowser:307,counts:{staticAssets:156,seo:307,promotion:190,anonymous:32}});
test('final receipt requires a paired CI/browser/complete-asset proof',()=>{assert.doesNotThrow(()=>validateAcceptance(proof(),expected));});
test('final receipt cannot be issued for a different stage, backup, manifest or missing assets',()=>{for(const [field,value] of [['stage','/different'],['backup','/different'],['releaseManifest','c'.repeat(64)],['gitCommit','unknown']])assert.throws(()=>validateAcceptance({...proof(),[field]:value},expected));const p=proof();p.counts.staticAssets--;assert.throws(()=>validateAcceptance(p,expected));});
test('unfinished, noninteger or mutating acceptance never disarms recovery',()=>{for(const [field,value] of [['ciSuccess',false],['ciId',0],['copyBrowser',0],['providerRequests',1],['writeRequests',1]])assert.throws(()=>validateAcceptance({...proof(),[field]:value},expected));for(const field of ['anonymous','promotion','seo','staticAssets'])for(const value of [0,NaN,1.5]){const p=proof();p.counts[field]=value;assert.throws(()=>validateAcceptance(p,expected));}const p=proof();delete p.counts.seo;assert.throws(()=>validateAcceptance(p,expected));});
