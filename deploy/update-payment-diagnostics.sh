#!/usr/bin/env bash
# Scoped payment diagnostics release: no configuration/dependency/schema changes.
set -euo pipefail
umask 077
staging="${1:?Staging directory required}"
mode="${2:-initial}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-paytest-deploy-* && -d "$staging" && ! -L "$staging" ]] || exit 1
modules=(payment-providers payment-routes payment-diagnostics)
if [[ "$mode" = alipay-probe ]]; then
  modules=(payment-providers payment-diagnostics)
elif [[ "$mode" = checkout ]]; then
  modules=(payment-providers payment-routes payment-checkout-errors)
elif [[ "$mode" = alipay ]]; then
  modules=(payment-configuration payment-providers payment-routes payment-diagnostics)
elif [[ "$mode" = refinement ]]; then
  modules=(payment-configuration payment-providers payment-diagnostics)
else
  [[ "$mode" = initial ]] || exit 1
fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
cd "$app"
sha256sum --quiet -c "$staging/live.sha256"
if [[ "$mode" = checkout ]]; then test ! -e "$app/server/payment-checkout-errors.mjs"; fi
if [[ "$mode" = initial ]]; then test ! -e "$app/server/payment-diagnostics.mjs"; else test -f "$app/server/payment-diagnostics.mjs"; fi
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
backup=$(mktemp -d /var/backups/oneshowlearn/payment-diagnostics-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
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
(cd "$staging/rehearsal" && "$node" --test tests/payment-diagnostics.test.mjs tests/payments.test.mjs)
if [[ "$mode" = checkout ]]; then
  cp "$backup/before.db" "$staging/rehearsal/rehearsal.db"
  "$node" "$staging/deploy/check-payment-switch.mjs" rehearse "$backup" "$staging/rehearsal"
fi
echo "Server rehearsal passed; backup: $backup"
rollback(){
  result=$?
  trap - EXIT
  systemctl stop oneshowlearn
  for module in "${modules[@]}"; do
    if [[ -f "$backup/server/$module.mjs" ]]; then install -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs";
    elif [[ "$module" = payment-checkout-errors && "$mode" = checkout && -f "$app/server/$module.mjs" ]]; then mv "$app/server/$module.mjs" "$backup/failed-$module.mjs"; fi
  done
  if [[ "$mode" != alipay-probe ]]; then
    install -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
    mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  fi
  systemctl start oneshowlearn
  echo 'Restored previous entry and payment modules; live settings and database preserved.' >&2
  exit "$result"
}
trap rollback EXIT
if [[ "$mode" != alipay-probe ]]; then
  cp -a "$staging/client/assets/." "$app/dist/client/assets/"
  chown -R root:root "$app/dist/client/assets"
  find "$app/dist/client/assets" -type d -exec chmod 755 {} +
  find "$app/dist/client/assets" -type f -exec chmod 644 {} +
fi
systemctl stop oneshowlearn
for module in "${modules[@]}"; do install -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/check-payment-diagnostics.mjs" "$backup" "$mode"
if [[ "$mode" = checkout ]]; then "$node" "$staging/deploy/check-payment-switch.mjs" live "$backup"; fi
if [[ "$mode" != alipay-probe ]]; then
  install -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
fi
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS payment connection diagnostics released; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
