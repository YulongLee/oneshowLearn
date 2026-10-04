import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarCatalogue,sidebarOfferSummary} from '../src/sidebar-offer-model.js';
const offer={productId:14,slug:'ai-opc-product-company'};
const entry={courses:[{id:8,slug:offer.slug,title:'真实课程',entitled:true}],lessons:[
  {id:11,kind:'course',owner_id:8,chapter_id:1,is_preview:true,progress:{video_time:60}},
  {id:12,kind:'course',owner_id:8,chapter_id:1,is_preview:true},
  {id:13,kind:'course',owner_id:8,chapter_id:2,is_preview:false},
  {id:14,kind:'project',owner_id:8,chapter_id:3,is_preview:true},
  {id:15,kind:'course',owner_id:9,chapter_id:3,is_preview:true}
]};
test('offer summary derives catalogue counts and previews only for the offered course',()=>{
  const data=sidebarOfferSummary(offer,sidebarCatalogue(entry));
  assert.equal(data.chapters,2);assert.equal(data.lessons,3);assert.equal(data.previews,2);
  assert.equal(data.previewPath,'/learn/ai-opc-product-company/lessons/11');
  for(const config of [null,{...offer,productId:null},{...offer,slug:'other'}]){
    const s=sidebarOfferSummary(config,sidebarCatalogue(entry));
    assert.equal(s.lessons,0);assert.equal(s.previewPath,null);
  }
});
test('retained sidebar catalogue excludes progress, entitlement and private fields',()=>{
  const catalog=sidebarCatalogue(entry),serialized=JSON.stringify(catalog);
  assert.doesNotMatch(serialized,/progress|video_time|entitled/);
  assert.equal(sidebarOfferSummary(offer).previewPath,null);
  const c=sidebarCatalogue({...entry,lessons:[{...entry.lessons[0],id:'11'},{...entry.lessons[1],id:-2}]});
  assert.equal(sidebarOfferSummary(offer,c).previewPath,null);
  assert.equal(sidebarOfferSummary({...offer,slug:'custom'},sidebarCatalogue({courses:[{id:9,slug:'custom',title:'CMS 新课程'}]})).title,'CMS 新课程');
});
