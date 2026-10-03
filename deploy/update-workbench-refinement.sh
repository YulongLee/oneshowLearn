#!/usr/bin/env bash
# Owner-approved frontend-only workbench release. No backend writes or restart.
set -euo pipefail
umask 077
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
live_entry=0d2b24d02c35cd5a6e794d07d13340a9fb85974dc7e9a5c639af7a7b6fed3bae
new_entry=1319a6903030297682b3169644c5760f4f8a111b8aecb2dad75e19f095a83030
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-workbench-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
if find "$staging/client" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/client" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
echo "$new_entry  $staging/client/index.html" | sha256sum --quiet -c -
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/workbench-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/server" "$backup/server"
cp -a "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
sha256sum "$app"/server/*.mjs "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
# Consistent snapshot; VACUUM INTO writes only the new backup, never migrates live DB.
"$node" --input-type=module - "$backup" <<'NODE'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');
db.exec('PRAGMA busy_timeout=5000');
db.prepare('VACUUM INTO ?').run(process.argv[2]+'/before.db');db.close();
NODE
for endpoint in offer status resources entry projects; do
  case "$endpoint" in
    offer) route=/api/commerce/offer;; status) route=/api/auth/status;;
    resources) route=/api/resources;; entry) route=/api/learning/entry;;
    projects) route=/api/learning/projects;;
  esac
  curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$endpoint.before.json"
done
echo "Rollback snapshot: $backup"
rollback(){
  local result=$?
  trap - EXIT
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  echo 'Prior frontend entry restored; data and services untouched.' >&2
  exit "$result"
}
sha256sum --quiet -c "$backup/unchanged.sha256"
trap rollback EXIT
# Retain old content-addressed assets and refuse conflicting existing files.
while IFS= read -r -d '' asset; do
  relative="${asset#"$staging/client/assets/"}"
  target="$app/dist/client/assets/$relative"
  if [[ -e "$target" ]]; then cmp "$asset" "$target";
  else install -D -o root -g root -m 644 "$asset" "$target"; fi
done < <(find "$staging/client/assets" -type f -print0)
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const backup=process.argv[2];
for(const [name,route] of [['offer','/api/commerce/offer'],['status','/api/auth/status'],['resources','/api/resources'],['entry','/api/learning/entry'],['projects','/api/learning/projects']]){
 const response=await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),JSON.parse(readFileSync(backup+'/'+name+'.before.json')));
}
for(const route of ['/api/auth/profile','/api/auth/identities','/api/commerce/orders','/api/learning/me/projects'])assert.equal((await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)})).status,401,route);
const before=new DatabaseSync(backup+'/before.db',{readOnly:true}),live=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
for(const table of ['users','orders','entitlements','learning_progress','learning_notes','workspace_state']){
 const keys=before.prepare(`PRAGMA table_info("${table}")`).all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
 assert.ok(keys.length,table);
 const query=keys.map(k=>`"${k}"`).join(','),old=before.prepare(`SELECT ${query} FROM "${table}"`).all();
 const exists=live.prepare(`SELECT 1 FROM "${table}" WHERE ${keys.map(k=>`"${k}"=?`).join(' AND ')}`);
 for(const r of old)assert.ok(exists.get(...keys.map(k=>r[k])),`existing ${table} record preserved`);
}
// Order identity and historical price are immutable; settlement status may advance
// normally from real traffic and is deliberately not frozen by this release.
for(const old of before.prepare('SELECT id,order_no,user_id,amount_cents FROM orders').all())assert.deepEqual(live.prepare('SELECT id,order_no,user_id,amount_cents FROM orders WHERE id=?').get(old.id),old);
for(const table of ['payment_configuration','login_configuration','ai_configuration','service_settings','learning_entry_settings','products','project_packs','learning_paths','project_steps','learning_lessons','lesson_placements','content_library','content_items','practice_projects','practice_project_settings','practice_project_stages']){
 if(!before.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
 assert.deepEqual(live.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),before.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),`unchanged ${table}`);
}
before.close();live.close();
console.log('PASS preserved accounts/private records/order identities and amounts; unchanged provider configuration/pricing/catalogues; anonymous privacy guards');
NODE
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS workbench frontend release; backup: $backup"
sha256sum "$app/dist/client/index.html"
