#!/bin/bash
# Cercle Privé : démarrage automatique (Mac / Linux). Double-cliquez sur ce fichier.
cd "$(dirname "$0")" || exit 1
echo ""
echo " ===== Cercle Privé : démarrage automatique ====="
echo ""
fail() { echo "[X] $1"; read -r -p "Appuie sur Entrée pour fermer…"; exit 1; }

command -v node >/dev/null || fail "Node.js n'est pas installé : https://nodejs.org/fr/download"
command -v docker >/dev/null || fail "Docker Desktop n'est pas installé : https://www.docker.com/products/docker-desktop/"

echo "[1/4] Vérification de Docker Desktop…"
docker info >/dev/null 2>&1 || fail "Docker Desktop n'est pas lancé. Ouvre-le, attends qu'il soit prêt, puis relance ce fichier."

echo "[2/4] Démarrage de la base de données…"
docker start poker-db >/dev/null 2>&1 || docker run -d --name poker-db -e POSTGRES_USER=poker -e POSTGRES_PASSWORD=poker -e POSTGRES_DB=poker -p 5432:5432 postgres:16-alpine || fail "Impossible de démarrer la base de données."
[ -f apps/server/.env ] || cp apps/server/.env.example apps/server/.env

echo "[3/4] Installation (quelques minutes la première fois)…"
npm install || fail "L'installation a échoué."

echo "    Préparation de la base de données…"
for i in $(seq 1 15); do
  npm run db:deploy >/dev/null 2>&1 && break
  [ "$i" = 15 ] && fail "La base de données ne répond pas."
  sleep 2
done

echo "[4/4] Lancement du site… le navigateur va s'ouvrir sur http://localhost:3000"
echo "    (Laisse cette fenêtre ouverte pendant que tu joues. Pour arrêter : ferme-la.)"
( sleep 25; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null ) &
npm run dev
