import { randomInt } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { ah, HttpError, requireAuth } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { emitToRoom, getManager, isOnline, notifyUser } from '../realtime/socket.js';
import { audit, requireMember, requireRoomAdmin } from '../services/access.js';
import { buildGameConfig, GameConfigInput, PRESETS } from '../services/gameConfig.js';
import { friendIds } from './friends.js';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const joinLimiter = rateLimit({ windowMs: 10 * 60_000, limit: env.NODE_ENV === 'test' ? 10_000 : 40, message: { error: 'Trop de tentatives' } });

/** Code d'invitation lisible (sans caractères ambigus), généré par CSPRNG. */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

const id = () => z.string().min(1).max(40);

roomsRouter.get('/', ah(async (req, res) => {
  const rooms = await prisma.room.findMany({
    where: { members: { some: { userId: req.user!.id, banned: false } } },
    include: {
      _count: { select: { members: { where: { banned: false } } } },
      members: { where: { userId: req.user!.id }, select: { role: true } },
      games: { where: { status: { not: 'FINISHED' } }, select: { id: true, name: true, mode: true, status: true } },
      owner: { select: { username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    rooms: rooms.map((r) => ({
      id: r.id, name: r.name, owner: r.owner.username, members: r._count.members, maxPlayers: r.maxPlayers,
      role: r.members[0]?.role ?? 'PLAYER', hasPassword: !!r.passwordHash, activeGames: r.games,
      seated: r.games.reduce((n, g) => n + (getManager().peek(g.id)?.table.seats.filter(Boolean).length ?? 0), 0),
    })),
  });
}));

roomsRouter.post('/', ah(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(40),
    password: z.string().max(100).optional().transform((v) => (v ? v : undefined)),
    maxPlayers: z.coerce.number().int().min(2).max(50).default(10),
  }).parse(req.body);
  const room = await prisma.room.create({
    data: {
      name: body.name, ownerId: req.user!.id, inviteCode: inviteCode(), maxPlayers: body.maxPlayers,
      passwordHash: body.password ? await hashPassword(body.password) : null,
      members: { create: { userId: req.user!.id, role: 'OWNER' } },
    },
  });
  await audit('room.create', req.user!.id, room.id);
  res.status(201).json({ room: { id: room.id, inviteCode: room.inviteCode } });
}));

/** Aperçu d'un salon à partir d'un code (page d'invitation). */
roomsRouter.get('/invite/:code', ah(async (req, res) => {
  const code = z.string().trim().toUpperCase().max(20).parse(req.params.code);
  const room = await prisma.room.findUnique({ where: { inviteCode: code }, include: { owner: { select: { username: true } }, _count: { select: { members: { where: { banned: false } } } } } });
  if (!room) throw new HttpError(404, "Code d'invitation invalide");
  const member = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.user!.id } } });
  res.json({ room: { id: room.id, name: room.name, owner: room.owner.username, members: room._count.members, maxPlayers: room.maxPlayers, hasPassword: !!room.passwordHash, isMember: !!member && !member.banned } });
}));

roomsRouter.post('/join', joinLimiter, ah(async (req, res) => {
  const { code, password } = z.object({ code: z.string().trim().toUpperCase().min(4).max(20), password: z.string().max(100).optional() }).parse(req.body);
  const room = await prisma.room.findUnique({ where: { inviteCode: code }, include: { _count: { select: { members: { where: { banned: false } } } } } });
  if (!room) throw new HttpError(404, "Code d'invitation invalide");
  const existing = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.user!.id } } });
  if (existing?.banned) throw new HttpError(403, 'Vous avez été banni de ce salon');
  if (existing) return res.json({ roomId: room.id });
  // Les invitations directes d'un membre dispensent du mot de passe
  const invited = await prisma.invitation.findFirst({ where: { roomId: room.id, toId: req.user!.id } });
  if (room.passwordHash && !invited) {
    if (!password || !(await verifyPassword(password, room.passwordHash))) throw new HttpError(403, 'Mot de passe du salon incorrect', 'BAD_PASSWORD');
  }
  if (room._count.members >= room.maxPlayers) throw new HttpError(403, 'Ce salon est complet');
  await prisma.roomMember.create({ data: { roomId: room.id, userId: req.user!.id } });
  emitToRoom(room.id, 'room:update', { roomId: room.id });
  await audit('room.join', req.user!.id, room.id, undefined, req.ip);
  res.json({ roomId: room.id });
}));

