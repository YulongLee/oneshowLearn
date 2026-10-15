#!/usr/bin/env bash
# Paired public-document release on the existing systemd/Nginx installation.
# Never installs dependencies, invokes separate migrations, or restores an old database.
set -euo pipefail
umask 077
stage="${1:?Fresh verified SEO staging directory required}"
mode="${2:-}"
selected_backup="${3:-}"
app=/var/www/oneshowlearn
node=/opt/node-v22/bin/node
snippet=/etc/nginx/snippets/oneshowlearn-app.conf
site=/etc/nginx/sites-available/oneshowlearn
modules=(index payment-configuration public-seo public-seo-data public-seo-model)
[[ "$EUID" -eq 0 && "$stage" =~ ^/tmp/oneshowlearn-seo-[a-zA-Z0-9]+$ && -d "$stage" && ! -L "$stage" ]] || exit 1
[[ "$mode" = '' || "$mode" = --rehearse-only || "$mode" = --rollback-only ]] || exit 1
[[ "$mode" = --rollback-only || -z "$selected_backup" ]] || exit 1
[[ -d "$app" && ! -L "$app" && -x "$node" && -f "$snippet" && ! -L "$snippet" ]] || exit 1
for directory in "$app/server" "$app/dist" "$app/dist/client" "$app/dist/client/assets" "$app/data"; do
  [[ -d "$directory" && ! -L "$directory" ]] || exit 1
done
[[ ! -L "$app/dist/client/.vite" && ! -L "$app/dist/render" ]] || exit 1
exec 9>/var/lock/oneshowlearn-workspace-release.lock; flock -n 9
exec 8>/var/lock/oneshowlearn-deploy.lock; flock -n 8
exec 7>/var/lock/oneshowlearn-frontend.lock; flock -n 7
exec 6>/var/lock/oneshowlearn-public-seo.lock; flock -n 6
checker="$stage/deploy/check-public-seo-release.mjs"
maintenance=false
proxy_changed=false
rollback_mode=false
stopped=false
changed=false
backup=''
release_id="${stage##*/}"
next_render="$app/dist/.render-next-$release_id"
previous_render="$app/dist/.render-previous-$release_id"

check(){ "$node" "$checker" "$1" "$stage" "$backup" "${2:-original}"; }
idle(){ DATABASE_PATH="$app/data/oneshowlearn.db" "$node" "$stage/deploy/portable/database-tools.mjs" idle; }
snapshot(){
  "$node" --input-type=module - "$app/data/oneshowlearn.db" "$1" <<'NODE'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2],{readOnly:true});
