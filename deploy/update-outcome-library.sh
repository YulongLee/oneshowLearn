#!/usr/bin/env bash
# Owner-approved frontend-only learner UI release. No backend writes or restart.
set -euo pipefail
umask 077
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
live_entry=c5c54f8d431231e0d004ab00582853d57d84d01aa5866d097630a509a3d5a59c
new_entry=fc91d818ba0b81cc1fe3385cf1e50d84b137366a25c08b2c0ed8d8394f164ea0
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-outcome-library-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo "$live_entry  $app/dist/client/index.html" | sha256sum --quiet -c -
echo "$new_entry  $staging/client/index.html" | sha256sum --quiet -c -
(cd "$staging" && sha256sum --quiet -c release.sha256)
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/outcome-library-XXXXXXXX)
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
"$node" "$staging/deploy/check-outcome-release.mjs" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS outcome-library frontend release; backup: $backup"
sha256sum "$app/dist/client/index.html"
