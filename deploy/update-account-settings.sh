#!/usr/bin/env bash
# Narrow settings/brand release. No environment, catalog or account fixture import.
set -euo pipefail
staging="${1:?Settings staging directory required}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
[[ "$EUID" -eq 0 && "$staging" == /tmp/oneshowlearn-settings-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$staging/client/index.html"
test -f "$staging/server/account-profile.mjs"
test -f "$staging/server/account-routes.mjs"
test ! -e "$app/server/account-profile.mjs"
if find "$staging/client" "$staging/server" -type l -print -quit | grep -q .; then exit 1; fi
exec 9>/var/lock/oneshowlearn-workspace-release.lock
flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock
flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock
flock -n 7
test "$(sha256sum "$app/server/account-routes.mjs" | cut -d' ' -f1)" = 5063496a964b25af2c266f149e4beea3f3d8fdb357ffd0962d2d320e43e2f119
"$node" --check "$staging/server/account-profile.mjs"
"$node" --check "$staging/server/account-routes.mjs"
install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/settings-XXXXXXXX)
cp -a "$app/dist/client" "$backup/client"
cp -a "$app/server/account-routes.mjs" "$backup/account-routes.mjs"
cp -a /etc/oneshowlearn/oneshowlearn.env "$backup/oneshowlearn.env"
"$node" --input-type=module -e 'import{DatabaseSync}from"node:sqlite";const db=new DatabaseSync("/var/www/oneshowlearn/data/oneshowlearn.db");db.prepare("VACUUM INTO ?").run(process.argv[1]);db.close();' "$backup/oneshowlearn.db"
chmod 600 "$backup/oneshowlearn.db"
for file in "$app"/server/*.mjs; do
  [[ "$file" == "$app/server/account-routes.mjs" ]] || sha256sum "$file"
done > "$backup/unchanged.sha256"
sha256sum "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service /etc/nginx/snippets/oneshowlearn-app.conf /etc/nginx/sites-available/{oneshowlearn,default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
curl --max-time 10 -fsS http://127.0.0.1:8791/api/commerce/offer > "$backup/offer.before.json"
echo "Rollback snapshot: $backup"

# Rehearse the complete startup and additive migration on a consistent copy.
mkdir "$backup/rehearsal"
cp -a "$app/server" "$backup/rehearsal/server"
cp "$staging/server/"account-{routes,profile}.mjs "$backup/rehearsal/server/"
ln -s "$app/node_modules" "$backup/rehearsal/node_modules"
cp "$backup/oneshowlearn.db" "$backup/rehearsal.db"
DATABASE_PATH="$backup/rehearsal.db" "$node" --env-file=/etc/oneshowlearn/oneshowlearn.env --input-type=module - "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const backup=process.argv[2];
const {createApp}=await import(`${backup}/rehearsal/server/index.mjs`);
createApp();
const before=new DatabaseSync(`${backup}/oneshowlearn.db`,{readOnly:true});
const after=new DatabaseSync(`${backup}/rehearsal.db`,{readOnly:true});
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x=>x.name);
assert.deepEqual(tables(after).filter(x=>x!=='account_profiles'),tables(before));
for(const table of tables(before)){
  const read=db=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM "${table.replaceAll('"','""')}"`).all().map(x=>JSON.stringify(x)).sort())).digest('hex');
  assert.equal(read(after),read(before),table);
}
assert.equal(after.prepare('SELECT COUNT(*) n FROM account_profiles').get().n,0);
before.close();after.close();
console.log('PASS migration rehearsal: every existing table unchanged; only empty private profile table added');
NODE

rollback(){
  local result=$?
  trap - EXIT
  echo 'Restoring prior account routes and frontend entry; preserving live data.' >&2
  install -o root -g root -m 644 "$backup/account-routes.mjs" "$app/server/account-routes.mjs"
  install -o root -g root -m 644 "$backup/client/index.html" "$app/dist/client/index.html.next"
  mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
  systemctl restart oneshowlearn.service
  exit "$result"
}
trap rollback EXIT
cp -a "$staging/client/assets/." "$app/dist/client/assets/"
chown -R root:root "$app/dist/client/assets"
find "$app/dist/client/assets" -type d -exec chmod 755 {} +
find "$app/dist/client/assets" -type f -exec chmod 644 {} +
for module in account-profile account-routes; do
  install -o root -g root -m 644 "$staging/server/$module.mjs" "$app/server/$module.mjs.next"
  mv -f "$app/server/$module.mjs.next" "$app/server/$module.mjs"
done
systemctl restart oneshowlearn.service
ready=false
for attempt in {1..12}; do
  if curl --max-time 3 -fsS http://127.0.0.1:8791/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
"$node" --env-file=/etc/oneshowlearn/oneshowlearn.env --input-type=module - "$app" "$backup" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const [app,backup]=process.argv.slice(2);
const db=new DatabaseSync(`${app}/data/oneshowlearn.db`,{readOnly:true});
const user=db.prepare("SELECT id,email,name,role,token_version FROM users WHERE status='active' AND email_verified=1 ORDER BY id LIMIT 1").get();
assert.ok(user,'An existing verified account is required for read-only probe');
const jwt=createRequire(`${app}/package.json`)('jsonwebtoken');
const token=jwt.sign({sub:String(user.id),role:user.role,email:user.email,ver:user.token_version},process.env.JWT_SECRET,{expiresIn:60});
const headers={Authorization:`Bearer ${token}`};
const response=await fetch('http://127.0.0.1:8791/api/auth/profile',{headers});
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
const profile=await response.json();assert.equal(profile.name,user.name);assert.equal(profile.email,user.email);assert.equal(profile.avatar,'');assert.equal(profile.bio,'');
const me=await fetch('http://127.0.0.1:8791/api/auth/me',{headers});assert.equal(me.status,200);assert.equal((await me.json()).user.name,user.name);
assert.equal(db.prepare('SELECT COUNT(*) n FROM account_profiles').get().n,0,'No production profile records should be seeded');
db.close();
const offer=await fetch('https://oneshowlearn.com/api/commerce/offer');assert.equal(offer.status,200);assert.deepEqual(await offer.json(),JSON.parse(readFileSync(`${backup}/offer.before.json`)));
console.log('PASS authenticated profile/me reads, no seeded profiles, pricing and payment availability unchanged');
NODE
install -o root -g root -m 644 "$staging/client/index.html" "$app/dist/client/index.html.next"
mv -f "$app/dist/client/index.html.next" "$app/dist/client/index.html"
"$node" "$staging/deploy/verify-frontend.mjs" "$staging/client"
sha256sum --quiet -c "$backup/unchanged.sha256"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.after"
cmp "$backup/services.before" "$backup/services.after"
trap - EXIT
echo "PASS settings and brand release; backup: $backup"
sha256sum "$app/dist/client/index.html"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
