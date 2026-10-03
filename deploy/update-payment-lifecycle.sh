#!/usr/bin/env bash
# Additive, hash-guarded payment lifecycle release; never imports local fixtures.
set -euo pipefail
umask 077
staging="${1:?Staging required}"
mode="${2:-initial}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-paytest-deploy-* && -d "$staging" && ! -L "$staging" ]] || exit 1
modules=(index payment-schema payment-providers payment-routes payment-lifecycle)
if [[ "$mode" = compatibility ]]; then modules=(payment-providers payment-lifecycle);
elif [[ "$mode" = website ]]; then modules=(payment-schema payment-providers payment-routes payment-lifecycle payment-diagnostics);
else [[ "$mode" = initial ]] || exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
cd "$app"
sha256sum --quiet -c "$staging/live.sha256"
if [[ "$mode" != initial ]]; then test -f "$app/server/payment-lifecycle.mjs"; else test ! -e "$app/server/payment-lifecycle.mjs"; fi
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
backup=$(mktemp -d /var/backups/oneshowlearn/payment-lifecycle-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
if [[ "$mode" = website ]]; then cp -a "$app/node_modules" "$backup/node_modules"; fi
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();' "$backup/before.db"
chmod 600 "$backup/before.db"
for file in "$app"/server/*.mjs; do
  name=$(basename "$file" .mjs)
  if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 15 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
mkdir -p "$staging/rehearsal/tests"
cp -a "$app/server" "$staging/rehearsal/server"
for module in "${modules[@]}"; do cp "$staging/server/$module.mjs" "$staging/rehearsal/server/"; done
cp "$staging/tests/"*.mjs "$staging/rehearsal/tests/"
ln -s "$app/node_modules" "$staging/rehearsal/node_modules"
if [[ "$mode" = website ]]; then
  cp -a "$staging/src" "$staging/rehearsal/src"
  cp "$app/package.json" "$staging/rehearsal/package.json"
  (cd "$staging/rehearsal" && "$node" --test tests/payment-diagnostics.test.mjs tests/payments.test.mjs tests/alipay-page-pay.test.mjs)
else
  (cd "$staging/rehearsal" && "$node" --test tests/payment-diagnostics.test.mjs tests/payments.test.mjs)
fi
cp "$backup/before.db" "$staging/rehearsal/rehearsal.db"
"$node" "$staging/deploy/check-payment-lifecycle.mjs" rehearse "$backup" "$staging/rehearsal" "$mode"
sha256sum --quiet -c "$staging/live.sha256"
sha256sum --quiet -c "$backup/unchanged.sha256"
echo "Server and production-copy rehearsal passed; backup: $backup"
rollback(){
  result=$?
  trap - EXIT
  systemctl stop oneshowlearn
  for module in "${modules[@]}"; do
    if [[ -f "$backup/server/$module.mjs" ]]; then install -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs";
    elif [[ "$module" = payment-lifecycle && -f "$app/server/payment-lifecycle.mjs" ]]; then mv "$app/server/payment-lifecycle.mjs" "$backup/failed-payment-lifecycle.mjs"; fi
  done
  if [[ "$mode" != compatibility ]]; then
    install -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
    mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  fi
  systemctl start oneshowlearn
  echo 'Restored protected code/entry; additive schema and all live records retained (no whole-database rollback).' >&2
  exit "$result"
}
if [[ "$mode" != compatibility ]]; then
  cp -a "$staging/client/assets/." "$app/dist/client/assets/"
  chown -R root:root "$app/dist/client/assets"
  find "$app/dist/client/assets" -type d -exec chmod 755 {} +
  find "$app/dist/client/assets" -type f -exec chmod 644 {} +
fi
# Do not interrupt an existing mutation or let its orphaned lease block users.
for attempt in {1..20}; do
  locks=$("$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db",{readOnly:true});console.log(d.prepare("SELECT COUNT(*) n FROM payment_checkout_locks WHERE lease_until>unixepoch()").get().n);d.close();')
  if [[ "$locks" = 0 ]]; then break; fi
  sleep 1
done
test "$locks" = 0
# Startup acceptance is gateway-free. Abort if a user's pending payment now needs
# automatic reconciliation; do not disable the worker or modify those records.
if [[ "$mode" = website ]]; then
  "$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db",{readOnly:true});const n=d.prepare("SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.status=? AND c.next_sync_at>0").get("pending").n;d.close();if(n)throw new Error("Active scheduled payments: release deferred");'
fi
sha256sum --quiet -c "$staging/live.sha256"
trap rollback EXIT
systemctl stop oneshowlearn
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();' "$backup/release.db"
chmod 600 "$backup/release.db"
for module in "${modules[@]}"; do install -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/check-payment-lifecycle.mjs" live "$backup" '' "$mode"
if [[ "$mode" != compatibility ]]; then
  install -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
fi
if [[ "$mode" = compatibility ]]; then "$node" "$staging/deploy/verify-frontend.mjs" "$backup/client"; else "$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"; fi
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS payment lifecycle deployed; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
