#!/usr/bin/env bash
# Caller sends only approved SMS credentials on stdin, through SSH.
set -euo pipefail
umask 077
staging="${1:?Login staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-login-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test ! -e "$app/server/login-routes.mjs"
modules=(account-profile account-routes auth course-ai-service db index materials tutor-conversations login-schema login-configuration login-providers login-routes)
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
cd "$app"
sha256sum --quiet -c "$staging/live-server.sha256"
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
backup=$(mktemp -d /var/backups/oneshowlearn/login-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  name=$(basename "$file" .mjs)
  if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 10 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
echo "Rollback snapshot: $backup"
mkdir "$backup/rehearsal"
cp -a "$app/server" "$backup/rehearsal/server"
for module in "${modules[@]}"; do cp "$staging/server/$module.mjs" "$backup/rehearsal/server/"; done
ln -s "$app/node_modules" "$backup/rehearsal/node_modules"
"$node" --env-file=/etc/oneshowlearn/oneshowlearn.env "$staging/deploy/check-login.mjs" rehearse "$staging" "$backup"
"$node" "$staging/deploy/check-login.mjs" key "$staging" "$backup"
rollback(){
  result=$?; trap - EXIT
  echo 'Restoring prior login-related code and frontend; preserving live database and encryption master.' >&2
  for module in "${modules[@]}"; do
    if [[ -f "$backup/server/$module.mjs" ]]; then install -o root -g root -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs"; fi
  done
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
systemctl stop oneshowlearn.service
for module in "${modules[@]}"; do install -o root -g root -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
systemctl start oneshowlearn.service
ready=false
for attempt in {1..15}; do
  if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" "$staging/deploy/check-login.mjs" configure "$staging" "$backup"
"$node" "$staging/deploy/check-login.mjs" smoke "$staging" "$backup"
"$node" "$staging/deploy/check-login.mjs" verify-data "$staging" "$backup"
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" "$staging/deploy/check-login.mjs" verify-env "$staging" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS login release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
