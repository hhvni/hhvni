/**
 * Évaluateur de mains de poker.
 *
 * Principe : pour 5 à 7 cartes, on énumère toutes les combinaisons de 5 cartes
 * (21 au maximum pour 7 cartes) et on garde celle dont le score est le plus
 * élevé. Le score est un entier comparable directement :
 *
 *   score = catégorie << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5
 *
 * où r1..r5 sont les rangs (2..14) ordonnés selon l'importance pour départager
 * (groupes les plus nombreux d'abord, puis rang décroissant = kickers).
 * Cette approche exhaustive est simple à vérifier et largement assez rapide
 * (quelques microsecondes par main).
 */
import { type Card, rankValue, suitOf } from './cards.js';

export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const CATEGORY_NAMES_FR: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carte haute',
  [HandCategory.OnePair]: 'Paire',
  [HandCategory.TwoPair]: 'Double paire',
  [HandCategory.ThreeOfAKind]: 'Brelan',
  [HandCategory.Straight]: 'Quinte',
  [HandCategory.Flush]: 'Couleur',
  [HandCategory.FullHouse]: 'Full',
  [HandCategory.FourOfAKind]: 'Carré',
  [HandCategory.StraightFlush]: 'Quinte flush',
  [HandCategory.RoyalFlush]: 'Quinte flush royale',
};

const RANK_NAMES_FR: Record<number, string> = {
  2: 'Deux', 3: 'Trois', 4: 'Quatre', 5: 'Cinq', 6: 'Six', 7: 'Sept', 8: 'Huit',
  9: 'Neuf', 10: 'Dix', 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As',
};
const RANK_PLURAL_FR: Record<number, string> = {
  2: 'Deux', 3: 'Trois', 4: 'Quatre', 5: 'Cinq', 6: 'Six', 7: 'Sept', 8: 'Huit',
  9: 'Neuf', 10: 'Dix', 11: 'Valets', 12: 'Dames', 13: 'Rois', 14: 'As',
};

export interface EvaluatedHand {
  category: HandCategory;
  /** Score comparable : plus grand = meilleure main. Égalité = partage. */
  score: number;
  /** Les 5 cartes retenues, ordonnées par importance. */
  cards: Card[];
  /** Rangs utilisés pour départager (taille 5). */
  ranks: number[];
  /** Description lisible en français, ex. « Full, Rois par les Sept ». */
  description: string;
}

function encode(category: HandCategory, ranks: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] ?? 0);
  return score;
}

/** Évalue exactement 5 cartes. */
export function evaluate5(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error('evaluate5 attend 5 cartes');
  if (new Set(cards).size !== 5) throw new Error('Cartes en double');

  const values = cards.map(rankValue);
  const isFlush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));

  // Groupes par rang : tri par (nombre desc, rang desc)
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Quinte (y compris la quinte basse A-2-3-4-5, dont la hauteur est 5)
  const distinct = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0]! - distinct[4]! === 4) straightHigh = distinct[0]!;
    else if (distinct.join(',') === '14,5,4,3,2') straightHigh = 5;
  }

  let category: HandCategory;
  let ranks: number[];

  if (straightHigh && isFlush) {
    category = straightHigh === 14 ? HandCategory.RoyalFlush : HandCategory.StraightFlush;
    ranks = straightRanks(straightHigh);
  } else if (groups[0]![1] === 4) {
    category = HandCategory.FourOfAKind;
    ranks = [groups[0]![0], groups[0]![0], groups[0]![0], groups[0]![0], groups[1]![0]];
  } else if (groups[0]![1] === 3 && groups[1]![1] === 2) {
    category = HandCategory.FullHouse;
    ranks = [groups[0]![0], groups[0]![0], groups[0]![0], groups[1]![0], groups[1]![0]];
  } else if (isFlush) {
    category = HandCategory.Flush;
    ranks = [...values].sort((a, b) => b - a);
  } else if (straightHigh) {
    category = HandCategory.Straight;
    ranks = straightRanks(straightHigh);
  } else if (groups[0]![1] === 3) {
    category = HandCategory.ThreeOfAKind;
    ranks = expand(groups);
  } else if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    category = HandCategory.TwoPair;
    ranks = expand(groups);
  } else if (groups[0]![1] === 2) {
    category = HandCategory.OnePair;
    ranks = expand(groups);
  } else {
    category = HandCategory.HighCard;
    ranks = [...values].sort((a, b) => b - a);
  }

  // Ordonne les cartes selon les rangs retenus (lisibilité de l'affichage)
  const pool = [...cards];
  const ordered: Card[] = [];
  for (const r of ranks) {
    const want = r === 1 ? 14 : r;
    const idx = pool.findIndex((c) => rankValue(c) === want);
    ordered.push(pool.splice(idx, 1)[0]!);
  }

  const scoreRanks = ranks.map((r) => (r === 1 ? 1 : r));
  return {
    category,
    score: encode(category, scoreRanks),
    cards: ordered,
    ranks: scoreRanks,
    description: describe(category, scoreRanks),
  };
}

/** Rangs d'une quinte de hauteur `high` ; l'As d'une quinte basse vaut 1. */
function straightRanks(high: number): number[] {
  if (high === 5) return [5, 4, 3, 2, 1];
  return [high, high - 1, high - 2, high - 3, high - 4];
}