try{db.exec('PRAGMA busy_timeout=5000');db.prepare('VACUUM INTO ?').run(process.argv[3]);}
finally{db.close();}
NODE
}
ready(){
  local attempt
  for attempt in {1..20}; do
    if curl --max-time 3 --silent --fail http://127.0.0.1:8791/api/ready | grep -q '"ok":true'; then return 0; fi
    sleep 1
  done
  return 1
}
atomic_file(){
  local source="$1" target="$2" pending
  [[ ! -L "$target" ]] || return 1
  pending=$(mktemp "$target.seo-next-XXXXXXXX") || return 1
  install -o root -g root -m 644 -- "$source" "$pending" || return 1
  mv -f -- "$pending" "$target" || return 1
}
atomic_original(){
  local source="$1" target="$2" pending
  [[ -f "$source" && ! -L "$source" && ! -L "$target" ]] || return 1
  pending=$(mktemp "$target.seo-next-XXXXXXXX") || return 1
  # Preserve original ownership/mode before the atomic rename. A private old
  # file must never be reopened as the publication helper's public root:644.
  cp -p -- "$source" "$pending" || return 1
  mv -f -- "$pending" "$target" || return 1
}
original_guard(){ sha256sum --quiet -c "$stage/live.sha256"; }
maintenance_guard(){
  awk '$2 != "/etc/nginx/snippets/oneshowlearn-app.conf"' "$stage/live.sha256" | sha256sum --quiet -c -
  sha256sum --quiet -c "$stage/maintenance.sha256"
}
unchanged_guard(){
  sha256sum --quiet -c "$backup/unchanged.sha256"
  sha256sum --quiet -c "$backup/dependencies.before.sha256"
  sha256sum --quiet -c "$backup/node.before.sha256"
  systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.current"
  cmp "$backup/unrelated.before" "$backup/unrelated.current"
}
new_files_guard(){
  local name
  for name in "${modules[@]}"; do cmp "$stage/server/$name.mjs" "$app/server/$name.mjs"; done
  cmp "$stage/package.json" "$app/package.json"
  cmp "$stage/package-lock.json" "$app/package-lock.json"
  cmp "$stage/client/index.html" "$app/dist/client/index.html"
  cmp "$stage/client/.vite/manifest.json" "$app/dist/client/.vite/manifest.json"
  if [[ "${1:-}" = allow-maintenance ]] && cmp --silent "$stage/nginx-maintenance.conf" "$snippet"; then :;
  else cmp "$stage/nginx-app.conf" "$snippet"; fi
  # Compare the entire server-render bundle, not just its entry point.
  diff -qr -- "$stage/render" "$app/dist/render"
}
preserve_assets(){
  local source relative target parent
  [[ -d "$app/dist/client/assets" && ! -L "$app/dist/client/assets" ]] || return 1
  while IFS= read -r -d '' source; do
    relative="${source#"$stage/client/assets/"}"; target="$app/dist/client/assets/$relative"
    parent="$(dirname "$target")"
    # Refuse a linked ancestor as well as a linked final collision target.
    while [[ "$parent" != "$app/dist/client/assets" ]]; do
      [[ ! -L "$parent" ]] || return 1
      parent="$(dirname "$parent")"
    done
    [[ ! -L "$target" ]] || return 1
    if [[ -e "$target" ]]; then cmp "$source" "$target";
    else install -D -o root -g root -m 644 -- "$source" "$target"; fi
  done < <(find "$stage/client/assets" -type f -print0)
}
enter_maintenance(){
  maintenance=true
  proxy_changed=true
  atomic_file "$stage/nginx-maintenance.conf" "$snippet" || return 1
  sha256sum --quiet -c "$stage/maintenance.sha256" || return 1
  nginx -t || return 1
  systemctl reload nginx || return 1
  sleep 3
  [[ "$(curl --max-time 15 --silent --show-error -o /dev/null -w '%{http_code}' https://oneshowlearn.com/)" = 503 ]] || return 1
  [[ "$(curl --max-time 15 --silent --show-error -o /dev/null -w '%{http_code}' https://oneshowlearn.com/api/health)" = 503 ]] || return 1
}
restore_code(){
  local name failed_render restore_render
  for name in "${modules[@]}"; do
    if [[ -f "$backup/server/$name.mjs" ]]; then atomic_original "$backup/server/$name.mjs" "$app/server/$name.mjs" || return 1;
    else
      # Only these exact newly introduced module targets can be removed.
      case "$name" in public-seo|public-seo-data|public-seo-model) rm -f -- "$app/server/$name.mjs" || return 1;; *) return 1;; esac
    fi
  done
  atomic_original "$backup/package.json" "$app/package.json" || return 1
  # The lock is never published: retain its exact original bytes AND metadata.
  atomic_original "$backup/client/index.html" "$app/dist/client/index.html" || return 1
  if [[ -f "$backup/client/.vite/manifest.json" ]]; then atomic_original "$backup/client/.vite/manifest.json" "$app/dist/client/.vite/manifest.json" || return 1;
  else rm -f -- "$app/dist/client/.vite/manifest.json" || return 1; fi
  if [[ -e "$app/dist/render" ]]; then
    failed_render="$app/dist/.render-failed-$release_id-$(date +%s)"
    [[ ! -e "$failed_render" ]] || return 1
    mv -- "$app/dist/render" "$failed_render" || return 1
  fi
  if [[ -d "$backup/render" ]]; then
    restore_render=$(mktemp -d "$app/dist/.render-restore-$release_id-XXXXXXXX") || return 1
    cp -a --reflink=auto -- "$backup/render/." "$restore_render/" || return 1
    mv -- "$restore_render" "$app/dist/render" || return 1
  fi
  # Deliberately no copy from before.db/release.db, private environment, keys,
  # attachments or backed-up node_modules into the running installation.
}
recover(){
  local result="$?" recovery_status=0 restore_proxy="$backup/oneshowlearn-app.conf"
  trap - EXIT
  set +e
  if [[ "$changed" = true ]]; then
    # Once a published pair was reopened, real users may have started a payment
    # or model task. Never stop that service unless maintenance AND idle are
    # freshly proved. Leave the current pair untouched and raise attention.
    if [[ "$maintenance" = false ]] && ! enter_maintenance; then
      echo "Recovery deferred: maintenance could not be confirmed; current paired code/service left untouched. Private backup: $backup" >&2
      exit 1
    fi
    if ! idle; then
      echo "Recovery deferred: active financial/model/upload/parser task; current paired service and maintenance retained. Private backup: $backup" >&2
      exit 1
    fi
  fi
  if [[ "$stopped" = true || "$changed" = true ]]; then
    systemctl stop oneshowlearn || recovery_status=1
    if [[ "$changed" = true ]]; then restore_code || recovery_status=1; fi
    systemctl start oneshowlearn || recovery_status=1
    ready || recovery_status=1
  fi
  # A rollback attempt that failed before restoring any code still owns the NEW
  # pair. Reopen its matching proxy, never the old static proxy over new code.
  if [[ "$rollback_mode" = true && "$changed" = false ]]; then restore_proxy="$stage/nginx-app.conf"; fi
  if [[ "$proxy_changed" = true && "$recovery_status" = 0 ]]; then
    if [[ "$restore_proxy" = "$backup/oneshowlearn-app.conf" ]]; then atomic_original "$restore_proxy" "$snippet" || recovery_status=1;
    else atomic_file "$restore_proxy" "$snippet" || recovery_status=1; fi
    nginx -t && systemctl reload nginx || recovery_status=1
  fi
  if [[ "$recovery_status" != 0 ]]; then
    echo "Recovery needs operator attention; maintenance retained where possible. Private backup: $backup" >&2
    exit 1
  fi
  echo "Release deferred/failed; prior code/frontend/render/proxy restored as needed. Current database/environment/runtime never overwritten. Private backup: $backup" >&2
  [[ "$result" != 0 ]] || result=1
  exit "$result"
}

