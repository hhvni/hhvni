/**
 * Moteur de table de Texas Hold'em No-Limit.
 *
 * Le moteur est une machine à états synchrone, sans dépendance réseau ni UI :
 * le serveur l'alimente avec des actions validées et diffuse les événements
 * produits. Toute action est contrôlée ici : le client ne décide de rien.
 *
 * Règles implémentées (TDA / règles usuelles des salles) :
 *  - bouton tournant, SB/BB, cas particulier du heads-up (bouton = SB, parle
 *    en premier préflop et en dernier après le flop) ;
 *  - ante facultative (« dead money », hors mise du tour) ;
 *  - blinds incomplètes (joueur à court) : le montant à suivre reste la BB ;
 *  - relance minimale = taille de la dernière relance complète ;
 *  - all-in inférieur à une relance complète : ne rouvre pas les enchères
 *    pour les joueurs ayant déjà parlé (règle cumulative TDA appliquée) ;
 *  - restitution des mises non suivies ;
 *  - pots secondaires, partages et jetons indivisibles ;
 *  - déroulé automatique du board quand plus personne ne peut miser.
 */
import { type Card, Deck, type RandomInt, secureRandomInt } from './cards.js';
import { evaluateBest, type EvaluatedHand } from './evaluator.js';
import { buildPots, distributePots, type Pot, type PotAward } from './pots.js';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  maxSeats: number;
}

export interface PlayerAction {
  type: ActionType;
  /** Pour bet/raise : montant TOTAL de la mise du joueur sur ce tour (« raise to »). */
  amount?: number;
}

export interface SeatInfo {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
  sittingOut: boolean;
}

export interface HandPlayer {
  playerId: string;
  seat: number;
  name: string;
  startStack: number;
  stack: number;
  hole: Card[];
  streetBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  /** Montant à suivre au moment où le joueur a parlé pour la dernière fois. */
  actedLevel: number;
  /** Cartes révélées publiquement (showdown ou all-in). */
  shown: boolean;
}

export type HandEvent =
  | { type: 'handStart'; handNumber: number; buttonSeat: number; sbSeat: number; bbSeat: number; smallBlind: number; bigBlind: number; ante: number; players: { playerId: string; name: string; seat: number; stack: number }[] }
  | { type: 'ante'; playerId: string; amount: number; allIn: boolean }
  | { type: 'blind'; playerId: string; kind: 'sb' | 'bb'; amount: number; allIn: boolean }
  | { type: 'holeCards'; count: number }
  | { type: 'action'; street: Street; playerId: string; action: ActionType; amount: number; to: number; allIn: boolean }
  | { type: 'street'; street: Street; cards: Card[]; board: Card[] }
  | { type: 'uncalled'; playerId: string; amount: number }
  | { type: 'reveal'; hands: { playerId: string; hole: Card[] }[] }
  | { type: 'showdown'; hands: { playerId: string; hole: Card[]; description: string; category: number; best: Card[] }[] }
  | { type: 'potAwarded'; potIndex: number; amount: number; winners: string[]; shares: Record<string, number>; description: string | null; showdown: boolean }
  | { type: 'handEnd'; stacks: Record<string, number> };

export interface HandState {
  handNumber: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  street: Street;
  board: Card[];
  deck: Card[];
  players: HandPlayer[];
  currentBet: number;
  lastFullRaise: number;
  toActSeat: number | null;
  finished: boolean;
  events: HandEvent[];
  awards: PotAward[];
  startedAt: number;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Montant total minimum (« to ») pour bet/raise. */
  minTo: number;
  /** Montant total maximum (« to ») = all-in. */
  maxTo: number;
  stack: number;
  streetBet: number;
  currentBet: number;
  pot: number;
}

export class PokerError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PokerError';
  }
}

export interface TableSnapshot {
  config: TableConfig;
  seats: (SeatInfo | null)[];
  buttonSeat: number;
  handNumber: number;
  hand: HandState | null;
}

export class PokerTable {
  config: TableConfig;
  seats: (SeatInfo | null)[];
  buttonSeat = -1;
  handNumber = 0;
  hand: HandState | null = null;

  constructor(config: TableConfig) {
    validateConfig(config);
    this.config = { ...config };
    this.seats = Array.from({ length: config.maxSeats }, () => null);
  }

