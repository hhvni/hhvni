# Architecture technique — Cercle Privé

## 1. Vue d'ensemble

```
┌──────────────────────── Navigateur ────────────────────────┐
│ Next.js 15 / React 19 / Tailwind 4 / Framer Motion          │
│  • pages (salons, table, profils, replay, admin)            │
│  • Socket.IO client  ── commandes + état filtré             │
│  • WebRTC (pair à pair) ── audio/vidéo entre joueurs        │
└───────────────┬─────────────────────────────┬───────────────┘
                │ HTTPS (REST + cookie)        │ WSS (Socket.IO)
┌───────────────▼─────────────────────────────▼───────────────┐
│ Processus Node unique (apps/server)                         │
│  Express : /api/*  ·  Socket.IO : /socket.io  ·  Next : /*   │
│  GameManager ─► GameRuntime (1 par table, en mémoire)        │
│                  └─► PokerTable (@poker/engine, pur TS)      │
│  File d'écriture sérialisée par table ─► PostgreSQL (Prisma) │
└──────────────────────────────────────────────────────────────┘
          Flux audio/vidéo : navigateur ⇄ navigateur (STUN/TURN)
```

### Arborescence

```
poker-prive/
├─ packages/engine/      Moteur de poker indépendant (aucune dépendance)
│  ├─ src/cards.ts       Cartes, CSPRNG, Fisher-Yates
│  ├─ src/evaluator.ts   Évaluateur 5–7 cartes
│  ├─ src/pots.ts        Pots principal/secondaires, partages, jetons indivisibles
│  ├─ src/table.ts       Machine à états d'une main NLHE
│  ├─ src/stats.ts       VPIP, PFR, 3-bet, AF, WTSD, W$SD depuis les événements
│  ├─ src/tournament.ts  Structures de blinds, répartition des places
│  ├─ src/protocol.ts    Types partagés serveur ⇄ navigateur
│  └─ test/              70 tests (dont vérification exhaustive 2 598 960 mains)
├─ apps/server/
│  ├─ prisma/            Schéma + migrations PostgreSQL
│  ├─ src/auth/          Mots de passe (scrypt), sessions, CSRF
│  ├─ src/routes/        API REST (auth, users, friends, rooms, games, hands, stats, admin)
│  ├─ src/realtime/      Socket.IO, GameManager, GameRuntime
│  ├─ src/services/      Contrôles d'accès, config de partie, statistiques SQL
│  └─ test/              Tests d'intégration bout en bout + test de charge
└─ apps/web/             Front Next.js (App Router)
```

## 2. Choix techniques (et écarts justifiés par rapport à la stack suggérée)

| Sujet | Choix | Pourquoi |
|---|---|---|
| Front | Next.js 15, React 19, TypeScript strict, Tailwind 4, Framer Motion | Conforme à la demande. |
| Back | Node.js + Express 5 + Socket.IO 4, TypeScript strict | Conforme. |
| Un seul processus | Next est servi par le serveur Node (custom server) | Même origine pour l'API, les WebSockets et les pages : cookies `SameSite=Lax` + `httpOnly` sans CORS, un seul service à déployer. |
| Authentification | Sessions maison (jeton 256 bits en cookie httpOnly, empreinte SHA-256 en base) au lieu d'Auth.js | Auth.js est couplé aux route handlers Next ; ici l'autorité est le serveur temps réel, qui doit authentifier aussi le handshake WebSocket. Une session en base, révocable, partagée par REST et Socket.IO est plus simple et plus sûre. |
| Hachage | `scrypt` (N=2¹⁵, r=8, p=1) natif Node | Recommandé par l'OWASP, aucune dépendance native à compiler. |
| Redis | Non utilisé | Une table est un acteur en mémoire dans un seul processus : pas d'état à partager. L'état est persisté en PostgreSQL (instantané par action) pour la reprise après redémarrage. Pour plusieurs instances : adaptateur Redis Socket.IO + répartition des tables par instance (voir §7). |
| Visio | WebRTC maillé (P2P) + signalisation Socket.IO + STUN/TURN (coturn) | Pour une table de 2 à 10 amis, le maillage évite tout serveur média : aucun flux ne passe par le serveur applicatif. Le débit est plafonné selon le nombre de pairs. Au-delà de ~8 caméras simultanées, remplacer par un SFU (LiveKit) sans changer l'UI (voir §7). |

