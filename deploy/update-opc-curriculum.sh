#!/usr/bin/env bash
# Owner-approved five-chapter course, demonstration assets and replacement controls.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-curriculum-release-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging" -name '._*' -print -quit | grep -q .; then exit 1; fi
modules=(learning-routes.mjs learning-model.mjs learning-schema.mjs course-ai-grounding.mjs tutor-retrieval.mjs)
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo 'c79ae92e85031f0c414d572e2c3ea09875eb1d82bafd972098b0dc61d09206c5  /var/www/oneshowlearn/dist/client/index.html' | sha256sum --quiet -c -
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
for file in "$app"/server/*.mjs; do
 name=$(basename "$file")
 if [[ " ${modules[*]} " != *" $name "* ]]; then cmp "$file" "$staging/server/$name"; fi
done
cmp "$app/package-lock.json" "$staging/package-lock.json"
# Confirm the approved pre-existing mock video rather than copying a database.
echo 'a489172d33b293d19b75ec82225012dd0a835bea726cde89ec172ec4f5f5996d  /var/www/oneshowlearn/uploads-private/787306c0-de94-4ec5-b8ac-6bc559dbefd7.mp4' | sha256sum --quiet -c -
backup=$(mktemp -d /var/backups/oneshowlearn/curriculum-release-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} "$app/package.json" "$app/package-lock.json" > "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/other-services.before"
curl --max-time 15 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
curl --max-time 15 -fsS http://127.0.0.1:8791/api/auth/status > "$backup/auth.before.json"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/before.db"
chmod 600 "$backup/before.db"
echo "Backup: $backup"
rollback(){
 local result=$?
 trap - EXIT
 cp -a "$backup/server/." "$app/server/"
 install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
 mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
 systemctl restart oneshowlearn.service || true
 echo 'Code restored; database and imported records preserved for reconciliation. Do not blindly retry import.' >&2
 exit "$result"
}
trap rollback EXIT
for name in "${modules[@]}"; do install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"; mv -f "$app/server/$name.next" "$app/server/$name"; done
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/import-opc-curriculum.mjs" --approved-new-opc-course "$staging/media"
"$node" "$staging/deploy/verify-opc-curriculum.mjs" https://oneshowlearn.com "$backup/before.db" "$staging/media"
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/dist/client"
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
for(const [name,route]of [['offer','/api/commerce/offer'],['auth','/api/auth/status']])assert.deepEqual(await(await fetch('http://127.0.0.1:8791'+route)).json(),JSON.parse(readFileSync(process.argv[2]+'/'+name+'.before.json')));
console.log('PASS unchanged payment and login configuration');
NODE
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/other-services.after"
cmp "$backup/other-services.before" "$backup/other-services.after"
trap - EXIT
echo "PASS curriculum release; backup: $backup"
sha256sum "$app/dist/client/index.html"
