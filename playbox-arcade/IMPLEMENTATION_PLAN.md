# PLAYBOX ARCADE — Plan d'implémentation

## Analyse du workspace (état initial)

- Dépôt `hhvni/hhvni` : uniquement un `README.md` de profil GitHub, aucun projet existant.
- Le projet mobile est donc créé dans le sous-dossier `playbox-arcade/` pour ne pas toucher au README de profil.

## Choix techniques

| Sujet | Choix | Raison |
| --- | --- | --- |
| Framework | Expo SDK 57 + React Native 0.86 + TypeScript strict | Android + iOS depuis une seule base, build cloud EAS, version stable courante |
| Navigation | Expo Router (`src/app/`) | Routage par fichiers recommandé par Expo, liens profonds gratuits |
| Rendu des jeux | `react-native-svg` + boucle `requestAnimationFrame` | Graphismes vectoriels nets sur écrans haute densité, aucune image distante, fonctionne aussi sur le web pour les tests automatisés. Skia a été écarté pour la V1 : plus lourd et inutile pour des scènes de quelques dizaines d'éléments. |
| Animations UI | API `Animated` de React Native | Intégrée, driver natif, pas de dépendance supplémentaire |
| Gestes | `PanResponder` | Intégré, suffisant pour des commandes à un doigt |
| Sauvegarde | `@react-native-async-storage/async-storage` | Persistance locale hors ligne |
| Audio | `expo-audio` + sons WAV générés par script (`scripts/generate-sounds.mjs`) | Sons 100 % originaux, aucune licence tierce ; le jeu fonctionne si l'audio échoue |
| Vibrations | `expo-haptics` | Retour tactile désactivable |
| Tests | `jest-expo` (logique pure) + export web + Playwright (captures) | Vérification réelle du comportement |

## Architecture

```
src/
  app/            Écrans (Expo Router) : accueil, catégorie, jeu, profil, paramètres
  config/         Nom de l'app et constantes modifiables
  i18n/           Dictionnaires (fr complet, en préparé) + fonction t()
  theme/          Couleurs, catégories, typographie, espacements
  components/     Kit UI (boutons, cartes, compteurs, particules, dialogues, icônes SVG)
  engine/         Boucle de jeu, maths, aléatoire, coordonnées, coque de jeu (GameShell)
  games/          Un dossier par mini-jeu + registre central (registry.ts)
  store/          Progression : XP, niveaux, pièces, scores, succès, défis du jour
  audio/          Gestionnaire de sons
```

Ajouter un jeu = créer un dossier dans `src/games/`, exporter un composant qui reçoit
`GameProps` et appelle `onFinish(result)`, puis l'enregistrer dans `src/games/registry.ts`.

## Étapes

1. Fondation : projet Expo, thème, i18n, stockage, audio, haptique.
2. Navigation et interface : splash animé, accueil, catégories, profil, paramètres.
3. Moteur de jeu : boucle, coque de partie (pause, résultat, récompenses), utilitaires.
4. Précision : fléchettes, tir à l'arc, lancer d'anneaux (bowling annoncé « Bientôt disponible »).
5. Football : tirs au but, coup franc, défi précision.
6. Couple : quiz « Tu me connais ? », « Qui de nous deux ? », cartes de questions, défis à deux.
7. Progression : XP, niveaux, pièces, succès, défis du jour, cosmétiques déblocables.
8. Tests, corrections, finition.

## Fonctionnement hors ligne

Tout fonctionne hors ligne : jeux, contenus de couple, sauvegardes, sons, défis du jour
(générés localement à partir de la date). Aucun compte, aucun serveur, aucun classement en ligne.
