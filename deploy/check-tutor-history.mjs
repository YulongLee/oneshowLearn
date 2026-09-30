// Rehearse the additive schema on a private server-side copy; never copy local data.
import assert from 'node:assert/strict';
import {copyFileSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [staging,backup,mode='rehearse']=process.argv.slice(2);
const old=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});
let target;
if(mode==='rehearse'){
  target=`${backup}/history-migration-check.db`;copyFileSync(`${backup}/oneshowlearn.db`,target);chmodSync(target,0o600);
}else{assert.equal(mode,'verify-live');target='/var/www/oneshowlearn/data/oneshowlearn.db';}
const current=new DatabaseSync(target,{readOnly:mode!=='rehearse'});
if(mode==='rehearse'){const {migrateAI}=await import(pathToFileURL(`${staging}/server/ai-schema.mjs`));migrateAI(current);migrateAI(current);}
assert.equal(current.prepare('PRAGMA quick_check').get().quick_check,'ok');
assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(),[]);
let unchanged=0;const changed=[];
for(const {name} of old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const quote=s=>'"'+s.replaceAll('"','""')+'"';
  const cols=old.prepare(`PRAGMA table_info(${quote(name)})`).all().map(c=>quote(c.name)).join(',');
  const before=old.prepare(`SELECT ${cols} FROM ${quote(name)} ORDER BY rowid`).all();
  const after=current.prepare(`SELECT ${cols} FROM ${quote(name)} ORDER BY rowid`).all();
  if(mode==='verify-live'&&['users','auth_rate_limits','ai_usage'].includes(name)){
    if(JSON.stringify(before)!==JSON.stringify(after))changed.push(name);else unchanged++;
  }else{assert.deepEqual(after,before,`Unexpected record change: ${name}`);unchanged++;}
}
for(const table of ['tutor_conversations','tutor_turns'])assert.ok(current.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
console.log(`PASS ${mode}: integrity, foreign keys, ${unchanged} unchanged original tables; expected verification metadata changes: ${changed.join(', ')||'none'}`);
current.close();old.close();
