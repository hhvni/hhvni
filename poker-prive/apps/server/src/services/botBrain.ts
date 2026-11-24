/**
 * « Cerveau » des robots : stratégie inspirée du jeu des réguliers en No-Limit.
 *
 * Préflop
 *  - Mains classées (formule de Chen) puis converties en percentile des 1 326 combinaisons.
 *  - Ouverture selon la position (UTG ~15 %, CO ~30 %, BTN ~45 %, SB ~38 %, heads-up ~80 %).
 *  - Face à une relance : 3-bet polarisé selon la position de l'ouvreur, call en position,
 *    défense élargie de la grosse blind selon le prix.
 *  - Face à un 3-bet / 4-bet : ranges très serrées (QQ+, AK…).
 *  - Tailles standard : open 2,2–3 BB (+1 BB par limper), 3-bet 3× IP / 4× OOP, 4-bet ~2,3×.
 *  - Tapis court (≤ 12 BB) : jeu « tapis ou se coucher ».
 *
 * Postflop
 *  - Équité estimée par Monte-Carlo contre les ranges probables des adversaires
 *    (déduites de leurs actions), comparée aux cotes du pot.
 *  - Continuation bet de l'agresseur préflop, value bets 50–75 %, semi-bluffs
 *    avec tirages, quelques bluffs rivière en heads-up, relances de valeur.
 *  - Garde-fous : pas de guerre de relances, engagement si le pot est déjà engagé.
 *
 * Le robot n'utilise QUE les informations qu'un joueur réel possède.
 */
import { randomInt } from 'node:crypto';
import { fastScore, freshDeck, rankValue, suitOf, type Card, type HandState, type LegalActions } from '@poker/engine';

// ─────────────────────────── Classement préflop ───────────────────────────

const RANKS = 'AKQJT98765432';

function chen(hi: number, lo: number, suited: boolean): number {
  const pts = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  if (hi === lo) return Math.max(5, pts(hi) * 2);
  let s = pts(hi);
  if (suited) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return s;
}

/** Percentile (0 = meilleure main, 1 = pire) de chacune des 169 mains. */
const PERCENTILE = (() => {
  const hands: { key: string; score: number; combos: number }[] = [];
  for (let i = 0; i < 13; i++)
    for (let j = i; j < 13; j++) {
      const hi = 14 - i;
      const lo = 14 - j;
      if (i === j) hands.push({ key: RANKS[i]! + RANKS[j]!, score: chen(hi, lo, false) + hi / 100, combos: 6 });
      else {
        hands.push({ key: `${RANKS[i]}${RANKS[j]}s`, score: chen(hi, lo, true) + hi / 100 + lo / 1000, combos: 4 });
        hands.push({ key: `${RANKS[i]}${RANKS[j]}o`, score: chen(hi, lo, false) + hi / 100 + lo / 1000, combos: 12 });
      }
    }
  hands.sort((a, b) => b.score - a.score);
  const map = new Map<string, number>();
  let acc = 0;
  for (const h of hands) {
    map.set(h.key, (acc + h.combos / 2) / 1326);
    acc += h.combos;
  }
  return map;
})();

export function handKey(hole: Card[]): string {
  const [a, b] = [...hole].sort((x, y) => rankValue(y) - rankValue(x)) as [Card, Card];
  const r1 = a[0]!;
  const r2 = b[0]!;
  if (r1 === r2) return r1 + r2;
  return `${r1}${r2}${suitOf(a) === suitOf(b) ? 's' : 'o'}`;
}

export const percentile = (hole: Card[]) => PERCENTILE.get(handKey(hole)) ?? 1;

// ─────────────────────────── Lecture de la main ───────────────────────────

type Pos = 'UTG' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
const OPEN: Record<Pos, number> = { UTG: 0.15, MP: 0.19, HJ: 0.24, CO: 0.3, BTN: 0.45, SB: 0.38, BB: 0.4 };
const LATE = new Set<Pos>(['CO', 'BTN', 'SB']);