## 3. Modèle de données (Prisma)

| Modèle | Rôle |
|---|---|
| `User` | Compte, rôle site (USER/ADMIN), solde de jetons virtuels, temps de jeu |
| `Session` | Sessions actives (empreinte du jeton, expiration, IP, user-agent) |
| `Friendship` | Demandes et liens d'amitié |
| `Room` / `RoomMember` | Salons privés, code d'invitation, mot de passe facultatif (haché), rôles OWNER/ADMIN/PLAYER, bannissements |
| `Invitation` | Invitations directes d'un ami (dispensent du mot de passe) |
| `Game` | Table (cash ou tournoi) : configuration validée + instantané complet pour la reprise |
| `GamePlayer` | Participation : caves, recharges, rebuys, add-ons, place, gains |
| `Hand` / `HandPlayer` | Historique de chaque main : journal d'événements, board, cartes privées, indicateurs statistiques |
| `ChatMessage` | Messages du salon ou d'une table |
| `AuditLog` | Journal de sécurité/modération (connexions, échecs, bannissements…) |

## 4. Événements temps réel (Socket.IO)

Toutes les commandes passent par un validateur `zod`, un limiteur de débit (15 req/s par connexion, 5 messages de chat / 10 s) et renvoient un accusé `{ ok, error?, code? }`.

**Client → serveur**

| Événement | Charge utile | Effet |
|---|---|---|
| `game:join` / `game:leave` | `{gameId}` | S'abonner à une table (membres du salon uniquement) |
| `game:action` | `{gameId, type, amount?, seq}` | fold / check / call / bet / raise / allin. `seq` doit correspondre à l'état affiché : anti double-clic et anti-rejeu |
| `game:sit` / `game:stand` | `{gameId, seat, buyIn}` | S'asseoir (cave débitée du solde) / quitter (entre deux mains) |
| `game:away` | `{gameId, away}` | Mode absent / retour |
| `game:reload` | `{gameId}` | Recharge selon la règle de la table |
| `game:register` / `game:unregister` | `{gameId}` | Inscription tournoi |
| `game:rebuy` / `game:declineRebuy` / `game:addon` | `{gameId}` | Tournoi |
| `game:start` / `game:pause` / `game:close` / `game:kick` | `{gameId, userId?}` | Administration de la table |
| `room:join` / `room:leave` | `{roomId}` | Lobby du salon |
| `chat:send` / `chat:react` | `{roomId, gameId?, text}` / `{gameId, emoji}` | Chat et réactions |
| `rtc:join` / `rtc:signal` / `rtc:media` / `rtc:leave` | — | Signalisation WebRTC (relayée uniquement entre membres de la même table) |

**Serveur → client** : `game:state` (vue filtrée par joueur), `game:log` (messages système « X relance à 500 »…), `chat:message`, `chat:reaction`, `presence:update`, `friends:update`, `invite`, `room:update`, `room:deleted`, `room:removed`, `game:kicked`, `game:rebuyOffer`, `rtc:*`.

## 5. Règles métier du moteur

