#!/usr/bin/env bash
# Scoped web-answer release; no content import or configuration replacement.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-tutor-web-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/dist/client" -name '._*' -print -quit | grep -q .; then exit 1; fi
modules=(ai-configuration.mjs ai-provider.mjs ai-web-search.mjs course-ai-service.mjs tutor-conversations.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; done
for file in "$app"/server/*.mjs; do
  name=$(basename "$file")
  if [[ " ${modules[*]} " != *" $name "* ]]; then cmp "$file" "$staging/server/$name"; fi
done
if ! cmp -s "$app/package-lock.json" "$staging/package-lock.json"; then "$node" "$staging/deploy/check-tutor-render-deps.mjs" "$staging"; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8 || exit 1
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/tutor-web-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.before"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
echo "Rollback snapshot: $backup"
"$node" "$staging/deploy/check-tutor-history.mjs" "$staging" "$backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'Verification failed; restoring previous code/entry, preserving live database.' >&2
  cp -a "$backup/server/." "$app/server/"
  cp -a "$backup/package.json" "$backup/package-lock.json" "$app/"
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
"$node" "$staging/deploy/smoke-tutor-history.mjs"
"$node" "$staging/deploy/smoke-tutor-web.mjs"
"$node" "$staging/deploy/check-tutor-history.mjs" "$staging" "$backup" verify-live
sha256sum --check "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.after"
cmp "$backup/other-services.before" "$backup/other-services.after"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/dist/client"
trap - EXIT
echo "Tutor web answers published. Rollback: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn.service -p ActiveState -p MainPID -p NRestarts
