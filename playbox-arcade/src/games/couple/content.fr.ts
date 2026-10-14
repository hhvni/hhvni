/**
 * Contenus des jeux de couple (français). Pour une autre langue, créer content.<code>.ts
 * avec la même structure et l'ajouter dans content.ts.
 * Règle éditoriale : bienveillant, drôle ou tendre ; jamais humiliant ni explicite.
 */

export interface KnowMeQuestion {
  /** Formulation pour la personne qui répond sur elle-même. */
  self: string;
  /** Formulation pour la personne qui devine ({name} = la personne qui a répondu). */
  other: string;
  options: string[];
}

export const KNOW_ME: KnowMeQuestion[] = [
  { self: 'Ta saison préférée ?', other: 'La saison préférée de {name} ?', options: ['Printemps', 'Été', 'Automne', 'Hiver'] },
  { self: 'Ton moment préféré de la journée ?', other: 'Le moment préféré de {name} ?', options: ['Le matin', 'Le midi', 'La fin d’après-midi', 'La nuit'] },
  { self: 'Pour une soirée idéale, tu choisis…', other: 'Pour une soirée idéale, {name} choisit…', options: ['Film sous un plaid', 'Restaurant', 'Soirée entre amis', 'Jeux de société'] },
  { self: 'Ta destination de rêve ?', other: 'La destination de rêve de {name} ?', options: ['Une île tropicale', 'Une grande ville', 'La montagne', 'Un road trip'] },
  { self: 'Ton petit-déjeuner parfait ?', other: 'Le petit-déjeuner parfait de {name} ?', options: ['Sucré', 'Salé', 'Juste un café', 'Brunch géant'] },
  { self: 'En cas de stress, tu as tendance à…', other: 'En cas de stress, {name} a tendance à…', options: ['En parler', 'S’isoler', 'Faire du sport', 'Manger'] },
  { self: 'Ton super-pouvoir rêvé ?', other: 'Le super-pouvoir rêvé de {name} ?', options: ['Voler', 'Se téléporter', 'Lire les pensées', 'Arrêter le temps'] },
  { self: 'Le cadeau qui te touche le plus ?', other: 'Le cadeau qui touche le plus {name} ?', options: ['Un objet fait main', 'Une expérience à vivre', 'Une lettre', 'Une surprise'] },
  { self: 'Ton genre de film favori ?', other: 'Le genre de film favori de {name} ?', options: ['Comédie', 'Action', 'Romance', 'Thriller'] },
  { self: 'Tu es plutôt…', other: '{name} est plutôt…', options: ['Lève-tôt', 'Couche-tard', 'Les deux', 'Ni l’un ni l’autre'] },
  { self: 'Ton plat réconfort ?', other: 'Le plat réconfort de {name} ?', options: ['Pâtes', 'Pizza', 'Plat de famille', 'Dessert'] },
  { self: 'En vacances, tu préfères…', other: 'En vacances, {name} préfère…', options: ['Tout planifier', 'Improviser', 'Ne rien faire', 'Visiter un max'] },
  { self: 'Ta façon préférée de dire « je t’aime » ?', other: 'La façon préférée de {name} de dire « je t’aime » ?', options: ['Les mots', 'Les gestes tendres', 'Les petites attentions', 'Le temps passé ensemble'] },
  { self: 'Quel animal te ressemble le plus ?', other: 'Quel animal ressemble le plus à {name} ?', options: ['Chat', 'Chien', 'Loutre', 'Hibou'] },
  { self: 'Ta musique pour chanter à tue-tête ?', other: 'La musique de {name} pour chanter à tue-tête ?', options: ['Variété française', 'Pop', 'Rap', 'Rock'] },
  { self: 'Ton rapport au rangement ?', other: 'Le rapport de {name} au rangement ?', options: ['Maniaque', 'Organisé·e', 'Chaos maîtrisé', 'Chaos tout court'] },
  { self: 'Un dimanche parfait commence par…', other: 'Le dimanche parfait de {name} commence par…', options: ['Une grasse matinée', 'Un footing', 'Un bon café', 'Un brunch'] },
  { self: 'Ce qui te fait le plus rire ?', other: 'Ce qui fait le plus rire {name} ?', options: ['Les blagues nulles', 'Les vidéos d’animaux', 'L’humour absurde', 'Les gaffes du quotidien'] },
  { self: 'Ta boisson préférée ?', other: 'La boisson préférée de {name} ?', options: ['Café', 'Thé', 'Jus de fruits', 'Chocolat chaud'] },
  { self: 'Si tu gagnais au loto, première folie ?', other: 'Si {name} gagnait au loto, première folie ?', options: ['Un voyage', 'Une maison', 'Tout donner', 'Une voiture'] },
  { self: 'Pendant une dispute, tu as besoin de…', other: 'Pendant une dispute, {name} a besoin de…', options: ['Parler tout de suite', 'Prendre du recul', 'Un câlin', 'De l’humour'] },
  { self: 'Ton talent caché ?', other: 'Le talent caché de {name} ?', options: ['La cuisine', 'Les imitations', 'Le chant', 'Le bricolage'] },
  { self: 'Ta saison des séries : tu regardes…', other: 'Côté séries, {name} regarde…', options: ['Un épisode par soir', 'Tout d’un coup', 'Que les classiques', 'Presque jamais'] },
  { self: 'Ton rendez-vous idéal ?', other: 'Le rendez-vous idéal de {name} ?', options: ['Pique-nique', 'Concert', 'Balade de nuit', 'Atelier cuisine'] },
];

