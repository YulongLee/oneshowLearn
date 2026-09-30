#!/usr/bin/env bash
# Scoped course/project release. Never seeds, restores a live database, or restarts other products.
set -euo pipefail
staging="${1:?Pass verified staging directory}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-workspace-learning-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
# Packages should use COPYFILE_DISABLE=1 tar --no-xattrs. Never publish macOS sidecars.
if find "$staging/dist/client/assets" -name '._*' -print -quit | grep -q .; then echo 'Repackage without Apple metadata'; exit 1; fi
modules=(db.mjs index.mjs workspace-routes.mjs opc-definition.mjs opc-routes.mjs project-routes.mjs resource-routes.mjs cms-routes.mjs materials.mjs platform-content.mjs site-defaults.mjs learning-schema.mjs learning-model.mjs learning-routes.mjs learning-commerce.mjs learning-note-body.mjs course-ai-service.mjs course-ai-grounding.mjs ai-provider.mjs ai-schema.mjs ai-configuration.mjs ai-admin-routes.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
for name in auth.mjs config.mjs email.mjs account-routes.mjs account-security.mjs seed.mjs homepage-cards.mjs; do cmp "$staging/server/$name" "$app/server/$name"; done
# New Tiptap dependencies are bundled in the browser output. Existing API runtime
# packages and their pinned versions must remain unchanged; no npm install on prod.
"$node" --input-type=module -e 'import{readFileSync}from"node:fs";import assert from"node:assert/strict";const [old,next]=process.argv.slice(1).map(p=>JSON.parse(readFileSync(p)));for(const n of ["express","bcryptjs","cors","jsonwebtoken","multer","nodemailer","zod"])assert.deepEqual(next.packages["node_modules/"+n],old.packages["node_modules/"+n],n);' "$app/package-lock.json" "$staging/package-lock.json"
if find "$staging" -type l -print -quit | grep -q .; then echo 'Unexpected symlink'; exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
"$node" --input-type=module -e 'process.loadEnvFile("/etc/oneshowlearn/oneshowlearn.env");const{config}=await import("/var/www/oneshowlearn/server/config.mjs");if(config.databasePath!=="/var/www/oneshowlearn/data/oneshowlearn.db"||config.uploadDir!=="/var/www/oneshowlearn/uploads")throw Error("Unexpected data paths");'
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/learning-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/uploads" "$backup/uploads"
if [[ -d "$app/uploads-private" ]]; then cp -a "$app/uploads-private" "$backup/uploads-private"; fi
cp -p "$app/package.json" "$app/package-lock.json" "$backup/"
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.before"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db" "$backup/oneshowlearn.env"
echo "Rollback snapshot: $backup"
cp "$backup/oneshowlearn.db" "$backup/migration-check.db"
"$node" "$staging/deploy/check-content-migration.mjs" "$staging" "$backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'Release failed; restoring previous code and entry, preserving user database.' >&2
  cp -a "$backup/server/." "$app/server/"
  cp -p "$backup/package.json" "$backup/package-lock.json" "$app/"
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT
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
"$node" "$staging/deploy/smoke-learning.mjs"
sha256sum --check "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.after"
cmp "$backup/other-services.before" "$backup/other-services.after"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
trap - EXIT
echo "Learning release published. Rollback: $backup"
sha256sum "$app/dist/client/index.html"