if [[ "$mode" = --rollback-only ]]; then
  rollback_mode=true
  [[ "$selected_backup" =~ ^/var/backups/oneshowlearn/seo-[a-zA-Z0-9]+$ && -d "$selected_backup" && ! -L "$selected_backup" ]] || exit 1
  backup="$selected_backup"
  # A receipt without the final commit marker may be an interrupted acceptance.
  # Only the atomically committed final marker disarms code-only recovery.
  [[ ! -e "$backup/recovery.final.json" ]] || exit 1
  [[ "$(stat -c %u "$stage")" = 0 && "$(stat -c %u "$backup")" = 0 ]] || exit 1
  "$node" --input-type=module - "$stage" "$backup" <<'NODE'
import assert from 'node:assert/strict';import {readFileSync,lstatSync} from 'node:fs';import {createHash} from 'node:crypto';
const [stage,backup]=process.argv.slice(2),r=JSON.parse(readFileSync(backup+'/recovery.json'));
assert.equal(r.format,'oneshowlearn-public-seo-recovery-v1');assert.equal(r.rollbackArmed,true);assert.equal(r.stage,stage);assert.equal(r.backup,backup);
for(const name of ['release.sha256','live.sha256','maintenance.sha256']){assert.ok(lstatSync(stage+'/'+name).isFile());assert.equal(createHash('sha256').update(readFileSync(stage+'/'+name)).digest('hex'),r.manifests[name]);}
NODE
  (cd "$stage" && sha256sum --quiet -c release.sha256)
  sha256sum --quiet -c "$backup/rollback.sha256"
  new_files_guard allow-maintenance
  unchanged_guard
  idle
  # Current business records may legitimately have advanced since cutover.
  # Rollback guards files/schema/idle state, never compares or restores old rows.
  check verify-guard rollback
  trap recover EXIT
  enter_maintenance
  idle
  unchanged_guard
  stopped=true
  systemctl stop oneshowlearn
  idle
  changed=true
  restore_code
  systemctl start oneshowlearn
  ready
  atomic_original "$backup/oneshowlearn-app.conf" "$snippet"
  nginx -t
  systemctl reload nginx
  maintenance=false
  unchanged_guard
  systemctl is-active --quiet oneshowlearn
  "$node" --input-type=module - "$backup/recovery.json" <<'NODE'
