#!/usr/bin/env bash
# Scoped October 1 release: navigation/card frontend + default original price.
set -euo pipefail
staging="${1:?Verified offer staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-offer-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -f "$staging/server/payment-configuration.mjs"
if find "$staging/client" "$staging/server" -type l -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
"$node" --check "$staging/server/payment-configuration.mjs"
"$node" --input-type=module - "$app" "$staging" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const [app,stage]=process.argv.slice(2);
const before=readFileSync(`${app}/server/payment-configuration.mjs`,'utf8');
assert.ok(before.includes('originalPriceCents:79900'));
assert.equal(readFileSync(`${stage}/server/payment-configuration.mjs`,'utf8'),before.replace('originalPriceCents:79900','originalPriceCents:99900'));
const db=new DatabaseSync(`${app}/data/oneshowlearn.db`,{readOnly:true});
assert.equal(db.prepare('SELECT COUNT(*) n FROM payment_configuration').get().n,0,'Saved pricing exists: update via versioned admin API instead of silently overriding it');
db.close();
console.log('PASS backend difference is only default original price; no saved merchant settings');
NODE
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/offer-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/server/payment-configuration.mjs" "$backup/payment-configuration.mjs"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  [[ "$file" == "$app/server/payment-configuration.mjs" ]] || sha256sum "$file"
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 10 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
echo "Rollback snapshot: $backup"
rollback(){
  local result=$?
  trap - EXIT
  echo 'Restoring prior pricing module and frontend entry; live database untouched.' >&2
  install -o root -g root -m 644 "$backup/payment-configuration.mjs" "$app/server/payment-configuration.mjs"
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
install -o root -g root -m 644 "$staging/server/payment-configuration.mjs" "$app/server/payment-configuration.mjs.next"
mv -f "$app/server/payment-configuration.mjs.next" "$app/server/payment-configuration.mjs"
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
  if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const before=JSON.parse(readFileSync(`${process.argv[2]}/offer.before.json`));
const response=await fetch('https://oneshowlearn.com/api/commerce/offer',{signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200);
assert.deepEqual(await response.json(),{...before,originalPriceCents:99900});
console.log('PASS original price 999; selling price/product/channels unchanged');
NODE
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS offer release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
