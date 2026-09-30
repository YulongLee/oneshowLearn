#!/usr/bin/env bash
# Scoped homepage repair: no seed, migration, dependency install or configuration change.
set -euo pipefail
staging="${1:?Pass verified release directory}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-homecards-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
modules=(homepage-cards.mjs site-defaults.mjs platform-content.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/homecards-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
"$node" --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db"); db.prepare("VACUUM INTO ?").run(process.argv[1]); db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db" "$backup/oneshowlearn.env"
echo "Rollback snapshot: $backup"
rollback() {
  local result=$?
  trap - EXIT
  echo 'Release failed; restoring previous application code and entry, never the live database.' >&2
  cp -a "$backup/server/." "$app/server/"
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT
# Old hashed assets remain available for existing tabs and rollback.
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
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
  if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" "$staging/deploy/verify-home-cards.mjs" http://127.0.0.1:8791
sha256sum --check "$backup/unchanged.sha256"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/dist/client"
trap - EXIT
echo "Homepage repair published. Rollback code and entry: $backup"
sha256sum "$app/dist/client/index.html"
