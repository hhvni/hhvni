import type React from 'react';
import type { IconName } from '../components/Icon';
import type { TKey } from '../i18n';
import type { Cosmetic } from '../store/cosmetics';
import type { GameMode, GameResult, Settings } from '../store/types';
import type { CategoryId, CategoryTheme } from '../theme/colors';

export type GameOutcome = Omit<GameResult, 'gameId' | 'mode'>;

export interface GameProps {
  mode: GameMode;
  /** Noms des joueurs (1 en solo, 2 à deux). */
  players: string[];
  paused: boolean;
  settings: Settings;
  skins: { dart: Cosmetic; ball: Cosmetic; arrow: Cosmetic };
  theme: CategoryTheme;
  onFinish: (outcome: GameOutcome) => void;
}

export interface GameDefinition {
  id: string;
  category: CategoryId;
  title: TKey;
  description: TKey;
  /** Règles affichées avant la partie (lignes séparées par \n). */
  howTo: TKey;
  icon: IconName;
  modes: GameMode[];
  status: 'available' | 'soon';
  /** false : pas de meilleur score affiché (jeux de discussion). */
  scored: boolean;
  component?: React.ComponentType<GameProps>;
}