import {readFileSync,writeFileSync,renameSync} from 'node:fs';const p=process.argv[2],r=JSON.parse(readFileSync(p));r.rollbackArmed=false;r.rolledBackAt=new Date().toISOString();writeFileSync(p+'.next',JSON.stringify(r)+'\n',{mode:0o600});renameSync(p+'.next',p);
NODE
  trap - EXIT
  echo "PASS paired SEO code/frontend/render/proxy rollback; current records/environment/runtime retained. Private backup: $backup"
  exit 0
fi

if find "$stage" -type l -print -quit | grep -q .; then exit 1; fi
if find "$stage" -name '._*' -print -quit | grep -q .; then exit 1; fi
[[ ! -e "$stage/rehearsal" && ! -e "$next_render" && ! -e "$previous_render" ]] || exit 1
"$node" --input-type=module - "$stage" "$app" "$snippet" <<'NODE'
import assert from 'node:assert/strict';import {readdirSync,lstatSync,readFileSync,existsSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const [stage,app,snippet]=process.argv.slice(2),required=['package.json','package-lock.json','nginx-app.conf','nginx-maintenance.conf','live.sha256','maintenance.sha256','client/index.html','client/.vite/manifest.json','render/public-render.mjs','deploy/update-public-seo.sh','deploy/check-public-seo-release.mjs','deploy/portable/database-tools.mjs'];
const publicAsset=/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|txt)$/;
const allowed=name=>required.includes(name)||/^server\/[a-z0-9-]+\.mjs$/.test(name)||
  name.startsWith('client/assets/')&&publicAsset.test(name.slice('client/assets/'.length))||
  name.startsWith('render/assets/')&&publicAsset.test(name.slice('render/assets/'.length));
