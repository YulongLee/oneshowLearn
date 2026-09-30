// Public API assertions only. Never saves a page or changes courses/accounts.
import assert from 'node:assert/strict';
import {HOME_CARDS} from '../server/homepage-cards.mjs';
const base=process.argv[2]||'https://oneshowlearn.com';
const get=route=>fetch(base+route,{signal:AbortSignal.timeout(15000)});
const response=await get('/api/site/pages/public');
assert.equal(response.status,200);
const page=await response.json();
assert.equal(page.hotCourseCards.length,4);
assert.deepEqual(page.hotCourseCards.map(c=>c.image),HOME_CARDS.map(c=>c.image));
assert.deepEqual(page.hotCourseCards.map(c=>c.title),HOME_CARDS.map(c=>c.title));
assert.ok(page.hotCourseCards.every(c=>c.course===null&&c.courseId===null));
assert.equal((await get('/api/admin/platform/pages/public')).status,401);
assert.equal((await get('/api/site/pages/workbench')).status,200);
console.log('PASS approved homepage cards, no guessed associations, workbench and admin access guard');
