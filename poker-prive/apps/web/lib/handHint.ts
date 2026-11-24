/**
 * Description en clair de la main du joueur pendant le coup :
 * « Paire de Huit », « As-Roi assortis », « Paire de Dames + tirage couleur »,
 * « Double paire, … (sur le board) ».
 */
import { evaluateBest, HandCategory, type Card } from '@poker/engine';

const NAMES: Record<string, string> = {
  A: 'As', K: 'Roi', Q: 'Dame', J: 'Valet', T: 'Dix', '9': 'Neuf', '8': 'Huit', '7': 'Sept', '6': 'Six', '5': 'Cinq', '4': 'Quatre', '3': 'Trois', '2': 'Deux',
};
const PLURAL: Record<string, string> = { K: 'Rois', Q: 'Dames', J: 'Valets' };
const VALUE: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

export interface HandHint {
  /** Main faite (ou description préflop). */
  made: string;
  /** Tirages éventuels (« tirage couleur », « quinte ventrale »…). */
  draws: string[];
  /** La main faite est entièrement sur le board (vos cartes ne l'améliorent pas). */
  onBoard: boolean;
  /** Force grossière, pour la couleur de l'étiquette (0 = faible … 3 = monstre). */
  tier: 0 | 1 | 2 | 3;
}

/** Nombre de cartes « structurantes » de la main (hors kickers). */
function coreSize(cat: HandCategory): number {
  switch (cat) {
    case HandCategory.OnePair: return 2;
    case HandCategory.TwoPair: return 4;
    case HandCategory.ThreeOfAKind: return 3;
    case HandCategory.FourOfAKind: return 4;
    case HandCategory.HighCard: return 1;
    default: return 5;
  }
}

function preflop(hole: Card[]): HandHint {
  const [a, b] = [...hole].sort((x, y) => VALUE[y[0]!]! - VALUE[x[0]!]!) as [Card, Card];
  const ra = a[0]!;
  const rb = b[0]!;
  if (ra === rb) {
    const v = VALUE[ra]!;
    return { made: `Paire de ${PLURAL[ra] ?? NAMES[ra]}`, draws: [], onBoard: false, tier: v >= 10 ? 3 : v >= 7 ? 2 : 1 };
  }
  const suited = a[1] === b[1];
  const hi = VALUE[ra]!;
  const lo = VALUE[rb]!;
  const tier = hi === 14 && lo >= 12 ? 3 : (hi >= 13 && lo >= 10) || (suited && hi - lo <= 2 && lo >= 9) ? 2 : hi >= 12 || suited ? 1 : 0;
  return { made: `${NAMES[ra]}-${NAMES[rb]} ${suited ? 'assortis' : 'dépareillés'}`, draws: [], onBoard: false, tier };
}

function draws(hole: Card[], board: Card[], cat: HandCategory): string[] {
  if (board.length >= 5) return [];
  const out: string[] = [];
  const all = [...hole, ...board];
  if (cat < HandCategory.Flush) {
    const bySuit = new Map<string, number>();
    for (const c of all) bySuit.set(c[1]!, (bySuit.get(c[1]!) ?? 0) + 1);
    for (const [suit, n] of bySuit) if (n === 4 && hole.some((c) => c[1] === suit)) out.push('tirage couleur');
  }
  if (cat < HandCategory.Straight) {
    const ranks = new Set(all.map((c) => VALUE[c[0]!]!));
    if (ranks.has(14)) ranks.add(1);
    const holeRanks = new Set(hole.flatMap((c) => (c[0] === 'A' ? [14, 1] : [VALUE[c[0]!]!])));
    // Rangs qui complètent une quinte en utilisant au moins une de nos cartes
    const outs = new Set<number>();
    for (let r = 1; r <= 14; r++) {
      if (ranks.has(r)) continue;
      for (let lo = Math.max(1, r - 4); lo <= Math.min(10, r); lo++) {
        let ok = true;
        let usesHole = false;
        for (let x = lo; x < lo + 5; x++) {
          if (x === r) continue;
          if (!ranks.has(x)) { ok = false; break; }
          if (holeRanks.has(x)) usesHole = true;
        }
        if (ok && usesHole) { outs.add(r === 1 ? 14 : r); break; }
      }
    }
    if (outs.size >= 2) out.push('tirage quinte');
    else if (outs.size === 1) out.push('quinte ventrale');
  }
  return out;
}

export function describeHand(hole: readonly (Card | null)[], board: readonly Card[]): HandHint | null {
  if (hole.length !== 2 || hole.some((c) => !c)) return null;
  const h = hole as Card[];
  if (board.length < 3) return preflop(h);
  let best;
  try {
    best = evaluateBest([...h, ...board]);
  } catch {
    return null;
  }
  const core = best.cards.slice(0, coreSize(best.category));
  const onBoard = !core.some((c) => h.includes(c));
  const cat = best.category;
  if (cat === HandCategory.HighCard && onBoard) {
    // Aucune combinaison et la carte haute est sur le board : rien à signaler
    return { made: 'Rien pour l’instant', draws: draws(h, [...board], cat), onBoard: false, tier: 0 };
  }
  const tier: HandHint['tier'] = onBoard ? 0
    : cat >= HandCategory.ThreeOfAKind ? 3
    : cat >= HandCategory.TwoPair ? 2
    : cat === HandCategory.OnePair ? 1 : 0;
  return { made: best.description, draws: draws(h, [...board], cat), onBoard, tier };
}
