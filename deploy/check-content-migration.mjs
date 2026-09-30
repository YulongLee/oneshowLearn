import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [staging,backup]=process.argv.slice(2);
process.env.DATABASE_PATH=`${backup}/migration-check.db`;
const old=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});
const {db}=await import(pathToFileURL(`${staging}/server/db.mjs`));
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
const tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
for(const {name} of tables){
  const cols=old.prepare(`PRAGMA table_info("${name}")`).all().map(c=>`"${c.name}"`).join(',');
  assert.deepEqual(db.prepare(`SELECT ${cols} FROM "${name}" ORDER BY rowid`).all(),old.prepare(`SELECT ${cols} FROM "${name}" ORDER BY rowid`).all(),`Existing records changed in ${name}`);
}
for(const name of ['content_library','practice_projects','practice_project_courses','site_pages','site_page_history'])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(name));
console.log(`PASS migration rehearsal: ${tables.length} existing tables preserved; integrity and foreign keys valid`);
db.close();old.close();
