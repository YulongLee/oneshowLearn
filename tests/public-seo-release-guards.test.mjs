import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync,mkdirSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {databaseState,compareDatabase,treeState,assertProxyPair,transientTables,publicAssetLocation} from '../deploy/check-public-seo-release.mjs';

function fixture(t){
  const folder=mkdtempSync(path.join(tmpdir(),'osl-seo-guards-')),file=path.join(folder,'isolated.db'),db=new DatabaseSync(file);
  db.exec(`CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL,large_value INTEGER,payload BLOB);
    CREATE TABLE auth_rate_limits(id INTEGER PRIMARY KEY,value TEXT);
    CREATE TABLE login_challenges(id INTEGER PRIMARY KEY,value TEXT);
    CREATE TABLE payment_checkout_locks(id INTEGER PRIMARY KEY,value TEXT);
    CREATE TABLE another_private_lease(id INTEGER PRIMARY KEY,value TEXT);
    INSERT INTO records(body,large_value,payload) VALUES('ISOLATED_PRIVATE_RECORD',9007199254740993,x'00ff');
    INSERT INTO auth_rate_limits VALUES(1,'before');
    INSERT INTO login_challenges VALUES(1,'before');
    INSERT INTO payment_checkout_locks VALUES(1,'before');
    INSERT INTO another_private_lease VALUES(1,'before');`);
  t.after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
  return {folder,file,db};
}
function proxies(){
  const original=`root /isolated/public;
location ^~ /api/auth/ {
    limit_req zone=oneshowlearn_auth_write_v2 burst=10 nodelay;
    limit_req zone=oneshowlearn_auth_read burst=30 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:8791;
}
location ^~ /api/ {
    proxy_pass http://127.0.0.1:8791;
}
location ^~ /uploads/ {
    proxy_pass http://127.0.0.1:8791;
}
location / {
    try_files $uri $uri/ /index.html;
}
location ~* \\.js$ {
    try_files $uri =404;
}
`;
  const root=`location / {
    if ($request_method !~ ^(GET|HEAD)$) { return 405; }
    if ($uri ~* ^/(api|uploads)(/|$)) { return 404; }
    proxy_pass http://127.0.0.1:8791;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
}`;
  const next=original.replace(/location \/ \{\n[\s\S]*?\n\}/g,publicAssetLocation+'\n\n'+root);
  const maintenance=original.replace(/(location (?:\^~ \/(?:api\/(?:auth\/)?|uploads\/)|\/) \{)/g,'$1\n    add_header Retry-After 30 always;\n    return 503;');
  return {original,next,maintenance};
}
const maintenanceFor=source=>source.replace(/(location (?:\^~ \/(?:api\/(?:auth\/)?|uploads\/)|\/) \{)/g,'$1\n    add_header Retry-After 30 always;\n    return 503;');

test('public SEO release database guard includes sqlite_sequence and exact schemas',t=>{
  const f=fixture(t),before=databaseState(f.file);assert.ok(Object.hasOwn(before.tables,'sqlite_sequence'));
  assert.equal(JSON.stringify(before).includes('ISOLATED_PRIVATE_RECORD'),false);
  f.db.exec("UPDATE sqlite_sequence SET seq=seq+1 WHERE name='records'");
  const changed=databaseState(f.file);assert.equal(changed.tables.records,before.tables.records);
  assert.notEqual(changed.tables.sqlite_sequence,before.tables.sqlite_sequence);
  assert.throws(()=>compareDatabase(changed,before),/sqlite_sequence/);
  f.db.exec('ALTER TABLE records ADD COLUMN unapproved TEXT');
  assert.throws(()=>compareDatabase(databaseState(f.file),before,{schemaOnly:true}),/schema/);
});
test('public SEO release guard compares lossless BigInt and blob values',t=>{
  const f=fixture(t),before=databaseState(f.file);assert.doesNotThrow(()=>compareDatabase(databaseState(f.file),before,{all:true}));
  f.db.exec('UPDATE records SET large_value=9007199254740994');
  assert.throws(()=>compareDatabase(databaseState(f.file),before),/records/);
  f.db.exec("UPDATE records SET large_value=9007199254740993,payload=x'00fe'");
  assert.throws(()=>compareDatabase(databaseState(f.file),before),/records/);
});
test('only the exact three expiring authentication/lease tables are transient',t=>{
  const f=fixture(t),before=databaseState(f.file);
  assert.deepEqual([...transientTables].sort(),['auth_rate_limits','login_challenges','payment_checkout_locks'].sort());
  for(const name of transientTables)f.db.exec('UPDATE '+name+" SET value='after'");
  assert.doesNotThrow(()=>compareDatabase(databaseState(f.file),before));
  assert.throws(()=>compareDatabase(databaseState(f.file),before,{all:true}));
  f.db.exec("UPDATE another_private_lease SET value='actual business change'");
  assert.throws(()=>compareDatabase(databaseState(f.file),before),/another_private_lease/);
});
test('rollback allows legitimate newer values but never a schema or table-set change',t=>{
  const f=fixture(t),before=databaseState(f.file);
  f.db.exec("INSERT INTO records(body,large_value,payload) VALUES('NEW_USER_RECORD',42,x'01')");
  assert.doesNotThrow(()=>compareDatabase(databaseState(f.file),before,{schemaOnly:true}));
  assert.throws(()=>compareDatabase(databaseState(f.file),before));
  f.db.exec('CREATE TABLE unexpected_table(id INTEGER)');
  assert.throws(()=>compareDatabase(databaseState(f.file),before,{schemaOnly:true}));
});
test('tree guards preserve exact bytes, file modes and symlink identity without reading link targets',t=>{
  const f=fixture(t),root=path.join(f.folder,'runtime');mkdirSync(root);
  const file=path.join(root,'package.js');writeFileSync(file,'isolated runtime');chmodSync(file,0o640);
  writeFileSync(path.join(f.folder,'private-outside.txt'),'PRIVATE_TARGET_MUST_NOT_BE_READ');
  const link=path.join(root,'external-link');symlinkSync('../private-outside.txt',link);
  const before=treeState(root);assert.equal(before['package.js'].mode,0o640);
  assert.deepEqual(before['external-link'],{link:'../private-outside.txt'});
  assert.equal(JSON.stringify(before).includes('PRIVATE_TARGET_MUST_NOT_BE_READ'),false);
  chmodSync(file,0o600);assert.notDeepEqual(treeState(root),before);chmodSync(file,0o640);
  writeFileSync(file,'modified runtime');assert.notDeepEqual(treeState(root),before);writeFileSync(file,'isolated runtime');
  unlinkSync(link);symlinkSync('another-target',link);assert.notDeepEqual(treeState(root),before);
});
test('tree guards refuse ambiguous newline names',t=>{
  const f=fixture(t),root=path.join(f.folder,'tree');mkdirSync(root);writeFileSync(path.join(root,'bad\nname'),'isolated');
  assert.throws(()=>treeState(root),/Safe runtime path/);
});
test('proxy pairing accepts only the reviewed document change and exact closed maintenance transform',()=>{
  const p=proxies();assert.doesNotThrow(()=>assertProxyPair(p.original,p.next,p.maintenance));
  const changes=[
    p.next.replace(publicAssetLocation,''),
    p.next.replace('/assets/ {','/assets {'),
    p.next.replace(publicAssetLocation,publicAssetLocation+'\n'+publicAssetLocation),
    p.next.replace(publicAssetLocation,publicAssetLocation.replace('try_files $uri =404;','alias /isolated/private/;')),
    p.next.replace(publicAssetLocation,publicAssetLocation.replace('try_files $uri =404;','proxy_pass http://127.0.0.1:8791;')),
    p.next.replace(publicAssetLocation,publicAssetLocation.replace('try_files $uri =404;','try_files $uri /index.html;')),
    p.next.replace('burst=10 nodelay','burst=999 nodelay'),
    p.next.replace('location ^~ /api/ {','location /api/ {'),
    p.next.replace('if ($request_method !~ ^(GET|HEAD)$) { return 405; }',''),
    p.next.replace('if ($uri ~* ^/(api|uploads)(/|$)) { return 404; }',''),
    p.next.replace('proxy_set_header Cookie "";',''),
    p.next.replace('proxy_set_header Authorization "";',''),
    p.next.replaceAll('http://127.0.0.1:8791','https://external.example.invalid'),
    p.next.replace('proxy_set_header Cookie "";','try_files $uri $uri/ /index.html;'),
  ];
  for(const changed of changes)assert.throws(()=>assertProxyPair(p.original,changed,p.maintenance));
  for(const wrong of [p.original,p.maintenance.replaceAll('return 503','return 502'),p.maintenance+'\n# unreviewed extra'])
    assert.throws(()=>assertProxyPair(p.original,p.next,wrong));
});
test('an already-paired SSR proxy can be retained byte-for-byte with its own closed maintenance transform',()=>{
  const {next,original}=proxies();assert.doesNotThrow(()=>assertProxyPair(next,next,maintenanceFor(next)));
  assert.throws(()=>assertProxyPair(original,original,maintenanceFor(original)),'An unchanged legacy static proxy is not an SSR pair');
});
test('identical proxy bytes never excuse missing, duplicated or unsafe public asset routing',async t=>{
  const {next}=proxies();
  for(const [name,asset] of [
    ['missing public prefix',''],
    ['prefix widened without trailing slash',publicAssetLocation.replace('/assets/ {','/assets {')],
    ['duplicate public prefix',publicAssetLocation+'\n'+publicAssetLocation],
    ['private filesystem alias',publicAssetLocation.replace('try_files $uri =404;','alias /isolated/private/;')],
    ['private filesystem root',publicAssetLocation.replace('try_files $uri =404;','root /isolated/private;\n    try_files $uri =404;')],
    ['asset proxy bypass',publicAssetLocation.replace('try_files $uri =404;','proxy_pass http://127.0.0.1:8791;')],
    ['missing asset document fallback',publicAssetLocation.replace('try_files $uri =404;','try_files $uri /index.html;')],
  ])await t.test(name,()=>{const unsafe=next.replace(publicAssetLocation,asset);assert.throws(()=>assertProxyPair(unsafe,unsafe,maintenanceFor(unsafe)));});
});
test('identical proxy bytes never excuse unsafe document or authentication policy',async t=>{
  const {next}=proxies();
  for(const [name,from,to] of [
    ['document writes','if ($request_method !~ ^(GET|HEAD)$) { return 405; }',''],
    ['mixed-case API/upload bypass','if ($uri ~* ^/(api|uploads)(/|$)) { return 404; }',''],
    ['cookie forwarding','proxy_set_header Cookie "";',''],
    ['authorization forwarding','proxy_set_header Authorization "";',''],
    ['document index fallback','proxy_set_header Cookie "";','proxy_set_header Cookie "";\n    try_files $uri /index.html;'],
    ['external document upstream','proxy_pass http://127.0.0.1:8791;\n    proxy_set_header Cookie','proxy_pass https://external.example.invalid;\n    proxy_set_header Cookie'],
    ['missing write authentication limit','limit_req zone=oneshowlearn_auth_write_v2 burst=10 nodelay;',''],
    ['missing read authentication limit','limit_req zone=oneshowlearn_auth_read burst=30 nodelay;',''],
    ['weakened write authentication budget','burst=10 nodelay','burst=999 nodelay'],
    ['weakened read authentication budget','burst=30 nodelay','burst=999 nodelay'],
    ['missing authentication rejection status','limit_req_status 429;',''],
    ['renamed authentication zone','zone=oneshowlearn_auth_write_v2','zone=unreviewed_auth'],
    ['duplicate authentication limit','limit_req zone=oneshowlearn_auth_read burst=30 nodelay;','limit_req zone=oneshowlearn_auth_read burst=30 nodelay;\n    limit_req zone=oneshowlearn_auth_read burst=30 nodelay;'],
  ])await t.test(name,()=>{
    const unsafe=next.replace(from,to);
    assert.throws(()=>assertProxyPair(unsafe,unsafe,maintenanceFor(unsafe)));
  });
});
test('already-paired SSR proxies permit no simultaneous routing or unrelated policy edits',async t=>{
  const {next}=proxies();
  for(const [name,changed] of [
    ['document timeout',next.replace('proxy_set_header Cookie "";','proxy_set_header Cookie "";\n    proxy_read_timeout 60s;')],
    ['authentication budget',next.replace('burst=10 nodelay','burst=999 nodelay')],
    ['API location priority',next.replace('location ^~ /api/ {','location /api/ {')],
    ['unrelated configuration',next+'\n# unreviewed configuration change\n'],
  ])await t.test(name,()=>assert.throws(()=>assertProxyPair(next,changed,maintenanceFor(next))));
});
test('already-paired SSR maintenance must be the exact closed transform of its current proxy',async t=>{
  const {next,maintenance}=proxies(),expected=maintenanceFor(next);
  for(const [name,wrong] of [
    ['old static maintenance',maintenance],
    ['documents left open',next],
    ['wrong rejection status',expected.replaceAll('return 503;','return 502;')],
    ['one missing closure',expected.replace('    return 503;\n','')],
    ['unreviewed extra content',expected+'\n# unreviewed extra\n'],
  ])await t.test(name,()=>assert.throws(()=>assertProxyPair(next,next,wrong)));
});
