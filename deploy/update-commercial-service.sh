#!/usr/bin/env bash
# Scoped additive release. No fixtures, gateway calls or merchant saves.
set -euo pipefail
umask 077
staging="${1:?Staging required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-commercial-deploy-* && -d "$staging" && ! -L "$staging" ]] || exit 1
modules=(index db materials service-definition service-schema service-routes)
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
cd "$app"
sha256sum --quiet -c "$staging/live.sha256"
for module in service-definition service-schema service-routes; do test ! -e "$app/server/$module.mjs"; done
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
backup=$(mktemp -d /var/backups/oneshowlearn/commercial-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/node_modules" "$backup/node_modules"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
cp -a /etc/nginx/snippets/oneshowlearn-app.conf "$backup/nginx-app.conf"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();' "$backup/before.db"
chmod 600 "$backup/before.db"
for file in "$app"/server/*.mjs; do name=$(basename "$file" .mjs); if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi; done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 15 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
mkdir -p "$staging/rehearsal/tests"
cp -a "$app/server" "$staging/rehearsal/server"
for module in "${modules[@]}"; do cp "$staging/server/$module.mjs" "$staging/rehearsal/server/"; done
cp -a "$staging/tests/." "$staging/rehearsal/tests/"
cp -a "$staging/src" "$staging/rehearsal/src"
cp "$app/package.json" "$staging/rehearsal/package.json"
ln -s "$app/node_modules" "$staging/rehearsal/node_modules"
(cd "$staging/rehearsal" && env NODE_ENV=test AI_ENABLED=false AI_API_KEY= EMAIL_API_KEY= ASSET_STORAGE=local "$node" --test tests/service-center.test.mjs tests/legacy-upload-security.test.mjs tests/payments.test.mjs tests/payment-diagnostics.test.mjs tests/alipay-page-pay.test.mjs tests/asset-storage.test.mjs)
cp "$backup/before.db" "$staging/rehearsal/rehearsal.db"
"$node" "$staging/deploy/check-commercial-service.mjs" rehearse "$backup" "$staging/rehearsal"
sha256sum --quiet -c "$staging/live.sha256"
sha256sum --quiet -c "$backup/unchanged.sha256"
echo "Production-copy rehearsal passed. Recoverable backup: $backup"
rollback(){
 result=$?;trap - EXIT
 systemctl stop oneshowlearn
 for module in "${modules[@]}"; do
  if [[ -f "$backup/server/$module.mjs" ]]; then install -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs";
  elif [[ -f "$app/server/$module.mjs" ]]; then mv "$app/server/$module.mjs" "$backup/failed-$module.mjs"; fi
 done
 install -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next";mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
 install -m 644 "$backup/nginx-app.conf" /etc/nginx/snippets/oneshowlearn-app.conf
 nginx -t && systemctl reload nginx
 systemctl start oneshowlearn
 echo 'Rolled back scoped code/frontend/config; additive tables and live records retained.' >&2
 exit "$result"
}
# Wait boundedly for user payment mutations, never interrupt or clear leases.
for attempt in {1..20}; do
 locks=$("$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db",{readOnly:true});console.log(d.prepare("SELECT COUNT(*) n FROM payment_checkout_locks WHERE lease_until>unixepoch()").get().n);d.close();')
 [[ "$locks" = 0 ]] && break;sleep 1
done
test "$locks" = 0
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db",{readOnly:true});if(d.prepare("SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.status=? AND c.next_sync_at>0").get("pending").n)throw new Error("Scheduled user payments: release deferred");d.close();'
sha256sum --quiet -c "$staging/live.sha256"
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
systemctl stop oneshowlearn
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();' "$backup/release.db"
chmod 600 "$backup/release.db"
for module in "${modules[@]}"; do install -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true;break;fi;sleep 1;done
test "$ready" = true
"$node" "$staging/deploy/check-commercial-service.mjs" live "$backup" ''
install -m 644 "$staging/deploy/nginx-oneshowlearn-app.conf" /etc/nginx/snippets/oneshowlearn-app.conf
nginx -t
systemctl reload nginx
install -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next";mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
asset=$(basename "$staging/client"/assets/index-*.js)
curl --max-time 15 -fsS -H 'Accept-Encoding: gzip' -D "$backup/gzip.headers" "https://oneshowlearn.com/assets/$asset" -o /dev/null
tr -d '\r' < "$backup/gzip.headers" | grep -qi '^Content-Encoding: gzip$'
trap - EXIT
echo "RELEASE PASSED: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p ActiveState -p MainPID -p NRestarts