function positionOf(h: HandState, playerId: string): Pos {
  const order = [...h.players].sort((a, b) => a.seat - b.seat);
  const n = order.length;
  const btnIdx = order.findIndex((p) => p.seat === h.buttonSeat);
  const me = order.findIndex((p) => p.playerId === playerId);
  if (n === 2) return h.players.find((p) => p.playerId === playerId)!.seat === h.buttonSeat ? 'BTN' : 'BB';
  const dist = (btnIdx - me + n) % n; // 0 = bouton, 1 = CO…
  const afterBtn = (me - btnIdx + n) % n; // 1 = SB, 2 = BB
  if (afterBtn === 1) return 'SB';
  if (afterBtn === 2) return 'BB';
  return dist === 0 ? 'BTN' : dist === 1 ? 'CO' : dist === 2 ? 'HJ' : dist === 3 ? 'MP' : 'UTG';
}

interface Read {
  preflopRaises: number;
  limpers: number;
  lastRaiser: string | null;
  preflopAggressor: string | null;
  streetRaises: number;
  /** Largeur estimée de la range de chaque adversaire (fraction des mains). */
  ranges: Map<string, number>;
}

function readHand(h: HandState, me: string): Read {
  let preflopRaises = 0;
  let limpers = 0;
  let lastRaiser: string | null = null;
  let preflopAggressor: string | null = null;
  let streetRaises = 0;
  const ranges = new Map<string, number>();
  for (const p of h.players) if (p.playerId !== me) ranges.set(p.playerId, 1);
  for (const e of h.events) {
    if (e.type === 'street') streetRaises = 0;
    if (e.type !== 'action') continue;
    const aggressive = e.action === 'bet' || e.action === 'raise' || (e.allIn && e.action !== 'call');
    if (e.street === 'preflop') {
      if (aggressive) {
        preflopRaises++;
        lastRaiser = e.playerId;
        preflopAggressor = e.playerId;
        if (e.playerId !== me) ranges.set(e.playerId, preflopRaises === 1 ? 0.25 : preflopRaises === 2 ? 0.08 : 0.035);
      } else if (e.action === 'call') {
        if (preflopRaises === 0) limpers++;
        if (e.playerId !== me) ranges.set(e.playerId, Math.min(ranges.get(e.playerId) ?? 1, preflopRaises === 0 ? 0.55 : preflopRaises === 1 ? 0.3 : 0.1));
      } else if (e.action === 'check' && e.playerId !== me) {
        ranges.set(e.playerId, Math.min(ranges.get(e.playerId) ?? 1, 0.85));
      }
    } else {
      if (aggressive) {
        streetRaises++;
        if (e.playerId !== me) ranges.set(e.playerId, Math.min(ranges.get(e.playerId) ?? 1, 0.3) * 0.8);
      }
    }
  }
  return { preflopRaises, limpers, lastRaiser, preflopAggressor, streetRaises, ranges };
}

// ─────────────────────────── Équité Monte-Carlo ───────────────────────────

/** Équité (part du pot espérée) contre les adversaires restants, selon leurs ranges. */
export function equity(hole: Card[], board: Card[], opponents: number[], iterations = 240): number {
  if (opponents.length === 0) return 1;
  const used = new Set<string>([...hole, ...board]);
  const deck = freshDeck().filter((c) => !used.has(c));
  let total = 0;
  for (let it = 0; it < iterations; it++) {
    const d = [...deck];
    const take = () => d.splice(randomInt(d.length), 1)[0]!;
    const opp: Card[][] = [];
    for (const width of opponents) {
      let hand: Card[] = [take(), take()];
      // Échantillonnage par rejet dans la range estimée
      for (let tries = 0; tries < 12 && percentile(hand) > width; tries++) {
        d.push(...hand);
        hand = [take(), take()];
      }
      opp.push(hand);
    }
    const full = [...board];
    while (full.length < 5) full.push(take());
    const mine = fastScore([...hole, ...full]);
    let best = 0;
    let ties = 0;
    for (const o of opp) {
      const s = fastScore([...o, ...full]);
      if (s > best) best = s;
    }
    if (mine > best) total += 1;
    else if (mine === best) {
      for (const o of opp) if (fastScore([...o, ...full]) === mine) ties++;
      total += 1 / (ties + 1);
    }
  }
  return total / iterations;
}

