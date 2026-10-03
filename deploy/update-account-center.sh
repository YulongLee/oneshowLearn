#!/usr/bin/env bash
# Approved account-center frontend release: no API/configuration/data writes or restart.
set -euo pipefail
umask 077
staging="${1:?Verified staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-account-center-* && -d "$staging" && ! -L "$staging" ]] || exit 1
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
echo '89ad1eb9a9be1dee23f9c10906ac0180e1a2231cc1ad4759100cb582ecfc73d9  /var/www/oneshowlearn/dist/client/index.html' | sha256sum --quiet -c -
echo '57b55f3cd978e5cb58f5bbcb377a78c3716fbf22302d0463f9dcfa8fa4135fc7  '"$staging/client/index.html" | sha256sum --quiet -c -
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/account-center-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
sha256sum "$app"/server/*.mjs "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} > "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
for endpoint in offer status resources entry projects; do
  case "$endpoint" in
    offer) route=/api/commerce/offer;; status) route=/api/auth/status;;
    resources) route=/api/resources;; entry) route=/api/learning/entry;;
    projects) route=/api/learning/projects;;
  esac
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
sha256sum --quiet -c "$backup/unchanged.sha256"
trap rollback EXIT
# Keep old content-addressed files; never overwrite a different existing asset.
while IFS= read -r -d '' asset; do
  relative="${asset#"$staging/client/assets/"}"
  target="$app/dist/client/assets/$relative"
  if [[ -e "$target" ]]; then cmp "$asset" "$target";
  else install -D -o root -g root -m 644 "$asset" "$target"; fi
done < <(find "$staging/client/assets" -type f -print0)
echo '89ad1eb9a9be1dee23f9c10906ac0180e1a2231cc1ad4759100cb582ecfc73d9  /var/www/oneshowlearn/dist/client/index.html' | sha256sum --quiet -c -
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
"$node" --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const [name,route] of [['offer','/api/commerce/offer'],['status','/api/auth/status'],['resources','/api/resources'],['entry','/api/learning/entry'],['projects','/api/learning/projects']]){
  const response=await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),JSON.parse(readFileSync(process.argv[2]+'/'+name+'.before.json')));
}
for(const route of ['/api/auth/profile','/api/auth/identities','/api/commerce/orders']){
  const response=await fetch('https://oneshowlearn.com'+route,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401,route);
}
console.log('PASS unchanged offer/payment/login/catalogues and anonymous account/order privacy; no authenticated writes');
NODE
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS account-center frontend release; backup: $backup"
sha256sum "$app/dist/client/index.html"
