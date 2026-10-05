#!/usr/bin/env bash
# Scoped source-favorites release. No schema/configuration/content writes or Git.
set -euo pipefail
umask 077
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
live_entry=7c979f30cc71dfc4e2dfe28882a93bf76526aa8f258bf6bbf5aa275dc3bb0684
new_entry=c5c54f8d431231e0d004ab00582853d57d84d01aa5866d097630a509a3d5a59c
old_routes=58274b639d1c24cf768659c941699b6ce46bd12b0a490f9868e1ef04c1db4524
new_routes=bf33efff0330c65787a1c4511d5353fe89cf7527b6d8f93369dbb793557f9c80
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-favorite-source-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
test ! -e "$app/server/workspace-favorites.mjs"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging" -name '._*' -print -quit | grep -q .; then exit 1; fi
for name in workspace-routes.mjs workspace-favorites.mjs; do "$node" --check "$staging/server/$name"; done
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
echo "$new_entry  $staging/client/index.html" | sha256sum --quiet -c -
echo "$old_routes  $app/server/workspace-routes.mjs" | sha256sum --quiet -c -
echo "$new_routes  $staging/server/workspace-routes.mjs" | sha256sum --quiet -c -
(cd "$staging" && sha256sum --quiet -c release.sha256)
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/favorite-source-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/server" "$backup/server"
cp -a "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
sha256sum "$app"/server/*.mjs "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/protected.before.sha256"
awk '$2 !~ /\/server\/workspace-routes.mjs$/' "$backup/protected.before.sha256" > "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.before"
"$node" --input-type=module - "$backup" <<'NODE'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');
db.exec('PRAGMA busy_timeout=5000');db.prepare('VACUUM INTO ?').run(process.argv[2]+'/before.db');db.close();
NODE
for endpoint in offer status resources entry projects; do
 case "$endpoint" in
  offer) route=/api/commerce/offer;; status) route=/api/auth/status;;
  resources) route=/api/resources;; entry) route=/api/learning/entry;; projects) route=/api/learning/projects;;
 esac
 curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$endpoint.before.json"
done
echo "Rollback snapshot: $backup"
# Rehearse only the two proposed modules against server dependencies and DB copy.
install -d -m 700 "$staging/rehearsal"
cp -a "$app/server" "$staging/rehearsal/server"
cp -a "$app/package.json" "$staging/rehearsal/package.json"
cp -a "$app/node_modules" "$staging/rehearsal/node_modules"
cp -a "$backup/before.db" "$staging/rehearsal/copy.db"
for name in workspace-routes.mjs workspace-favorites.mjs; do install -m 600 "$staging/server/$name" "$staging/rehearsal/server/$name"; done
"$node" "$staging/deploy/check-favorite-source-release.mjs" rehearse "$staging" "$backup"
sha256sum --quiet -c "$backup/protected.before.sha256"
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
(cd "$staging" && sha256sum --quiet -c release.sha256)
rollback(){
 local result=$?
 trap - EXIT
 install -o root -g root -m 644 "$backup/server/workspace-routes.mjs" "$app/server/workspace-routes.mjs.next"
 mv -f "$app/server/workspace-routes.mjs.next" "$app/server/workspace-routes.mjs"
 # The new unreferenced helper is left recoverable; never roll back the database.
 install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
 mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
 systemctl restart oneshowlearn.service || true
 echo 'Prior backend/entry restored; records and settings retained.' >&2
 exit "$result"
}
trap rollback EXIT
while IFS= read -r -d '' asset; do
 relative="${asset#"$staging/client/assets/"}"
 target="$app/dist/client/assets/$relative"
 if [[ -e "$target" ]]; then cmp "$asset" "$target";
 else install -D -o root -g root -m 644 "$asset" "$target"; fi
done < <(find "$staging/client/assets" -type f -print0)
for name in workspace-favorites.mjs workspace-routes.mjs; do
 install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"
 mv -f "$app/server/$name.next" "$app/server/$name"
done
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
 if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" "$staging/deploy/check-favorite-source-release.mjs" live "$staging" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
cmp "$staging/server/workspace-routes.mjs" "$app/server/workspace-routes.mjs"
cmp "$staging/server/workspace-favorites.mjs" "$app/server/workspace-favorites.mjs"
systemctl is-active --quiet oneshowlearn
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.after"
cmp "$backup/unrelated.before" "$backup/unrelated.after"
trap - EXIT
echo "PASS favorite-source release; backup: $backup"
sha256sum "$app/dist/client/index.html" "$app/server/workspace-routes.mjs" "$app/server/workspace-favorites.mjs"
