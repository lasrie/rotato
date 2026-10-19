#!/bin/bash
# CSS-Setup für Uberspace 8 (Asteroid rotato @ ymir.uberspace.de)
# Ausführen auf dem Asteroiden:  bash setup-css.sh
set -euo pipefail

echo "== 1/6 Node-Version prüfen =="
NODE_VER=$(uberspace tools version show node)
echo "Node: $NODE_VER"
if [ "$NODE_VER" != "22" ]; then
  echo "-> setze Node 22"
  uberspace tools version use node 22
fi

echo "== 2/6 CSS installieren =="
mkdir -p ~/css ~/css-data
cd ~/css
[ -f package.json ] || npm init -y
npm install @solid/community-server

echo "== 3/6 Start-Skript =="
cat > ~/css/start.sh <<'EOF'
#!/bin/bash
export NODE_ENV=production
exec node ~/css/node_modules/.bin/community-solid-server \
  --port 3457 \
  --baseUrl https://solid.lasrie.dev \
  --rootFilePath /home/rotato/css-data \
  --loggingLevel info
EOF
chmod +x ~/css/start.sh

echo "== 4/6 supervisord-Service =="
mkdir -p ~/etc/services.d
cat > ~/etc/services.d/css.ini <<'EOF'
[program:css]
command=/home/rotato/css/start.sh
autostart=true
autorestart=true
stdout_logfile=/home/rotato/css/css.log
redirect_stderr=true
environment=NODE_ENV=production
EOF
supervisorctl reread
supervisorctl update
supervisorctl start css || true

echo "== 5/6 Web-Backend =="
uberspace web backend set solid.lasrie.dev/ --http --port 3457
uberspace web backend list

echo "== 6/6 Smoke-Test (lokal am Asteroiden) =="
sleep 3
curl -s -o /dev/null -w "CSS auf Port 3457: HTTP %{http_code}\n" http://localhost:3457/
echo "Fertig! Danach DNS: solid.lasrie.dev -> CNAME rotato.uberspace.de (Cloudflare, DNS only!)"
