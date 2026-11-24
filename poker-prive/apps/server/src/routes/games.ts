import { createHmac } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Card, HandEvent } from '@poker/engine';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { ah, HttpError, requireAuth } from '../auth/middleware.js';
import { emitToRoom, getManager } from '../realtime/socket.js';
import { requireMember, requireRoomAdmin } from '../services/access.js';
import { buildGameConfig, GameConfigInput } from '../services/gameConfig.js';

export const gamesRouter = Router();
gamesRouter.use(requireAuth);
const id = z.string().min(1).max(40);

async function loadGame(gameId: string) {
  const g = await prisma.game.findUnique({ where: { id: gameId }, include: { room: { select: { id: true, name: true } } } });
  if (!g) throw new HttpError(404, 'Partie introuvable');
  return g;
}

gamesRouter.get('/:id', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.id));
  const m = await requireMember(g.roomId, req.user!);
  res.json({ game: { id: g.id, name: g.name, mode: g.mode, status: getManager().peek(g.id)?.status ?? g.status, room: g.room, config: g.config }, myRole: m.role });
}));

/** Modification des paramètres : uniquement avant le début de la partie. */
gamesRouter.patch('/:id', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.id));
  await requireRoomAdmin(g.roomId, req.user!);
  const rt = await getManager().get(g.id);
  if (!rt || rt.status !== 'WAITING') throw new HttpError(409, 'Paramètres modifiables uniquement avant le début');
  if (rt.table.seats.some(Boolean) || rt.registered.length) throw new HttpError(409, 'Des joueurs sont déjà inscrits ou assis');
  const parsed = GameConfigInput.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Paramètres invalides');
  const config = buildGameConfig(parsed.data);
  await prisma.game.update({ where: { id: g.id }, data: { name: config.name, mode: config.mode, config: config as unknown as Prisma.InputJsonValue, snapshot: Prisma.DbNull } });
  getManager().unload(g.id);
  emitToRoom(g.roomId, 'room:update', { roomId: g.roomId });
  res.json({ ok: true });
}));

gamesRouter.delete('/:id', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.id));
  await requireRoomAdmin(g.roomId, req.user!);
  const rt = await getManager().get(g.id);
  if (rt && rt.status !== 'FINISHED') {
    if (rt.config.mode === 'TOURNAMENT' && rt.status !== 'WAITING') throw new HttpError(409, 'Un tournoi en cours ne peut pas être supprimé');
    await rt.close(req.user!.id); // rend les jetons
    await rt.flush();
  }
  getManager().unload(g.id);
  await prisma.game.delete({ where: { id: g.id } });
  emitToRoom(g.roomId, 'room:update', { roomId: g.roomId });
  res.json({ ok: true });
}));

/** Résultats d'une partie (gains/pertes, classement final). */
gamesRouter.get('/:id/results', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.id));
  await requireMember(g.roomId, req.user!);
  const players = await prisma.gamePlayer.findMany({ where: { gameId: g.id }, include: { user: { select: { username: true, avatarUrl: true } } } });
  res.json({
    players: players.map((p) => ({
      userId: p.userId, username: p.user.username, avatarUrl: p.user.avatarUrl, buyIn: p.buyIn, cashOut: p.cashOut, stack: p.stack,
      net: g.mode === 'CASH' ? p.cashOut + (p.leftAt ? 0 : p.stack) - p.buyIn : p.prize - p.buyIn,
      place: p.place, prize: p.prize, rebuys: p.rebuys, addons: p.addons, hands: p.handsPlayed,
    })).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.net - a.net),
  });
}));

/**
 * Serveurs ICE pour WebRTC. Les identifiants TURN sont éphémères (1 h) et
 * dérivés du secret partagé coturn (« use-auth-secret ») : ils ne sont remis
 * qu'aux membres du salon de la partie.
 */
gamesRouter.get('/:id/ice', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.id));
  await requireMember(g.roomId, req.user!);
  const iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
  const stun = env.STUN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  if (stun.length) iceServers.push({ urls: stun });
  const turn = env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  if (turn.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    // Service TURN hébergé avec identifiants fixes
    iceServers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  } else if (turn.length && env.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${req.user!.id}`;
    const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls: turn, username, credential });
  }
  res.json({ iceServers });
}));

// ─── Historique des mains ───

export const handsRouter = Router();
handsRouter.use(requireAuth);

handsRouter.get('/mine', ah(async (req, res) => {
  const take = Math.min(100, Number(req.query.limit ?? 30) || 30);
  const rows = await prisma.handPlayer.findMany({
    where: { userId: req.user!.id }, orderBy: { hand: { endedAt: 'desc' } }, take,
    include: { hand: { select: { id: true, handNumber: true, board: true, potTotal: true, endedAt: true, game: { select: { id: true, name: true, mode: true, room: { select: { name: true } } } } } } },
  });
  res.json({
    hands: rows.map((r) => ({
      id: r.hand.id, handNumber: r.hand.handNumber, board: r.hand.board, pot: r.hand.potTotal, endedAt: r.hand.endedAt,
      game: r.hand.game.name, gameId: r.hand.game.id, room: r.hand.game.room.name, cards: r.holeCards, net: r.net, won: r.won,
    })),
  });
}));

handsRouter.get('/game/:gameId', ah(async (req, res) => {
  const g = await loadGame(id.parse(req.params.gameId));
  await requireMember(g.roomId, req.user!);
  const hands = await prisma.hand.findMany({
    where: { gameId: g.id }, orderBy: { handNumber: 'desc' }, take: 100,
    select: { id: true, handNumber: true, board: true, potTotal: true, endedAt: true, players: { where: { won: true }, select: { user: { select: { username: true } } } } },
  });
  res.json({ hands: hands.map((h) => ({ ...h, winners: h.players.map((p) => p.user.username), players: undefined })) });
}));

/**
 * Détail d'une main pour le replay. Les cartes privées des adversaires ne sont
 * renvoyées que si elles ont été montrées (showdown/all-in) ; un joueur voit
 * toujours les siennes. Les administrateurs du site voient tout.
 */
handsRouter.get('/:id', ah(async (req, res) => {
  const hand = await prisma.hand.findUnique({
    where: { id: id.parse(req.params.id) },
    include: { game: { select: { id: true, name: true, roomId: true, mode: true } }, players: { include: { user: { select: { username: true, avatarUrl: true } } } } },
  });
  if (!hand) throw new HttpError(404, 'Main introuvable');
  const member = await requireMember(hand.game.roomId, req.user!).catch(() => null);
  const participated = hand.players.some((p) => p.userId === req.user!.id);
  if (!member && !participated && req.user!.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé');
  const seeAll = req.user!.role === 'ADMIN';
  res.json({
    hand: {
      id: hand.id, handNumber: hand.handNumber, board: hand.board, potTotal: hand.potTotal, startedAt: hand.startedAt, endedAt: hand.endedAt,
      game: hand.game, events: hand.events as unknown as HandEvent[],
      players: hand.players.map((p) => ({
        userId: p.userId, username: p.user.username, avatarUrl: p.user.avatarUrl, seat: p.seat, net: p.net, won: p.won,
        cards: (seeAll || p.userId === req.user!.id || p.shown ? p.holeCards : []) as Card[],
      })),
    },
  });
}));
