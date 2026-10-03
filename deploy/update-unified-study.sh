#!/usr/bin/env bash
# Approved shared study UI plus course-only completion gate correction.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-study-unified-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
if find "$staging/client" "$staging/server" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/client" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo '4ab4be71c23cc672392a4029a3985fe5629e12a92fc86d6a8db1d7562184f720  /var/www/oneshowlearn/dist/client/index.html' | sha256sum --quiet -c -
echo '22329a1468ad7f7fcf99839500587f90d74a5acb1636651993a0309e2ea7d038  /var/www/oneshowlearn/server/learning-routes.mjs' | sha256sum --quiet -c -
echo '4fb40e0bd897b5cb162a6f3248ce0429dea548f54e1d7ec9f3b79546ff46e644  '"$staging/client/index.html" | sha256sum --quiet -c -
echo '31ee1634c8a1307b04d970024e54d0467834e6ce5874bb70a8dbff6625031956  '"$staging/server/learning-routes.mjs" | sha256sum --quiet -c -
"$node" --check "$staging/server/learning-routes.mjs"
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/study-unified-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/server/learning-routes.mjs" "$backup/learning-routes.mjs"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  [[ "$file" == "$app/server/learning-routes.mjs" ]] || sha256sum "$file"
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
for endpoint in offer status; do
  route=/api/commerce/offer
  [[ "$endpoint" != status ]] || route=/api/auth/status
  curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$endpoint.before.json"
done
echo "Rollback snapshot: $backup"
rollback(){
  local result=$?
  trap - EXIT
  install -o root -g root -m 644 "$backup/learning-routes.mjs" "$app/server/learning-routes.mjs"
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service || true
  echo 'Prior study module and frontend restored; live database not overwritten.' >&2
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
install -o root -g root -m 644 "$staging/server/learning-routes.mjs" "$app/server/learning-routes.mjs.next"
mv -f "$app/server/learning-routes.mjs.next" "$app/server/learning-routes.mjs"
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..15}; do
  if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const backup=process.argv[2];
const get=async route=>{const r=await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
for(const [name,route] of [['offer','/api/commerce/offer'],['status','/api/auth/status']])
  assert.deepEqual(await get(route),JSON.parse(readFileSync(backup+'/'+name+'.before.json')));
const entry=await get('/api/learning/entry');
assert.deepEqual(entry.courses.map(c=>c.slug),['ai-opc-product-company']);
assert.equal(entry.lessons.length,40);
const projects=await get('/api/learning/projects');
assert.equal(projects.total,5);
assert.deepEqual(projects.items.map(p=>p.id).sort((a,b)=>a-b),[1,2,3,5,6]);
for(const p of projects.items){assert.equal(p.lessonCount,1);assert.ok(p.stages.some(s=>s.lessons.length));}
const before=new DatabaseSync(backup+'/oneshowlearn.db',{readOnly:true}),after=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
assert.equal(after.prepare('PRAGMA foreign_key_check').all().length,0);
const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const digest=(db,name)=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.stringify(row)).sort())).digest('hex');
for(const {name} of tables) assert.equal(digest(after,name),digest(before,name),'Data changed: '+name);
before.close();after.close();
console.log(`PASS unchanged price/payment/login, 40 course lessons, five projects, integrity and ${tables.length} unchanged data tables`);
NODE
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
systemctl is-active --quiet oneshowlearn
trap - EXIT
echo "PASS shared study release; backup: $backup"
sha256sum "$app/dist/client/index.html" "$app/server/learning-routes.mjs"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
