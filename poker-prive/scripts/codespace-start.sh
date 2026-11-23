#!/bin/bash
# Démarrage du site (exécuté à chaque démarrage du Codespace).
cd "$(dirname "$0")/.."
source scripts/codespace-env.sh
[ -f apps/server/.env ] || cp apps/server/.env.example apps/server/.env
for i in $(seq 1 30); do npm run db:deploy >/dev/null 2>&1 && break; sleep 2; done
[ -d apps/web/.next ] || npm run build
pkill -f "node dist/index.js" 2>/dev/null || true
echo "▶ Lancement du site sur $PUBLIC_URL"
setsid nohup npm start > /tmp/cercle-prive.log 2>&1 < /dev/null &
# Rend le site accessible à tes amis (sans compte GitHub)
if [ -n "$CODESPACE_NAME" ] && command -v gh >/dev/null; then
  ( for i in $(seq 1 30); do sleep 5; gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 && break; done ) > /dev/null 2>&1 &
fi
for i in $(seq 1 60); do
  curl -s http://localhost:3000/api/health >/dev/null && { echo "✔ Site en ligne : $PUBLIC_URL"; exit 0; }
  sleep 2
done
echo "Le site met du temps à démarrer. Journal : /tmp/cercle-prive.log"
