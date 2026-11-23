/**
 * Structures de tournoi : niveaux de blinds, pauses, répartition des places.
 * Fonctions pures, utilisées par le serveur pour piloter l'horloge.
 */

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** Durée du niveau en secondes. */
  duration: number;
  /** Pause après ce niveau (secondes, 0 = aucune). */
  breakAfter: number;
}

/**
 * Génère une structure progressive standard (~ +25 à +50 % par niveau),
 * arrondie à des valeurs « propres ».
 */
export function generateBlindStructure(opts: {
  startSmallBlind: number;
  startBigBlind: number;
  levelMinutes: number;
  levels?: number;
  anteFromLevel?: number | null;
  breakEvery?: number;
  breakMinutes?: number;
}): BlindLevel[] {
  const n = opts.levels ?? 20;
  const out: BlindLevel[] = [];
  let bb = opts.startBigBlind;
  const ratio = opts.startSmallBlind / opts.startBigBlind;
  for (let i = 0; i < n; i++) {
    const big = i === 0 ? opts.startBigBlind : niceRound(bb);
    const small = i === 0 ? opts.startSmallBlind : Math.max(1, niceRound(big * ratio));
    const ante = opts.anteFromLevel != null && i + 1 >= opts.anteFromLevel ? Math.max(1, niceRound(big / 8)) : 0;
    const breakAfter = opts.breakEvery && (i + 1) % opts.breakEvery === 0 ? (opts.breakMinutes ?? 5) * 60 : 0;
    out.push({ smallBlind: small, bigBlind: big, ante, duration: opts.levelMinutes * 60, breakAfter });
    bb = big * (i < 4 ? 1.5 : 1.35);
  }
  return out;
}

export function niceRound(x: number): number {
  if (x <= 10) return Math.round(x);
  const mag = 10 ** Math.floor(Math.log10(x));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const n = x / mag;
  const best = steps.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  return Math.round(best * mag);
}

/** Pourcentages de répartition (points de classement virtuels) selon le nombre d'inscrits. */
export function payoutPercentages(entrants: number): number[] {
  if (entrants <= 3) return [100];
  if (entrants <= 6) return [65, 35];
  if (entrants <= 10) return [50, 30, 20];
  if (entrants <= 20) return [40, 25, 18, 10, 7];
  return [30, 20, 14, 10, 8, 6, 5, 4, 3];
}

/** Points de classement par place (jetons virtuels de prestige, sans valeur). */
export function prizePool(entrants: number, buyIn: number): number[] {
  const total = entrants * buyIn;
  const pcts = payoutPercentages(entrants);
  const prizes = pcts.map((p) => Math.floor((total * p) / 100));
  const rest = total - prizes.reduce((a, b) => a + b, 0);
  if (prizes.length) prizes[0]! += rest;
  return prizes;
}
