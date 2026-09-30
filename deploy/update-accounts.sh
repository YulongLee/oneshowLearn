#!/bin/sh
# Targeted update, preserving production data and all other services. Run as root from staging.
set -eu
test "$(id -u)" = 0
test -f server/account-routes.mjs
test -f dist/client/index.html
test -f /etc/oneshowlearn/oneshowlearn.env
test -f /var/www/oneshowlearn/data/oneshowlearn.db
# This release introduces no dependency changes.
cmp package-lock.json /var/www/oneshowlearn/package-lock.json

staging=$(pwd)
install -d -o root -g root -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/accounts-XXXXXXXX)
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
cp -a /var/www/oneshowlearn/server /var/www/oneshowlearn/dist /var/www/oneshowlearn/package.json "$backup/"
cp -a /var/www/oneshowlearn/uploads "$backup/uploads"
# node:sqlite creates a consistent online snapshot, including committed WAL records.
/opt/node-v22/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db"); db.prepare("VACUUM INTO ?").run(process.argv[1]); db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
echo "Rollback snapshot: $backup"

rollback() {
  echo "Health check failed; restoring prior code and mail configuration." >&2
  cp -a "$backup/server/." /var/www/oneshowlearn/server/
  cp -a "$backup/dist/." /var/www/oneshowlearn/dist/
  cp -p "$backup/package.json" /var/www/oneshowlearn/package.json
  cp -p "$backup/oneshowlearn.env" /etc/oneshowlearn/oneshowlearn.env
  systemctl restart oneshowlearn
  # Do not replace the live database automatically: preserve any new user data.
}
trap rollback EXIT
cp -R "$staging/server/." /var/www/oneshowlearn/server/
# Retain old hashed bundles so already-open browser tabs continue working.
cp -R "$staging/dist/client/assets/." /var/www/oneshowlearn/dist/client/assets/
install -o root -g root -m 644 "$staging/package.json" /var/www/oneshowlearn/package.json
cp -R "$staging/deploy/." /var/www/oneshowlearn/deploy/
chown -R root:root /var/www/oneshowlearn/server /var/www/oneshowlearn/deploy /var/www/oneshowlearn/dist
/opt/node-v22/bin/node "$staging/deploy/configure-email.mjs"
systemctl restart oneshowlearn
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --silent --fail http://127.0.0.1:8791/api/auth/status | grep -q '"registrationEnabled":true'; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
install -o root -g root -m 644 "$staging/dist/client/index.html" /var/www/oneshowlearn/dist/client/index.html
trap - EXIT
echo "Account service update complete. Production data and other services preserved."