const files=[];function walk(folder,prefix=''){for(const name of readdirSync(folder)){assert.ok(!name.startsWith('._'));const relative=prefix+name,stat=lstatSync(path.join(folder,name));assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())walk(path.join(folder,name),relative+'/');else{assert.ok(stat.isFile());files.push(relative);}}}walk(stage);
const lines=readFileSync(stage+'/release.sha256','utf8').trim().split('\n'),listed=[];
for(const line of lines){const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m,'Unsafe release manifest line');const name=m[2];assert.ok(!name.split('/').some(p=>p==='.'||p==='..')&&!name.startsWith('/')&&allowed(name),'Unapproved staged file: '+name);assert.ok(!listed.includes(name));listed.push(name);assert.equal(createHash('sha256').update(readFileSync(stage+'/'+name)).digest('hex'),m[1]);}
assert.deepEqual(listed.sort(),files.filter(name=>name!=='release.sha256').sort(),'Exact stage manifest coverage');for(const name of required)assert.ok(listed.includes(name),'Missing stage input: '+name);
const modules=['index','payment-configuration','public-seo','public-seo-data','public-seo-model'];for(const name of modules)assert.ok(listed.includes('server/'+name+'.mjs'));
const old=JSON.parse(readFileSync(app+'/package.json')),next=JSON.parse(readFileSync(stage+'/package.json'));delete old.scripts;delete next.scripts;assert.deepEqual(next,old,'Only package scripts may change');assert.equal(Buffer.compare(readFileSync(app+'/package-lock.json'),readFileSync(stage+'/package-lock.json')),0,'Lock must remain byte-identical');
for(const name of readdirSync(stage+'/server'))if(!modules.includes(name.replace(/\.mjs$/,'')))assert.equal(Buffer.compare(readFileSync(stage+'/server/'+name),readFileSync(app+'/server/'+name)),0,'Unreviewed server difference: '+name);
const oldIndex=app+'/dist/client/index.html',oldRender=app+'/dist/render',oldClientManifest=app+'/dist/client/.vite/manifest.json',oldRenderPaths=[];
const alreadySsr=existsSync(oldRender)||existsSync(oldIndex)&&/name="document-rendering" content="public-ssr-v1"/.test(readFileSync(oldIndex,'utf8'));
if(alreadySsr){
  for(const file of [oldIndex,oldClientManifest])assert.ok(existsSync(file)&&lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink(),'Existing SSR pair requires an ordinary original template and client manifest');
  assert.match(readFileSync(oldIndex,'utf8'),/name="document-rendering" content="public-ssr-v1"/,'Existing renderer belongs to an SSR template');
  assert.ok(existsSync(oldRender)&&lstatSync(oldRender).isDirectory()&&!lstatSync(oldRender).isSymbolicLink(),'Existing SSR renderer directory required');
  const visit=(directory,prefix='')=>{for(const name of readdirSync(directory)){const relative=prefix+name,file=path.join(directory,name),stat=lstatSync(file);assert.ok(!stat.isSymbolicLink(),'No linked old SSR inputs');if(stat.isDirectory()){assert.ok(relative==='assets'||relative.startsWith('assets/')&&relative.split('/').every(part=>/^[A-Za-z0-9_-]+$/.test(part)),'Only ordinary old render asset directories');visit(file,relative+'/');}else{assert.ok(stat.isFile()&&(relative==='public-render.mjs'||relative.startsWith('assets/')&&publicAsset.test(relative.slice('assets/'.length))),'Only reviewed old renderer files');oldRenderPaths.push(file);}}};
  visit(oldRender);assert.ok(oldRenderPaths.includes(oldRender+'/public-render.mjs'),'Original SSR entry required');
}
const oldServerPaths=readdirSync(app+'/server').filter(name=>/^[a-z0-9-]+\.mjs$/.test(name)).map(name=>app+'/server/'+name);
const allowedLive=new Set(oldServerPaths.concat(oldRenderPaths,[
  app+'/package.json',app+'/package-lock.json',app+'/dist/client/index.html',app+'/dist/client/.vite/manifest.json',
  '/etc/oneshowlearn/oneshowlearn.env','/etc/systemd/system/oneshowlearn.service',snippet,
  ...['oneshowlearn','default','oneshowseo','pocketledger'].map(name=>'/etc/nginx/sites-available/'+name)]));
