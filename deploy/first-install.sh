#!/bin/sh
# Run from an unpacked, verified release as root. Refuses to replace an installation.
set -eu

test "$(id -u)" = 0
test -f dist/client/index.html
test -f server/index.mjs
test ! -e /var/www/oneshowlearn
test ! -e /etc/oneshowlearn
test ! -e /etc/systemd/system/oneshowlearn.service
test ! -e /etc/nginx/sites-available/oneshowlearn
test ! -e /etc/nginx/sites-enabled/oneshowlearn
test ! -e /etc/nginx/snippets/oneshowlearn-app.conf
if getent passwd oneshowlearn >/dev/null; then
  echo "Service user already exists; inspect before deploying." >&2
  exit 1
fi
if ss -H -ltn 'sport = :8791' | grep -q .; then
  echo "Port 8791 is occupied; inspect before deploying." >&2
  exit 1
fi

useradd --system --user-group --home-dir /var/www/oneshowlearn --shell /usr/sbin/nologin oneshowlearn
install -d -o oneshowlearn -g oneshowlearn -m 755 /var/www/oneshowlearn
cp -R package.json package-lock.json server dist deploy /var/www/oneshowlearn/
chown -R oneshowlearn:oneshowlearn /var/www/oneshowlearn
install -d -o oneshowlearn -g oneshowlearn -m 750 /var/www/oneshowlearn/data
install -d -o oneshowlearn -g oneshowlearn -m 755 /var/www/oneshowlearn/uploads
install -d -o oneshowlearn -g oneshowlearn -m 700 /var/www/oneshowlearn/uploads-private
install -d -o root -g root -m 700 /etc/oneshowlearn
install -d -o root -g root -m 755 /var/lib/oneshowlearn-acme

cd /var/www/oneshowlearn
runuser -u oneshowlearn -- env PATH=/opt/node-v22/bin:/usr/bin:/bin npm ci --omit=dev --no-audit --no-fund
/opt/node-v22/bin/node deploy/init-production-env.mjs
systemd-run --unit=oneshowlearn-initial-seed --wait --pipe --collect \
  --property=User=oneshowlearn --property=Group=oneshowlearn \
  --property=WorkingDirectory=/var/www/oneshowlearn \
  --property=EnvironmentFile=/etc/oneshowlearn/oneshowlearn.env \
  /opt/node-v22/bin/node server/seed.mjs

install -o root -g root -m 644 deploy/oneshowlearn.service /etc/systemd/system/oneshowlearn.service
systemctl daemon-reload
systemctl enable --now oneshowlearn.service

ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --silent --fail http://127.0.0.1:8791/api/health; then ready=true; break; fi
  sleep 1
done
test "$ready" = true

install -o root -g root -m 644 deploy/nginx-oneshowlearn-app.conf /etc/nginx/snippets/oneshowlearn-app.conf
install -o root -g root -m 644 deploy/nginx-oneshowlearn.conf /etc/nginx/sites-available/oneshowlearn
ln -s /etc/nginx/sites-available/oneshowlearn /etc/nginx/sites-enabled/oneshowlearn
nginx -t
systemctl reload nginx
echo "OneShowLearn HTTP bootstrap complete. Configure its certificate next."