  // ───────────────────────────── Sièges ─────────────────────────────

  sit(seat: number, playerId: string, name: string, stack: number): void {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.config.maxSeats) throw new PokerError('BAD_SEAT', 'Siège invalide');
    if (this.seats[seat]) throw new PokerError('SEAT_TAKEN', 'Siège occupé');
    if (this.seatOf(playerId) !== -1) throw new PokerError('ALREADY_SEATED', 'Joueur déjà assis');
    if (!Number.isInteger(stack) || stack < 0) throw new PokerError('BAD_STACK', 'Tapis invalide');
    this.seats[seat] = { seat, playerId, name, stack, sittingOut: false };
  }

  /** Retire un joueur. Interdit pendant une main où il est encore engagé. */
  stand(playerId: string): number {
    const s = this.seatOf(playerId);
    if (s === -1) throw new PokerError('NOT_SEATED', 'Joueur non assis');
    if (this.isInLiveHand(playerId)) throw new PokerError('IN_HAND', 'Impossible de quitter pendant une main en cours');
    const stack = this.seats[s]!.stack;
    this.seats[s] = null;
    return stack;
  }

  setSittingOut(playerId: string, value: boolean): void {
    const s = this.seatOf(playerId);
    if (s === -1) throw new PokerError('NOT_SEATED', 'Joueur non assis');
    this.seats[s]!.sittingOut = value;
  }

  addChips(playerId: string, amount: number): void {
    const s = this.seatOf(playerId);
    if (s === -1) throw new PokerError('NOT_SEATED', 'Joueur non assis');
    if (this.isInLiveHand(playerId)) throw new PokerError('IN_HAND', 'Recharge possible uniquement entre deux mains');
    if (!Number.isInteger(amount) || amount <= 0) throw new PokerError('BAD_AMOUNT', 'Montant invalide');
    this.seats[s]!.stack += amount;
  }

  setBlinds(smallBlind: number, bigBlind: number, ante: number): void {
    validateConfig({ ...this.config, smallBlind, bigBlind, ante });
    this.config = { ...this.config, smallBlind, bigBlind, ante };
  }

  seatOf(playerId: string): number {
    return this.seats.findIndex((s) => s?.playerId === playerId);
  }

  isInLiveHand(playerId: string): boolean {
    if (!this.hand || this.hand.finished) return false;
    const p = this.hand.players.find((x) => x.playerId === playerId);
    return !!p && !p.folded;
  }

  /** Joueurs pouvant recevoir des cartes à la prochaine main. */
  eligibleSeats(): number[] {
    return this.seats.filter((s): s is SeatInfo => !!s && s.stack > 0 && !s.sittingOut).map((s) => s.seat);
  }

  canStartHand(): boolean {
    return (!this.hand || this.hand.finished) && this.eligibleSeats().length >= 2;
  }

  // ───────────────────────────── Main ─────────────────────────────

  /**
   * Démarre une nouvelle main.
   * @param rand source d'aléa cryptographique (injectée par le serveur)
   * @param presetDeck uniquement pour les tests : ordre exact des cartes
   */
  startHand(rand: RandomInt = secureRandomInt, presetDeck?: Card[]): HandState {
    if (this.hand && !this.hand.finished) throw new PokerError('HAND_IN_PROGRESS', 'Une main est déjà en cours');
    const eligible = this.eligibleSeats();
    if (eligible.length < 2) throw new PokerError('NOT_ENOUGH_PLAYERS', 'Il faut au moins deux joueurs');

    const { smallBlind, bigBlind, ante } = this.config;
    this.buttonSeat = this.nextFrom(this.buttonSeat, eligible);
    const headsUp = eligible.length === 2;
    const sbSeat = headsUp ? this.buttonSeat : this.nextFrom(this.buttonSeat, eligible);
    const bbSeat = this.nextFrom(sbSeat, eligible);
    this.handNumber += 1;

    const deck = new Deck(rand, presetDeck);
    const players: HandPlayer[] = eligible.map((seat) => {
      const s = this.seats[seat]!;
      return {
        playerId: s.playerId, seat, name: s.name, startStack: s.stack, stack: s.stack, hole: [],
        streetBet: 0, totalBet: 0, folded: false, allIn: false, hasActed: false, actedLevel: 0, shown: false,
      };
    });

    const hand: HandState = {
      handNumber: this.handNumber, buttonSeat: this.buttonSeat, sbSeat, bbSeat,
      smallBlind, bigBlind, ante, street: 'preflop', board: [], deck: [], players,
      currentBet: 0, lastFullRaise: bigBlind, toActSeat: null, finished: false, events: [], awards: [],
      startedAt: Date.now(),
    };
    this.hand = hand;
    hand.events.push({
      type: 'handStart', handNumber: hand.handNumber, buttonSeat: this.buttonSeat, sbSeat, bbSeat,
      smallBlind, bigBlind, ante,
      players: players.map((p) => ({ playerId: p.playerId, name: p.name, seat: p.seat, stack: p.stack })),
    });

    // Antes (argent mort, ne compte pas dans la mise du tour)
    if (ante > 0) {
      for (const p of this.orderFrom(this.buttonSeat)) {
        const amt = Math.min(ante, p.stack);
        p.stack -= amt;
        p.totalBet += amt;
        if (p.stack === 0) p.allIn = true;
        hand.events.push({ type: 'ante', playerId: p.playerId, amount: amt, allIn: p.allIn });
      }
    }
    // Blinds
    this.postBlind(this.playerAt(sbSeat)!, smallBlind, 'sb');
    this.postBlind(this.playerAt(bbSeat)!, bigBlind, 'bb');
    hand.currentBet = bigBlind;
    hand.lastFullRaise = bigBlind;

    // Distribution : une carte à la fois, en commençant à gauche du bouton
    const dealOrder = this.orderFrom(this.buttonSeat);
    for (let round = 0; round < 2; round++) for (const p of dealOrder) p.hole.push(deck.draw());
    hand.events.push({ type: 'holeCards', count: 2 });
    hand.deck = drain(deck);

    // Premier à parler : après la BB (en heads-up : le bouton/SB)
    hand.toActSeat = this.firstToActAfter(bbSeat);
    this.progress();
    return hand;
  }

  private postBlind(p: HandPlayer, amount: number, kind: 'sb' | 'bb'): void {
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    p.streetBet += amt;
    p.totalBet += amt;
    if (p.stack === 0) p.allIn = true;
    this.hand!.events.push({ type: 'blind', playerId: p.playerId, kind, amount: amt, allIn: p.allIn });
  }

  /** Actions légales pour un joueur (null si ce n'est pas son tour). */
  legalActions(playerId: string): LegalActions | null {
    const h = this.hand;
    if (!h || h.finished || h.toActSeat === null) return null;
    const p = this.playerAt(h.toActSeat);
    if (!p || p.playerId !== playerId) return null;
    const toCall = Math.max(0, h.currentBet - p.streetBet);
    const maxTo = p.streetBet + p.stack;
    const othersCanAct = h.players.some((o) => o !== p && !o.folded && !o.allIn);
    const reopened = !p.hasActed || h.currentBet - p.actedLevel >= h.lastFullRaise;
    const canAggress = othersCanAct && p.stack > toCall;
    const canBet = h.currentBet === 0 && canAggress;
    const canRaise = h.currentBet > 0 && canAggress && reopened;
    const minFull = h.currentBet === 0 ? h.bigBlind : h.currentBet + h.lastFullRaise;
    return {
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      callAmount: Math.min(toCall, p.stack),
      canBet,
      canRaise,
      minTo: Math.min(minFull, maxTo),
      maxTo,
      stack: p.stack,
      streetBet: p.streetBet,
      currentBet: h.currentBet,
      pot: totalPot(h),
    };
  }

  /** Applique une action. Lève PokerError si elle est illégale. */
  act(playerId: string, action: PlayerAction): HandEvent[] {
    const h = this.hand;
    if (!h || h.finished) throw new PokerError('NO_HAND', 'Aucune main en cours');
    const legal = this.legalActions(playerId);
    if (!legal) throw new PokerError('NOT_YOUR_TURN', "Ce n'est pas votre tour");
    const p = this.playerAt(h.toActSeat!)!;
    const before = h.events.length;

    let type = action.type;
    let to = action.amount;
    if (type === 'allin') {
      to = legal.maxTo;
      if (to <= h.currentBet || (h.currentBet > 0 && !legal.canRaise) || (h.currentBet === 0 && !legal.canBet)) {
        type = legal.canCall ? 'call' : 'check';
      } else {
        type = h.currentBet === 0 ? 'bet' : 'raise';
      }
    }

    switch (type) {
      case 'fold':
        p.folded = true;
        this.record(p, 'fold', 0);
        break;
      case 'check':
        if (!legal.canCheck) throw new PokerError('CANNOT_CHECK', 'Impossible de checker : une mise doit être suivie');
        this.record(p, 'check', 0);
        break;
      case 'call': {
        if (!legal.canCall) throw new PokerError('CANNOT_CALL', 'Rien à suivre');
        const amt = legal.callAmount;
        this.commit(p, amt);
        this.record(p, 'call', amt);
        break;
      }
      case 'bet':
      case 'raise': {
        if (type === 'bet' && !legal.canBet) throw new PokerError('CANNOT_BET', 'Mise impossible');
        if (type === 'raise' && !legal.canRaise) throw new PokerError('CANNOT_RAISE', 'Relance impossible');
        if (to === undefined || !Number.isInteger(to)) throw new PokerError('BAD_AMOUNT', 'Montant invalide');
        if (to > legal.maxTo) throw new PokerError('OVER_STACK', 'Montant supérieur à votre tapis');
        if (to < legal.minTo) throw new PokerError('UNDER_MIN', `Montant minimum : ${legal.minTo}`);
        if (to <= h.currentBet) throw new PokerError('UNDER_MIN', `Montant minimum : ${legal.minTo}`);
        const add = to - p.streetBet;
        const raiseSize = to - h.currentBet;
        this.commit(p, add);
        if (raiseSize >= h.lastFullRaise) h.lastFullRaise = raiseSize; // relance complète
        h.currentBet = to;
        this.record(p, type, add);
        break;
      }
      default:
        throw new PokerError('BAD_ACTION', 'Action inconnue');
    }
    p.hasActed = true;
    p.actedLevel = h.currentBet;
    this.advanceTurn(p.seat);
    this.progress();
    return h.events.slice(before);
  }

  /** Action automatique en cas de temps écoulé : check si possible, sinon fold. */
  timeoutAction(playerId: string): HandEvent[] {
    const legal = this.legalActions(playerId);
    if (!legal) throw new PokerError('NOT_YOUR_TURN', "Ce n'est pas votre tour");
    return this.act(playerId, { type: legal.canCheck ? 'check' : 'fold' });
  }

  currentPlayerId(): string | null {
    const h = this.hand;
    if (!h || h.finished || h.toActSeat === null) return null;
    return this.playerAt(h.toActSeat)?.playerId ?? null;
  }

  // ───────────────────────────── Internes ─────────────────────────────

  private commit(p: HandPlayer, amount: number): void {
    if (amount > p.stack) throw new PokerError('OVER_STACK', 'Montant supérieur au tapis');
    p.stack -= amount;
    p.streetBet += amount;
    p.totalBet += amount;
    if (p.stack === 0) p.allIn = true;
  }

  private record(p: HandPlayer, action: ActionType, amount: number): void {
    const h = this.hand!;
    h.events.push({ type: 'action', street: h.street, playerId: p.playerId, action, amount, to: p.streetBet, allIn: p.allIn });
  }

  private playerAt(seat: number): HandPlayer | undefined {
    return this.hand?.players.find((p) => p.seat === seat);
  }

  /** Joueurs de la main dans l'ordre horaire à partir du siège suivant `seat`. */
  private orderFrom(seat: number): HandPlayer[] {
    const ps = [...this.hand!.players].sort((a, b) => a.seat - b.seat);
    const idx = ps.findIndex((p) => p.seat > seat);
    return idx === -1 ? ps : [...ps.slice(idx), ...ps.slice(0, idx)];
  }

  private nextFrom(seat: number, seats: number[]): number {
    const sorted = [...seats].sort((a, b) => a - b);
    return sorted.find((s) => s > seat) ?? sorted[0]!;
  }

  private canAct(p: HandPlayer): boolean {
    return !p.folded && !p.allIn;
  }

  private needsToAct(p: HandPlayer): boolean {
    return this.canAct(p) && (!p.hasActed || p.streetBet < this.hand!.currentBet);
  }

  private firstToActAfter(seat: number): number | null {
    const next = this.orderFrom(seat).find((p) => this.needsToAct(p));
    return next ? next.seat : null;
  }

  private advanceTurn(fromSeat: number): void {
    this.hand!.toActSeat = this.firstToActAfter(fromSeat);
  }

  private liveCount(): number {
    return this.hand!.players.filter((p) => !p.folded).length;
  }

  private isRoundComplete(): boolean {
    const h = this.hand!;
    const actors = h.players.filter((p) => this.canAct(p));
    if (actors.length === 0) return true;
    const maxBet = Math.max(...h.players.map((p) => p.streetBet));
    if (actors.length === 1 && actors[0]!.streetBet >= maxBet) return true;
    return actors.every((p) => p.hasActed && p.streetBet === h.currentBet);
  }

  /** Fait avancer la main tant qu'aucune décision humaine n'est requise. */
  private progress(): void {
    const h = this.hand!;
    for (;;) {
      if (h.finished) return;
      if (this.liveCount() === 1) {
        this.returnUncalled();
        this.awardUncontested();
        return;
      }
      if (!this.isRoundComplete()) {
        if (h.toActSeat === null || !this.needsToAct(this.playerAt(h.toActSeat)!)) {
          h.toActSeat = this.firstToActAfter(h.toActSeat ?? h.buttonSeat);
        }
        if (h.toActSeat !== null) return;
      }
      // Fin du tour d'enchères
      this.returnUncalled();
      for (const p of h.players) {
        p.streetBet = 0;
        p.hasActed = false;
        p.actedLevel = 0;
      }
      h.currentBet = 0;
      h.lastFullRaise = h.bigBlind;
      h.toActSeat = null;

      const actors = h.players.filter((p) => this.canAct(p));
      if (actors.length <= 1 && h.street !== 'river') this.revealAllIn();

      if (h.street === 'river') {
        this.showdown();
        return;
      }
      this.dealNextStreet();
      if (actors.length >= 2) h.toActSeat = this.firstToActAfter(h.buttonSeat);
    }
  }

  private revealAllIn(): void {
    const h = this.hand!;
    const toShow = h.players.filter((p) => !p.folded && !p.shown);
    if (toShow.length === 0) return;
    for (const p of toShow) p.shown = true;
    h.events.push({ type: 'reveal', hands: toShow.map((p) => ({ playerId: p.playerId, hole: [...p.hole] })) });
  }

  private dealNextStreet(): void {
    const h = this.hand!;
    const draw = () => {
      const c = h.deck.shift();
      if (!c) throw new Error('Jeu épuisé');
      return c;
    };
    draw(); // carte brûlée
    let cards: Card[];
    if (h.street === 'preflop') {
      cards = [draw(), draw(), draw()];
      h.street = 'flop';
    } else if (h.street === 'flop') {
      cards = [draw()];
      h.street = 'turn';
    } else {
      cards = [draw()];
      h.street = 'river';
    }
    h.board.push(...cards);
    h.events.push({ type: 'street', street: h.street, cards, board: [...h.board] });
  }

  /** Rend la part d'une mise que personne n'a suivie. */
  private returnUncalled(): void {
    const h = this.hand!;
    const sorted = [...h.players].sort((a, b) => b.streetBet - a.streetBet);
    const top = sorted[0];
    const second = sorted[1];
    if (!top || top.streetBet === 0) return;
    const diff = top.streetBet - (second?.streetBet ?? 0);
    if (diff > 0) {
      top.streetBet -= diff;
      top.totalBet -= diff;
      top.stack += diff;
      if (top.stack > 0) top.allIn = false;
      h.events.push({ type: 'uncalled', playerId: top.playerId, amount: diff });
    }
  }

  private awardUncontested(): void {
    const h = this.hand!;
    const winner = h.players.find((p) => !p.folded)!;
    const amount = h.players.reduce((s, p) => s + p.totalBet, 0);
    winner.stack += amount;
    const award: PotAward = { potIndex: 0, amount, winners: [winner.playerId], shares: { [winner.playerId]: amount } };
    h.awards = [award];
    h.events.push({ type: 'potAwarded', potIndex: 0, amount, winners: [winner.playerId], shares: award.shares, description: null, showdown: false });
    this.finish();
  }

  private showdown(): void {
    const h = this.hand!;
    h.street = 'showdown';
    const live = h.players.filter((p) => !p.folded);
    const evals = new Map<string, EvaluatedHand>();
    for (const p of live) {
      evals.set(p.playerId, evaluateBest([...p.hole, ...h.board]));
      p.shown = true;
    }
    // Ordre de dévoilement : dernier agresseur d'abord serait possible ; ici on
    // montre toutes les mains restantes en partant de la gauche du bouton.
    const order = this.orderFrom(h.buttonSeat);
    h.events.push({
      type: 'showdown',
      hands: order.filter((p) => !p.folded).map((p) => {
        const e = evals.get(p.playerId)!;
        return { playerId: p.playerId, hole: [...p.hole], description: e.description, category: e.category, best: e.cards };
      }),
    });
    const pots = buildPots(h.players.map((p) => ({ playerId: p.playerId, amount: p.totalBet, folded: p.folded })));
    const scores: Record<string, number> = {};
    for (const [id, e] of evals) scores[id] = e.score;
    const awards = distributePots(pots, scores, order.map((p) => p.playerId));
    for (const a of awards) {
      for (const [id, amt] of Object.entries(a.shares)) h.players.find((p) => p.playerId === id)!.stack += amt;
      const desc = evals.get(a.winners[0]!)!.description;
      h.events.push({ type: 'potAwarded', potIndex: a.potIndex, amount: a.amount, winners: a.winners, shares: a.shares, description: desc, showdown: true });
    }
    h.awards = awards;
    this.finish();
  }

  private finish(): void {
    const h = this.hand!;
    h.finished = true;
    h.toActSeat = null;
    for (const p of h.players) {
      const s = this.seats[p.seat];
      if (s && s.playerId === p.playerId) s.stack = p.stack;
    }
    const stacks: Record<string, number> = {};
    for (const p of h.players) stacks[p.playerId] = p.stack;
    h.events.push({ type: 'handEnd', stacks });
    // Invariant : conservation des jetons
    const before = h.players.reduce((s, p) => s + p.startStack, 0);
    const after = h.players.reduce((s, p) => s + p.stack, 0);
    if (before !== after) throw new Error(`Invariant violé : ${before} jetons avant, ${after} après`);
  }

  // ───────────────────────────── Vues ─────────────────────────────

  /** Pots actuels (mises des tours précédents) pour l'affichage. */
  currentPots(): Pot[] {
    const h = this.hand;
    if (!h) return [];
    const contribs = h.players.map((p) => ({ playerId: p.playerId, amount: p.totalBet - p.streetBet, folded: p.folded }));
    if (contribs.every((c) => c.amount === 0)) return [];
    if (h.players.every((p) => p.folded || p.totalBet - p.streetBet === 0)) {
      return [{ amount: contribs.reduce((s, c) => s + c.amount, 0), eligible: h.players.filter((p) => !p.folded).map((p) => p.playerId) }];
    }
    return buildPots(contribs);
  }

  snapshot(): TableSnapshot {
    return structuredClone({ config: this.config, seats: this.seats, buttonSeat: this.buttonSeat, handNumber: this.handNumber, hand: this.hand });
  }

  static restore(s: TableSnapshot): PokerTable {
    const t = new PokerTable(s.config);
    const c = structuredClone(s);
    t.seats = c.seats;
    t.buttonSeat = c.buttonSeat;
    t.handNumber = c.handNumber;
    t.hand = c.hand;
    return t;
  }
}

function drain(deck: Deck): Card[] {
  const out: Card[] = [];
  while (deck.remaining > 0) out.push(deck.draw());
  return out;
}

export function totalPot(h: HandState): number {
  return h.players.reduce((s, p) => s + p.totalBet, 0);
}

export function validateConfig(c: TableConfig): void {
  const ints = [c.smallBlind, c.bigBlind, c.ante, c.maxSeats];
  if (!ints.every((n) => Number.isInteger(n) && n >= 0)) throw new PokerError('BAD_CONFIG', 'Paramètres invalides');
  if (c.smallBlind <= 0 || c.bigBlind <= 0) throw new PokerError('BAD_CONFIG', 'Les blinds doivent être positives');
  if (c.smallBlind > c.bigBlind) throw new PokerError('BAD_CONFIG', 'La petite blind doit être ≤ grosse blind');
  if (c.maxSeats < 2 || c.maxSeats > 10) throw new PokerError('BAD_CONFIG', 'Entre 2 et 10 joueurs');
}
