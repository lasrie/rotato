#!/bin/bash
# CSS-Setup für Uberspace 8 (Asteroid rotato @ ymir.uberspace.de)
# U8-Befehle: 'uberspace service add' (systemd user services),
#             'uberspace web backend add URI DESTINATION:PORT PORT'
# Ausführen auf dem Asteroiden:  bash setup-css.sh
set -euo pipefail

echo "== 1/6 Node-Version prüfen =="
NODE_VER=$(node --version)
echo "Node: $NODE_VER"
case "$NODE_VER" in
  v2[2-9]*|v3*) echo "-> passt" ;;
  *) echo "!! Node zu alt (braucht >= 22). Abbruch." ; exit 1 ;;
esac

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

echo "== 4/6 systemd-Service (U8: uberspace service add) =="
if uberspace service list 2>/dev/null | grep -q "^css"; then
  echo "Service 'css' existiert schon — überspringe."
else
  uberspace service add css "/home/rotato/css/start.sh" \
    --env NODE_ENV=production --workdir /home/rotato/css
fi

echo "== 5/6 Web-Backend (U8: uberspace web backend add) =="
uberspace web backend add solid.lasrie.dev/ PORT 3457 --force || true
uberspace web backend list

echo "== 6/6 Smoke-Test =="
sleep 3
curl -s -o /dev/null -w "CSS auf Port 3457: HTTP %{http_code}\n" http://localhost:3457/ || {
  echo "!! CSS nicht erreichbar — Log prüfen:"; journalctl --user -u css -n 30 --no-pager; exit 1;
}
echo "Fertig! DNS: solid.lasrie.dev -> CNAME ymir.uberspace.de (Cloudflare, DNS only!)"
