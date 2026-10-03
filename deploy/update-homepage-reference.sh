#!/usr/bin/env bash
# Homepage-only release: two read-side CMS modules and verified frontend assets.
set -euo pipefail
staging="${1:?Verified homepage staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-homepage-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
if find "$staging/client" "$staging/server" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/client" -name '._*' -print -quit | grep -q .; then echo 'Repackage into a clean stage without AppleDouble metadata.' >&2; exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
modules=(site-defaults.mjs platform-content.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
# Refuse to overwrite an independently updated production version.
echo '99faa3945118fb5f57e378c3798428c8566b4aaefc9f4e2ecee604617cc10529  /var/www/oneshowlearn/server/platform-content.mjs' | sha256sum --quiet -c -
echo '3e70c3ecd1795d7339e33459157f9df74e1b9ce436e4081629de0859c24a30b4  /var/www/oneshowlearn/server/site-defaults.mjs' | sha256sum --quiet -c -
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/homepage-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
for name in "${modules[@]}"; do cp -a "$app/server/$name" "$backup/$name"; done
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  [[ "$file" == "$app/server/site-defaults.mjs" || "$file" == "$app/server/platform-content.mjs" ]] || sha256sum "$file"
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 10 -fsS http://127.0.0.1:8791/api/site/pages/public > "$backup/home.before.json"
curl --max-time 10 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
echo "Rollback snapshot: $backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'Restoring prior homepage modules and entry; live database remains untouched.' >&2
  for name in "${modules[@]}"; do install -o root -g root -m 644 "$backup/$name" "$app/server/$name"; done
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT
# Retain older hashes for active tabs and rollback.
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
for name in "${modules[@]}"; do
  install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"
  mv -f "$app/server/$name.next" "$app/server/$name"
done
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
  if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {currentPublicCopy,SITE_DEFAULTS} from '/var/www/oneshowlearn/server/site-defaults.mjs';
const backup=process.argv[2];
const get=async path=>{const r=await fetch('https://oneshowlearn.com/api'+path,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
const before=new DatabaseSync(backup+'/oneshowlearn.db',{readOnly:true}),after=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
const oldPage=JSON.parse(readFileSync(backup+'/home.before.json'));
const hasPublished=Boolean(before.prepare("SELECT published_json FROM site_pages WHERE key='public'").get()?.published_json);
const expected=hasPublished?currentPublicCopy(oldPage):{...oldPage,...SITE_DEFAULTS.public,courses:oldPage.courses,projects:oldPage.projects,hotCourseCards:oldPage.hotCourseCards};
assert.deepEqual(await get('/site/pages/public'),expected);
assert.deepEqual(await get('/commerce/offer'),JSON.parse(readFileSync(backup+'/offer.before.json')));
assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
assert.equal(after.prepare('PRAGMA foreign_key_check').all().length,0);
const tables=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const digest=(db,name)=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.stringify(row)).sort())).digest('hex');
for(const {name} of tables)assert.equal(digest(after,name),digest(before,name),'Data changed: '+name);
before.close();after.close();
console.log(`PASS homepage copy, purchase destination, unchanged price/channels, integrity and ${tables.length} unchanged database tables`);
NODE
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS homepage release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
