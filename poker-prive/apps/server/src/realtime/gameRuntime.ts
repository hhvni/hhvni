/**
 * GameRuntime : autorité unique et en mémoire d'une table (cash game ou tournoi).
 *
 * - Toutes les mutations passent par des méthodes synchrones de cette classe
 *   (boucle d'événements Node = pas de concurrence intra-table).
 * - Les écritures en base sont sérialisées dans une file par partie.
 * - Les vues envoyées aux navigateurs sont filtrées par joueur (viewFor).
 */
import { randomInt } from 'node:crypto';
import {
  allInEquity, computeHandStats, evaluateBest, PokerError, PokerTable, prizePool, totalPot,
  type ActionType, type Card, type GameConfig, type GameStatus, type GameView, type HandEvent,
  type HandResultView, type LogLine, type PublicSeat, type TableSnapshot, type TournamentView, type TurnInfo,
} from '@poker/engine';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { logger } from '../logger.js';
import { botStyleFor, getBotUser } from '../services/bots.js';
import { BOT_STYLES, decide, type BotDecision } from '../services/botBrain.js';

const FAST = env.FAST_MODE === '1';
const fmt = (n: number) => n.toLocaleString('fr-FR');
const secureRand = (n: number) => randomInt(n);

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface GameBroadcaster {
  /** Envoie la vue personnalisée à chaque spectateur/joueur de la partie. */
  state(rt: GameRuntime): void;
  log(gameId: string, line: LogLine): void;
  toUser(userId: string, event: string, payload: unknown): void;
  /** Nombre de connexions humaines présentes sur la table (joueurs + spectateurs). */
  viewerCount(gameId: string): number;
}

interface PlayerMeta {
  userId: string;
  username: string;
  avatarUrl: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  timeBankMs: number;
  timeouts: number;
  /** Mode automatique (absent) : check/fold immédiat. */
  away: boolean;
  leaveAfterHand: boolean;
  pendingReload: number;
  pendingRebuyUntil: number | null;
  addonUsed: boolean;
  rebuys: number;
  lastAction: string | null;
  kicked: boolean;
  /** Robot de test piloté par le serveur */
  bot?: boolean;
}

interface TournamentState {
  levelIndex: number;
  levelEndsAt: number | null;
  levelRemainingMs: number | null;
  pendingBreak: boolean;
  onBreak: boolean;
  breakEndsAt: number | null;
  entrants: string[];
  results: { userId: string; username: string; place: number; prize: number }[];
  prizes: number[];
}

interface Staging {
  visibleBoard: number;
  /** Cartes visibles du second board (null tant qu'il n'est pas commencé). */
  visible2?: number | null;
  /** River encore face cachée (suspense) sur le board 1 ou 2. */
  suspense?: 1 | 2 | null;
  resultVisible: boolean;
}

interface RuntimeSnapshot {
  table: TableSnapshot;
  meta: PlayerMeta[];
  tournament: TournamentState | null;
  actionSeq: number;
  registered: string[];
  bombRequestedBy?: string | null;
  lastBombHand?: number | null;
  bombMult?: number;
  bombSpin?: { value: number; by: string; at: number } | null;
}

export interface RuntimeInit {
  id: string;
  roomId: string;
  config: GameConfig;
  status: GameStatus;
  createdById: string;
  snapshot: RuntimeSnapshot | null;
}

export class GameRuntime {
  readonly id: string;
  readonly roomId: string;
  config: GameConfig;
  status: GameStatus;
  table: PokerTable;
  meta = new Map<string, PlayerMeta>();
  /** Inscrits (tournoi en attente) */
  registered: string[] = [];
  actionSeq = 0;
  turn: TurnInfo | null = null;
  result: HandResultView | null = null;
  tournament: TournamentState | null = null;
  roomAdmins = new Set<string>();
  bankrolls = new Map<string, number>();
  spectatorCount = 0;

  private staging: Staging = { visibleBoard: 0, resultVisible: true };
  /** Probabilités de gain par longueur de board pendant un tapis. */
  private equityByBoard = new Map<number, { userId: string; win: number; tie: number }[]>();
  /** Vote « run it twice » en cours. */
  /** Straddle général demandé pour la prochaine main (id du joueur). */
  bombRequestedBy: string | null = null;
  /** Numéro de la dernière main jouée en straddle général. */
  lastBombHand: number | null = null;
  /** Montant du straddle général prévu, en grosses blindes (2 ou tiré à la roulette). */
  bombMult = 2;
  /** Roulette en cours / tirée : animée chez tous les joueurs. */
  bombSpin: { value: number; by: string; at: number } | null = null;
  static readonly SPIN_MS = 5200;
  /** Montant (en BB) du straddle général de la main en cours. */
  private currentBombBB: number | null = null;
  private runoutVote: { deadline: number; votes: Map<string, boolean | null>; timer: NodeJS.Timeout; boardBefore: number } | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;
  private stagingTimer: NodeJS.Timeout | null = null;
  private levelTimer: NodeJS.Timeout | null = null;
  private breakTimer: NodeJS.Timeout | null = null;
  private rebuyTimers = new Map<string, NodeJS.Timeout>();
  private snapshotTimer: NodeJS.Timeout | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private logs: LogLine[] = [];
  private logId = 0;
  private turnStartedAt = 0;
  private timeBankStartedAt: number | null = null;
  private disposed = false;

  constructor(init: RuntimeInit, private io: GameBroadcaster) {
    this.id = init.id;
    this.roomId = init.roomId;
    this.config = init.config;
    this.status = init.status;
    if (init.snapshot) {
      this.table = PokerTable.restore(init.snapshot.table);
      this.table.config.enforceBlindRules = init.config.mode === 'CASH';
      this.table.config.straddle = false;
      this.table.config.runItTwice = init.config.mode === 'CASH' && init.config.runItTwice !== false;
      // Après un redémarrage, les humains doivent se reconnecter ; les robots, pilotés par le serveur, restent connectés
      for (const m of init.snapshot.meta) this.meta.set(m.userId, { ...m, connected: !!m.bot, disconnectedAt: m.bot ? null : Date.now() });
      this.tournament = init.snapshot.tournament;
      this.actionSeq = init.snapshot.actionSeq;
      this.registered = init.snapshot.registered ?? [];
      this.bombRequestedBy = init.snapshot.bombRequestedBy ?? null;
      this.lastBombHand = init.snapshot.lastBombHand ?? null;
      this.bombMult = init.snapshot.bombMult ?? 2;
      this.bombSpin = init.snapshot.bombSpin ?? null;
    } else {
      this.table = new PokerTable({
        smallBlind: init.config.smallBlind, bigBlind: init.config.bigBlind, ante: init.config.ante, maxSeats: init.config.maxSeats,
        enforceBlindRules: init.config.mode === 'CASH',
        straddle: false,
        runItTwice: init.config.mode === 'CASH' && init.config.runItTwice !== false,
      });
    }
  }

  // ═══════════════════════════ Cycle de vie ═══════════════════════════

