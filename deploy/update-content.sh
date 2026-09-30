#!/usr/bin/env bash
# Targeted CMS release. No seed, dependency install, credential change or Nginx reload.
set -euo pipefail
staging="${1:?Pass the uploaded content release directory}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-workspace-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
modules=(db.mjs index.mjs workspace-routes.mjs opc-definition.mjs opc-routes.mjs project-routes.mjs resource-routes.mjs cms-routes.mjs materials.mjs platform-content.mjs site-defaults.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
for name in auth.mjs config.mjs email.mjs account-routes.mjs account-security.mjs seed.mjs; do cmp "$staging/server/$name" "$app/server/$name"; done
cmp "$staging/package-lock.json" "$app/package-lock.json"
cmp "$staging/deploy/nginx-oneshowlearn-app.conf" /etc/nginx/snippets/oneshowlearn-app.conf
if find "$staging" -type l -print -quit | grep -q .; then echo 'Unexpected symlink in release'; exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
"$node" --input-type=module -e 'process.loadEnvFile("/etc/oneshowlearn/oneshowlearn.env"); const {config}=await import("/var/www/oneshowlearn/server/config.mjs"); if(config.databasePath!=="/var/www/oneshowlearn/data/oneshowlearn.db"||config.uploadDir!=="/var/www/oneshowlearn/uploads")throw Error("Unexpected data paths; manual review required");'
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/content-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/uploads" "$backup/uploads"
if [[ -d "$app/uploads-private" ]]; then cp -a "$app/uploads-private" "$backup/uploads-private"; fi
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
cp -p /etc/systemd/system/oneshowlearn.service "$backup/oneshowlearn.service"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
"$node" --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db"); db.prepare("VACUUM INTO ?").run(process.argv[1]); db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db" "$backup/oneshowlearn.env"
echo "Rollback snapshot: $backup"
cp "$backup/oneshowlearn.db" "$backup/migration-check.db"
"$node" "$staging/deploy/check-content-migration.mjs" "$staging" "$backup"
rollback() {
  local result=$?
  trap - EXIT
  echo 'Release failed. Restoring previous OneShowLearn code, service unit and entry page.' >&2
  cp -a "$backup/server/." "$app/server/"
  install -o root -g root -m 644 "$backup/oneshowlearn.service" /etc/systemd/system/oneshowlearn.service
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl daemon-reload
  systemctl restart oneshowlearn.service || true
  # Keep additive schema and all post-release user data. Never restore the live DB automatically.
  exit "$result"
}
trap rollback EXIT
install -d -o oneshowlearn -g oneshowlearn -m 700 "$app/uploads-private"
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
for name in "${modules[@]}"; do
  install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"
  mv -f "$app/server/$name.next" "$app/server/$name"
done
install -o root -g root -m 644 "$staging/deploy/oneshowlearn.service" /etc/systemd/system/oneshowlearn.service
systemctl daemon-reload
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
  if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" "$staging/deploy/smoke-content.mjs" http://127.0.0.1:8791
sha256sum --check "$backup/unchanged.sha256"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
trap - EXIT
echo "Content platform published. Previous version: $backup"
sha256sum "$app/dist/client/index.html"
