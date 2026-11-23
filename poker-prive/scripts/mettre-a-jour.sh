#!/bin/bash
# Récupère la dernière version du site et le redémarre (à lancer dans le terminal du Codespace).
set -e
cd "$(dirname "$0")/.."
echo "▶ Récupération de la dernière version…"
git pull
echo "▶ Installation…"
npm install
echo "▶ Mise à jour de la base de données…"
npm run db:deploy
echo "▶ Construction du site (1 à 3 minutes)…"
npm run build
bash scripts/codespace-start.sh
