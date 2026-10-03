#!/usr/bin/env bash
# Approved 16:9 player and panel visibility release. Frontend only.
set -euo pipefail
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-view-controls-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
if find "$staging/client" -type l -print -quit | grep -q .; then exit 1; fi
if find "$staging/client" -name '._*' -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
echo '8f1a56a8d0d85973ae5bc8bc45ff9752628f032744ab4560f39d5fb317df5c98  /var/www/oneshowlearn/dist/client/index.html' | sha256sum --quiet -c -
echo '395d33d2a1bcaae96aebe004be75d768e79ba3ffef4271737a9845093045cee1  '"$staging/client/index.html" | sha256sum --quiet -c -
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/view-controls-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
sha256sum "$app"/server/*.mjs "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
for endpoint in offer status; do
  route=/api/commerce/offer
  [[ "$endpoint" != status ]] || route=/api/auth/status
  curl --max-time 15 -fsS "http://127.0.0.1:8791$route" > "$backup/$endpoint.before.json"
done
echo "Rollback snapshot: $backup"
rollback(){
  local result=$?
  trap - EXIT
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  echo 'Prior frontend entry restored; data and services unchanged.' >&2
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const [name,route] of [['offer','/api/commerce/offer'],['status','/api/auth/status']]){
  const response=await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),JSON.parse(readFileSync(process.argv[2]+'/'+name+'.before.json')));
}
console.log('PASS unchanged public price/payment and login availability');
NODE
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS frontend release; backup: $backup"
sha256sum "$app/dist/client/index.html"
