#!/usr/bin/env bash
# Guarded engineering update for the existing installation, not a Docker takeover.
set -euo pipefail
umask 077
stage="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
snippet=/etc/nginx/snippets/oneshowlearn-app.conf
modules=(config db index resumable-uploads upload-schema)
[[ "$EUID" -eq 0 && "$stage" =~ ^/tmp/oneshowlearn-engineering-[a-zA-Z0-9]+$ && -d "$stage" && ! -L "$stage" ]] || exit 1
if find "$stage" -type l -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
sha256sum --quiet -c "$stage/live.sha256"
(cd "$stage" && sha256sum --quiet -c release.sha256)
test ! -e "$app/server/upload-schema.mjs"
for name in "${modules[@]}"; do "$node" --check "$stage/server/$name.mjs"; done
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/engineering-XXXXXXXX)
cp -a "$app/server" "$app/dist/client" "$backup/"
cp -a "$app/node_modules" "$backup/node_modules"
cp -a "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
cp -a "$snippet" "$backup/oneshowlearn-app.conf"
# Existing runtime versions/integrities are unchanged: no live package install.
"$node" "$stage/deploy/check-engineering-release.mjs" dependencies "$stage" "$backup"
find "$app/node_modules" -type f -exec sha256sum {} + > "$backup/dependencies.sha256"
for file in "$app"/server/*.mjs; do
 name=$(basename "$file" .mjs)
 if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service "$snippet" /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
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
cp -a "$app/server" "$stage/rehearsal/server"
cp -a "$stage/package.json" "$stage/rehearsal/package.json"
ln -s "$app/node_modules" "$stage/rehearsal/node_modules"
cp -a "$backup/before.db" "$stage/rehearsal/copy.db"
for name in "${modules[@]}"; do install -m 600 "$stage/server/$name.mjs" "$stage/rehearsal/server/$name.mjs"; done
"$node" "$stage/deploy/check-engineering-release.mjs" rehearse "$stage" "$backup"
sha256sum --quiet -c "$stage/live.sha256"
sha256sum --quiet -c "$backup/dependencies.sha256"
sha256sum --quiet -c "$backup/unchanged.sha256"
for file in "$stage/client/assets/"*; do
 target="$app/dist/client/assets/$(basename "$file")"
 if [[ -e "$target" ]]; then cmp "$file" "$target"; else install -m 644 "$file" "$target"; fi
done
maintenance=false
changed=false
restore_proxy(){
 install -m 644 "$backup/oneshowlearn-app.conf" "$snippet.next"
 mv -f "$snippet.next" "$snippet"
 nginx -t
 systemctl reload nginx
 maintenance=false
}
rollback(){
 result=$?; trap - EXIT
 if [[ "$changed" = true ]]; then
  systemctl stop oneshowlearn || true
  for name in "${modules[@]}"; do
   if [[ -f "$backup/server/$name.mjs" ]]; then install -m 644 "$backup/server/$name.mjs" "$app/server/$name.mjs";
   elif [[ "$name" = upload-schema ]]; then rm -f /var/www/oneshowlearn/server/upload-schema.mjs; fi
  done
  install -m 644 "$backup/package.json" "$app/package.json"
  install -m 644 "$backup/package-lock.json" "$app/package-lock.json"
  install -m 644 "$backup/client/index.html" "$app/dist/client/index.html"
  systemctl start oneshowlearn || true
 fi
 if [[ "$maintenance" = true ]]; then restore_proxy; fi
 echo "Release failed; prior code/entry restored, current data retained. Backup: $backup" >&2
 exit "$result"
}
trap rollback EXIT
# Temporary outer API maintenance stops new user writes/callbacks (503 retries).
# Original proxy is restored even when the active-operation guard defers release.
maintenance=true
"$node" --input-type=module - "$snippet" <<'NODE'
import{readFileSync,writeFileSync,renameSync}from'node:fs';const p=process.argv[2],s=readFileSync(p,'utf8');
if((s.match(/location \^~ \/api\/(?:auth\/)? \{/g)||[]).length!==2)throw Error('Unexpected proxy layout');
const text=s.replace(/(location \^~ \/api\/(?:auth\/)? \{)/g,'$1\n    add_header Retry-After 30 always;\n    return 503;');writeFileSync(p+'.next',text,{mode:0o644});renameSync(p+'.next',p);
NODE
nginx -t
systemctl reload nginx
sleep 5
[[ "$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' https://oneshowlearn.com/api/health)" = 503 ]]
DATABASE_PATH="$app/data/oneshowlearn.db" "$node" "$stage/deploy/portable/database-tools.mjs" idle
systemctl stop oneshowlearn
snapshot "$backup/release.db"
cp -a "$app/uploads" "$app/uploads-private" "$backup/"
for name in .ai-config.key .payment-config.key .auth-config.key; do
 if [[ -f "$app/data/$name" ]]; then cp -a "$app/data/$name" "$backup/"; fi
done
changed=true
for name in "${modules[@]}"; do install -m 644 "$stage/server/$name.mjs" "$app/server/$name.mjs.next"; mv -f "$app/server/$name.mjs.next" "$app/server/$name.mjs"; done
install -m 644 "$stage/package.json" "$app/package.json"
install -m 644 "$stage/package-lock.json" "$app/package-lock.json"
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do
 if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/ready | grep -q '"ok":true'; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
"$node" "$stage/deploy/check-engineering-release.mjs" live "$stage" "$backup"
install -m 644 "$stage/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
restore_proxy
"$node" "$stage/deploy/verify-frontend.mjs" "$stage/client"
"$node" "$stage/deploy/check-engineering-release.mjs" https "$stage" "$backup"
sha256sum --quiet -c "$backup/unchanged.sha256"
sha256sum --quiet -c "$backup/dependencies.sha256"
for name in "${modules[@]}"; do cmp "$stage/server/$name.mjs" "$app/server/$name.mjs"; done
cmp "$stage/package.json" "$app/package.json"
cmp "$stage/package-lock.json" "$app/package-lock.json"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.after"
cmp "$backup/unrelated.before" "$backup/unrelated.after"
systemctl is-active --quiet oneshowlearn
trap - EXIT
echo "PASS existing-service engineering release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
