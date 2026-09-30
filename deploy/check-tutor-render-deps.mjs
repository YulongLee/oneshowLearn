// Only two frontend build dependencies may be added; installed server runtime stays intact.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const staging=process.argv[2],app='/var/www/oneshowlearn';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const old=json(`${app}/package.json`),next=json(`${staging}/package.json`);
assert.deepEqual(next.dependencies,old.dependencies);
for(const [key,value] of Object.entries(old.devDependencies))assert.equal(next.devDependencies[key],value);
assert.deepEqual(Object.keys(next.devDependencies).filter(k=>!(k in old.devDependencies)).sort(),['react-markdown','remark-gfm']);
const before=json(`${app}/package-lock.json`),after=json(`${staging}/package-lock.json`);
assert.deepEqual(after.packages[''].dependencies,before.packages[''].dependencies);
for(const [name,pkg] of Object.entries(before.packages)){
  if(!name)continue;
  const updated=after.packages[name];assert.ok(updated,`Missing dependency ${name}`);
  for(const field of ['version','resolved','integrity'])assert.equal(updated[field],pkg[field],`${name}: ${field} changed`);
}
console.log('PASS dependencies: existing packages unchanged, only Markdown build dependencies added; no server installation required');
