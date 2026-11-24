#!/bin/bash
# Récupère la dernière version du site et le redémarre (à lancer dans le terminal du Codespace).
# Le nouveau site est construit à côté de l'ancien, qui reste en ligne jusqu'au dernier moment.
set -e
cd "$(dirname "$0")/.."
echo "▶ Récupération de la dernière version…"
git pull
echo "▶ Installation…"
npm install
echo "▶ Mise à jour de la base de données…"
npm run db:deploy
echo "▶ Construction du site (1 à 3 minutes, le site actuel reste en ligne)…"
npm run build -w @poker/engine
npm run build -w @poker/server
( cd apps/web && rm -rf .next-new && NEXT_DIST_DIR=.next-new npx next build ) || {
  echo "✘ La construction du site a échoué : le site actuel n'a pas été modifié."
  echo "  Envoie une capture d'écran de ce terminal pour obtenir de l'aide."
  exit 1
}
echo "▶ Bascule vers la nouvelle version…"
pkill -f "node dist/index.js" 2>/dev/null || true
( cd apps/web && rm -rf .next && mv .next-new .next )
bash scripts/codespace-start.sh
