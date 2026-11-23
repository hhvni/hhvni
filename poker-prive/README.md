# Cercle Privé — plateforme de poker privée entre amis

Texas Hold'em No-Limit en temps réel, pour jouer entre amis avec des **jetons virtuels sans aucune valeur monétaire** (aucun dépôt, aucun retrait, aucun échange).

* Comptes, profils, avatars, amis et présence en ligne
* Salons privés : code et lien d'invitation (WhatsApp, Discord, partage natif), mot de passe facultatif, rôles créateur / admin / joueur, modération (exclure, bannir)
* Plusieurs tables par salon : **cash game** (caves, recharges selon la règle de l'admin, entrée/sortie entre deux mains) et **tournois Sit & Go** (inscriptions, niveaux chronométrés, pauses, rebuy, add-on, éliminations, classement et gains)
* Moteur NLHE complet et testé : blinds/antes, relances minimales, all-in incomplets, mises non suivies, **pots secondaires**, partages, kickers, quinte A-2-3-4-5
* Table immersive : cartes et jetons animés, minuteur et time bank, curseur de mise et raccourcis (2 / 2,5 / 3 BB, 50 / 75 / 100 % du pot, tapis), pré-actions, réactions émoji, chat, journal des actions
* **Visio intégrée** (WebRTC) : webcam à côté de chaque joueur, micro, choix des périphériques, taille des vignettes, détection de la parole, qualité adaptative — toujours facultative
* Historique de chaque main et **replay pas à pas**
* Statistiques réelles : mains, victoires, gains, temps de jeu, **VPIP, PFR, 3-bet, AF, WTSD, W$SD** ; classements entre amis, par salon et général
* Espace administrateur : utilisateurs, salons, mains, journal d'audit, attribution de jetons
* Reconnexion automatique, reprise des parties après redémarrage du serveur

L'architecture détaillée (modèles, événements temps réel, règles, sécurité) est décrite dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lancer en local

Prérequis : **Node.js ≥ 20** et **PostgreSQL ≥ 14**.

```bash
cd poker-prive
npm install
cp apps/server/.env.example apps/server/.env   # puis adaptez DATABASE_URL
npm run db:migrate                              # crée les tables
npm run dev                                     # http://localhost:3000
```

Le premier compte créé devient administrateur du site (ou listez des e-mails dans `ADMIN_EMAILS`).

Pour tester à plusieurs sur une seule machine, ouvrez des fenêtres de navigation privée (une session par fenêtre).

### Base PostgreSQL rapide avec Docker

```bash
docker run -d --name poker-db -e POSTGRES_USER=poker -e POSTGRES_PASSWORD=poker -e POSTGRES_DB=poker -p 5432:5432 postgres:16-alpine
```

## Tests

```bash
npm run test:engine     # 70 tests du moteur (évaluateur exhaustif, pots, règles, fuzzing 3 000 mains)
npm run test:server     # 14 tests d'intégration bout en bout (nécessite la base poker_test)
npm run loadtest -- 20 6 30   # 20 tables × 6 robots pendant 30 s
```

Les tests serveur et le test de charge utilisent la base `postgresql://poker:poker@localhost:5432/poker_test` (créez-la puis `DATABASE_URL=… npx prisma migrate deploy` dans `apps/server`). Elle est **vidée** par les tests d'intégration.

## Mise en production

### Option 1 — un serveur (VPS) avec Docker Compose

```bash
cd poker-prive
cat > .env <<'EOF'
POSTGRES_PASSWORD=un-mot-de-passe-long
PUBLIC_URL=https://poker.mondomaine.fr
ADMIN_EMAILS=moi@mondomaine.fr
TURN_SECRET=une-longue-chaine-aleatoire
TURN_URLS=turn:poker.mondomaine.fr:3478
EOF
docker compose --profile turn up -d --build
```

Placez un reverse proxy HTTPS devant le port 3000 (HTTPS obligatoire pour la caméra et le micro). Exemple avec Caddy :

```
poker.mondomaine.fr {
  reverse_proxy localhost:3000
}
```

Ouvrez les ports UDP/TCP 3478 et UDP 49160-49200 pour le relais TURN.

### Option 2 — PaaS (Render, Railway, Fly.io…)

* Service web Node : commande de build `npm ci && npm run build`, commande de démarrage `npm run db:deploy && npm start`
* Une base PostgreSQL managée (`DATABASE_URL`)
* **Une seule instance** (les tables vivent en mémoire, voir l'architecture) avec WebSockets activés
* Un stockage persistant pour `UPLOAD_DIR` (avatars)
* Pour la visio hors réseau local : un service TURN (coturn auto-hébergé ou fournisseur) via `TURN_URLS`/`TURN_SECRET`

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL |
| `PORT` | Port HTTP (défaut 3000) |
| `PUBLIC_URL` | URL publique (vérification d'origine, liens d'invitation) |
| `ADMIN_EMAILS` | E-mails promus administrateurs à l'inscription |
| `STARTING_BANKROLL` | Solde virtuel initial (défaut 100 000) |
| `STUN_URLS` | Serveurs STUN, séparés par des virgules |
| `TURN_URLS`, `TURN_SECRET` | Relais TURN (coturn `use-auth-secret`), identifiants éphémères |
| `UPLOAD_DIR` | Dossier des avatars |
| `LOG_LEVEL` | Niveau de logs pino |

## Limites connues

* Tournois : une table de 2 à 10 joueurs (Sit & Go). Les tournois multi-tables avec équilibrage des tables ne sont pas encore implémentés.
* Une seule instance serveur (suffisant pour des dizaines de tables) ; la marche à suivre pour plusieurs instances est décrite dans l'architecture.
* Visio en pair à pair : confortable jusqu'à ~8 caméras actives ; au-delà, prévoir un SFU (LiveKit).
* Pas d'envoi d'e-mails (pas de réinitialisation de mot de passe par e-mail) : un administrateur peut aider un joueur.
* Au showdown, toutes les mains restantes sont dévoilées automatiquement (pas d'option « muck »).
