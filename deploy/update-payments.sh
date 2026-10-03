#!/usr/bin/env bash
# Explicit owner-authorized payment release. No merchant activation or data seeding.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-payments-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
test -d "$staging/node_modules/alipay-sdk"
modules=(index.mjs db.mjs learning-commerce.mjs payment-schema.mjs payment-configuration.mjs payment-providers.mjs payment-routes.mjs)
for name in "${modules[@]}"; do "$node" --check "$staging/server/$name"; test ! -L "$staging/server/$name"; done
for file in "$app"/server/*.mjs; do
  name=$(basename "$file")
  if [[ " ${modules[*]} " != *" $name "* ]]; then cmp "$file" "$staging/server/$name"; fi
done
"$node" "$staging/deploy/check-payments.mjs" dependencies "$staging"
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || exit 1
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8 || exit 1
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/payments-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
sha256sum /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.before"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
tar -czf "$backup/uploads.tar.gz" -C "$app" uploads uploads-private
echo "Rollback snapshot: $backup"
"$node" "$staging/deploy/check-payments.mjs" rehearse "$staging" "$backup"
"$node" "$staging/deploy/check-payments.mjs" key "$staging" "$backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'Verification failed; restoring previous code/dependencies/entry; retaining live database and payment encryption key.' >&2
  systemctl stop oneshowlearn.service || true
  cp -a "$backup/server/." "$app/server/"
  cp -a "$backup/package.json" "$backup/package-lock.json" "$app/"
  if test -d "$backup/node_modules"; then
    if test -d "$app/node_modules"; then mv "$app/node_modules" "$backup/failed-node_modules"; fi
    mv "$backup/node_modules" "$app/node_modules"
  fi
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl start oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
systemctl stop oneshowlearn.service
mv "$app/node_modules" "$backup/node_modules"
mv "$staging/node_modules" "$app/node_modules"
chown -R root:root "$app/node_modules"
for name in "${modules[@]}"; do install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"; mv -f "$app/server/$name.next" "$app/server/$name"; done
install -o root -g root -m 644 "$staging/package.json" "$staging/package-lock.json" "$app/"
systemctl start oneshowlearn.service
ready=false
for attempt in {1..12}; do if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/check-payments.mjs" smoke "$staging" "$backup"
"$node" "$staging/deploy/check-payments.mjs" verify-live "$staging" "$backup"
"$node" "$staging/deploy/check-payments.mjs" verify-env "$staging" "$backup"
sha256sum --check "$backup/unchanged.sha256"
systemctl show nginx.service oneshowseo.service pocketledger.service -p Id -p MainPID > "$backup/other-services.after"
cmp "$backup/other-services.before" "$backup/other-services.after"
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/dist/client"
trap - EXIT
echo "Payment UI and configuration published; merchant channels disabled. Rollback: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn.service -p ActiveState -p MainPID -p NRestarts
