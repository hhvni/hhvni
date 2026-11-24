/**
 * Probabilités de gain lors d'un all-in (affichage façon retransmission TV).
 *
 * - Énumération exhaustive quand il reste au plus 2 cartes à distribuer
 *   (au plus 1 081 tableaux possibles) : résultat exact.
 * - Sinon (avant le flop) : simulation de Monte-Carlo.
 * Utilise uniquement des cartes connues de tous (mains dévoilées + board).
 */
import { type Card, freshDeck } from './cards.js';
import { fastScore } from './evaluator.js';

export interface Equity {
  /** Probabilité de remporter seul le pot (0..1). */
  win: number;
  /** Probabilité de partager (0..1). */
  tie: number;
}

export function allInEquity(hands: Card[][], board: Card[], samples = 6000, rand: () => number = Math.random): Equity[] {
  const used = new Set<Card>([...hands.flat(), ...board]);
  const deck = freshDeck().filter((c) => !used.has(c));
  const missing = 5 - board.length;
  const wins = new Array<number>(hands.length).fill(0);
  const ties = new Array<number>(hands.length).fill(0);
  let total = 0;

  const score = (full: Card[]) => {
    let best = -1;
    let winners: number[] = [];
    hands.forEach((h, i) => {
      const s = fastScore([...h, ...full]);
      if (s > best) {
        best = s;
        winners = [i];
      } else if (s === best) winners.push(i);
    });
    if (winners.length === 1) wins[winners[0]!]!++;
    else for (const w of winners) ties[w]!++;
    total++;
  };

  if (missing === 0) score(board);
  else if (missing === 1) for (const a of deck) score([...board, a]);
  else if (missing === 2) {
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) score([...board, deck[i]!, deck[j]!]);
  } else {
    const d = [...deck];
    for (let n = 0; n < samples; n++) {
      // Tirage partiel de Fisher-Yates des cartes manquantes
      for (let k = 0; k < missing; k++) {
        const j = k + Math.floor(rand() * (d.length - k));
        const t = d[k]!;
        d[k] = d[j]!;
        d[j] = t;
      }
      score([...board, ...d.slice(0, missing)]);
    }
  }
  return hands.map((_, i) => ({ win: wins[i]! / total, tie: ties[i]! / total }));
}
