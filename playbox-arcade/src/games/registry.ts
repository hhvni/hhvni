import type { GameDefinition } from '../engine/types';
import type { CategoryId } from '../theme/colors';
import ArcheryGame from './archery/ArcheryGame';
import ChallengesGame from './couple/ChallengesGame';
import DeepTalkGame from './couple/DeepTalkGame';
import KnowMeGame from './couple/KnowMeGame';
import WhoOfUsGame from './couple/WhoOfUsGame';
import DartsGame from './darts/DartsGame';
import FreeKickGame from './football/FreeKickGame';
import PenaltyGame from './football/PenaltyGame';
import TargetGame from './football/TargetGame';
import RingsGame from './rings/RingsGame';

/**
 * Registre central des mini-jeux. Pour ajouter un jeu :
 * 1. créer son dossier dans src/games/<id>/ avec un composant recevant GameProps ;
 * 2. ajouter ses textes dans src/i18n/fr.ts (games.<id>) ;
 * 3. l'enregistrer ci-dessous avec status: 'available'.
 */
export const GAMES: GameDefinition[] = [
  {
    id: 'darts',
    category: 'precision',
    title: 'games.darts.title',
    description: 'games.darts.description',
    howTo: 'games.darts.howTo',
    icon: 'dart',
    modes: ['solo', 'duo'],
    status: 'available',
    scored: true,
    component: DartsGame,
  },
  {
    id: 'archery',
    category: 'precision',
    title: 'games.archery.title',
    description: 'games.archery.description',
    howTo: 'games.archery.howTo',
    icon: 'bow',
    modes: ['solo', 'duo'],
    status: 'available',
    scored: true,
    component: ArcheryGame,
  },
  {
    id: 'rings',
    category: 'precision',
    title: 'games.rings.title',
    description: 'games.rings.description',
    howTo: 'games.rings.howTo',
    icon: 'ring',
    modes: ['solo', 'duo'],
    status: 'available',
    scored: true,
    component: RingsGame,
  },
  {
    id: 'bowling',
    category: 'precision',
    title: 'games.bowling.title',
    description: 'games.bowling.description',
    howTo: 'games.bowling.howTo',
    icon: 'pin',
    modes: ['solo', 'duo'],
    status: 'soon',
    scored: true,
  },
  {
    id: 'penalty',
    category: 'football',
    title: 'games.penalty.title',
    description: 'games.penalty.description',
    howTo: 'games.penalty.howTo',
    icon: 'goal',
    modes: ['solo', 'duo'],
    status: 'available',
    scored: true,
    component: PenaltyGame,
  },
  {
    id: 'freekick',
    category: 'football',
    title: 'games.freekick.title',
    description: 'games.freekick.description',
    howTo: 'games.freekick.howTo',
    icon: 'wall',
    modes: ['solo'],
    status: 'available',
    scored: true,
    component: FreeKickGame,
  },
  {
    id: 'target',
    category: 'football',
    title: 'games.target.title',
    description: 'games.target.description',
    howTo: 'games.target.howTo',
    icon: 'crosshair',
    modes: ['solo'],
    status: 'available',
    scored: true,
    component: TargetGame,
  },
  {
    id: 'juggling',
    category: 'football',
    title: 'games.juggling.title',
    description: 'games.juggling.description',
    howTo: 'games.juggling.howTo',
    icon: 'ball',
    modes: ['solo'],
    status: 'soon',
    scored: true,
  },
  {
    id: 'know-me',
    category: 'couple',
    title: 'games.knowMe.title',
    description: 'games.knowMe.description',
    howTo: 'games.knowMe.howTo',
    icon: 'heart',
    modes: ['duo'],
    status: 'available',
    scored: true,
    component: KnowMeGame,
  },
  {
    id: 'who-of-us',
    category: 'couple',
    title: 'games.whoOfUs.title',
    description: 'games.whoOfUs.description',
    howTo: 'games.whoOfUs.howTo',
    icon: 'users',
    modes: ['duo'],
    status: 'available',
    scored: true,
    component: WhoOfUsGame,
  },
  {
    id: 'deep-talk',
    category: 'couple',
    title: 'games.deepTalk.title',
    description: 'games.deepTalk.description',
    howTo: 'games.deepTalk.howTo',
    icon: 'chat',
    modes: ['duo'],
    status: 'available',
    scored: false,
    component: DeepTalkGame,
  },
  {
    id: 'challenges',
    category: 'couple',
    title: 'games.challenges.title',
    description: 'games.challenges.description',
    howTo: 'games.challenges.howTo',
    icon: 'cards',
    modes: ['duo'],
    status: 'available',
    scored: true,
    component: ChallengesGame,
  },
];

export const CATEGORIES: { id: CategoryId; icon: GameDefinition['icon'] }[] = [
  { id: 'precision', icon: 'target' },
  { id: 'football', icon: 'ball' },
  { id: 'couple', icon: 'heart' },
];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export function gamesOf(category: CategoryId): GameDefinition[] {
  return GAMES.filter((g) => g.category === category);
}