roomsRouter.get('/:id', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  const me = await requireMember(roomId, req.user!);
  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } }, orderBy: { joinedAt: 'asc' } },
      games: { orderBy: { createdAt: 'desc' }, take: 30, include: { _count: { select: { players: true, hands: true } } } },
    },
  });
  const isAdmin = me.role !== 'PLAYER';
  res.json({
    room: {
      id: room.id, name: room.name, ownerId: room.ownerId, maxPlayers: room.maxPlayers, rules: room.rules,
      hasPassword: !!room.passwordHash, inviteCode: room.inviteCode, createdAt: room.createdAt,
    },
    myRole: me.role,
    members: room.members
      .filter((m) => isAdmin || !m.banned)
      .map((m) => ({ userId: m.userId, username: m.user.username, avatarUrl: m.user.avatarUrl, role: m.role, banned: m.banned, online: isOnline(m.userId), joinedAt: m.joinedAt })),
    games: room.games.map((g) => {
      const rt = getManager().peek(g.id);
      const cfg = g.config as { smallBlind: number; bigBlind: number; maxSeats: number; startingStack: number; buyIn: number };
      return {
        id: g.id, name: g.name, mode: g.mode, status: rt?.status ?? g.status, createdAt: g.createdAt,
        smallBlind: cfg.smallBlind, bigBlind: cfg.bigBlind, maxSeats: cfg.maxSeats, startingStack: cfg.startingStack, buyIn: cfg.buyIn,
        seated: rt ? rt.table.seats.filter(Boolean).length : 0,
        registered: rt ? rt.registered.length : g._count.players, hands: g._count.hands,
      };
    }),
  });
}));

roomsRouter.patch('/:id', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  await requireRoomAdmin(roomId, req.user!);
  const body = z.object({
    name: z.string().trim().min(2).max(40).optional(),
    password: z.string().max(100).nullable().optional(),
    maxPlayers: z.coerce.number().int().min(2).max(50).optional(),
    rules: z.string().max(2000).optional(),
  }).parse(req.body);
  const data: Prisma.RoomUpdateInput = {};
  if (body.name) data.name = body.name;
  if (body.maxPlayers) data.maxPlayers = body.maxPlayers;
  if (body.rules !== undefined) data.rules = body.rules;
  if (body.password !== undefined) data.passwordHash = body.password ? await hashPassword(body.password) : null;
  await prisma.room.update({ where: { id: roomId }, data });
  emitToRoom(roomId, 'room:update', { roomId });
  res.json({ ok: true });
}));

roomsRouter.delete('/:id', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { games: { select: { id: true } } } });
  if (!room) throw new HttpError(404, 'Salon introuvable');
  if (room.ownerId !== req.user!.id && req.user!.role !== 'ADMIN') throw new HttpError(403, 'Seul le créateur peut supprimer le salon');
  await deleteRoom(roomId);
  await audit('room.delete', req.user!.id, roomId);
  res.json({ ok: true });
}));

/** Supprime un salon en rendant d'abord les jetons des joueurs assis. */
export async function deleteRoom(roomId: string): Promise<void> {
  const games = await prisma.game.findMany({ where: { roomId, status: { not: 'FINISHED' } } });
  for (const g of games) {
    const rt = await getManager().get(g.id);
    if (rt && rt.table.hand && !rt.table.hand.finished) throw new HttpError(409, `Une main est en cours sur « ${g.name} » : mettez la partie en pause d'abord`);
  }
  // Remboursement : jetons sur les tables cash, inscriptions des tournois
  const gps = await prisma.gamePlayer.findMany({ where: { game: { roomId, status: { not: 'FINISHED' } }, leftAt: null }, include: { game: true } });
  await prisma.$transaction(gps.map((gp) => prisma.user.update({
    where: { id: gp.userId },
    data: { chips: { increment: gp.game.mode === 'CASH' ? gp.stack : gp.place ? 0 : gp.buyIn } },
  })));
  for (const g of games) getManager().unload(g.id);
  emitToRoom(roomId, 'room:deleted', { roomId });
  await prisma.room.delete({ where: { id: roomId } });
}

roomsRouter.post('/:id/leave', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  const me = await requireMember(roomId, req.user!);
  if (me.role === 'OWNER') throw new HttpError(400, 'Le créateur ne peut pas quitter son salon (supprimez-le ou transférez-le)');
  const seated = (await prisma.game.findMany({ where: { roomId, status: { not: 'FINISHED' } }, select: { id: true } }))
    .some((g) => (getManager().peek(g.id)?.table.seatOf(req.user!.id) ?? -1) !== -1);
  if (seated) throw new HttpError(400, "Quittez d'abord les tables où vous êtes assis");
  await prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId: req.user!.id } } });
  emitToRoom(roomId, 'room:update', { roomId });
  res.json({ ok: true });
}));

roomsRouter.post('/:id/regenerate-code', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  await requireRoomAdmin(roomId, req.user!);
  const room = await prisma.room.update({ where: { id: roomId }, data: { inviteCode: inviteCode() } });
  res.json({ inviteCode: room.inviteCode });
}));

roomsRouter.post('/:id/invite', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  await requireMember(roomId, req.user!);
  const { userId, gameId } = z.object({ userId: id(), gameId: id().optional() }).parse(req.body);
  const friends = await friendIds(req.user!.id);
  if (!friends.includes(userId)) throw new HttpError(403, 'Vous ne pouvez inviter que vos amis');
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
  const inv = await prisma.invitation.create({ data: { roomId, fromId: req.user!.id, toId: userId, gameId: gameId ?? null } });
  notifyUser(userId, 'invite', { id: inv.id, roomId, roomName: room.name, from: req.user!.username, code: room.inviteCode, gameId: gameId ?? null });
  res.json({ ok: true });
}));

