/**
 * Statistiques agrégées, calculées en SQL à partir des mains réellement jouées
 * (table HandPlayer). Requêtes paramétrées : aucune concaténation de saisie.
 */
import { aggregate } from '@poker/engine';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { BOT_EMAIL_DOMAIN } from './bots.js';

interface CounterRow {
  hands: bigint;
  vpip: bigint;
  pfr: bigint;
  tb: bigint;
  tbopp: bigint;
  bets: bigint;
  raises: bigint;
  calls: bigint;
  sawflop: bigint;
  wtsd: bigint;
  wsd: bigint;
  won: bigint;
  net: bigint | null;
}

export async function userStats(userId: string, roomId?: string) {
  const roomFilter = roomId ? Prisma.sql`AND g."roomId" = ${roomId}` : Prisma.empty;
  const [row] = await prisma.$queryRaw<CounterRow[]>`
    SELECT COUNT(*) AS hands,
      COALESCE(SUM(hp.vpip::int),0) AS vpip, COALESCE(SUM(hp.pfr::int),0) AS pfr,
      COALESCE(SUM(hp."threeBet"::int),0) AS tb, COALESCE(SUM(hp."threeBetOpportunity"::int),0) AS tbopp,
      COALESCE(SUM(hp."postflopBets"),0) AS bets, COALESCE(SUM(hp."postflopRaises"),0) AS raises,
      COALESCE(SUM(hp."postflopCalls"),0) AS calls, COALESCE(SUM(hp."sawFlop"::int),0) AS sawflop,
      COALESCE(SUM(hp."wentToShowdown"::int),0) AS wtsd, COALESCE(SUM(hp."wonAtShowdown"::int),0) AS wsd,
      COALESCE(SUM(hp.won::int),0) AS won, SUM(hp.net) AS net
    FROM "HandPlayer" hp JOIN "Hand" h ON h.id = hp."handId" JOIN "Game" g ON g.id = h."gameId"
    WHERE hp."userId" = ${userId} ${roomFilter}`;
  const r = row!;
  const n = (v: bigint | null) => Number(v ?? 0);
  const advanced = aggregate({
    hands: n(r.hands), vpipCount: n(r.vpip), pfrCount: n(r.pfr), threeBetCount: n(r.tb), threeBetOpp: n(r.tbopp),
    postflopBets: n(r.bets), postflopRaises: n(r.raises), postflopCalls: n(r.calls), sawFlopCount: n(r.sawflop),
    wtsdCount: n(r.wtsd), wsdCount: n(r.wsd),
  });

  const gp = await prisma.gamePlayer.findMany({
    where: { userId, ...(roomId ? { game: { roomId } } : {}) },
    select: { buyIn: true, cashOut: true, stack: true, leftAt: true, place: true, prize: true, game: { select: { mode: true, status: true } } },
  });
  let cumulative = 0;
  let best: number | null = null;
  let tournamentsWon = 0;
  let tournamentsPlayed = 0;
  for (const g of gp) {
    // En cash game, le tapis encore sur la table compte comme récupérable
    const result = g.game.mode === 'CASH' ? g.cashOut + (g.leftAt ? 0 : g.stack) - g.buyIn : g.prize - g.buyIn;
    if (g.game.mode === 'TOURNAMENT') {
      if (g.game.status === 'FINISHED' || g.place) tournamentsPlayed++;
      if (g.place === 1) tournamentsWon++;
    }
    cumulative += result;
    best = best === null ? result : Math.max(best, result);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { playSeconds: true } });
  return {
    gamesPlayed: gp.length,
    handsPlayed: n(r.hands),
    handsWon: n(r.won),
    winRate: n(r.hands) ? Math.round((n(r.won) / n(r.hands)) * 1000) / 10 : 0,
    tournamentsPlayed,
    tournamentsWon,
    cumulative,
    bestResult: best ?? 0,
    handsNet: n(r.net),
    playSeconds: roomId ? null : (user?.playSeconds ?? 0),
    advanced,
  };
}

export interface LeaderRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  hands: number;
  handsWon: number;
  net: number;
  tournamentsWon: number;
}

/** Classement sur un ensemble d'utilisateurs (amis, salon) ou tous. */
export async function leaderboard(opts: { userIds?: string[]; roomId?: string }): Promise<LeaderRow[]> {
  const userFilter = opts.userIds ? Prisma.sql`AND u.id IN (${Prisma.join(opts.userIds.length ? opts.userIds : [''])})` : Prisma.empty;
  const roomFilter = opts.roomId ? Prisma.sql`AND g."roomId" = ${opts.roomId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ userId: string; username: string; avatarUrl: string | null; net: bigint | null; tw: bigint; hands: bigint; won: bigint }[]>`
    SELECT u.id AS "userId", u.username, u."avatarUrl",
      SUM(CASE WHEN g.mode = 'CASH' THEN gp."cashOut" + (CASE WHEN gp."leftAt" IS NULL THEN gp.stack ELSE 0 END) - gp."buyIn"
               ELSE gp.prize - gp."buyIn" END) AS net,
      SUM(CASE WHEN gp.place = 1 THEN 1 ELSE 0 END) AS tw,
      (SELECT COUNT(*) FROM "HandPlayer" hp JOIN "Hand" h ON h.id = hp."handId" JOIN "Game" g2 ON g2.id = h."gameId"
        WHERE hp."userId" = u.id ${opts.roomId ? Prisma.sql`AND g2."roomId" = ${opts.roomId}` : Prisma.empty}) AS hands,
      (SELECT COUNT(*) FROM "HandPlayer" hp JOIN "Hand" h ON h.id = hp."handId" JOIN "Game" g2 ON g2.id = h."gameId"
        WHERE hp."userId" = u.id AND hp.won ${opts.roomId ? Prisma.sql`AND g2."roomId" = ${opts.roomId}` : Prisma.empty}) AS won
    FROM "User" u JOIN "GamePlayer" gp ON gp."userId" = u.id JOIN "Game" g ON g.id = gp."gameId"
    WHERE u.banned = false AND u.email NOT LIKE ${'%' + BOT_EMAIL_DOMAIN} ${userFilter} ${roomFilter}
    GROUP BY u.id
    ORDER BY net DESC NULLS LAST
    LIMIT 100`;
  return rows.map((r) => ({
    userId: r.userId, username: r.username, avatarUrl: r.avatarUrl, net: Number(r.net ?? 0),
    tournamentsWon: Number(r.tw), hands: Number(r.hands), handsWon: Number(r.won),
  }));
}
