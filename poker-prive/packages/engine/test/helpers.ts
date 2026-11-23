import { type Card, freshDeck, parseCards } from '../src/cards.js';
import { PokerTable } from '../src/table.js';

/** Crée une table et assoit des joueurs p0..pn aux sièges 0..n. */
export function makeTable(stacks: number[], cfg: Partial<{ smallBlind: number; bigBlind: number; ante: number; maxSeats: number }> = {}) {
  const t = new PokerTable({ smallBlind: 50, bigBlind: 100, ante: 0, maxSeats: 9, ...cfg });
  stacks.forEach((s, i) => t.sit(i, `p${i}`, `Joueur${i}`, s));
  return t;
}

/**
 * Construit un jeu truqué (tests uniquement) : `holes` indexé par siège,
 * `board` = 5 cartes. Reproduit l'ordre de distribution du moteur.
 */
export function rigDeck(t: PokerTable, holes: Record<number, string>, board: string): Card[] {
  const eligible = t.eligibleSeats().sort((a, b) => a - b);
  const button = eligible.find((s) => s > t.buttonSeat) ?? eligible[0]!;
  const idx = eligible.findIndex((s) => s > button);
  const order = idx === -1 ? eligible : [...eligible.slice(idx), ...eligible.slice(0, idx)];
  const h = Object.fromEntries(Object.entries(holes).map(([k, v]) => [Number(k), parseCards(v)]));
  const b = parseCards(board);
  const used = new Set<Card>([...Object.values(h).flat(), ...b]);
  const filler = freshDeck().filter((c) => !used.has(c));
  const take = () => filler.shift()!;
  const deck: Card[] = [];
  for (let r = 0; r < 2; r++) for (const s of order) deck.push(h[s]?.[r] ?? take());
  deck.push(take(), b[0]!, b[1]!, b[2]!, take(), b[3]!, take(), b[4]!);
  deck.push(...filler);
  return deck;
}

export const stacksOf = (t: PokerTable) => Object.fromEntries(t.seats.filter(Boolean).map((s) => [s!.playerId, s!.stack]));