export const WHO_OF_US: string[] = [
  'Qui de nous deux s’endort le premier devant un film ?',
  'Qui de nous deux est le plus gourmand ?',
  'Qui de nous deux se perd le plus facilement ?',
  'Qui de nous deux dit « je t’aime » le plus souvent ?',
  'Qui de nous deux est le plus têtu ?',
  'Qui de nous deux chante le plus faux ?',
  'Qui de nous deux pleure devant les films ?',
  'Qui de nous deux est toujours en retard ?',
  'Qui de nous deux a eu le coup de foudre en premier ?',
  'Qui de nous deux est le plus drôle ?',
  'Qui de nous deux prend le plus de photos ?',
  'Qui de nous deux est le plus câlin ?',
  'Qui de nous deux fait le plus de bêtises en cuisine ?',
  'Qui de nous deux est le meilleur pour consoler ?',
  'Qui de nous deux a le plus mauvais caractère au réveil ?',
  'Qui de nous deux organise les surprises ?',
  'Qui de nous deux est le plus mauvais perdant ?',
  'Qui de nous deux passe le plus de temps sur son téléphone ?',
  'Qui de nous deux se souvient des dates importantes ?',
  'Qui de nous deux danserait au milieu de la rue ?',
];

export type TalkLevel = 'light' | 'deep' | 'spicy';

