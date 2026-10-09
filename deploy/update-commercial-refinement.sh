#!/usr/bin/env bash
# Reviewed dependency repair + refinement. Existing systemd/Nginx; never roll data back.
set -euo pipefail
umask 077
stage="${1:?Fresh verified staging directory required}"
mode="${2:-}"
[[ "$mode" = '' || "$mode" = --rehearse-only ]] || exit 1
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
snippet=/etc/nginx/snippets/oneshowlearn-app.conf
site=/etc/nginx/sites-available/oneshowlearn
modules=(account-security course-ai-service course-certificates index learning-routes operational-readiness payment-configuration tutor-retrieval tutor-intent)
[[ "$EUID" -eq 0 && "$stage" =~ ^/tmp/oneshowlearn-refinement-[a-zA-Z0-9]+$ && -d "$stage" && ! -L "$stage" ]] || exit 1
if find "$stage" -type l -print -quit | grep -q .; then exit 1; fi
if find "$stage" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
sha256sum --quiet -c "$stage/live.sha256"
(cd "$stage" && sha256sum --quiet -c release.sha256)
for name in "${modules[@]}"; do "$node" --check "$stage/server/$name.mjs"; done
test ! -e "$app/server/tutor-intent.mjs"
install -d -m 700 "$stage/runtime"
install -m 600 "$stage/package.json" "$stage/package-lock.json" "$stage/runtime/"
# Only the isolated new runtime is installed; no production npm mutation or scripts.
(cd "$stage/runtime" && PATH=/opt/node-v22/bin:/usr/bin:/bin npm ci --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-retries=1 --fetch-timeout=20000 && PATH=/opt/node-v22/bin:/usr/bin:/bin npm audit --omit=dev --audit-level=low --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=15000)
chmod -R a+rX "$stage/runtime/node_modules"
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/refinement-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/node_modules" "$backup/node_modules"
cp -a "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
cp -a "$snippet" "$backup/oneshowlearn-app.conf"
cp -a "$site" "$backup/oneshowlearn-site.conf"
find "$app/node_modules" -type f -exec sha256sum {} + > "$backup/dependencies.before.sha256"
find "$stage/runtime/node_modules" -type f -exec sha256sum {} + > "$stage/dependencies.sha256"
for file in "$app"/server/*.mjs; do
 name=$(basename "$file" .mjs)
 if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/sites-available/{default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.before"
snapshot(){ "$node" --input-type=module - "$1" <<'NODE'
import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/var/www/oneshowlearn/data/oneshowlearn.db');d.exec('PRAGMA busy_timeout=5000');d.prepare('VACUUM INTO ?').run(process.argv[2]);d.close();
NODE
}
snapshot "$backup/before.db"
for name in offer status resources entry projects service; do
 case "$name" in
  offer) route=commerce/offer;; status) route=auth/status;; resources) route=resources;; entry) route=learning/entry;; projects) route=learning/projects;; service) route=service/public;;
 esac
 curl --max-time 15 -fsS "http://127.0.0.1:8791/api/$route" > "$backup/$name.before.json"
done
install -d -m 700 "$stage/rehearsal"
cp -a "$stage/server" "$stage/rehearsal/server"
cp -a "$stage/package.json" "$stage/rehearsal/package.json"
ln -s "$stage/runtime/node_modules" "$stage/rehearsal/node_modules"
cp -a "$backup/before.db" "$stage/rehearsal/copy.db"
"$node" "$stage/deploy/check-commercial-refinement.mjs" rehearse "$stage" "$backup"
sha256sum --quiet -c "$stage/live.sha256"
sha256sum --quiet -c "$backup/dependencies.before.sha256"
sha256sum --quiet -c "$backup/unchanged.sha256"
sha256sum --quiet -c "$stage/dependencies.sha256"
if [[ "$mode" = --rehearse-only ]]; then
 echo "PASS provider-blocked rehearsal only; production files/processes untouched; backup: $backup"
 exit 0
fi
while IFS= read -r -d '' file; do
 relative="${file#"$stage/client/assets/"}"; target="$app/dist/client/assets/$relative"
 if [[ -e "$target" ]]; then cmp "$file" "$target"; else install -D -m 644 "$file" "$target"; fi
done < <(find "$stage/client/assets" -type f -print0)
maintenance=false
changed=false
dependencyChanged=false
rollback(){
 result=$?; trap - EXIT
 if [[ "$changed" = true ]]; then
  systemctl stop oneshowlearn || true
  for name in "${modules[@]}"; do
   if [[ -f "$backup/server/$name.mjs" ]]; then install -m 644 "$backup/server/$name.mjs" "$app/server/$name.mjs";
   elif [[ "$name" = tutor-intent ]]; then rm -f "$app/server/tutor-intent.mjs"; fi
  done
  if [[ "$dependencyChanged" = true ]]; then
   if [[ -d "$stage/previous-node_modules" ]]; then
    if [[ -d "$app/node_modules" ]]; then mv "$app/node_modules" "$stage/failed-node_modules"; fi
    mv "$stage/previous-node_modules" "$app/node_modules"
   fi
  fi
  install -m 644 "$backup/package.json" "$app/package.json"
  install -m 644 "$backup/package-lock.json" "$app/package-lock.json"
  install -m 644 "$backup/client/index.html" "$app/dist/client/index.html"
  systemctl start oneshowlearn || true
 fi
 if [[ "$maintenance" = true ]]; then
  install -m 644 "$backup/oneshowlearn-app.conf" "$snippet"
  install -m 644 "$backup/oneshowlearn-site.conf" "$site"
  nginx -t; systemctl reload nginx
 fi
 echo "Release deferred/failed; old code/runtime/proxy restored where changed; current DB and private environment never restored over. Backup: $backup" >&2
 exit "$result"
}
trap rollback EXIT
maintenance=true
"$node" --input-type=module - "$snippet" <<'NODE'
import{readFileSync,writeFileSync,renameSync}from'node:fs';const p=process.argv[2],s=readFileSync(p,'utf8');if((s.match(/location \^~ \/api\/(?:auth\/)? \{/g)||[]).length!==2)throw Error('Unexpected proxy layout');writeFileSync(p+'.next',s.replace(/(location \^~ \/api\/(?:auth\/)? \{)/g,'$1\n    add_header Retry-After 30 always;\n    return 503;'),{mode:0o644});renameSync(p+'.next',p);
NODE
nginx -t
sha256sum "$snippet" > "$backup/maintenance.sha256"
systemctl reload nginx
sleep 5
[[ "$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' https://oneshowlearn.com/api/health)" = 503 ]]
DATABASE_PATH="$app/data/oneshowlearn.db" "$node" "$stage/deploy/portable/database-tools.mjs" idle
awk '$2 != "/etc/nginx/snippets/oneshowlearn-app.conf"' "$stage/live.sha256" | sha256sum --quiet -c -
sha256sum --quiet -c "$backup/maintenance.sha256"
sha256sum --quiet -c "$backup/dependencies.before.sha256"
sha256sum --quiet -c "$stage/dependencies.sha256"
systemctl stop oneshowlearn
snapshot "$backup/release.db"
cp -a "$app/uploads" "$app/uploads-private" "$backup/"
for name in .ai-config.key .payment-config.key .auth-config.key; do if [[ -f "$app/data/$name" ]]; then cp -a "$app/data/$name" "$backup/"; fi; done
changed=true
for name in "${modules[@]}"; do install -m 644 "$stage/server/$name.mjs" "$app/server/$name.mjs.next"; mv -f "$app/server/$name.mjs.next" "$app/server/$name.mjs"; done
dependencyChanged=true
mv "$app/node_modules" "$stage/previous-node_modules"
mv "$stage/runtime/node_modules" "$app/node_modules"
# The checker resolves this stable path after the atomic directory switch.
ln -s "$app/node_modules" "$stage/runtime/node_modules"
install -m 644 "$stage/package.json" "$app/package.json"
install -m 644 "$stage/package-lock.json" "$app/package-lock.json"
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do
 if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/ready | grep -q '"ok":true'; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
"$node" "$stage/deploy/check-commercial-refinement.mjs" live "$stage" "$backup"
install -m 644 "$stage/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
install -m 644 "$stage/nginx-site.conf" "$site"
install -m 644 "$stage/nginx-app.conf" "$snippet"
nginx -t
systemctl reload nginx
"$node" "$stage/deploy/verify-frontend.mjs" "$stage/client"
"$node" "$stage/deploy/check-commercial-refinement.mjs" https "$stage" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
sha256sum --quiet -c "$stage/dependencies.sha256"
for name in "${modules[@]}"; do cmp "$stage/server/$name.mjs" "$app/server/$name.mjs"; done
cmp "$stage/package.json" "$app/package.json"
cmp "$stage/package-lock.json" "$app/package-lock.json"
cmp "$stage/nginx-site.conf" "$site"
cmp "$stage/nginx-app.conf" "$snippet"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.after"
cmp "$backup/unrelated.before" "$backup/unrelated.after"
systemctl is-active --quiet oneshowlearn
"$node" --input-type=module - "$backup/receipt.json" <<'NODE'
import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],JSON.stringify({format:'oneshowlearn-systemd-refinement-backup-v1',createdAt:new Date().toISOString(),rollback:'code/runtime/frontend/proxy only; never replace current database',privateEnvironmentChanged:false,schemaChanged:false})+'\n',{mode:0o600});
NODE
find "$backup" -type f ! -name files.sha256 -exec sha256sum {} + > "$backup/files.sha256"
sha256sum --quiet -c "$backup/files.sha256"
maintenance=false
trap - EXIT
echo "PASS commercial-refinement release; backup: $backup"
sha256sum "$app/dist/client/index.html" "$app/package-lock.json"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