* **Distribution** : jeu de 52 cartes mélangé par Fisher-Yates avec `crypto.randomInt` (CSPRNG, sans biais modulo). Distribution une carte à la fois à partir de la gauche du bouton ; carte brûlée avant flop, turn et river.
* **Positions** : bouton tournant sur les joueurs actifs. Heads-up : le bouton est petite blind, parle en premier préflop et en dernier ensuite.
* **Blinds et ante** : ante = argent mort ; blind incomplète d'un joueur à court → le montant à suivre reste la grosse blind.
* **Relances** : minimum = taille de la dernière relance complète (BB au préflop / pour une mise). Un all-in inférieur à une relance complète ne rouvre pas les enchères pour ceux qui ont déjà parlé ; plusieurs all-in incomplets cumulés rouvrent les enchères (règle TDA). Relance impossible si tous les adversaires sont à tapis.
* **Mises non suivies** restituées avant la construction des pots.
* **Pots** : couches par niveau de contribution des joueurs non couchés ; les jetons des joueurs couchés alimentent les pots sans éligibilité ; partages au sein de chaque pot ; jeton indivisible au premier gagnant à gauche du bouton.
* **Board déroulé automatiquement** quand plus personne ne peut miser ; cartes révélées en cas d'all-in.
* **Showdown** : toutes les mains restantes sont dévoilées et évaluées (meilleure combinaison de 5 parmi 7).
* **Invariant** : la somme des tapis est vérifiée à la fin de chaque main (exception sinon).
* **Temps** : délai par action, puis réserve de temps (time bank, +2 s par main, plafonnée). Délai écoulé → check si possible, sinon fold. Deux délais consécutifs → joueur absent (cash : n'est plus servi ; tournoi : se couche automatiquement à chaque main, comme un joueur « blindé »).
* **Déconnexion** : le siège est conservé ; le délai d'action sert de délai de reconnexion. Cash : un joueur déconnecté depuis 10 min est levé de table et ses jetons reviennent à son solde.
* **Tournoi** : placement aléatoire sécurisé, niveaux chronométrés (blinds appliquées à la main suivante), pauses, rebuy (jusqu'au niveau N, 20 s pour décider), add-on (pause ou dernier niveau de rebuy), élimination (à égalité de main, le plus gros tapis de départ est mieux classé), fin automatique au dernier joueur, gains répartis selon le nombre d'inscrits.

## 6. Sécurité

* Le serveur est l'unique autorité : le navigateur n'envoie que des intentions ; montants, tours, pots et gagnants sont calculés et revalidés côté serveur.
* Les vues `game:state` sont construites **par joueur** : jamais le paquet, jamais les cartes privées adverses (sauf cartes montrées). Le replay masque aussi les cartes non montrées. Un test d'intégration le vérifie sur chaque état reçu.
* Sessions en cookie `httpOnly`, `SameSite=Lax`, `Secure` en production ; révocation des autres sessions au changement de mot de passe ; comptes bannis déconnectés.
* CSRF : vérification de l'origine sur toute requête modifiante et sur le handshake WebSocket.
* Injections : requêtes Prisma paramétrées (y compris le SQL brut des statistiques via `Prisma.sql`), validation `zod` de toutes les entrées, React échappe tout texte affiché, CSP stricte, avatars vérifiés par signature binaire.
* Limitation de débit : authentification, rejoindre un salon, événements socket, chat.
* Accès : chaque salon/table/main/flux vidéo est réservé aux membres non bannis du salon ; les identifiants TURN sont éphémères (HMAC, 1 h).
* Journalisation : événements complets de chaque main en base, journal d'audit, logs `pino`.

## 7. Montée en charge

Mesuré sur le conteneur de développement (`npm run loadtest -- 25 6 30`) : 25 tables × 6 robots, ~52 mains/s, p95 de latence d'accusé < 30 ms, conservation des jetons vérifiée.

Pour aller au-delà d'une instance :
1. Adaptateur `@socket.io/redis-adapter` pour la diffusion inter-instances ;
2. Affectation d'une table à une instance (hachage de `gameId`) + routage collant (sticky sessions) ;
3. Visio : remplacer le maillage par LiveKit (SFU) en conservant `useVideoChat` comme façade.
