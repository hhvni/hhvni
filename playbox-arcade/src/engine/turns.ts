/**
 * Gestion générique des tours : `rounds` manches, chaque joueur lance `perTurn` fois par manche.
 * Les joueurs alternent à chaque tour complet.
 */
export interface TurnState {
  round: number; // 0-based
  player: number;
  shot: number; // index du lancer dans le tour
  done: boolean;
}

export function firstTurn(): TurnState {
  return { round: 0, player: 0, shot: 0, done: false };
}

export function nextShot(s: TurnState, cfg: { rounds: number; players: number; perTurn: number }): TurnState & { turnEnded: boolean } {
  if (s.done) return { ...s, turnEnded: false };
  if (s.shot + 1 < cfg.perTurn) return { ...s, shot: s.shot + 1, turnEnded: false };
  if (s.player + 1 < cfg.players) return { round: s.round, player: s.player + 1, shot: 0, done: false, turnEnded: true };
  if (s.round + 1 < cfg.rounds) return { round: s.round + 1, player: 0, shot: 0, done: false, turnEnded: true };
  return { ...s, done: true, turnEnded: true };
}

/** Désigne le gagnant ; renvoie -1 en cas d'égalité. */
export function winnerIndex(scores: number[]): number {
  const max = Math.max(...scores);
  const idx = scores.filter((v) => v === max).length > 1 ? -1 : scores.indexOf(max);
  return idx;
}
