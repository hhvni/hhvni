/**
 * Robots de test : de vrais comptes (marqués par un domaine d'e-mail réservé,
 * sans mot de passe utilisable) pilotés par le serveur. Ils passent par
 * exactement les mêmes règles que les humains (le moteur valide leurs actions).
 */
import { randomBytes, randomInt } from 'node:crypto';
import { evaluateBest, HandCategory, rankValue, suitOf, type Card, type LegalActions } from '@poker/engine';
import { prisma } from '../db.js';

export const BOT_EMAIL_DOMAIN = '@bots.cercle-prive.local';
export const isBotEmail = (email: string) => email.endsWith(BOT_EMAIL_DOMAIN);

const NAMES = ['Ada', 'Bruno', 'Chloé', 'Dédé', 'Émile', 'Fanny', 'Gaston', 'Hélène', 'Igor', 'Josette', 'Kiki', 'Lulu', 'Marcel', 'Nina', 'Oscar'];

/** Retourne un robot libre (crée le compte si besoin) avec un solde suffisant. */
export async function getBotUser(exclude: string[], minChips: number): Promise<{ id: string; username: string; avatarUrl: string | null }> {
  const existing = await prisma.user.findFirst({
    where: { email: { endsWith: BOT_EMAIL_DOMAIN }, id: { notIn: exclude.length ? exclude : [''] }, banned: false },
    orderBy: { createdAt: 'asc' },
  });
  let bot = existing;
  if (!bot) {
    const count = await prisma.user.count({ where: { email: { endsWith: BOT_EMAIL_DOMAIN } } });
    const base = `Robot ${NAMES[count % NAMES.length]}`;
    const username = count < NAMES.length ? base : `${base} ${Math.floor(count / NAMES.length) + 1}`;
    bot = await prisma.user.create({
      data: {
        email: `bot-${randomBytes(6).toString('hex')}${BOT_EMAIL_DOMAIN}`,
        username,
        passwordHash: '!robot-sans-mot-de-passe', // aucun mot de passe ne peut correspondre
        chips: 1_000_000,
      },
    });
  }
  if (bot.chips < minChips) bot = await prisma.user.update({ where: { id: bot.id }, data: { chips: 1_000_000 } });
  return { id: bot.id, username: bot.username, avatarUrl: bot.avatarUrl };
}

/** Force d'une main entre 0 et 1 (heuristique simple). */
function strength(hole: Card[], board: Card[]): number {
  if (board.length < 3) {
    const [a, b] = hole.map(rankValue).sort((x, y) => y - x) as [number, number];
    if (a === b) return Math.min(1, 0.55 + a / 30);
    let s = (a + b * 0.6) / 24;
    if (suitOf(hole[0]!) === suitOf(hole[1]!)) s += 0.06;
    if (a - b === 1) s += 0.04;
    return Math.min(0.85, s);
  }
  const e = evaluateBest([...hole, ...board]);
  const table: Record<number, number> = {
    [HandCategory.HighCard]: 0.18, [HandCategory.OnePair]: 0.45, [HandCategory.TwoPair]: 0.66, [HandCategory.ThreeOfAKind]: 0.76,
    [HandCategory.Straight]: 0.82, [HandCategory.Flush]: 0.86, [HandCategory.FullHouse]: 0.93, [HandCategory.FourOfAKind]: 0.98,
    [HandCategory.StraightFlush]: 1, [HandCategory.RoyalFlush]: 1,
  };
  let s = table[e.category] ?? 0.2;
  // Une paire formée uniquement par le board ne vaut pas grand-chose
  if (board.length === 5 && evaluateBest(board).score >= e.score) s = 0.15;
  return s;
}

export interface BotDecision {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount?: number;
}

/** Décision d'un robot à partir des seules informations dont dispose un joueur. */
export function decide(hole: Card[], board: Card[], l: LegalActions, bigBlind: number): BotDecision {
  const s = strength(hole, board) + (randomInt(1000) / 1000) * 0.18 - 0.06;
  const toCall = l.callAmount;
  const potOdds = toCall / Math.max(1, l.pot + toCall);
  const clamp = (x: number) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(x / Math.max(1, bigBlind / 2)) * Math.max(1, bigBlind / 2)));
  const roll = randomInt(100);

  if (l.canCheck) {
    if ((l.canBet || l.canRaise) && (s > 0.7 || (s > 0.5 && roll < 25) || roll < 6)) {
      const to = l.canBet ? l.pot * (0.5 + randomInt(40) / 100) : l.currentBet * 3;
      return { type: l.canBet ? 'bet' : 'raise', amount: clamp(to) };
    }
    return { type: 'check' };
  }
  if (l.canRaise && (s > 0.82 || (s > 0.65 && roll < 20))) {
    return { type: 'raise', amount: clamp(Math.max(l.currentBet * 2.5, l.currentBet + l.pot * 0.7)) };
  }
  const cheap = toCall <= bigBlind;
  if (s > potOdds + 0.2 || (cheap && s > 0.3) || (s > 0.55 && roll < 70)) return { type: 'call' };
  return { type: 'fold' };
}
