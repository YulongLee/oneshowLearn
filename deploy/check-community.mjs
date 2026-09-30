import assert from 'node:assert/strict';
import {copyFileSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [staging,backup,mode='rehearse']=process.argv.slice(2);
const old=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});
let current;
if(mode==='rehearse'){
  const target=`${backup}/community-migration-check.db`;
  copyFileSync(`${backup}/oneshowlearn.db`,target);chmodSync(target,0o600);
  process.env.DATABASE_PATH=target;
  process.env.NODE_ENV='test';
  process.env.JWT_SECRET='isolated-migration-rehearsal-only';
  const {db}=await import(pathToFileURL(`${staging}/server/db.mjs`));
  const {communityRouter}=await import(pathToFileURL(`${staging}/server/community-routes.mjs`));
  communityRouter();communityRouter();current=db;
}else{assert.equal(mode,'verify-live');current=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});}
assert.equal(current.prepare('PRAGMA quick_check').get().quick_check,'ok');
assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(),[]);
let unchanged=0;const metadata=[];
for(const {name} of old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const q=s=>'"'+s.replaceAll('"','""')+'"';
  const cols=old.prepare(`PRAGMA table_info(${q(name)})`).all().map(c=>q(c.name)).join(',');
  const before=old.prepare(`SELECT ${cols} FROM ${q(name)} ORDER BY rowid`).all();
  const after=current.prepare(`SELECT ${cols} FROM ${q(name)} ORDER BY rowid`).all();
  if(mode==='verify-live'&&['users','auth_rate_limits'].includes(name)&&JSON.stringify(before)!==JSON.stringify(after))metadata.push(name);
  else{assert.deepEqual(after,before,`Unexpected data change: ${name}`);unchanged++;}
}
for(const table of ['community_records','community_history']){
  assert.ok(current.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
  if(!old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))assert.equal(current.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,'No fixtures permitted');
}
console.log(`PASS ${mode}: integrity, foreign keys, ${unchanged} unchanged tables; login metadata: ${metadata.join(', ')||'none'}; no community fixtures`);
current.close();old.close();
