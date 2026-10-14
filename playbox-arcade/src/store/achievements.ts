import type { Profile } from './types';
import { levelInfo } from './level';

export interface AchievementDef {
  id: string;
  /** Icône du kit SVG (voir components/Icon). */
  icon: 'trophy' | 'target' | 'ball' | 'heart' | 'star' | 'flame' | 'bow' | 'ring' | 'compass' | 'crown' | 'chat';
  check: (p: Profile) => boolean;
}

const total = (p: Profile, key: string) => p.totals[key] ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_game', icon: 'star', check: (p) => p.gamesPlayed >= 1 },
  { id: 'bullseye', icon: 'target', check: (p) => total(p, 'bullseyes') >= 1 },
  { id: 'ton', icon: 'flame', check: (p) => total(p, 'dartsTon') >= 1 },
  { id: 'robin', icon: 'bow', check: (p) => total(p, 'xs') >= 1 },
  { id: 'perfect_volley', icon: 'bow', check: (p) => total(p, 'perfectVolleys') >= 1 },
  { id: 'ring_master', icon: 'ring', check: (p) => total(p, 'ringsOn') >= 25 },
  { id: 'hat_trick', icon: 'ball', check: (p) => total(p, 'hatTricks') >= 1 },
  { id: 'top_corner', icon: 'ball', check: (p) => total(p, 'topCorners') >= 1 },
  { id: 'free_kick_artist', icon: 'ball', check: (p) => total(p, 'freekickGoals') >= 10 },
  { id: 'soulmates', icon: 'heart', check: (p) => total(p, 'perfectMatch') >= 1 },
  { id: 'deep_talker', icon: 'chat', check: (p) => total(p, 'questionsAnswered') >= 30 },
  { id: 'explorer', icon: 'compass', check: (p) => p.categoriesPlayed.length >= 3 },
  { id: 'regular', icon: 'trophy', check: (p) => p.gamesPlayed >= 25 },
  { id: 'level5', icon: 'crown', check: (p) => levelInfo(p.xp).level >= 5 },
  { id: 'collector', icon: 'star', check: (p) => p.cosmetics.owned.length >= 5 },
];