const liveNames=[];for(const line of readFileSync(stage+'/live.sha256','utf8').trim().split('\n')){
  const m=/^([a-f0-9]{64})  (\/[A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m&&allowedLive.has(m[2]),'Unapproved live guard target');assert.ok(!liveNames.includes(m[2]));liveNames.push(m[2]);
}
for(const name of [app+'/package.json',app+'/package-lock.json',app+'/dist/client/index.html','/etc/oneshowlearn/oneshowlearn.env','/etc/systemd/system/oneshowlearn.service',snippet,...(alreadySsr?[oldClientManifest,...oldRenderPaths,...oldServerPaths]:[])])assert.ok(liveNames.includes(name),'Missing original live guard');
const maintenance=/^([a-f0-9]{64})  ([^\r\n]+)\n?$/.exec(readFileSync(stage+'/maintenance.sha256','utf8'));assert.ok(maintenance);assert.equal(maintenance[2],snippet);assert.equal(createHash('sha256').update(readFileSync(stage+'/nginx-maintenance.conf')).digest('hex'),maintenance[1]);
assert.match(readFileSync(stage+'/client/index.html','utf8'),/name="document-rendering" content="public-ssr-v1"/);
const proxy=readFileSync(stage+'/nginx-app.conf','utf8');assert.match(proxy,/location \/ \{/);assert.match(proxy,/\$request_method !~ \^\(GET\|HEAD\)\$/);assert.match(proxy,/return 405/);assert.match(proxy,/if \(\$uri ~\* \^\/\(api\|uploads\)\(\/\|\$\)\) \{ return 404; \}/);assert.match(proxy,/zone=oneshowlearn_auth_write_v2 burst=10 nodelay/);assert.match(proxy,/zone=oneshowlearn_auth_read burst=30 nodelay/);assert.match(proxy,/limit_req_status 429/);
const publicAssetLocation='location ^~ /assets/ {\n    expires 7d;\n    add_header X-Content-Type-Options "nosniff" always;\n    try_files $uri =404;\n}';
const assetLocations=proxy.match(/location \^~ \/assets\/ \{\n[\s\S]*?\n\}/g);
assert.equal(assetLocations?.length,1,'One explicit public assets prefix required');
assert.equal(assetLocations[0],publicAssetLocation,'Public assets never proxy, alias outside their root or fall back to the document shell');
NODE
(cd "$stage" && sha256sum --quiet -c release.sha256)
original_guard
for name in "${modules[@]}"; do "$node" --check "$stage/server/$name.mjs"; done
# Seal inputs against the uploading account before taking a production snapshot.
chown -R root:root "$stage"
chmod -R go-rwx "$stage"
install -d -o root -g root -m 700 /var/backups/oneshowlearn
[[ ! -L /var/backups/oneshowlearn ]] || exit 1
runtime=$(readlink -f "$app/node_modules")
[[ -d "$runtime" && ! -L "$runtime" ]] || exit 1
planned_paths=("$app/server" "$app/dist/client" "$runtime" "$app/data" "$stage/render")
for directory in "$app/dist/render" "$app/uploads" "$app/uploads-private"; do if [[ -d "$directory" ]]; then planned_paths+=("$directory"); fi; done
planned_bytes=$(du -sb -- "${planned_paths[@]}" | awk '{total+=$1} END {printf "%.0f",total}')
backup_available=$(df -PB1 /var/backups/oneshowlearn | awk 'NR==2 {print $4}')
app_available=$(df -PB1 "$app" | awk 'NR==2 {print $4}')
[[ "$planned_bytes" =~ ^[0-9]+$ && "$backup_available" =~ ^[0-9]+$ && "$app_available" =~ ^[0-9]+$ ]] || exit 1
(( backup_available > planned_bytes * 2 + 536870912 && app_available > 536870912 )) || { echo 'Insufficient headroom for consistent recoverable private backup and retained assets.' >&2; exit 1; }
backup=$(mktemp -d /var/backups/oneshowlearn/seo-XXXXXXXX)
printf '%s\n' "$backup" > "$stage/private-backup-path"
echo "Private backup: $backup"
cp -a --reflink=auto -- "$app/server" "$backup/server"
cp -a --reflink=auto -- "$app/dist/client" "$backup/client"
if [[ -d "$app/dist/render" ]]; then cp -a --reflink=auto -- "$app/dist/render" "$backup/render"; fi
cp -a -- "$app/package.json" "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env "$backup/"
cp -a -- "$snippet" "$backup/oneshowlearn-app.conf"
cp -a -- "$site" "$backup/oneshowlearn-site.conf"
install -d -m 700 "$backup/node_modules"
cp -a --reflink=auto -- "$runtime/." "$backup/node_modules/"
find "$runtime" -type f -exec sha256sum {} + > "$backup/dependencies.before.sha256"
sha256sum "$node" > "$backup/node.before.sha256"
for file in "$app"/server/*.mjs; do
  name="$(basename "$file" .mjs)"
  if [[ ! " ${modules[*]} " == *" $name "* ]]; then sha256sum "$file"; fi
done > "$backup/unchanged.sha256"
sha256sum "$app/package-lock.json" /etc/oneshowlearn/oneshowlearn.env /etc/systemd/system/oneshowlearn.service "$site" /etc/nginx/sites-available/{default,oneshowseo,pocketledger} >> "$backup/unchanged.sha256"
systemctl show oneshowlearn nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/services.before"
systemctl show nginx oneshowseo pocketledger -p Id -p MainPID -p NRestarts -p ActiveState > "$backup/unrelated.before"
snapshot "$backup/before.db"
for name in offer status resources entry projects service; do
  case "$name" in
    offer) route=commerce/offer;; status) route=auth/status;; resources) route=resources;;
    entry) route=learning/entry;; projects) route=learning/projects;; service) route=service/public;;
  esac
  curl --max-time 15 --fail --silent --show-error "http://127.0.0.1:8791/api/$route" > "$backup/$name.before.json"
done
check capture original
check verify-guard original
install -d -m 700 "$stage/rehearsal/dist"
cp -a -- "$backup/server" "$stage/rehearsal/server"
for name in "${modules[@]}"; do cp -- "$stage/server/$name.mjs" "$stage/rehearsal/server/$name.mjs"; done
cp -- "$stage/package.json" "$stage/rehearsal/package.json"
ln -s "$runtime" "$stage/rehearsal/node_modules"
cp -- "$backup/before.db" "$stage/rehearsal/copy.db"
cp -a -- "$stage/client" "$stage/rehearsal/dist/client"
cp -a -- "$stage/render" "$stage/rehearsal/dist/render"
check rehearse original
original_guard
unchanged_guard
(cd "$stage" && sha256sum --quiet -c release.sha256)
idle
if [[ "$mode" = --rehearse-only ]]; then
  echo "PASS provider-blocked rehearsal only; production code/proxy/processes untouched. Private backup: $backup"
  exit 0
fi
preserve_assets
original_guard
check verify-guard original
trap recover EXIT
enter_maintenance
idle
maintenance_guard
unchanged_guard
check verify-guard maintenance
stopped=true
systemctl stop oneshowlearn
idle
maintenance_guard
unchanged_guard
snapshot "$backup/release.db"
check verify-guard maintenance
cp -a --reflink=auto -- "$app/data" "$backup/data"
for directory in uploads uploads-private; do
  if [[ -d "$app/$directory" ]]; then cp -a --reflink=auto -- "$app/$directory" "$backup/$directory"; fi
done
"$node" --input-type=module - "$stage" "$backup" <<'NODE'
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const [stage,backup]=process.argv.slice(2),names=['release.sha256','live.sha256','maintenance.sha256'];
const record={format:'oneshowlearn-public-seo-recovery-v1',createdAt:new Date().toISOString(),stage,backup,
  modules:['index','payment-configuration','public-seo','public-seo-data','public-seo-model'],
  originalRenderPresent:existsSync(backup+'/render'),originalClientManifestPresent:existsSync(backup+'/client/.vite/manifest.json'),
  manifests:Object.fromEntries(names.map(name=>[name,createHash('sha256').update(readFileSync(stage+'/'+name)).digest('hex')])),
  rollbackArmed:true,rollback:'code/package/frontend/render/proxy only; never replace current database/environment/runtime',
  environmentChanged:false,schemaChanged:false,dependenciesChanged:false};
writeFileSync(backup+'/recovery.json',JSON.stringify(record)+'\n',{mode:0o600});
NODE
find "$backup" -type f ! -name rollback.sha256 ! -name files.sha256 -exec sha256sum {} + > "$backup/rollback.sha256"
sha256sum --quiet -c "$backup/rollback.sha256"
(cd "$stage" && sha256sum --quiet -c release.sha256)
changed=true
for name in "${modules[@]}"; do atomic_file "$stage/server/$name.mjs" "$app/server/$name.mjs"; done
atomic_file "$stage/package.json" "$app/package.json"
cp -a -- "$stage/render" "$next_render"
chmod -R a+rX "$next_render"
if [[ -d "$app/dist/render" ]]; then mv -- "$app/dist/render" "$previous_render"; fi
mv -- "$next_render" "$app/dist/render"
install -d -o root -g root -m 755 "$app/dist/client/.vite"
atomic_file "$stage/client/.vite/manifest.json" "$app/dist/client/.vite/manifest.json"
atomic_file "$stage/client/index.html" "$app/dist/client/index.html"
systemctl start oneshowlearn
ready
check live post
atomic_file "$stage/nginx-app.conf" "$snippet"
nginx -t
systemctl reload nginx
maintenance=false
new_files_guard
unchanged_guard
check https post
check verify-guard post
systemctl is-active --quiet oneshowlearn
# The outer read-only browser/HTTPS acceptance must finish before its receipt
# command disarms recovery. This script deliberately does NOT issue a receipt.
trap - EXIT
echo "PASS paired public SEO publication; outer acceptance/recovery remains armed. Private backup: $backup"
sha256sum "$app/dist/client/index.html" "$app/package-lock.json"
systemctl show oneshowlearn -p MainPID -p NRestarts -p ActiveState