function expand(groups: [number, number][]): number[] {
  const out: number[] = [];
  for (const [rank, n] of groups) for (let i = 0; i < n; i++) out.push(rank);
  return out;
}

function describe(category: HandCategory, r: number[]): string {
  const n = (v: number) => RANK_NAMES_FR[v === 1 ? 14 : v] ?? String(v);
  const p = (v: number) => RANK_PLURAL_FR[v] ?? String(v);
  switch (category) {
    case HandCategory.RoyalFlush:
      return 'Quinte flush royale';
    case HandCategory.StraightFlush:
      return `Quinte flush hauteur ${n(r[0]!)}`;
    case HandCategory.FourOfAKind:
      return `Carré de ${p(r[0]!)}`;
    case HandCategory.FullHouse:
      return `Full, ${p(r[0]!)} par les ${p(r[3]!)}`;
    case HandCategory.Flush:
      return `Couleur hauteur ${n(r[0]!)}`;
    case HandCategory.Straight:
      return `Quinte hauteur ${n(r[0]!)}`;
    case HandCategory.ThreeOfAKind:
      return `Brelan de ${p(r[0]!)}`;
    case HandCategory.TwoPair:
      return `Double paire, ${p(r[0]!)} et ${p(r[2]!)}`;
    case HandCategory.OnePair:
      return `Paire de ${p(r[0]!)}`;
    default:
      return `Carte haute ${n(r[0]!)}`;
  }
}

/** Évalue la meilleure main de 5 cartes parmi 5, 6 ou 7 cartes. */
export function evaluateBest(cards: Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) throw new Error('Il faut entre 5 et 7 cartes');
  if (new Set(cards).size !== cards.length) throw new Error('Cartes en double');
  let best: EvaluatedHand | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const h = evaluate5([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (!best || h.score > best.score) best = h;
          }
  return best!;
}

/** Compare deux mains : >0 si a gagne, <0 si b gagne, 0 en cas d'égalité. */
export function compareHands(a: Card[], b: Card[]): number {
  return Math.sign(evaluateBest(a).score - evaluateBest(b).score);
}

// ─────────────────────────── Évaluation rapide ───────────────────────────

const RANK_OF: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const SUIT_OF: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };

const enc = (cat: number, r: number[]) => (((((cat * 16 + (r[0] ?? 0)) * 16 + (r[1] ?? 0)) * 16 + (r[2] ?? 0)) * 16 + (r[3] ?? 0)) * 16 + (r[4] ?? 0));

/** Hauteur de la meilleure quinte dans un masque de rangs (bit r = rang r), 0 si aucune. */
function straightHigh(mask: number): number {
  if (mask & (1 << 14)) mask |= 1 << 1; // As bas
  for (let hi = 14; hi >= 5; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  return 0;
}

const straightRanksOf = (hi: number) => (hi === 5 ? [5, 4, 3, 2, 1] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]);

/**
 * Score de la meilleure main de 5 parmi 5 à 7 cartes, identique à
 * `evaluateBest(cards).score` mais sans énumérer les combinaisons (≈ 20× plus rapide).
 * Utilisé pour les calculs intensifs (probabilités, robots).
 */
export function fastScore(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = RANK_OF[c[0]!]!;
    const s = SUIT_OF[c[1]!]!;
    counts[r]!++;
    suitMask[s]! |= 1 << r;
    suitCount[s]!++;
    mask |= 1 << r;
  }
  // Couleur / quinte flush
  const fs = suitCount.findIndex((n) => n >= 5);
  if (fs !== -1) {
    const sh = straightHigh(suitMask[fs]!);
    if (sh) return enc(sh === 14 ? HandCategory.RoyalFlush : HandCategory.StraightFlush, straightRanksOf(sh));
  }
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = counts[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
    else if (n === 1) singles.push(r);
  }
  const highestExcept = (...ex: number[]) => {
    for (let r = 14; r >= 2; r--) if (counts[r]! > 0 && !ex.includes(r)) return r;
    return 0;
  };
  if (quads.length) {
    const q = quads[0]!;
    return enc(HandCategory.FourOfAKind, [q, q, q, q, highestExcept(q)]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0]!;
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return enc(HandCategory.FullHouse, [t, t, t, p, p]);
  }
  if (fs !== -1) {
    const r: number[] = [];
    for (let x = 14; x >= 2 && r.length < 5; x--) if (suitMask[fs]! & (1 << x)) r.push(x);
    return enc(HandCategory.Flush, r);
  }
  const sh = straightHigh(mask);
  if (sh) return enc(HandCategory.Straight, straightRanksOf(sh));
  if (trips.length) {
    const t = trips[0]!;
    const k = singles.slice(0, 2);
    return enc(HandCategory.ThreeOfAKind, [t, t, t, ...k]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs as [number, number];
    return enc(HandCategory.TwoPair, [p1, p1, p2, p2, highestExcept(p1, p2)]);
  }
  if (pairs.length === 1) {
    const p = pairs[0]!;
    return enc(HandCategory.OnePair, [p, p, ...singles.slice(0, 3)]);
  }
  return enc(HandCategory.HighCard, singles.slice(0, 5));
}
