// Read-only comparison against the pre-import backup; never restore live data.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const old=new DatabaseSync('/var/backups/oneshowlearn/demo-import-20260930/before-import.db',{readOnly:true});
const live=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
const contentTables=['learning_paths','project_packs','project_steps','content_items','content_library','practice_projects','learning_lessons','lesson_placements','assets','products'];
let retained=0;
for(const table of contentTables)for(const row of old.prepare(`SELECT * FROM ${table}`).all()) {
  assert.deepEqual(live.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row.id),row,`${table} ${row.id}`);retained++;
}
for(const table of ['entitlements','project_entitlements','learning_progress','learning_notes','project_runs','workspace_state','orders']) {
  assert.deepEqual(live.prepare(`SELECT * FROM ${table}`).all(),old.prepare(`SELECT * FROM ${table}`).all(),table);
}
assert.equal(live.prepare('SELECT COUNT(*) n FROM users').get().n,old.prepare('SELECT COUNT(*) n FROM users').get().n);
assert.deepEqual(live.prepare('PRAGMA foreign_key_check').all(),[]);
console.log(`PASS ${retained} original content/product records retained; learner data and user count unchanged; foreign keys valid`);
old.close();live.close();