export const DEEP_TALK: Record<TalkLevel, string[]> = {
  light: [
    'Quel est le meilleur repas que nous ayons partagé ?',
    'Si on partait demain, où irais-tu sans réfléchir ?',
    'Quelle chanson te fait penser à nous ?',
    'Quel est ton souvenir préféré de notre premier mois ?',
    'Quelle petite habitude de l’autre te fait sourire ?',
    'Quel film pourrions-nous regarder dix fois ensemble ?',
    'Quel surnom aurais-tu aimé avoir enfant ?',
    'Quel objet emporterais-tu sur une île déserte (à part moi) ?',
    'Quelle activité aimerais-tu qu’on essaie ensemble cette année ?',
    'Quel est le cadeau le plus réussi que tu aies reçu ?',
    'Quelle est la chose la plus drôle qui nous soit arrivée ?',
    'Si notre couple était un plat, ce serait lequel ?',
    'Quelle est ta plus grande fierté de la semaine ?',
    'Quel talent aimerais-tu apprendre avec moi ?',
  ],
  deep: [
    'Qu’est-ce qui t’a fait comprendre que tu tenais vraiment à moi ?',
    'De quoi as-tu besoin quand tu passes une mauvaise journée ?',
    'Quel rêve n’as-tu encore jamais osé me raconter ?',
    'Qu’as-tu appris sur toi depuis que nous sommes ensemble ?',
    'Quelle valeur est la plus importante pour toi dans un couple ?',
    'À quoi ressemble notre vie idéale dans dix ans ?',
    'Quel moment difficile nous a rendus plus forts ?',
    'Qu’est-ce que je fais qui te fait te sentir aimé·e ?',
    'Y a-t-il quelque chose que tu aimerais que l’on fasse plus souvent ?',
    'Quelle peur aimerais-tu dépasser cette année ?',
    'Quel souvenir d’enfance t’a le plus marqué·e ?',
    'Comment aimerais-tu qu’on se réconcilie après une dispute ?',
    'Qu’est-ce qui te rend profondément heureux·se, au quotidien ?',
    'Quelle promesse aimerais-tu qu’on se fasse ?',
  ],
  spicy: [
    'Quel est le moment où tu m’as trouvé·e le plus irrésistible ?',
    'Quel compliment aimerais-tu entendre plus souvent ?',
    'Quel rendez-vous surprise rêverais-tu que je t’organise ?',
    'Quelle tenue me va le mieux selon toi ?',
    'Quel est ton souvenir de notre plus beau baiser ?',
    'Qu’est-ce qui t’a attiré·e chez moi la toute première fois ?',
    'Quel geste tendre te fait toujours fondre ?',
    'Quelle chanson mettrais-tu pour un slow improvisé dans le salon ?',
    'Si on avait une soirée rien qu’à nous, sans téléphone, on ferait quoi ?',
    'Quel petit défi romantique aimerais-tu me lancer ?',
    'Quel est le message le plus mignon que je t’aie envoyé ?',
    'Où aimerais-tu qu’on s’embrasse pour la première fois si c’était à refaire ?',
  ],
};

export interface Challenge {
  text: string;
  /** Durée du chrono en secondes. */
  seconds: number;
}

export const CHALLENGES: Challenge[] = [
  { text: 'Faites-vous chacun trois compliments sincères, sans répéter ceux de l’autre.', seconds: 45 },
  { text: 'Regardez-vous dans les yeux sans rire pendant 30 secondes.', seconds: 30 },
  { text: 'Imitez la façon dont l’autre rit. Le plus ressemblant gagne un bisou.', seconds: 40 },
  { text: 'Trouvez cinq points communs que vous n’aviez jamais remarqués.', seconds: 60 },
  { text: 'Dessinez le portrait de l’autre sans regarder la feuille.', seconds: 45 },
  { text: 'Racontez votre première rencontre en alternant une phrase chacun.', seconds: 60 },
  { text: 'Inventez ensemble un surnom secret pour votre couple.', seconds: 40 },
  { text: 'Dansez un slow sur la chanson que fredonne l’un de vous.', seconds: 45 },
  { text: 'Citez chacun trois choses que l’autre fait mieux que vous.', seconds: 45 },
  { text: 'Mimez votre film préféré à deux : l’autre doit deviner.', seconds: 60 },
  { text: 'Écrivez un mot doux de dix mots maximum et échangez-les.', seconds: 60 },
  { text: 'Faites le plus long câlin possible sans parler.', seconds: 30 },
  { text: 'Planifiez votre prochain rendez-vous en moins d’une minute : lieu, heure, surprise.', seconds: 60 },
  { text: 'Chantez ensemble le refrain d’une chanson que vous connaissez tous les deux.', seconds: 40 },
  { text: 'Trouvez un geste secret qui voudra dire « je pense à toi » en public.', seconds: 40 },
  { text: 'Racontez chacun le moment où vous vous êtes sentis le plus fiers de l’autre.', seconds: 60 },
];
