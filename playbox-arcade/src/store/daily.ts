import type { CategoryId } from '../theme/colors';
import { hashString, seededRandom } from './random';

/**
 * Défis du jour, générés localement à partir de la date.
 * - `sum` : on additionne la statistique `stat` sur toutes les parties du jour.
 * - `max` : on garde la meilleure valeur obtenue en une partie.
 * Statistiques spéciales : `plays` (toutes parties), `plays:<catégorie>`, `score:<jeu>`.
 */
export interface ChallengeDef {
  id: string;
  group: CategoryId;
  kind: 'sum' | 'max';
  stat: string;
  target: number;
  reward: number;
}

export const CHALLENGE_POOL: ChallengeDef[] = [
  { id: 'darts_score', group: 'precision', kind: 'max', stat: 'score:darts', target: 250, reward: 40 },
  { id: 'bullseyes', group: 'precision', kind: 'sum', stat: 'bullseyes', target: 2, reward: 40 },
  { id: 'archery_score', group: 'precision', kind: 'max', stat: 'score:archery', target: 110, reward: 40 },
  { id: 'archery_tens', group: 'precision', kind: 'sum', stat: 'tens', target: 4, reward: 35 },
  { id: 'rings_on', group: 'precision', kind: 'sum', stat: 'ringsOn', target: 8, reward: 35 },
  { id: 'precision_plays', group: 'precision', kind: 'sum', stat: 'plays:precision', target: 3, reward: 30 },
  { id: 'goals', group: 'football', kind: 'sum', stat: 'goals', target: 8, reward: 40 },
  { id: 'freekick_goals', group: 'football', kind: 'sum', stat: 'freekickGoals', target: 3, reward: 40 },
  { id: 'targets_hit', group: 'football', kind: 'sum', stat: 'targetsHit', target: 6, reward: 35 },
  { id: 'football_plays', group: 'football', kind: 'sum', stat: 'plays:football', target: 3, reward: 30 },
  { id: 'couple_plays', group: 'couple', kind: 'sum', stat: 'plays:couple', target: 1, reward: 30 },
  { id: 'couple_matches', group: 'couple', kind: 'sum', stat: 'coupleMatches', target: 5, reward: 35 },
  { id: 'questions', group: 'couple', kind: 'sum', stat: 'questionsAnswered', target: 8, reward: 30 },
];

/** Un défi par univers, choisi de façon déterministe pour la date donnée. */
export function challengesForDate(date: string): ChallengeDef[] {
  const rand = seededRandom(hashString(`daily-${date}`));
  const groups: CategoryId[] = ['precision', 'football', 'couple'];
  return groups.map((g) => {
    const options = CHALLENGE_POOL.filter((c) => c.group === g);
    return options[Math.floor(rand() * options.length)];
  });
}
