#!/usr/bin/env bash
# Additive commercial hardening. No live fixtures, provider probes or Git push.
set -euo pipefail
umask 077
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" =~ ^/tmp/oneshowlearn-hardening-[a-zA-Z0-9]+$ && -d "$staging" && ! -L "$staging" ]] || exit 1
modules=(asset-storage course-ai-service index learning-commerce learning-routes materials payment-routes service-routes service-schema workspace-routes list-page manual-refunds notifications operational-readiness resumable-uploads workspace-capacity workspace-search)
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
if find "$staging" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
sha256sum --quiet -c "$staging/live.sha256"
(cd "$staging" && sha256sum --quiet -c release.sha256)
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
for module in list-page manual-refunds notifications operational-readiness resumable-uploads workspace-capacity workspace-search; do test ! -e "$app/server/$module.mjs"; done
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/hardening-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/node_modules" "$backup/node_modules"
cp -a "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
for file in "$app"/server/*.mjs; do
 name=$(basename "$file" .mjs)
 if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.before"
"$node" --input-type=module - "$backup/before.db" <<'NODE'
import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');d.exec('PRAGMA busy_timeout=5000');d.prepare('VACUUM INTO ?').run(process.argv[2]);d.close();
NODE
for endpoint in offer status resources entry projects service; do
 case "$endpoint" in
  offer) route=/api/commerce/offer;; status) route=/api/auth/status;; resources) route=/api/resources;;
  entry) route=/api/learning/entry;; projects) route=/api/learning/projects;; service) route=/api/service/public;;
 esac
 curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$endpoint.before.json"
done
install -d -m 700 "$staging/rehearsal"
cp -a "$app/server" "$staging/rehearsal/server"
cp -a "$app/package.json" "$staging/rehearsal/package.json"
cp -a "$app/node_modules" "$staging/rehearsal/node_modules"
cp -a "$staging/tests" "$staging/src" "$staging/rehearsal/"
cp -a "$backup/before.db" "$staging/rehearsal/copy.db"
for module in "${modules[@]}"; do install -m 600 "$staging/server/$module.mjs" "$staging/rehearsal/server/$module.mjs"; done
(cd "$staging/rehearsal" && env NODE_ENV=test ASSET_STORAGE=local AI_ENABLED=false AI_API_KEY= EMAIL_API_KEY= "$node" --test tests/service-center.test.mjs tests/legacy-upload-security.test.mjs tests/functional-hardening.test.mjs tests/commercial-hardening.test.mjs tests/resumable-uploads.test.mjs tests/asset-storage.test.mjs tests/payments.test.mjs tests/alipay-page-pay.test.mjs tests/payment-diagnostics.test.mjs)
"$node" "$staging/deploy/check-functional-hardening-release.mjs" rehearse "$staging" "$backup"
sha256sum --quiet -c "$staging/live.sha256"
sha256sum --quiet -c "$backup/unchanged.sha256"
(cd "$staging" && sha256sum --quiet -c release.sha256)
echo "Production-copy rehearsal passed. Recoverable backup: $backup"
# Defer if a user payment mutation/reconciliation or model generation is active.
# Never clear leases, cancel orders or stop a running provider request for release.
"$node" --input-type=module <<'NODE'
import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db',{readOnly:true});
const checks=["SELECT COUNT(*) n FROM payment_checkout_locks WHERE lease_until>unixepoch()","SELECT COUNT(*) n FROM payment_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.status='pending' AND c.next_sync_at>0","SELECT COUNT(*) n FROM ai_usage WHERE status='pending' AND julianday(created_at)>julianday('now','-5 minutes')","SELECT COUNT(*) n FROM tutor_turns WHERE status='pending' AND julianday(updated_at)>julianday('now','-5 minutes')"];
for(const sql of checks)if(d.prepare(sql).get().n)throw Error('Active user operation: release deferred');d.close();
NODE
rollback(){
 result=$?; trap - EXIT
 systemctl stop oneshowlearn || true
 for module in "${modules[@]}"; do
  if [[ -f "$backup/server/$module.mjs" ]]; then install -o root -g root -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs.next"; mv -f "$app/server/$module.mjs.next" "$app/server/$module.mjs"; fi
 done
 install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"; mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
 systemctl start oneshowlearn || true
 echo "Prior backend/entry restored. Additive schema and current records retained. Backup: $backup" >&2
 exit "$result"
}
trap rollback EXIT
while IFS= read -r -d '' asset; do
 relative="${asset#"$staging/client/assets/"}"; target="$app/dist/client/assets/$relative"
 if [[ -e "$target" ]]; then cmp "$asset" "$target"; else install -D -o root -g root -m 644 "$asset" "$target"; fi
done < <(find "$staging/client/assets" -type f -print0)
sha256sum --quiet -c "$staging/live.sha256"
systemctl stop oneshowlearn
"$node" --input-type=module - "$backup/release.db" <<'NODE'
import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');d.exec('PRAGMA busy_timeout=5000');d.prepare('VACUUM INTO ?').run(process.argv[2]);d.close();
NODE
for module in "${modules[@]}"; do install -o root -g root -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs.next"; mv -f "$app/server/$module.mjs.next" "$app/server/$module.mjs"; done
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do
 if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"; mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" "$staging/deploy/check-functional-hardening-release.mjs" live "$staging" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
for module in "${modules[@]}"; do cmp "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
systemctl is-active --quiet oneshowlearn
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.after"
cmp "$backup/unrelated.before" "$backup/unrelated.after"
trap - EXIT
echo "PASS functional-hardening release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