/** Présence d'un tirage couleur ou quinte ouverte (pour les semi-bluffs). */
function hasDraw(hole: Card[], board: Card[]): boolean {
  if (board.length >= 5) return false;
  const cards = [...hole, ...board];
  const suits = new Map<string, number>();
  for (const c of cards) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  if ([...suits.entries()].some(([s, n]) => n === 4 && hole.some((c) => suitOf(c) === s))) return true;
  const ranks = new Set(cards.map(rankValue));
  if (ranks.has(14)) ranks.add(1);
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 4; r++) if (ranks.has(r)) n++;
    if (n === 4 && !ranks.has(lo - 1) && !ranks.has(lo + 4)) return true;
  }
  return false;
}

// ─────────────────────────── Décision ───────────────────────────

export interface BotDecision {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount?: number;
  /** Temps de réflexion conseillé (ms). */
  thinkMs: number;
}

const chance = (pct: number) => randomInt(1000) < pct * 10;

export function decide(h: HandState, me: string, l: LegalActions): BotDecision {
  const p = h.players.find((x) => x.playerId === me)!;
  const bb = h.bigBlind;
  const read = readHand(h, me);
  const opponents = h.players.filter((x) => x.playerId !== me && !x.folded);
  const effStack = Math.min(p.stack + p.streetBet, Math.max(...opponents.map((o) => o.stack + o.streetBet)));
  const stackBB = effStack / bb;
  const step = Math.max(1, h.smallBlind);
  const size = (to: number) => {
    const r = Math.round(to / step) * step;
    return Math.max(l.minTo, Math.min(l.maxTo, r));
  };
  const canAggro = l.canBet || l.canRaise;
  const aggro = (to: number): BotDecision => {
    const amount = size(to);
    // Si la relance engagerait déjà 60 % du tapis, autant faire tapis
    if (amount >= l.maxTo * 0.6) return { type: l.canBet ? 'bet' : 'raise', amount: l.maxTo, thinkMs: 0 };
    return { type: l.canBet ? 'bet' : 'raise', amount, thinkMs: 0 };
  };
  const passive = (): BotDecision => ({ type: l.canCheck ? 'check' : 'fold', thinkMs: 0 });
  const call = (): BotDecision => ({ type: l.canCheck ? 'check' : 'call', thinkMs: 0 });
  const potOdds = l.callAmount / Math.max(1, l.pot + l.callAmount);

  let d: BotDecision;
  if (h.street === 'preflop') d = preflop();
  else d = postflop();
  if ((d.type === 'bet' || d.type === 'raise') && !canAggro) d = call();

  // Temps de réflexion : plus long sur les grosses décisions
  const big = l.callAmount > l.pot * 0.5 || d.type === 'raise' || (d.amount ?? 0) >= l.maxTo;
  const base = d.type === 'check' ? 900 : d.type === 'fold' && l.callAmount <= bb ? 1100 : 1700;
  d.thinkMs = base + randomInt(1600) + (big ? 1500 + randomInt(2000) : 0) + (h.street === 'river' ? 600 : 0);
  return d;

  function preflop(): BotDecision {
    const pos = positionOf(h, me);
    const pct = percentile(p.hole);
    const nPlayers = h.players.length;
    const headsUp = nPlayers === 2;
    // Moins de joueurs = ranges plus larges
    const widen = headsUp ? 1.8 : nPlayers <= 4 ? 1.3 : nPlayers <= 6 ? 1.1 : 1;
    const openPct = Math.min(0.85, OPEN[pos] * widen);

    // Tapis court : tapis ou se coucher
    if (stackBB <= 12) {
      if (read.preflopRaises === 0) {
        const push = Math.min(0.75, openPct * 1.5 * (12 / Math.max(3, stackBB)) * 0.6);
        if (pct <= push) return { type: l.canBet ? 'bet' : 'raise', amount: l.maxTo, thinkMs: 0 };
        return passive();
      }
      const price = l.callAmount / Math.max(1, l.pot + l.callAmount);
      const callWidth = price < 0.3 ? 0.25 : 0.12;
      if (pct <= 0.05) return { type: 'raise', amount: l.maxTo, thinkMs: 0 };
      return pct <= callWidth ? call() : passive();
    }

    if (read.preflopRaises === 0) {
      // Personne n'a relancé : ouverture (iso-relance s'il y a des limpers)
      if (pos === 'BB' && l.canCheck) {
        return pct <= 0.12 ? aggro(bb * (3 + read.limpers)) : call();
      }
      const width = read.limpers > 0 ? openPct * 0.7 : openPct;
      if (pct <= width) {
        const open = pos === 'BTN' ? 2.2 : pos === 'SB' ? 3 : 2.5;
        return aggro(bb * (open + read.limpers));
      }
      // Limp derrière avec petites paires / connecteurs assortis en position, à bas prix
      if (read.limpers > 0 && pct <= width * 1.5 && LATE.has(pos)) return call();
      return passive();
    }

    const raiser = read.lastRaiser ? h.players.find((x) => x.playerId === read.lastRaiser) : null;
    const raiserPos = raiser ? positionOf(h, raiser.playerId) : 'UTG';
    const inPosition = pos === 'BTN' || (pos === 'CO' && raiserPos !== 'BTN');

    if (read.preflopRaises === 1) {
      // Face à une ouverture : 3-bet / call / fold
      const vsLate = LATE.has(raiserPos);
      let threeBet = vsLate ? 0.1 : raiserPos === 'UTG' ? 0.04 : 0.065;
      if (pos === 'BB' && raiserPos === 'SB') threeBet = 0.14;
      let callW = threeBet + (inPosition ? (vsLate ? 0.14 : 0.08) : 0.04);
      if (pos === 'BB') callW = threeBet + (l.callAmount <= 2.5 * bb ? (vsLate ? 0.3 : 0.18) : 0.1);
      if (headsUp) {
        threeBet *= 1.6;
        callW *= 1.6;
      }
      if (pct <= threeBet || (pct <= threeBet * 1.6 && chance(12))) {
        return aggro(l.currentBet * (inPosition ? 3 : 4));
      }
      return pct <= callW ? call() : passive();
    }

    if (read.preflopRaises === 2) {
      // Face à un 3-bet
      if (pct <= 0.025) return aggro(l.currentBet * 2.3);
      if (pct <= 0.06 && stackBB > 40) return call();
      if (pct <= 0.04) return call();
      return passive();
    }
    // Face à un 4-bet ou plus : seulement le haut du haut
    if (pct <= 0.012) return { type: 'raise', amount: l.maxTo, thinkMs: 0 };
    if (pct <= 0.02) return call();
    return passive();
  }

  function postflop(): BotDecision {
    const widths = opponents.map((o) => read.ranges.get(o.playerId) ?? 1);
    let eq = equity(p.hole, h.board, widths);
    const multiway = opponents.length;
    const draw = hasDraw(p.hole, h.board);
    const isAggressor = read.preflopAggressor === me;
    const river = h.street === 'river';
    // L'équité brute surestime la réalisation, surtout en multiway
    eq *= multiway >= 3 ? 0.88 : multiway === 2 ? 0.93 : 0.97;

    if (l.canCheck) {
      // Personne n'a misé
      if (eq > 0.68) return aggro(l.pot * (river ? 0.75 : 0.6));
      if (eq > 0.55 && chance(65)) return aggro(l.pot * 0.5);
      if (isAggressor && h.street === 'flop' && multiway === 1 && chance(eq > 0.35 ? 70 : 45)) return aggro(l.pot * 0.33);
      if (draw && !river && multiway <= 2 && chance(40)) return aggro(l.pot * 0.55);
      if (river && multiway === 1 && eq < 0.15 && chance(12)) return aggro(l.pot * 0.6);
      return passive();
    }

    // Face à une mise
    const facing = l.callAmount;
    const committed = (p.totalBet + facing) / (p.totalBet + p.stack) > 0.5;
    if (read.streetRaises >= 2) {
      // Guerre de relances : seulement les monstres continuent
      if (eq > 0.85) return committed || facing > p.stack * 0.5 ? { type: 'raise', amount: l.maxTo, thinkMs: 0 } : call();
      return eq > potOdds + 0.12 ? call() : passive();
    }
    if (eq > 0.82 && canAggro && chance(70)) return aggro(l.currentBet * 3 + (l.pot - l.currentBet) * 0.2);
    if (draw && !river && multiway === 1 && eq > 0.3 && canAggro && chance(10)) return aggro(l.currentBet * 3);
    const margin = multiway >= 2 ? 0.06 : 0.03;
    if (eq >= potOdds + margin) return call();
    if (committed && eq > potOdds) return call();
    return passive();
  }
}
