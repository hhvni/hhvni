/**
 * Types partagés entre le serveur et le navigateur (protocole temps réel).
 * Le navigateur ne reçoit que des vues filtrées : jamais le paquet, jamais les
 * cartes privées des autres joueurs (sauf cartes montrées publiquement).
 */
import type { Card } from './cards.js';
import type { LegalActions, Street } from './table.js';
import type { BlindLevel } from './tournament.js';

export type GameMode = 'CASH' | 'TOURNAMENT';
export type GameStatus = 'WAITING' | 'RUNNING' | 'PAUSED' | 'FINISHED';
export type ReloadMode = 'none' | 'busted' | 'below';
export type UiLevel = 'simple' | 'standard' | 'expert';

export interface GameConfig {
  name: string;
  mode: GameMode;
  maxSeats: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** Délai maximum par action (secondes). */
  actionSeconds: number;
  /** Réserve de temps par joueur (secondes). */
  timeBankSeconds: number;
  /** Cash game : cave minimum / maximum. */
  minBuyIn: number;
  maxBuyIn: number;
  /** Cash game : règle de recharge. */
  reloadMode: ReloadMode;
  /** Tournoi : coût d'inscription en jetons virtuels (0 = gratuit). */
  buyIn: number;
  levelMinutes: number;
  blindLevels: BlindLevel[];
  rebuyAllowed: boolean;
  rebuyUntilLevel: number;
  addonAllowed: boolean;
  addonStack: number;
  uiLevel: UiLevel;
}

export interface PublicSeat {
  seat: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  stack: number;
  streetBet: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  connected: boolean;
  /** null = pas de cartes ; [null, null] = cartes cachées ; sinon cartes visibles */
  cards: (Card | null)[] | null;
  lastAction: string | null;
  timeBank: number;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  pendingRebuy: boolean;
  isBot: boolean;
}

export interface TurnInfo {
  seat: number;
  userId: string;
  /** Horodatage serveur (ms epoch) de fin du délai courant. */
  deadline: number;
  usingTimeBank: boolean;
  totalMs: number;
}

export interface HandResultView {
  handNumber: number;
  pots: { amount: number; winners: string[]; description: string | null }[];
  shown: { userId: string; cards: Card[]; description: string; best: Card[] }[];
}

export interface TournamentView {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  levelEndsAt: number | null;
  onBreak: boolean;
  breakEndsAt: number | null;
  nextLevel: BlindLevel | null;
  registered: { userId: string; username: string; avatarUrl: string | null }[];
  results: { userId: string; username: string; place: number; prize: number }[];
  entrants: number;
  remaining: number;
  prizes: number[];
}

export interface GameView {
  gameId: string;
  roomId: string;
  name: string;
  mode: GameMode;
  status: GameStatus;
  config: GameConfig;
  seats: (PublicSeat | null)[];
  board: Card[];
  pots: { amount: number; eligible: string[] }[];
  totalPot: number;
  handNumber: number;
  street: Street | null;
  buttonSeat: number;
  turn: TurnInfo | null;
  result: HandResultView | null;
  actionSeq: number;
  serverTime: number;
  me: {
    userId: string;
    seat: number;
    cards: Card[];
    legal: LegalActions | null;
    isRoomAdmin: boolean;
    canReload: boolean;
    reloadAmount: number;
    canRebuy: boolean;
    canAddon: boolean;
    leavingAfterHand: boolean;
    bankroll: number;
    registered: boolean;
  };
  tournament: TournamentView | null;
  spectators: number;
  /** Probabilités de gain pendant le déroulé d'un tapis (cartes dévoilées). */
  equity: { userId: string; win: number; tie: number }[] | null;
}

export interface LogLine {
  id: number;
  at: number;
  text: string;
  kind: 'system' | 'action' | 'win' | 'hand';
}

export interface ChatMessageView {
  id: string;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  kind: 'USER' | 'SYSTEM';
  text: string;
  createdAt: string;
}

export const REACTIONS = ['👍', '😂', '😮', '🔥', '😭', '👏', '🤔', '😎'] as const;
