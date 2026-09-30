#!/usr/bin/env bash
# Frontend-only release: no API restart, configuration, or database changes.
set -euo pipefail
staging="${1:?Pass the uploaded release directory}"
site=/var/www/oneshowlearn/dist/client
[[ "$EUID" -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ "$staging" == /tmp/oneshowlearn-platforms-* && -d "$staging" && ! -L "$staging" ]] || exit 1
test -f "$site/index.html"
test -f "$staging/client/index.html"
test -d "$staging/client/assets"
if find "$staging/client" -type l -print -quit | grep -q .; then
  echo 'Release must not contain symbolic links'; exit 1
fi

install -d -m 700 /var/backups/oneshowlearn
backup=$(mktemp -d /var/backups/oneshowlearn/frontend-XXXXXXXX)
cp -a "$site" "$backup/client"
# Keep old hashed assets for already-open pages and for instant index rollback.
cp -a "$staging/client/assets/." "$site/assets/"
chown -R root:root "$site/assets"
find "$site/assets" -type d -exec chmod 755 {} +
find "$site/assets" -type f -exec chmod 644 {} +
# Publish the entry only after all referenced assets are present.
install -m 644 "$staging/client/index.html" "$site/index.html.next"
mv -f "$site/index.html.next" "$site/index.html"
printf 'Frontend published. Previous version: %s/client\n' "$backup"
sha256sum "$site/index.html"
