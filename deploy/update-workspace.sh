#!/usr/bin/env bash
# Targeted workspace release. No seed, dependency install, mail change or Nginx reload.
set -euo pipefail
staging="${1:?Pass the uploaded workspace release directory}"
app=/var/www/oneshowlearn
[[ "$EUID" -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ "$staging" == /tmp/oneshowlearn-workspace-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/dist/client/index.html"
test -f "$staging/server/workspace-routes.mjs"
modules=(workspace-routes.mjs db.mjs index.mjs opc-definition.mjs opc-routes.mjs project-routes.mjs resource-routes.mjs)
for name in "${modules[@]}"; do
  test -f "$staging/server/$name"
  /opt/node-v22/bin/node --check "$staging/server/$name"
done
test -f "$app/data/oneshowlearn.db"
test -f /etc/oneshowlearn/oneshowlearn.env
cmp "$staging/package-lock.json" "$app/package-lock.json"
if find "$staging" -type l -print -quit | grep -q .; then
  echo 'Release must not contain symbolic links'; exit 1
fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9 || { echo 'A workspace release is already running'; exit 1; }

install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/workspace-XXXXXXXX)
cp -a "$app/server" "$backup/server"
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/uploads" "$backup/uploads"
cp -p /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
/opt/node-v22/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db"); db.prepare("VACUUM INTO ?").run(process.argv[1]); db.close(); const snapshot=new DatabaseSync(process.argv[1],{readOnly:true}); if(snapshot.prepare("PRAGMA quick_check").get().quick_check!=="ok") throw Error("Invalid database snapshot"); snapshot.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db" "$backup/oneshowlearn.env"
echo "Rollback snapshot: $backup"

rollback() {
  local result=$?
  trap - EXIT
  echo 'Release failed. Restoring previous OneShowLearn code and entry page.' >&2
  cp -a "$backup/server/." "$app/server/"
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  # The additive workspace table and any new user records remain intact.
  systemctl restart oneshowlearn.service || true
  exit "$result"
}
trap rollback EXIT

# Old hashed assets remain available to already-open tabs and a rollback.
cp -a "$staging/dist/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
for name in "${modules[@]}"; do
  install -o root -g root -m 644 "$staging/server/$name" "$app/server/$name.next"
  mv -f "$app/server/$name.next" "$app/server/$name"
done
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
  if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/health | grep -q '"ok":true'; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
/opt/node-v22/bin/node --input-type=module -e 'import assert from "node:assert/strict"; const base="http://127.0.0.1:8791/api"; const catalog=await fetch(base+"/catalog/workspace",{signal:AbortSignal.timeout(5000)}); assert.equal(catalog.status,200); assert.ok(Array.isArray((await catalog.json()).items)); for(const [path,method] of [["/me/workspace","GET"],["/me/workspace/state","PUT"]]) { const response=await fetch(base+path,{method,signal:AbortSignal.timeout(5000)}); assert.equal(response.status,401); } console.log("PASS workspace API and authentication guards");'
/opt/node-v22/bin/node --input-type=module -e 'import assert from "node:assert/strict"; const base="http://127.0.0.1:8791/api"; for(const path of ["/opc/curriculum","/resources"]) { const r=await fetch(base+path,{signal:AbortSignal.timeout(5000)}); assert.equal(r.status,200,path); const data=await r.json(); assert.ok(Array.isArray(data.phases||data.items)); } for(const path of ["/me/opc/product","/admin/opc/steps"]) assert.equal((await fetch(base+path,{signal:AbortSignal.timeout(5000)})).status,401,path); console.log("PASS OPC/resource APIs and private guards");'
install -o root -g root -m 644 "$staging/dist/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
trap - EXIT
echo "Workspace published. Previous version: $backup"
sha256sum "$app/dist/client/index.html" "$app/server/workspace-routes.mjs"
