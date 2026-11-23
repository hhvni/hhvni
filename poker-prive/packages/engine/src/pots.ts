/**
 * Calcul des pots (principal + secondaires) et répartition des gains.
 *
 * Les pots sont construits par « niveaux » de contribution des joueurs encore
 * en jeu : chaque niveau distinct de mise totale (typiquement un all-in) crée
 * une couche. Les jetons des joueurs couchés alimentent les pots mais ces
 * joueurs ne sont éligibles à aucun.
 */

export interface PotContribution {
  playerId: string;
  /** Total des jetons investis dans la main (antes + blinds + mises). */
  amount: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Joueurs pouvant prétendre à ce pot. */
  eligible: string[];
}

export function buildPots(contributions: PotContribution[]): Pot[] {
  const live = contributions.filter((c) => !c.folded && c.amount > 0);
  const levels = [...new Set(live.map((c) => c.amount))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contributions) amount += Math.max(0, Math.min(c.amount, level) - Math.min(c.amount, prev));
    const eligible = live.filter((c) => c.amount >= level).map((c) => c.playerId);
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Sécurité : jetons d'un joueur couché au-delà du plus haut niveau vivant
  // (ne devrait pas arriver après restitution des mises non suivies).
  const top = levels[levels.length - 1] ?? 0;
  const excess = contributions.reduce((s, c) => s + Math.max(0, c.amount - top), 0);
  if (excess > 0) {
    const last = pots[pots.length - 1];
    if (last) last.amount += excess;
    else if (live.length === 0) {
      // Aucun joueur vivant : impossible dans une main réelle.
      throw new Error('Aucun joueur éligible au pot');
    }
  }
  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export interface PotAward {
  potIndex: number;
  amount: number;
  winners: string[];
  /** Montant reçu par chaque gagnant pour ce pot. */
  shares: Record<string, number>;
}

/**
 * Répartit chaque pot entre les meilleurs scores éligibles.
 * @param scores score de main par joueur (plus grand = meilleur)
 * @param seatOrderFromButton ordre des joueurs en partant du premier siège à
 *   gauche du bouton : les jetons indivisibles (« odd chips ») sont attribués un
 *   par un dans cet ordre, conformément aux règles usuelles.
 */
export function distributePots(
  pots: Pot[],
  scores: Record<string, number>,
  seatOrderFromButton: string[],
): PotAward[] {
  return pots.map((pot, potIndex) => {
    const contenders = pot.eligible.filter((id) => scores[id] !== undefined);
    if (contenders.length === 0) throw new Error('Pot sans prétendant');
    const best = Math.max(...contenders.map((id) => scores[id]!));
    const winners = contenders
      .filter((id) => scores[id] === best)
      .sort((a, b) => seatOrderFromButton.indexOf(a) - seatOrderFromButton.indexOf(b));
    const base = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - base * winners.length;
    const shares: Record<string, number> = {};
    for (const w of winners) {
      shares[w] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
    return { potIndex, amount: pot.amount, winners, shares };
  });
}
