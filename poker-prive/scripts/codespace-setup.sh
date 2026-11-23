#!/bin/bash
# Installation automatique (exécutée une seule fois à la création du Codespace).
set -e
cd "$(dirname "$0")/.."
source scripts/codespace-env.sh
echo "▶ Installation des dépendances…"
npm install
[ -f apps/server/.env ] || cp apps/server/.env.example apps/server/.env
echo "▶ Préparation de la base de données…"
for i in $(seq 1 30); do
  npm run db:deploy && break
  echo "  (la base démarre, nouvelle tentative…)"; sleep 2
done
echo "▶ Construction du site…"
npm run build
echo "✔ Installation terminée"