const MemberParams = z.object({ id: id(), userId: id() });

roomsRouter.post('/:id/members/:userId/role', ah(async (req, res) => {
  const { id: roomId, userId } = MemberParams.parse(req.params);
  const me = await requireRoomAdmin(roomId, req.user!);
  const { role } = z.object({ role: z.enum(['ADMIN', 'PLAYER']) }).parse(req.body);
  if (me.role !== 'OWNER' && req.user!.role !== 'ADMIN') throw new HttpError(403, 'Seul le créateur peut nommer des administrateurs');
  const target = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!target || target.role === 'OWNER') throw new HttpError(400, 'Modification impossible');
  await prisma.roomMember.update({ where: { id: target.id }, data: { role } });
  await getManager().refreshAdmins(roomId);
  emitToRoom(roomId, 'room:update', { roomId });
  res.json({ ok: true });
}));

async function moderate(roomId: string, actor: { id: string; role: string }, userId: string, ban: boolean | null): Promise<void> {
  await requireRoomAdmin(roomId, actor);
  const target = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!target) throw new HttpError(404, 'Membre introuvable');
  if (target.role === 'OWNER') throw new HttpError(403, 'Impossible de modérer le créateur du salon');
  if (target.role === 'ADMIN') {
    const actorM = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId: actor.id } } });
    if (actorM?.role !== 'OWNER' && actor.role !== 'ADMIN') throw new HttpError(403, 'Seul le créateur peut modérer un administrateur');
  }
  // Exclusion des tables actives du salon
  const games = await prisma.game.findMany({ where: { roomId, status: { not: 'FINISHED' } }, select: { id: true } });
  for (const g of games) {
    const rt = getManager().peek(g.id);
    if (rt && (rt.table.seatOf(userId) !== -1 || rt.registered.includes(userId))) await rt.kick(actor.id, userId).catch(() => undefined);
  }
  if (ban === null) await prisma.roomMember.delete({ where: { id: target.id } });
  else await prisma.roomMember.update({ where: { id: target.id }, data: { banned: ban } });
  await getManager().refreshAdmins(roomId);
  notifyUser(userId, 'room:removed', { roomId, banned: !!ban });
  emitToRoom(roomId, 'room:update', { roomId });
  await audit(ban ? 'room.ban' : ban === false ? 'room.unban' : 'room.kick', actor.id, userId, { roomId });
}

roomsRouter.post('/:id/members/:userId/kick', ah(async (req, res) => {
  const { id: roomId, userId } = MemberParams.parse(req.params);
  await moderate(roomId, req.user!, userId, null);
  res.json({ ok: true });
}));
roomsRouter.post('/:id/members/:userId/ban', ah(async (req, res) => {
  const { id: roomId, userId } = MemberParams.parse(req.params);
  await moderate(roomId, req.user!, userId, true);
  res.json({ ok: true });
}));
roomsRouter.post('/:id/members/:userId/unban', ah(async (req, res) => {
  const { id: roomId, userId } = MemberParams.parse(req.params);
  await requireRoomAdmin(roomId, req.user!);
  await prisma.roomMember.update({ where: { roomId_userId: { roomId, userId } }, data: { banned: false } });
  emitToRoom(roomId, 'room:update', { roomId });
  res.json({ ok: true });
}));

roomsRouter.get('/:id/messages', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  await requireMember(roomId, req.user!);
  const msgs = await prisma.chatMessage.findMany({
    where: { roomId, gameId: null }, orderBy: { createdAt: 'desc' }, take: 60,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });
  res.json({
    messages: msgs.reverse().map((m) => ({ id: m.id, userId: m.userId, username: m.user?.username ?? null, avatarUrl: m.user?.avatarUrl ?? null, kind: m.kind, text: m.text, createdAt: m.createdAt })),
  });
}));

// ─── Parties (tables) d'un salon ───

roomsRouter.get('/:id/presets', (_req, res) => {
  res.json({ presets: PRESETS });
});

roomsRouter.post('/:id/games', ah(async (req, res) => {
  const roomId = id().parse(req.params.id);
  await requireRoomAdmin(roomId, req.user!);
  const parsed = GameConfigInput.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Paramètres invalides');
  let config;
  try {
    config = buildGameConfig(parsed.data);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const active = await prisma.game.count({ where: { roomId, status: { not: 'FINISHED' } } });
  if (active >= 10) throw new HttpError(400, 'Maximum 10 tables actives par salon');
  const game = await prisma.game.create({
    data: { roomId, name: config.name, mode: config.mode, config: config as unknown as Prisma.InputJsonValue, createdById: req.user!.id },
  });
  emitToRoom(roomId, 'room:update', { roomId });
  await audit('game.create', req.user!.id, game.id, { roomId, mode: config.mode });
  res.status(201).json({ game: { id: game.id } });
}));