  /** Reprise après redémarrage du serveur. */
  resume(): void {
    const t = this.tournament;
    if (t && this.status === 'RUNNING') {
      if (t.onBreak) this.startBreak(t.levelRemainingMs ?? 60_000);
      else this.armLevelTimer(t.levelRemainingMs ?? this.levelDurationMs());
    }
    for (const m of this.meta.values()) if (m.pendingRebuyUntil) this.armRebuyTimer(m.userId, 20_000);
    if (this.table.hand && !this.table.hand.finished) {
      this.log('Reprise de la main après redémarrage du serveur', 'system');
      this.scheduleTurn();
    } else {
      this.scheduleNextHand(1500);
    }
    this.changed();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [this.turnTimer, this.nextHandTimer, this.stagingTimer, this.levelTimer, this.breakTimer, this.snapshotTimer]) if (t) clearTimeout(t);
    for (const t of this.rebuyTimers.values()) clearTimeout(t);
    if (this.runoutVote) clearTimeout(this.runoutVote.timer);
  }

  /** Attend la fin des écritures en base (tests, arrêt propre). */
  flush(): Promise<unknown> {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
      this.enqueue(() => this.writeSnapshot());
    }
    return this.writeQueue;
  }

  isRoomAdmin(userId: string): boolean {
    return this.roomAdmins.has(userId);
  }

  // ═══════════════════════════ Connexions ═══════════════════════════

  onConnect(userId: string): void {
    const m = this.meta.get(userId);
    if (m && !m.connected) {
      m.connected = true;
      m.disconnectedAt = null;
      if (this.table.seatOf(userId) !== -1) this.log(`${m.username} est reconnecté`, 'system');
      this.changed();
    }
  }

  onDisconnect(userId: string): void {
    const m = this.meta.get(userId);
    if (m && m.connected) {
      m.connected = false;
      m.disconnectedAt = Date.now();
      if (this.table.seatOf(userId) !== -1) this.log(`${m.username} est déconnecté — en attente de reconnexion`, 'system');
      this.changed();
    }
  }

  private ensureMeta(user: { id: string; username: string; avatarUrl: string | null }): PlayerMeta {
    let m = this.meta.get(user.id);
    if (!m) {
      m = {
        userId: user.id, username: user.username, avatarUrl: user.avatarUrl, connected: true, disconnectedAt: null,
        timeBankMs: this.config.timeBankSeconds * 1000, timeouts: 0, away: false, leaveAfterHand: false,
        pendingReload: 0, pendingRebuyUntil: null, addonUsed: false, rebuys: 0, lastAction: null, kicked: false,
      };
      this.meta.set(user.id, m);
    } else {
      m.username = user.username;
      m.avatarUrl = user.avatarUrl;
    }
    return m;
  }

  // ═══════════════════════════ Cash game ═══════════════════════════

  private reservedSeats = new Set<number>();
  private pendingUsers = new Set<string>();

  async sit(user: { id: string; username: string; avatarUrl: string | null }, seat: number, buyIn: number): Promise<void> {
    if (this.config.mode !== 'CASH') throw new GameError('MODE', 'Inscrivez-vous au tournoi pour jouer');
    if (this.status === 'FINISHED') throw new GameError('FINISHED', 'Cette table est fermée');
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.config.maxSeats) throw new GameError('BAD_SEAT', 'Siège invalide');
    if (this.table.seats[seat] || this.reservedSeats.has(seat)) throw new GameError('SEAT_TAKEN', 'Siège déjà occupé');
    if (this.table.seatOf(user.id) !== -1) throw new GameError('ALREADY_SEATED', 'Vous êtes déjà assis');
    if (this.meta.get(user.id)?.kicked) throw new GameError('KICKED', 'Vous avez été exclu de cette table');
    if (!Number.isInteger(buyIn) || buyIn < this.config.minBuyIn || buyIn > this.config.maxBuyIn) {
      throw new GameError('BAD_BUYIN', `Cave entre ${fmt(this.config.minBuyIn)} et ${fmt(this.config.maxBuyIn)}`);
    }
    if (this.pendingUsers.has(user.id)) throw new GameError('BUSY', 'Opération déjà en cours');
    this.reservedSeats.add(seat);
    this.pendingUsers.add(user.id);
    try {
      await debitBankroll(user.id, buyIn);
      await prisma.gamePlayer.upsert({
        where: { gameId_userId: { gameId: this.id, userId: user.id } },
        create: { gameId: this.id, userId: user.id, buyIn, stack: buyIn },
        update: { buyIn: { increment: buyIn }, stack: buyIn, leftAt: null },
      });
    } finally {
      this.reservedSeats.delete(seat);
      this.pendingUsers.delete(user.id);
    }
    const m = this.ensureMeta(user);
    m.leaveAfterHand = false;
    m.away = false;
    m.timeouts = 0;
    this.table.sit(seat, user.id, user.username, buyIn);
    this.log(`${user.username}${this.meta.get(user.id)?.bot ? ` (${BOT_STYLES[botStyleFor(user.username)].emoji} ${BOT_STYLES[botStyleFor(user.username)].label})` : ''} s'assoit avec ${fmt(buyIn)} jetons`, 'system');
    await this.refreshBankroll(user.id);
    this.changed();
    this.maybeStartHand();
  }

  /** Quitte la table (immédiatement entre deux mains, sinon à la fin de la main). */
  async standUp(userId: string): Promise<void> {
    const seat = this.table.seatOf(userId);
    if (seat === -1) throw new GameError('NOT_SEATED', "Vous n'êtes pas assis");
    if (this.config.mode === 'TOURNAMENT') throw new GameError('MODE', 'Impossible de quitter un tournoi en cours : passez en mode absent');
    const m = this.meta.get(userId)!;
    if (this.table.isInLiveHand(userId)) {
      m.leaveAfterHand = true;
      // Si c'est son tour, on se couche immédiatement.
      if (this.table.currentPlayerId() === userId) this.applyAction(userId, 'fold', undefined);
      else this.changed();
      return;
    }
    await this.removeCashPlayer(userId);
  }

  private async removeCashPlayer(userId: string): Promise<void> {
    if (this.table.isInLiveHand(userId)) return;
    const seat = this.table.seatOf(userId);
    if (seat === -1) return;
    const stack = this.table.stand(userId);
    const m = this.meta.get(userId)!;
    m.leaveAfterHand = false;
    m.pendingReload = 0;
    this.log(`${m.username} quitte la table avec ${fmt(stack)} jetons`, 'system');
    this.changed();
    await this.enqueue(async () => {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { chips: { increment: stack } } }),
        prisma.gamePlayer.update({
          where: { gameId_userId: { gameId: this.id, userId } },
          data: { cashOut: { increment: stack }, stack: 0, leftAt: new Date() },
        }),
      ]);
    });
    await this.refreshBankroll(userId);
    this.changed();
  }

  /** Montant de recharge autorisé maintenant (0 si interdit). */
  reloadAmountFor(userId: string): number {
    if (this.config.mode !== 'CASH' || this.config.reloadMode === 'none') return 0;
    const seat = this.table.seatOf(userId);
    if (seat === -1) return 0;
    const m = this.meta.get(userId);
    if (m?.pendingReload) return 0;
    const stack = this.table.seats[seat]!.stack;
    const target = this.config.startingStack;
    if (this.config.reloadMode === 'busted') return stack === 0 ? target : 0;
    return stack < target ? target - stack : 0;
  }

  async reload(userId: string): Promise<void> {
    const amount = this.reloadAmountFor(userId);
    if (amount <= 0) throw new GameError('NO_RELOAD', "Recharge non autorisée par les règles de l'administrateur");
    await debitBankroll(userId, amount);
    await prisma.gamePlayer.update({ where: { gameId_userId: { gameId: this.id, userId } }, data: { buyIn: { increment: amount } } });
    const m = this.meta.get(userId)!;
    if (this.table.isInLiveHand(userId) || (this.table.hand && !this.table.hand.finished && this.table.hand.players.some((p) => p.playerId === userId))) {
      m.pendingReload += amount;
      this.log(`${m.username} recharge ${fmt(amount)} jetons (à la fin de la main)`, 'system');
    } else {
      this.table.addChips(userId, amount);
      if (m.away && m.connected) {
        m.away = false;
        m.timeouts = 0;
        this.table.setSittingOut(userId, false);
      }
      this.log(`${m.username} recharge ${fmt(amount)} jetons`, 'system');
    }
    await this.refreshBankroll(userId);
    this.changed();
    this.maybeStartHand();
  }

  private async botReload(userId: string): Promise<void> {
    try {
      await prisma.user.updateMany({ where: { id: userId, chips: { lt: 1_000_000 } }, data: { chips: 1_000_000 } });
      await this.reload(userId);
    } catch {
      await this.removeCashPlayer(userId);
    }
  }

  // ─── Run it twice ───

  private startRunoutVote(boardBefore: number): void {
    const h = this.table.hand!;
    this.turn = null;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const votes = new Map<string, boolean | null>();
    for (const p of h.players.filter((x) => !x.folded)) {
      const m = this.meta.get(p.playerId);
      // Robots : acceptent toujours. Absents / déconnectés : refusent.
      votes.set(p.playerId, m?.bot ? true : !m || m.away || !m.connected ? false : null);
    }
    const ms = FAST ? 30 : 10_000;
    this.runoutVote = { deadline: Date.now() + ms, votes, boardBefore, timer: setTimeout(() => this.finishRunoutVote(), ms) };
    this.log('Tapis ! Jouer le board deux fois ? (tous les joueurs doivent accepter)', 'system');
    this.checkRunoutVote();
  }

  voteRunout(userId: string, accept: boolean): void {
    const v = this.runoutVote;
    if (!v || !v.votes.has(userId)) throw new GameError('NO_VOTE', 'Aucun vote en cours pour vous');
    if (v.votes.get(userId) !== null) throw new GameError('ALREADY', 'Vous avez déjà répondu');
    v.votes.set(userId, accept);
    this.log(`${this.meta.get(userId)?.username ?? '?'} ${accept ? 'accepte' : 'refuse'} de jouer deux fois`, 'system');
    this.checkRunoutVote();
    this.changed();
  }

  private checkRunoutVote(): void {
    const v = this.runoutVote;
    if (!v) return;
    const values = [...v.votes.values()];
    if (values.includes(false) || values.every((x) => x === true)) this.finishRunoutVote();
  }

  private finishRunoutVote(): void {
    const v = this.runoutVote;
    if (!v || this.disposed) return;
    clearTimeout(v.timer);
    this.runoutVote = null;
    const twice = [...v.votes.values()].every((x) => x === true);
    const events = this.table.resolveRunout(twice ? 2 : 1);
    this.log(twice ? 'Le board sera joué deux fois' : 'Le board sera joué une fois', 'system');
    this.handleEvents(events);
    const streets = this.table.hand!.events.filter((e) => e.type === 'street').length - (v.boardBefore === 0 ? 0 : v.boardBefore === 3 ? 1 : v.boardBefore === 4 ? 2 : 3);
    this.onHandFinished(v.boardBefore, Math.max(1, streets));
    this.changed();
  }

  private runoutEquity(): { userId: string; win: number; tie: number }[] | null {
    const h = this.table.hand;
    if (!h) return null;
    const live = h.players.filter((p) => !p.folded && p.shown);
    if (live.length < 2) return null;
    const key = 1000 + h.board.length;
    if (!this.equityByBoard.has(key)) {
      const eq = allInEquity(live.map((p) => p.hole), h.board);
      this.equityByBoard.set(key, live.map((p, i) => ({ userId: p.playerId, win: eq[i]!.win, tie: eq[i]!.tie })));
    }
    return this.equityByBoard.get(key)!;
  }

  // ─── Straddle général (bomb pot) ───

  private static readonly BOMB_EVERY = 15;

  /** Nombre de mains avant de pouvoir relancer un straddle général (0 = disponible). */
  bombInHands(): number {
    if (this.lastBombHand === null) return 0;
    return Math.max(0, this.lastBombHand + GameRuntime.BOMB_EVERY - (this.table.handNumber + 1));
  }

  bombAllowed(): boolean {
    return this.config.mode === 'CASH' && this.config.allowStraddle !== false && this.status !== 'FINISHED';
  }

  requestBomb(userId: string, roulette = false): void {
    if (!this.bombAllowed()) throw new GameError('NO_BOMB', 'Le straddle général est désactivé à cette table');
    if (this.table.seatOf(userId) === -1) throw new GameError('NOT_SEATED', 'Asseyez-vous pour lancer un straddle général');
    if (this.bombRequestedBy) throw new GameError('PENDING', 'Un straddle général est déjà prévu à la prochaine main');
    const wait = this.bombInHands();
    if (wait > 0) throw new GameError('COOLDOWN', `Prochain straddle général possible dans ${wait} main${wait > 1 ? 's' : ''}`);
    this.bombRequestedBy = userId;
    const bb = this.table.config.bigBlind;
    const name = this.meta.get(userId)?.username ?? '?';
    if (roulette) {
      // Tirage équitable (aléa cryptographique) entre 2 et 10 BB, dévoilé après la rotation
      const value = 2 + secureRand(9);
      this.bombMult = value;
      this.bombSpin = { value, by: name, at: Date.now() };
      this.log(`🎡 ${name} fait tourner la roulette du straddle…`, 'system');
      setTimeout(() => {
        if (this.disposed || this.bombSpin?.at === undefined || this.bombRequestedBy !== userId) return;
        this.log(`🎡 La roulette s'arrête sur ${value} BB : tout le monde posera ${fmt(bb * value)} à la prochaine main, flop direct`, 'system');
        this.changed();
        this.maybeStartHand();
      }, FAST ? 5 : GameRuntime.SPIN_MS);
    } else {
      this.bombMult = 2;
      this.bombSpin = null;
      this.log(`💣 ${name} lance un straddle général : tout le monde posera ${fmt(bb * 2)} à la prochaine main, flop direct`, 'system');
    }
    this.changed();
  }

  cancelBomb(userId: string): void {
    if (this.bombRequestedBy !== userId) throw new GameError('NOT_YOURS', "Vous n'avez pas lancé de straddle général");
    if (this.spinning()) throw new GameError('SPINNING', 'La roulette tourne encore');
    this.bombRequestedBy = null;
    this.bombMult = 2;
    this.bombSpin = null;
    this.log(`${this.meta.get(userId)?.username ?? '?'} annule le straddle général`, 'system');
    this.changed();
  }

  /** La roue est-elle encore en train de tourner ? */
  private spinning(): boolean {
    return !!this.bombSpin && !FAST && Date.now() < this.bombSpin.at + GameRuntime.SPIN_MS;
  }

  /** Payer la grosse blinde (et la petite manquée) pour jouer dès la prochaine main. */
  postNow(userId: string): void {
    try {
      this.table.requestPostNow(userId);
    } catch (e) {
      if (e instanceof PokerError) throw new GameError(e.code, e.message);
      throw e;
    }
    const amount = this.table.postNowAmount(userId);
    this.log(`${this.meta.get(userId)?.username ?? '?'} paiera ${fmt(amount)} pour jouer dès la prochaine main`, 'system');
    this.changed();
    this.maybeStartHand();
  }

  /** Montrer volontairement ses cartes à la fin d'un coup. */
  showCards(userId: string): void {
    const h = this.table.hand;
    if (!h?.finished || !this.staging.resultVisible) throw new GameError('NOT_FINISHED', 'Vous pourrez montrer vos cartes à la fin du coup');
    let shown;
    try {
      shown = this.table.showCards(userId);
    } catch (e) {
      if (e instanceof PokerError) throw new GameError(e.code, e.message);
      throw e;
    }
    const full = [...shown.hole, ...h.board];
    const e = full.length >= 5 ? evaluateBest(full) : null;
    if (this.result) {
      this.result.shown.push({ userId, cards: shown.hole, description: e?.description ?? '', best: [] });
      this.result.mucked = this.result.mucked.filter((id) => id !== userId);
    }
    this.log(`${this.meta.get(userId)?.username ?? '?'} montre ses cartes : ${shown.hole.map(cardLabel).join(' ')}`, 'action');
    const handNumber = h.handNumber;
    this.enqueue(() => prisma.handPlayer.updateMany({ where: { userId, hand: { gameId: this.id, handNumber } }, data: { shown: true } }));
    this.changed();
  }

  setAway(userId: string, away: boolean): void {
    const m = this.meta.get(userId);
    if (!m || this.table.seatOf(userId) === -1) throw new GameError('NOT_SEATED', "Vous n'êtes pas assis");
    if (m.kicked && !away) throw new GameError('KICKED', 'Vous avez été exclu de cette table');
    m.away = away;
    m.timeouts = 0;
    if (this.config.mode === 'CASH') this.table.setSittingOut(userId, away);
    this.log(away ? `${m.username} est absent` : `${m.username} est de retour`, 'system');
    if (away && this.table.currentPlayerId() === userId) this.scheduleTurn();
    this.changed();
    if (!away) this.maybeStartHand();
  }

  // ═══════════════════════════ Tournoi ═══════════════════════════

  async register(user: { id: string; username: string; avatarUrl: string | null }): Promise<void> {
    if (this.config.mode !== 'TOURNAMENT') throw new GameError('MODE', "Ce n'est pas un tournoi");
    if (this.status !== 'WAITING') throw new GameError('STARTED', 'Les inscriptions sont closes');
    if (this.registered.includes(user.id)) throw new GameError('ALREADY', 'Déjà inscrit');
    if (this.registered.length >= this.config.maxSeats) throw new GameError('FULL', 'Tournoi complet');
    if (this.meta.get(user.id)?.kicked) throw new GameError('KICKED', 'Vous avez été exclu de ce tournoi');
    this.registered.push(user.id);
    try {
      if (this.config.buyIn > 0) await debitBankroll(user.id, this.config.buyIn);
      await prisma.gamePlayer.upsert({
        where: { gameId_userId: { gameId: this.id, userId: user.id } },
        create: { gameId: this.id, userId: user.id, buyIn: this.config.buyIn },
        update: { buyIn: this.config.buyIn, leftAt: null },
      });
    } catch (e) {
      this.registered = this.registered.filter((id) => id !== user.id);
      throw e;
    }
    this.ensureMeta(user);
    this.log(`${user.username} s'inscrit au tournoi`, 'system');
    await this.refreshBankroll(user.id);
    this.changed();
  }

  async unregister(userId: string): Promise<void> {
    if (this.status !== 'WAITING') throw new GameError('STARTED', 'Le tournoi a commencé');
    if (!this.registered.includes(userId)) throw new GameError('NOT_REGISTERED', 'Non inscrit');
    this.registered = this.registered.filter((id) => id !== userId);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { chips: { increment: this.config.buyIn } } }),
      prisma.gamePlayer.delete({ where: { gameId_userId: { gameId: this.id, userId } } }),
    ]);
    this.log(`${this.meta.get(userId)?.username ?? 'Un joueur'} se désinscrit`, 'system');
    await this.refreshBankroll(userId);
    this.changed();
  }

  canRebuy(userId: string): boolean {
    const m = this.meta.get(userId);
    return !!m && this.config.mode === 'TOURNAMENT' && this.config.rebuyAllowed && m.pendingRebuyUntil !== null;
  }

  canAddon(userId: string): boolean {
    const t = this.tournament;
    const m = this.meta.get(userId);
    if (!t || !m || !this.config.addonAllowed || m.addonUsed) return false;
    if (this.table.seatOf(userId) === -1) return false;
    // Add-on disponible pendant la première pause, ou à la fin de la période de rebuy
    return t.onBreak || t.levelIndex + 1 === this.config.rebuyUntilLevel;
  }

  async rebuy(userId: string): Promise<void> {
    if (!this.canRebuy(userId)) throw new GameError('NO_REBUY', 'Rebuy impossible');
    if (this.config.buyIn > 0) await debitBankroll(userId, this.config.buyIn);
    const m = this.meta.get(userId)!;
    m.pendingRebuyUntil = null;
    m.rebuys += 1;
    clearTimeout(this.rebuyTimers.get(userId));
    this.rebuyTimers.delete(userId);
    this.table.addChips(userId, this.config.startingStack);
    this.table.setSittingOut(userId, false);
    await prisma.gamePlayer.update({ where: { gameId_userId: { gameId: this.id, userId } }, data: { rebuys: { increment: 1 }, buyIn: { increment: this.config.buyIn } } });
    this.log(`${m.username} effectue un rebuy (+${fmt(this.config.startingStack)})`, 'system');
    await this.refreshBankroll(userId);
    this.changed();
    this.maybeStartHand();
  }

  async declineRebuy(userId: string): Promise<void> {
    if (!this.canRebuy(userId)) throw new GameError('NO_REBUY', 'Aucun rebuy en attente');
    this.expireRebuy(userId);
  }

  async addon(userId: string): Promise<void> {
    if (!this.canAddon(userId)) throw new GameError('NO_ADDON', 'Add-on indisponible');
    if (this.table.isInLiveHand(userId)) throw new GameError('IN_HAND', 'Add-on possible entre deux mains');
    if (this.config.buyIn > 0) await debitBankroll(userId, this.config.buyIn);
    const m = this.meta.get(userId)!;
    m.addonUsed = true;
    this.table.addChips(userId, this.config.addonStack);
    await prisma.gamePlayer.update({ where: { gameId_userId: { gameId: this.id, userId } }, data: { addons: { increment: 1 }, buyIn: { increment: this.config.buyIn } } });
    this.log(`${m.username} prend l'add-on (+${fmt(this.config.addonStack)})`, 'system');
    await this.refreshBankroll(userId);
    this.changed();
  }

  private levelDurationMs(): number {
    const lvl = this.config.blindLevels[this.tournament?.levelIndex ?? 0];
    return FAST ? 60_000 : (lvl?.duration ?? this.config.levelMinutes * 60) * 1000;
  }

  private armLevelTimer(ms: number): void {
    const t = this.tournament!;
    if (this.levelTimer) clearTimeout(this.levelTimer);
    t.levelEndsAt = Date.now() + ms;
    t.levelRemainingMs = null;
    this.levelTimer = setTimeout(() => this.onLevelEnd(), ms);
  }

  private onLevelEnd(): void {
    const t = this.tournament;
    if (!t || this.status !== 'RUNNING') return;
    const lvl = this.config.blindLevels[t.levelIndex];
    if (lvl && lvl.breakAfter > 0) {
      t.pendingBreak = true;
      t.levelEndsAt = null;
      this.log('Fin du niveau : pause à la fin de la main', 'system');
      if (!this.table.hand || this.table.hand.finished) this.betweenHands();
    } else {
      this.advanceLevel();
    }
    this.changed();
  }

  private advanceLevel(): void {
    const t = this.tournament!;
    if (t.levelIndex < this.config.blindLevels.length - 1) t.levelIndex += 1;
    const lvl = this.config.blindLevels[t.levelIndex]!;
    this.log(`Niveau ${t.levelIndex + 1} : blinds ${fmt(lvl.smallBlind)}/${fmt(lvl.bigBlind)}${lvl.ante ? `, ante ${fmt(lvl.ante)}` : ''}`, 'system');
    this.armLevelTimer(this.levelDurationMs());
  }

  private startBreak(ms: number): void {
    const t = this.tournament!;
    t.pendingBreak = false;
    t.onBreak = true;
    t.breakEndsAt = Date.now() + ms;
    t.levelEndsAt = null;
    this.log(`Pause de ${Math.round(ms / 60000)} min`, 'system');
    if (this.breakTimer) clearTimeout(this.breakTimer);
    this.breakTimer = setTimeout(() => {
      t.onBreak = false;
      t.breakEndsAt = null;
      this.log('Fin de la pause, reprise du jeu', 'system');
      this.advanceLevel();
      this.changed();
      this.maybeStartHand();
    }, ms);
  }

  private armRebuyTimer(userId: string, ms: number): void {
    clearTimeout(this.rebuyTimers.get(userId));
    this.rebuyTimers.set(userId, setTimeout(() => this.expireRebuy(userId), ms));
  }

  private expireRebuy(userId: string): void {
    const m = this.meta.get(userId);
    if (!m || m.pendingRebuyUntil === null) return;
    m.pendingRebuyUntil = null;
    clearTimeout(this.rebuyTimers.get(userId));
    this.rebuyTimers.delete(userId);
    this.eliminate([userId]);
    this.checkTournamentEnd();
    this.changed();
    this.maybeStartHand();
  }

  /** Élimine des joueurs (tapis à 0) ; les meilleurs tapis de départ finissent mieux classés. */
  private eliminate(userIds: string[]): void {
    const t = this.tournament!;
    const startStacks = new Map(this.table.hand?.players.map((p) => [p.playerId, p.startStack]) ?? []);
    const ordered = [...userIds].sort((a, b) => (startStacks.get(b) ?? 0) - (startStacks.get(a) ?? 0));
    const alive = this.aliveTournamentPlayers().filter((id) => !userIds.includes(id)).length;
    ordered.forEach((userId, i) => {
      const place = alive + 1 + i;
      const m = this.meta.get(userId)!;
      if (this.table.seatOf(userId) !== -1) this.table.stand(userId);
      const prize = t.prizes[place - 1] ?? 0;
      t.results.push({ userId, username: m.username, place, prize });
      this.log(`${m.username} est éliminé (${place}${place === 1 ? 'er' : 'e'})${prize ? ` et gagne ${fmt(prize)} jetons` : ''}`, 'win');
      this.enqueue(() => this.persistPlace(userId, place, prize));
    });
  }

  private aliveTournamentPlayers(): string[] {
    return this.table.seats
      .filter((s) => !!s && (s.stack > 0 || this.meta.get(s.playerId)?.pendingRebuyUntil))
      .map((s) => s!.playerId);
  }

  private async persistPlace(userId: string, place: number, prize: number): Promise<void> {
    await prisma.$transaction([
      prisma.gamePlayer.update({ where: { gameId_userId: { gameId: this.id, userId } }, data: { place, prize, cashOut: prize, stack: 0, leftAt: new Date() } }),
      ...(prize > 0 ? [prisma.user.update({ where: { id: userId }, data: { chips: { increment: prize } } })] : []),
    ]);
    await this.refreshBankroll(userId);
  }

  private checkTournamentEnd(): void {
    const t = this.tournament;
    if (!t || this.status === 'FINISHED') return;
    const alive = this.aliveTournamentPlayers();
    const pending = alive.some((id) => this.meta.get(id)?.pendingRebuyUntil);
    if (alive.length === 1 && !pending) {
      const winner = alive[0]!;
      const m = this.meta.get(winner)!;
      const prize = t.prizes[0] ?? 0;
      t.results.push({ userId: winner, username: m.username, place: 1, prize });
      this.log(`🏆 ${m.username} remporte le tournoi${prize ? ` et ${fmt(prize)} jetons` : ''} !`, 'win');
      this.enqueue(() => this.persistPlace(winner, 1, prize));
      this.finishGame();
    }
  }

  // ═══════════════════════════ Administration ═══════════════════════════

  async start(byUserId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    if (this.status === 'RUNNING') throw new GameError('RUNNING', 'Partie déjà démarrée');
    if (this.status === 'FINISHED') throw new GameError('FINISHED', 'Partie terminée');
    if (this.status === 'PAUSED') return this.resumeGame(byUserId);

    if (this.config.mode === 'TOURNAMENT') {
      if (this.registered.length < 2) throw new GameError('NOT_ENOUGH', 'Il faut au moins 2 inscrits');
      // Placement aléatoire sécurisé
      const seats = Array.from({ length: this.config.maxSeats }, (_, i) => i);
      for (let i = seats.length - 1; i > 0; i--) {
        const j = secureRand(i + 1);
        [seats[i], seats[j]] = [seats[j]!, seats[i]!];
      }
      this.registered.forEach((userId, i) => {
        const m = this.meta.get(userId)!;
        this.table.sit(seats[i]!, userId, m.username, this.config.startingStack);
      });
      const entrants = this.registered.length;
      const totalCost = this.config.buyIn;
      this.tournament = {
        levelIndex: 0, levelEndsAt: null, levelRemainingMs: null, pendingBreak: false, onBreak: false, breakEndsAt: null,
        entrants: [...this.registered], results: [], prizes: totalCost > 0 ? prizePool(entrants, totalCost) : [],
      };
      await prisma.gamePlayer.updateMany({ where: { gameId: this.id }, data: { stack: this.config.startingStack } });
      this.armLevelTimer(this.levelDurationMs());
      this.log(`Le tournoi commence avec ${entrants} joueurs !`, 'system');
    } else {
      this.log('La table est ouverte', 'system');
    }
    this.status = 'RUNNING';
    await prisma.game.update({ where: { id: this.id }, data: { status: 'RUNNING', startedAt: new Date() } });
    this.changed();
    this.maybeStartHand();
  }

  async pause(byUserId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    if (this.status !== 'RUNNING') throw new GameError('NOT_RUNNING', "La partie n'est pas en cours");
    this.status = 'PAUSED';
    const t = this.tournament;
    if (t && t.levelEndsAt) {
      t.levelRemainingMs = Math.max(1000, t.levelEndsAt - Date.now());
      t.levelEndsAt = null;
      if (this.levelTimer) clearTimeout(this.levelTimer);
    }
    this.log('La partie est mise en pause (après la main en cours)', 'system');
    await prisma.game.update({ where: { id: this.id }, data: { status: 'PAUSED' } });
    this.changed();
  }

  private async resumeGame(byUserId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    this.status = 'RUNNING';
    const t = this.tournament;
    if (t && !t.onBreak && !t.pendingBreak) this.armLevelTimer(t.levelRemainingMs ?? this.levelDurationMs());
    this.log('Reprise de la partie', 'system');
    await prisma.game.update({ where: { id: this.id }, data: { status: 'RUNNING' } });
    this.changed();
    this.maybeStartHand();
  }

  /** Exclut un joueur de la table (après la main en cours). */
  async kick(byUserId: string, userId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    const m = this.meta.get(userId);
    if (!m) throw new GameError('UNKNOWN', 'Joueur inconnu');
    m.kicked = true;
    this.log(`${m.username} a été exclu de la table`, 'system');
    if (this.config.mode === 'CASH') {
      if (this.table.seatOf(userId) !== -1) await this.standUp(userId);
    } else if (this.status === 'WAITING' && this.registered.includes(userId)) {
      await this.unregister(userId);
    } else {
      m.away = true; // tournoi : le joueur est « blindé » automatiquement
      if (this.table.currentPlayerId() === userId) this.scheduleTurn();
    }
    this.io.toUser(userId, 'game:kicked', { gameId: this.id });
    this.changed();
  }

  /** Ferme la table (cash) : tout le monde récupère ses jetons. */
  async close(byUserId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    if (this.config.mode === 'TOURNAMENT' && this.status !== 'WAITING') throw new GameError('RUNNING', 'Un tournoi en cours ne peut pas être fermé');
    if (this.table.hand && !this.table.hand.finished) throw new GameError('IN_HAND', 'Attendez la fin de la main (mettez la partie en pause)');
    for (const s of this.table.seats) if (s) await this.removeCashPlayer(s.playerId);
    for (const userId of [...this.registered]) await this.unregister(userId);
    this.finishGame();
  }

  private finishGame(): void {
    this.status = 'FINISHED';
    this.turn = null;
    for (const t of [this.turnTimer, this.nextHandTimer, this.levelTimer, this.breakTimer]) if (t) clearTimeout(t);
    this.enqueue(() => prisma.game.update({ where: { id: this.id }, data: { status: 'FINISHED', endedAt: new Date() } }));
    this.log('Partie terminée', 'system');
    this.changed();
  }

  // ═══════════════════════════ Jeu ═══════════════════════════

  /**
   * Action d'un joueur. `seq` doit correspondre à l'état affiché par le client :
   * protège contre les doubles clics et les actions envoyées sur un état périmé.
   */
  act(userId: string, type: ActionType, amount: number | undefined, seq: number): void {
    if (this.status === 'FINISHED') throw new GameError('FINISHED', 'Partie terminée');
    if (seq !== this.actionSeq) throw new GameError('STALE', 'Action ignorée (état périmé ou double clic)');
    if (this.table.currentPlayerId() !== userId) throw new GameError('NOT_YOUR_TURN', "Ce n'est pas votre tour");
    const m = this.meta.get(userId)!;
    m.timeouts = 0;
    this.applyAction(userId, type, amount);
  }

  private applyAction(userId: string, type: ActionType, amount: number | undefined, auto = false): void {
    const m = this.meta.get(userId)!;
    if (this.timeBankStartedAt !== null) {
      m.timeBankMs = Math.max(0, m.timeBankMs - (Date.now() - this.timeBankStartedAt));
      this.timeBankStartedAt = null;
    }
    const h = this.table.hand!;
    const boardBefore = h.board.length;
    let events: HandEvent[];
    try {
      events = auto ? this.table.timeoutAction(userId) : this.table.act(userId, { type, amount });
    } catch (e) {
      if (e instanceof PokerError) throw new GameError(e.code, e.message);
      throw e;
    }
    this.actionSeq += 1;
    this.handleEvents(events);
    const streets = events.filter((e) => e.type === 'street').length;
    if (h.finished) {
      this.onHandFinished(boardBefore, streets);
    } else if (h.pendingRunout) {
      this.startRunoutVote(boardBefore);
    } else {
      this.scheduleTurn();
    }
    this.changed();
  }

  private handleEvents(events: HandEvent[]): void {
    for (const e of events) {
      const name = (id: string) => this.meta.get(id)?.username ?? '?';
      if (e.type === 'action') {
        const m = this.meta.get(e.playerId);
        const label = actionLabel(e.action, e.to, e.allIn);
        if (m) m.lastAction = label;
        let text: string;
        if (e.allIn) text = `${name(e.playerId)} est à tapis (${fmt(e.to)})`;
        else if (e.action === 'raise') text = `${name(e.playerId)} relance à ${fmt(e.to)}`;
        else if (e.action === 'bet') text = `${name(e.playerId)} mise ${fmt(e.to)}`;
        else if (e.action === 'call') text = `${name(e.playerId)} suit ${fmt(e.amount)}`;
        else if (e.action === 'check') text = `${name(e.playerId)} parole`;
        else text = `${name(e.playerId)} se couche`;
        this.log(text, 'action');
      } else if (e.type === 'street') {
        for (const m of this.meta.values()) m.lastAction = null;
        // Tapis : les rues sont annoncées au rythme du déroulé (voir onHandFinished)
        if (this.table.hand?.finished || this.table.hand?.pendingRunout) continue;
        const label = e.street === 'flop' ? 'Flop' : e.street === 'turn' ? 'Turn' : 'River';
        this.log(`${label} : ${e.cards.map(cardLabel).join(' ')}`, 'hand');
      } else if (e.type === 'uncalled') {
        this.log(`${fmt(e.amount)} jetons non suivis rendus à ${name(e.playerId)}`, 'action');
      }
    }
  }

  private onHandFinished(boardBefore: number, streetsDealt: number): void {
    const h = this.table.hand!;
    this.turn = null;
    if (this.turnTimer) clearTimeout(this.turnTimer);

    const showdowns = h.events.filter((e) => e.type === 'showdown');
    const showdown = showdowns[0];
    const showdown2 = showdowns.find((e) => e.type === 'showdown' && e.run === 2);
    this.result = {
      handNumber: h.handNumber,
      pots: h.events.flatMap((e) => (e.type === 'potAwarded' ? [{ amount: e.amount, winners: e.winners, description: e.description, run: e.run }] : [])),
      shown: showdown && showdown.type === 'showdown'
        ? showdown.hands.map((x) => ({ userId: x.playerId, cards: x.hole, description: x.description, best: x.best }))
        : [],
      shown2: showdown2 && showdown2.type === 'showdown' ? showdown2.hands.map((x) => ({ userId: x.playerId, description: x.description })) : undefined,
      mucked: showdown && showdown.type === 'showdown' ? (showdown.mucked ?? []) : [],
    };
    for (const id of this.result.mucked) this.log(`${this.meta.get(id)?.username ?? '?'} jette sa main`, 'action');

    // Déroulé progressif du board en cas d'all-in (affichage contrôlé par le serveur)
    const twice = !!h.board2;
    const stageCount = streetsDealt > 1 || twice || (streetsDealt === 1 && !!showdown && boardBefore < 5) ? streetsDealt : 0;
    const resultDelay = () => {
      this.staging.resultVisible = true;
      this.announceWinners();
      this.changed();
      this.scheduleNextHand(showdown ? (twice ? 8000 : 5500) : 3000);
    };
    this.equityByBoard.clear();
    if (stageCount > 0) {
      this.staging = { visibleBoard: boardBefore, visible2: null, suspense: null, resultVisible: false };
      // Probabilités de gain à chaque étape du déroulé (mains dévoilées uniquement)
      const live = h.players.filter((p) => !p.folded && p.shown);
      if (live.length >= 2) {
        const boards: [number, Card[]][] = [[0, h.board]];
        if (h.board2) boards.push([100, h.board2]);
        for (const [offset, board] of boards) {
          for (const len of [boardBefore, 3, 4, 5]) {
            if (len < boardBefore || this.equityByBoard.has(offset + len)) continue;
            const eq = allInEquity(live.map((p) => p.hole), board.slice(0, len));
            this.equityByBoard.set(offset + len, live.map((p, i) => ({ userId: p.playerId, win: eq[i]!.win, tie: eq[i]!.tie })));
          }
        }
      }
      // Déroulé façon retransmission : chaque rue avec une pause, la river reste
      // face cachée quelques secondes (suspense) puis se retourne lentement.
      const sizes = (from: number) => (from === 0 ? [3, 1, 1] : from === 3 ? [1, 1] : from === 4 ? [1] : []);
      const STEP = FAST ? 5 : 2200; // entre deux rues
      const SUSPENSE = FAST ? 5 : 2800; // river face cachée
      const AFTER_RIVER = FAST ? 5 : 2400; // le temps de voir la river avant le résultat
      const BETWEEN_BOARDS = FAST ? 5 : 2200; // pause avant le second board
      type Step = { run: 1 | 2; size: number; river: boolean };
      const plan: Step[] = [];
      for (const run of twice ? [1, 2] as const : [1] as const) {
        let len = boardBefore;
        for (const size of sizes(boardBefore)) {
          len += size;
          plan.push({ run, size, river: len === 5 });
        }
      }
      const board1 = h.board;
      const board2 = h.board2;
      const announce = (run: 1 | 2, from: number, size: number) => {
        const cards = (run === 1 ? board1 : board2!).slice(from, from + size);
        const label = from === 0 ? 'Flop' : from === 3 ? 'Turn' : 'River';
        this.log(`${run === 2 ? '2ᵉ board — ' : twice ? '1ᵉʳ board — ' : ''}${label} : ${cards.map(cardLabel).join(' ')}`, 'hand');
      };
      let k = 0;
      const reveal = (st: Step) => {
        if (st.run === 1) {
          announce(1, this.staging.visibleBoard, st.size);
          this.staging.visibleBoard += st.size;
        } else {
          if (this.staging.visible2 == null) this.staging.visible2 = boardBefore;
          announce(2, this.staging.visible2, st.size);
          this.staging.visible2 += st.size;
        }
        this.staging.suspense = null;
      };
      const tick = () => {
        if (this.disposed) return;
        const st = plan[k];
        if (!st) {
          resultDelay();
          return;
        }
        const firstOfRun2 = st.run === 2 && (k === 0 || plan[k - 1]!.run === 1);
        if (firstOfRun2 && this.staging.visible2 == null) {
          // Le second board apparaît avec les cartes communes, puis se déroule
          this.staging.visible2 = boardBefore;
          this.log('Second board', 'hand');
          this.changed();
          this.stagingTimer = setTimeout(tick, BETWEEN_BOARDS);
          return;
        }
        if (st.river && this.staging.suspense !== st.run) {
          // River face cachée : suspense
          this.staging.suspense = st.run;
          this.changed();
          this.stagingTimer = setTimeout(tick, SUSPENSE);
          return;
        }
        reveal(st);
        k++;
        this.changed();
        this.stagingTimer = setTimeout(tick, st.river ? AFTER_RIVER : STEP);
      };
      this.stagingTimer = setTimeout(tick, FAST ? 5 : 1200);
    } else {
      this.staging = { visibleBoard: h.board.length, visible2: h.board2 ? 5 : null, resultVisible: true };
      this.announceWinners();
      this.scheduleNextHand(showdown ? 5000 : 2500);
    }
    this.persistHand();
  }

  private announceWinners(): void {
    const h = this.table.hand!;
    for (const e of h.events) {
      if (e.type !== 'potAwarded') continue;
      const names = e.winners.map((id) => this.meta.get(id)?.username ?? '?');
      const multi = h.events.filter((x) => x.type === 'potAwarded' && x.run === e.run).length > 1;
      const base = multi ? (e.potIndex === 0 ? 'le pot principal' : `le pot secondaire ${e.potIndex}`) : 'le pot';
      const label = e.run ? `${base} (${e.run === 1 ? 'premier' : 'second'} board)` : base;
      if (names.length > 1) {
        this.log(`${names.join(' et ')} se partagent ${label} de ${fmt(e.amount)} jetons${e.description ? ` (${e.description})` : ''}`, 'win');
      } else {
        this.log(`${names[0]} remporte ${label} de ${fmt(e.amount)} jetons${e.description ? ` avec ${e.description}` : ''}`, 'win');
      }
    }
  }

  private scheduleNextHand(delayMs: number): void {
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = setTimeout(() => this.betweenHands(), FAST ? 10 : delayMs);
  }

  /** Traitements entre deux mains puis démarrage de la suivante si possible. */
  private betweenHands(): void {
    if (this.disposed) return;
    this.nextHandTimer = null;
    if (this.stagingTimer && !this.staging.resultVisible) return; // attendre la fin du déroulé
    this.result = null;
    this.equityByBoard.clear();
    this.staging = { visibleBoard: 5, visible2: null, resultVisible: true };
    for (const m of this.meta.values()) m.lastAction = null;

    // Cash : départs, recharges différées, absents prolongés
    if (this.config.mode === 'CASH') {
      for (const m of this.meta.values()) {
        const seat = this.table.seatOf(m.userId);
        if (seat === -1) continue;
        if (m.pendingReload > 0) {
          this.table.addChips(m.userId, m.pendingReload);
          m.pendingReload = 0;
        }
        const longGone = !m.bot && !m.connected && m.disconnectedAt && Date.now() - m.disconnectedAt > 10 * 60_000;
        if (m.leaveAfterHand || m.kicked || longGone) void this.removeCashPlayer(m.userId);
        else if (this.table.seats[seat]!.stack === 0 && m.bot) {
          if (this.reloadAmountFor(m.userId) > 0) void this.botReload(m.userId);
          else void this.removeCashPlayer(m.userId);
        } else if (this.table.seats[seat]!.stack === 0 && !m.away) {
          // Joueur sans jetons : il reste assis (absent) et peut recharger
          this.table.setSittingOut(m.userId, true);
          m.away = true;
        }
      }
    }

    // Tournoi : éliminations, rebuys, pauses
    const t = this.tournament;
    if (t && this.status !== 'FINISHED') {
      const busted = this.table.seats.filter((s) => !!s && s.stack === 0 && !this.meta.get(s.playerId)?.pendingRebuyUntil).map((s) => s!.playerId);
      const rebuyOpen = this.config.rebuyAllowed && t.levelIndex + 1 <= this.config.rebuyUntilLevel;
      const toEliminate: string[] = [];
      for (const id of busted) {
        const m = this.meta.get(id)!;
        if (rebuyOpen && m.connected && !m.kicked && !m.bot) {
          m.pendingRebuyUntil = Date.now() + 20_000;
          this.table.setSittingOut(id, true);
          this.armRebuyTimer(id, 20_000);
          this.io.toUser(id, 'game:rebuyOffer', { gameId: this.id, until: m.pendingRebuyUntil });
        } else {
          toEliminate.push(id);
        }
      }
      if (toEliminate.length) this.eliminate(toEliminate);
      this.checkTournamentEnd();
      if (t.pendingBreak && this.status === 'RUNNING') {
        const lvl = this.config.blindLevels[t.levelIndex];
        this.startBreak(FAST ? 50 : (lvl?.breakAfter ?? 300) * 1000);
      }
    }
    this.changed();
    this.maybeStartHand();
  }

  /** Relance la partie si elle attendait (ex. un humain revient à une table de robots). */
  wake(): void {
    this.maybeStartHand();
  }

  private maybeStartHand(): void {
    if (this.disposed || this.status !== 'RUNNING') return;
    // Cash game : pas de nouvelle main si aucun humain ne regarde la table
    // (évite qu'une table de robots joue toute seule indéfiniment)
    if (this.config.mode === 'CASH' && this.io.viewerCount(this.id) === 0) return;
    if (this.tournament?.onBreak || this.tournament?.pendingBreak) return;
    if (this.nextHandTimer || (this.table.hand && !this.table.hand.finished)) return;
    if (!this.staging.resultVisible) return;
    if (!this.table.canStartHand()) return;
    if (this.result) return; // résultat encore affiché : betweenHands relancera
    if (this.bombRequestedBy && this.spinning()) return; // la roulette relancera la main

    const t = this.tournament;
    if (t) {
      const lvl = this.config.blindLevels[t.levelIndex]!;
      this.table.setBlinds(lvl.smallBlind, lvl.bigBlind, lvl.ante);
    }
    const mult = this.bombMult;
    const bombPot = this.bombRequestedBy && this.bombAllowed() ? this.table.config.bigBlind * mult : 0;
    const h = this.table.startHand(secureRand, undefined, { bombPot });
    this.currentBombBB = bombPot ? mult : null;
    if (bombPot) {
      this.lastBombHand = h.handNumber;
      this.bombRequestedBy = null;
      this.bombMult = 2;
      this.bombSpin = null;
    }
    this.actionSeq += 1;
    this.staging = { visibleBoard: 0, resultVisible: true };
    // Petit bonus de time bank à chaque main (plafonné)
    for (const p of h.players) {
      const m = this.meta.get(p.playerId)!;
      m.timeBankMs = Math.min(this.config.timeBankSeconds * 1000, m.timeBankMs + 2000);
      m.lastAction = null;
    }
    this.log(bombPot
      ? `Nouvelle main #${h.handNumber} — 💣 straddle général ${mult} BB : ${fmt(bombPot)} chacun, flop direct`
      : `Nouvelle main #${h.handNumber} — blinds ${fmt(h.smallBlind)}/${fmt(h.bigBlind)}${h.ante ? `, ante ${fmt(h.ante)}` : ''}`, 'hand');
    if (h.finished) {
      // Tous à tapis dès les blinds : déroulé immédiat
      const streets = h.events.filter((e) => e.type === 'street').length;
      this.onHandFinished(0, streets);
    } else if (h.pendingRunout) {
      this.startRunoutVote(0);
    } else {
      this.scheduleTurn();
    }
    this.changed();
  }

  /** Programme le minuteur du joueur qui a la parole. */
  private scheduleTurn(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.timeBankStartedAt = null;
    const userId = this.table.currentPlayerId();
    if (!userId) {
      this.turn = null;
      return;
    }
    const seat = this.table.seatOf(userId);
    const m = this.meta.get(userId)!;
    this.turnStartedAt = Date.now();
    const seqAtSchedule = this.actionSeq;
    if (m.bot && !m.kicked && !m.leaveAfterHand) {
      // Le robot décide tout de suite (l'état ne bouge pas avant son action), puis « réfléchit »
      let decision: BotDecision;
      try {
        decision = decide(this.table.hand!, userId, this.table.legalActions(userId)!, botStyleFor(m.username));
      } catch (err) {
        logger.warn({ err }, 'Décision du robot impossible, check/fold');
        decision = { type: 'fold', thinkMs: 1000 };
      }
      const total = this.config.actionSeconds * 1000;
      const ms = FAST ? 5 : Math.min(decision.thinkMs, Math.max(800, total - 1500));
      this.turn = { seat, userId, deadline: Date.now() + total, usingTimeBank: false, totalMs: total };
      this.turnTimer = setTimeout(() => this.botAct(userId, seqAtSchedule, decision), ms);
      return;
    }
    if (m.away || m.leaveAfterHand || m.kicked) {
      const ms = FAST ? 1 : 700;
      this.turn = { seat, userId, deadline: Date.now() + ms, usingTimeBank: false, totalMs: ms };
      this.turnTimer = setTimeout(() => this.onTurnTimeout(userId, seqAtSchedule, true), ms);
      return;
    }
    const ms = FAST ? this.config.actionSeconds * 100 : this.config.actionSeconds * 1000;
    this.turn = { seat, userId, deadline: Date.now() + ms, usingTimeBank: false, totalMs: ms };
    this.turnTimer = setTimeout(() => this.onTurnTimeout(userId, seqAtSchedule, false), ms);
  }

  private onTurnTimeout(userId: string, seq: number, immediate: boolean): void {
    if (this.disposed || seq !== this.actionSeq || this.table.currentPlayerId() !== userId) return;
    const m = this.meta.get(userId)!;
    if (!immediate && m.timeBankMs > 500 && this.timeBankStartedAt === null) {
      // Bascule sur la réserve de temps
      this.timeBankStartedAt = Date.now();
      this.turn = { ...this.turn!, deadline: Date.now() + m.timeBankMs, usingTimeBank: true, totalMs: m.timeBankMs };
      this.turnTimer = setTimeout(() => this.onTurnTimeout(userId, seq, true), m.timeBankMs);
      this.changed();
      return;
    }
    if (!immediate || this.timeBankStartedAt !== null) {
      m.timeouts += 1;
      if (m.timeouts >= 2 && !m.away) {
        m.away = true;
        this.log(`${m.username} passe en mode absent (temps écoulé)`, 'system');
        if (this.config.mode === 'CASH') this.table.setSittingOut(userId, true);
      }
    }
    this.applyAction(userId, 'fold', undefined, true);
  }

  // ═══════════════════════════ Robots ═══════════════════════════

  private botAct(userId: string, seq: number, d: BotDecision): void {
    if (this.disposed || seq !== this.actionSeq || this.table.currentPlayerId() !== userId) return;
    try {
      this.applyAction(userId, d.type === 'fold' && this.table.legalActions(userId)?.canCheck ? 'check' : d.type, d.amount);
    } catch {
      this.applyAction(userId, 'fold', undefined, true); // filet de sécurité : jamais de blocage
    }
  }

  /** Ajoute un robot de test (administrateurs du salon). */
  async addBot(byUserId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    if (this.status === 'FINISHED') throw new GameError('FINISHED', 'Partie terminée');
    const used = [...this.meta.values()].filter((m) => m.bot).map((m) => m.userId);
    if (this.config.mode === 'TOURNAMENT') {
      if (this.status !== 'WAITING') throw new GameError('STARTED', 'Ajoutez les robots avant le début du tournoi');
      if (this.registered.length >= this.config.maxSeats) throw new GameError('FULL', 'Tournoi complet');
      const bot = await getBotUser(used, this.config.buyIn);
      this.ensureMeta(bot).bot = true;
      await this.register(bot);
    } else {
      const seat = this.table.seats.findIndex((s, i) => !s && !this.reservedSeats.has(i));
      if (seat === -1) throw new GameError('FULL', 'Plus de place à cette table');
      const buyIn = Math.min(Math.max(this.config.startingStack, this.config.minBuyIn), this.config.maxBuyIn);
      const bot = await getBotUser(used.filter((id) => this.table.seatOf(id) !== -1), buyIn);
      if (this.table.seatOf(bot.id) !== -1) throw new GameError('BUSY', 'Réessayez');
      const meta = this.ensureMeta(bot);
      meta.bot = true;
      meta.kicked = false;
      await this.sit(bot, seat, buyIn);
    }
    this.changed();
  }

  async removeBot(byUserId: string, botId: string): Promise<void> {
    if (!this.isRoomAdmin(byUserId)) throw new GameError('FORBIDDEN', 'Réservé aux administrateurs du salon');
    const m = this.meta.get(botId);
    if (!m?.bot) throw new GameError('NOT_BOT', "Ce joueur n'est pas un robot");
    if (this.config.mode === 'CASH') await this.standUp(botId);
    else if (this.status === 'WAITING') await this.unregister(botId);
    else throw new GameError('STARTED', 'Un robot ne peut pas quitter un tournoi en cours');
  }

  // ═══════════════════════════ Persistance ═══════════════════════════

  private enqueue<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const p = this.writeQueue.then(fn).catch((e: unknown) => {
      logger.error({ err: e, gameId: this.id }, 'Erreur de persistance');
      return undefined;
    });
    this.writeQueue = p;
    return p;
  }

  private persistHand(): void {
    const h = structuredClone(this.table.hand!);
    const stats = computeHandStats(h.events);
    const durationSec = Math.max(1, Math.round((Date.now() - h.startedAt) / 1000));
    this.enqueue(async () => {
      // Main + état de la table enregistrés ensemble (tout ou rien) : après un
      // redémarrage, l'état restauré est toujours cohérent avec l'historique.
      const snapshot = this.buildSnapshot();
      await prisma.$transaction(async (tx) => {
        const already = await tx.hand.findUnique({ where: { gameId_handNumber: { gameId: this.id, handNumber: h.handNumber } }, select: { id: true } });
        if (already) return; // déjà enregistrée (reprise après redémarrage)
        await tx.game.update({ where: { id: this.id }, data: { snapshot: snapshot as unknown as Prisma.InputJsonValue } });
        const hand = await tx.hand.create({
          data: {
            gameId: this.id, handNumber: h.handNumber, board: h.board, events: h.events as unknown as Prisma.InputJsonValue,
            potTotal: totalPot(h), startedAt: new Date(h.startedAt),
          },
        });
        await tx.handPlayer.createMany({
          data: h.players.map((p) => {
            const s = stats.find((x) => x.playerId === p.playerId)!;
            return {
              handId: hand.id, userId: p.playerId, seat: p.seat, holeCards: p.hole, shown: p.shown, net: s.net, won: s.won,
              vpip: s.vpip, pfr: s.pfr, threeBetOpportunity: s.threeBetOpportunity, threeBet: s.threeBet, sawFlop: s.sawFlop,
              wentToShowdown: s.wentToShowdown, wonAtShowdown: s.wonAtShowdown, postflopBets: s.postflopBets,
              postflopRaises: s.postflopRaises, postflopCalls: s.postflopCalls,
            };
          }),
        });
        for (const p of h.players) {
          await tx.gamePlayer.update({
            where: { gameId_userId: { gameId: this.id, userId: p.playerId } },
            data: { stack: p.stack, handsPlayed: { increment: 1 } },
          });
          await tx.user.update({ where: { id: p.playerId }, data: { playSeconds: { increment: durationSec } } });
        }
      });
    });
  }

  private async writeSnapshot(): Promise<void> {
    await prisma.game.update({ where: { id: this.id }, data: { snapshot: this.buildSnapshot() as unknown as Prisma.InputJsonValue } });
  }

  private buildSnapshot(): RuntimeSnapshot {
    const snap: RuntimeSnapshot = {
      table: this.table.snapshot(), meta: [...this.meta.values()], tournament: this.tournament ? { ...this.tournament } : null,
      actionSeq: this.actionSeq, registered: this.registered,
      bombRequestedBy: this.bombRequestedBy, lastBombHand: this.lastBombHand, bombMult: this.bombMult, bombSpin: this.bombSpin,
    };
    if (snap.tournament?.levelEndsAt) snap.tournament.levelRemainingMs = Math.max(1000, snap.tournament.levelEndsAt - Date.now());
    if (snap.tournament?.breakEndsAt) snap.tournament.levelRemainingMs = Math.max(1000, snap.tournament.breakEndsAt - Date.now());
    return snap;
  }

  private async refreshBankroll(userId: string): Promise<void> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { chips: true } });
    if (u) this.bankrolls.set(userId, u.chips);
  }

  /** Notifie un changement : diffusion (coalescée) + instantané différé. */
  private changed(): void {
    if (this.disposed) return;
    this.io.state(this);
    if (!this.snapshotTimer) {
      this.snapshotTimer = setTimeout(() => {
        this.snapshotTimer = null;
        this.enqueue(() => this.writeSnapshot());
      }, 300);
    }
  }

  private log(text: string, kind: LogLine['kind']): void {
    const line: LogLine = { id: ++this.logId, at: Date.now(), text, kind };
    this.logs.push(line);
    if (this.logs.length > 150) this.logs.shift();
    this.io.log(this.id, line);
  }

  recentLogs(): LogLine[] {
    return [...this.logs];
  }

  // ═══════════════════════════ Vues ═══════════════════════════

  /** Vue filtrée pour un utilisateur : seules SES cartes privées sont incluses. */
  viewFor(userId: string): GameView {
    const h = this.table.hand;
    const live = h && !h.finished;
    const resultVisible = this.staging.resultVisible;
    const wonBy = new Map<string, number>();
    if (h?.finished && !resultVisible) for (const a of h.awards) for (const [id, amt] of Object.entries(a.shares)) wonBy.set(id, (wonBy.get(id) ?? 0) + amt);
    const showdownIds = new Set(resultVisible ? (this.result?.shown.map((s) => s.userId) ?? []) : []);

    const seats: (PublicSeat | null)[] = this.table.seats.map((s, i) => {
      if (!s) return null;
      const m = this.meta.get(s.playerId);
      const hp = h?.players.find((p) => p.playerId === s.playerId);
      let cards: PublicSeat['cards'] = null;
      if (hp && (!h!.finished || this.result)) {
        if (hp.playerId === userId) cards = [...hp.hole];
        else if (hp.shown && (showdownIds.has(hp.playerId) || h!.events.some((e) => e.type === 'reveal' && e.hands.some((x) => x.playerId === hp.playerId)))) cards = [...hp.hole];
        else if (hp.folded || this.result?.mucked.includes(hp.playerId)) cards = null;
        else cards = [null, null];
      }
      // Pendant une main, le tapis vivant est celui de la main (mises déduites)
      const displayStack = hp && !h!.finished ? hp.stack : hp && h!.finished && !resultVisible ? hp.stack - (wonBy.get(hp.playerId) ?? 0) : s.stack;
      return {
        seat: i, userId: s.playerId, username: s.name, avatarUrl: m?.avatarUrl ?? null, stack: displayStack,
        streetBet: live && hp ? hp.streetBet : 0, inHand: !!hp && !hp.folded, folded: !!hp?.folded, allIn: !!hp?.allIn,
        sittingOut: s.sittingOut || !!m?.away, connected: m?.bot ? true : (m?.connected ?? false), cards, lastAction: m?.lastAction ?? null,
        timeBank: Math.round((m?.timeBankMs ?? 0) / 1000), isButton: !!h && h.buttonSeat === i,
        isSmallBlind: !!h && h.sbSeat === i && !h.finished && !h.bombPot, isBigBlind: !!h && h.bbSeat === i && !h.finished && !h.bombPot,
        pendingRebuy: !!m?.pendingRebuyUntil,
        isBot: !!m?.bot,
        botStyle: m?.bot ? (({ label, emoji, description }) => ({ label, emoji, description }))(BOT_STYLES[botStyleFor(s.name)]) : null,
        isStraddle: !!h && !h.finished && h.straddleSeat === i,
        waitingBB: !!s.waitBB && !s.postNow && !hp,
      };
    });

    const mySeat = this.table.seatOf(userId);
    const myHp = h?.players.find((p) => p.playerId === userId);
    const visibleBoard = h ? h.board.slice(0, h.finished ? this.staging.visibleBoard : h.board.length) : [];
    const pots = live ? this.table.currentPots() : [];
    const t = this.tournament;
    const m = this.meta.get(userId);
    let tournament: TournamentView | null = null;
    if (this.config.mode === 'TOURNAMENT') {
      const lvl = t ? this.config.blindLevels[t.levelIndex] : this.config.blindLevels[0];
      tournament = {
        level: (t?.levelIndex ?? 0) + 1,
        smallBlind: lvl?.smallBlind ?? this.config.smallBlind,
        bigBlind: lvl?.bigBlind ?? this.config.bigBlind,
        ante: lvl?.ante ?? 0,
        levelEndsAt: t?.levelEndsAt ?? null,
        onBreak: !!t?.onBreak,
        breakEndsAt: t?.breakEndsAt ?? null,
        nextLevel: this.config.blindLevels[(t?.levelIndex ?? 0) + 1] ?? null,
        registered: (t ? t.entrants : this.registered).map((id) => {
          const mm = this.meta.get(id);
          return { userId: id, username: mm?.username ?? '?', avatarUrl: mm?.avatarUrl ?? null };
        }),
        results: t ? [...t.results].sort((a, b) => a.place - b.place) : [],
        entrants: t ? t.entrants.length : this.registered.length,
        remaining: t ? this.aliveTournamentPlayers().length : this.registered.length,
        prizes: t ? t.prizes : this.config.buyIn > 0 ? prizePool(Math.max(2, this.registered.length), this.config.buyIn) : [],
      };
    }
    return {
      gameId: this.id, roomId: this.roomId, name: this.config.name, mode: this.config.mode, status: this.status,
      config: this.config, seats, board: visibleBoard, pots,
      totalPot: h && live ? totalPot(h) : 0,
      handNumber: h?.handNumber ?? 0, street: h ? h.street : null, buttonSeat: h?.buttonSeat ?? -1,
      turn: this.turn, result: resultVisible ? this.result : null, actionSeq: this.actionSeq, serverTime: Date.now(),
      me: {
        userId, seat: mySeat, cards: myHp ? [...myHp.hole] : [],
        legal: this.table.currentPlayerId() === userId && !m?.away ? this.table.legalActions(userId) : null,
        // Pendant le déroulé d'un tapis, rien ne doit trahir le résultat
        isRoomAdmin: this.isRoomAdmin(userId), canReload: resultVisible && this.reloadAmountFor(userId) > 0, reloadAmount: this.reloadAmountFor(userId),
        canRebuy: this.canRebuy(userId), canAddon: this.canAddon(userId), leavingAfterHand: !!m?.leaveAfterHand,
        bankroll: this.bankrolls.get(userId) ?? 0, registered: this.registered.includes(userId),
        postNowAmount: mySeat >= 0 && !this.table.seats[mySeat]!.postNow ? this.table.postNowAmount(userId) : 0,
        postNowRequested: mySeat >= 0 && !!this.table.seats[mySeat]!.postNow,
        canShow: !!h?.finished && resultVisible && !!this.result && !!myHp && !myHp.shown,
        runoutVote: this.runoutVote?.votes.get(userId),
        canVoteRunout: !!this.runoutVote && this.runoutVote.votes.get(userId) === null,
        bomb: {
          available: this.bombAllowed() && mySeat >= 0 && !this.bombRequestedBy && this.bombInHands() === 0,
          inHands: this.bombInHands(),
          pendingBy: this.bombRequestedBy ? (this.meta.get(this.bombRequestedBy)?.username ?? '?') : null,
          canCancel: this.bombRequestedBy === userId && !this.spinning(),
          pendingBB: this.bombRequestedBy ? this.bombMult : null,
        },
      },
      tournament,
      spectators: this.spectatorCount,
      equity: h?.finished && !resultVisible
        ? (this.equityByBoard.get(this.staging.visible2 != null ? 100 + this.staging.visible2 : this.staging.visibleBoard) ?? null)
        : this.runoutVote ? (this.runoutEquity() ?? null) : null,
      bombPot: !!h?.bombPot && !h.finished,
      bombBB: h?.bombPot && !h.finished ? (this.currentBombBB ?? Math.round(h.bombPot / h.bigBlind)) : null,
      bombSpin: this.bombSpin,
      suspense: h?.finished && !resultVisible ? (this.staging.suspense ?? null) : null,
      board2: h?.board2 ? (h.finished && !resultVisible ? (this.staging.visible2 != null ? h.board2.slice(0, this.staging.visible2) : null) : h.board2) : null,
      runout: this.runoutVote ? { deadline: this.runoutVote.deadline, votes: [...this.runoutVote.votes].map(([id, vote]) => ({ userId: id, vote })) } : null,
    };
  }

  async loadBankroll(userId: string): Promise<void> {
    if (!this.bankrolls.has(userId)) await this.refreshBankroll(userId);
  }
}

async function debitBankroll(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const r = await prisma.user.updateMany({ where: { id: userId, chips: { gte: amount } }, data: { chips: { decrement: amount } } });
  if (r.count !== 1) throw new GameError('BANKROLL', 'Solde de jetons virtuels insuffisant');
}

function actionLabel(a: ActionType, to: number, allIn: boolean): string {
  if (allIn) return 'Tapis';
  switch (a) {
    case 'fold': return 'Couché';
    case 'check': return 'Parole';
    case 'call': return 'Suit';
    case 'bet': return `Mise ${fmt(to)}`;
    case 'raise': return `Relance ${fmt(to)}`;
    default: return '';
  }
}

const SUIT_SYMBOL: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
function cardLabel(c: string): string {
  return `${c[0] === 'T' ? '10' : c[0]}${SUIT_SYMBOL[c[1]!]}`;
}
