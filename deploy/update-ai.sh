#!/usr/bin/env bash
# Scoped AI release. Credentials stream on stdin; no local DB/fixtures imported.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-workspace-ai-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/dist/client" -name '._*' -print -quit | grep -q .; then exit 1; fi
modules=(db.mjs index.mjs learning-routes.mjs course-ai-service.mjs course-ai-grounding.mjs ai-provider.mjs ai-schema.mjs ai-configuration.mjs ai-admin-routes.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
for file in "$app"/server/*.mjs; do
  name=$(basename "$file")
  if [[ " ${modules[*]} " != *" $name "* ]]; then cmp "$file" "$staging/server/$name"; fi
done
"$node" --input-type=module -e 'import{readFileSync}from"node:fs";import assert from"node:assert/strict";const [old,next]=process.argv.slice(1).map(p=>JSON.parse(readFileSync(p)));for(const n of ["express","bcryptjs","cors","jsonwebtoken","multer","nodemailer","zod"])assert.deepEqual(next.packages["node_modules/"+n],old.packages["node_modules/"+n],n);' "$app/package-lock.json" "$staging/package-lock.json"
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/ai-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -p "$app/package.json" "$app/package-lock.json" "$backup/"
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
sha256sum /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.before"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db" "$backup/oneshowlearn.env"
echo "Rollback snapshot: $backup"
cp "$backup/oneshowlearn.db" "$backup/migration-check.db"
"$node" "$staging/deploy/check-content-migration.mjs" "$staging" "$backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'AI release failed; restoring previous code, environment and entry; preserving database.' >&2
  cp -a "$backup/server/." "$app/server/"
  cp -p "$backup/package.json" "$backup/package-lock.json" "$app/"
  install -o root -g root -m 600 "$backup/oneshowlearn.env" /etc/oneshowlearn/oneshowlearn.env
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT
"$node" "$staging/deploy/configure-ai.mjs"
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
for name in "${modules[@]}"; do install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"; mv -f "$app/server/$name.next" "$app/server/$name"; done
install -o root -g root -m 644 "$staging/package.json" "$staging/package-lock.json" "$app/"
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/smoke-content.mjs" http://127.0.0.1:8791
"$node" "$staging/deploy/smoke-ai.mjs" http://127.0.0.1:8791 --probe
sha256sum --check "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.after"
cmp "$backup/other-services.before" "$backup/other-services.after"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/dist/client"
"$node" "$staging/deploy/smoke-ai.mjs" https://oneshowlearn.com
trap - EXIT
echo "AI release published. Rollback: $backup"
sha256sum "$app/dist/client/index.html"
