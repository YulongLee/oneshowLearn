#!/usr/bin/env bash
# Receives an allowlisted OSS configuration JSON through encrypted SSH stdin.
set -euo pipefail
umask 077
staging="${1:?Staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
export PATH=/opt/node-v22/bin:$PATH
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-oss-deploy-* && -d "$staging" && ! -L "$staging" ]] || exit 1
modules=(asset-storage materials community-assets db index)
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
cd "$app"
sha256sum --quiet -c "$staging/live.sha256"
for module in "${modules[@]}"; do "$node" --check "$staging/server/$module.mjs"; done
(cd "$staging" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
"$node" "$staging/deploy/check-resource-storage.mjs" configure "$staging"
backup=$(mktemp -d /var/backups/oneshowlearn/resource-oss-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/package.json" "$app/package-lock.json" "$backup/"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  name=$(basename "$file" .mjs)
  if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
for name in offer status resources courses projects; do
  case "$name" in
    offer) route=/api/commerce/offer;; status) route=/api/auth/status;; resources) route=/api/resources;; courses) route=/api/learning/entry;; projects) route=/api/learning/projects;;
  esac
  curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$name.before.json"
done
mkdir "$staging/rehearsal"
cp -a "$app/server" "$staging/rehearsal/server"
cp "$backup/oneshowlearn.db" "$backup/rehearsal.db"
for module in "${modules[@]}"; do cp "$staging/server/$module.mjs" "$staging/rehearsal/server/"; done
ln -s "$staging/node_modules" "$staging/rehearsal/node_modules"
"$node" "$staging/deploy/check-resource-storage.mjs" rehearse "$staging" "$backup"
echo "Verified rehearsal; rollback snapshot: $backup"
rollback(){
  result=$?
  trap - EXIT
  remote_count=$("$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db",{readOnly:true});console.log(d.prepare("SELECT name FROM sqlite_master WHERE name=?").get("asset_storage")?d.prepare("SELECT COUNT(*) n FROM asset_storage").get().n:0);d.close();')
  if [[ "$remote_count" != 0 ]]; then echo 'Remote assets now exist: retaining cloud-aware code/config to protect uploaded files; manual recovery required.' >&2; exit "$result"; fi
  systemctl stop oneshowlearn
  for module in materials community-assets db index; do install -m 644 "$backup/server/$module.mjs" "$app/server/$module.mjs"; done
  if [[ -d "$backup/node_modules" ]]; then mv "$app/node_modules" "$staging/failed-node_modules"; mv "$backup/node_modules" "$app/node_modules"; fi
  cp "$backup/package.json" "$backup/package-lock.json" "$app/"
  install -o root -g oneshowlearn -m 640 "$backup/oneshowlearn.env" /etc/oneshowlearn/oneshowlearn.env
  install -m 644 "$backup/client/index.html" "$app/dist/client/index.html"
  systemctl start oneshowlearn
  echo 'Prior application/config restored; live database and all existing files preserved.' >&2
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
systemctl stop oneshowlearn
mv "$app/node_modules" "$backup/node_modules"
mv "$staging/node_modules" "$app/node_modules"
chown -R root:root "$app/node_modules"
chmod -R a+rX "$app/node_modules"
install -m 644 "$staging/package.json" "$app/package.json"
install -m 644 "$staging/package-lock.json" "$app/package-lock.json"
for module in "${modules[@]}"; do install -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs"; done
install -o root -g oneshowlearn -m 640 "$staging/proposed.env" /etc/oneshowlearn/oneshowlearn.env
systemctl start oneshowlearn
ready=false
for attempt in {1..20}; do if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi; sleep 1; done
test "$ready" = true
"$node" "$staging/deploy/check-resource-storage.mjs" live "$staging" "$backup"
install -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
"$node" --input-type=module -e 'import{unlinkSync}from"node:fs";unlinkSync(process.argv[1]);' "$staging/proposed.env"
echo "PASS OSS release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
