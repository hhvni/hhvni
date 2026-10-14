import type { CategoryId } from '../theme/colors';
import type { Locale } from '../i18n';

export type GameMode = 'solo' | 'duo';

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  language: Locale;
  reduceMotion: boolean;
  /** Réduit le tremblement de visée et élargit les zones de tolérance. */
  aimAssist: boolean;
}

export interface GameStatsEntry {
  plays: number;
  best: number;
  totalScore: number;
  lastPlayed: number;
}

export interface DailyState {
  date: string;
  /** Progression par identifiant de défi. */
  progress: Record<string, number>;
  claimed: string[];
}

export interface CosmeticsState {
  owned: string[];
  equipped: { dart: string; ball: string; arrow: string };
}

export interface Profile {
  name: string;
  xp: number;
  coins: number;
  gamesPlayed: number;
  perGame: Record<string, GameStatsEntry>;
  /** Compteurs cumulés (bullseyes, buts, quiz parfaits…). */
  totals: Record<string, number>;
  achievements: Record<string, number>;
  recent: string[];
  categoriesPlayed: CategoryId[];
  daily: DailyState;
  cosmetics: CosmeticsState;
  preferredMode: GameMode;
  createdAt: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  profile: Profile;
}

/** Ce que chaque jeu renvoie à la fin d'une partie. */
export interface GameResult {
  gameId: string;
  mode: GameMode;
  score: number;
  /** Performance normalisée 0..1, sert au calcul de l'XP et des pièces. */
  performance: number;
  /** Titre affiché sur l'écran de fin (ex. « Victoire ! », « Joueur 2 gagne »). */
  headline?: string;
  won?: boolean;
  /** Compteurs de la partie, ajoutés aux totaux et aux défis du jour. */
  stats: Record<string, number>;
  /** Lignes affichées sur l'écran de fin. */
  summary: { label: string; value: string }[];
  /** false pour les jeux de couple : pas de « meilleur score » pertinent. */
  scored?: boolean;
}

export interface RewardSummary {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  newBest: boolean;
  previousBest: number;
  newAchievements: string[];
  completedChallenges: string[];
}
