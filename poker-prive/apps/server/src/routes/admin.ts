/** Espace administrateur du site (rôle ADMIN). Toutes les actions sont journalisées. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, HttpError, requireAdmin } from '../auth/middleware.js';
import { getManager, isOnline, notifyUser, onlineUserIds } from '../realtime/socket.js';
import { audit } from '../services/access.js';
import { deleteRoom } from './rooms.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);
const id = z.string().min(1).max(40);

adminRouter.get('/overview', ah(async (_req, res) => {
  const [users, rooms, games, hands, chips] = await Promise.all([
    prisma.user.count(), prisma.room.count(), prisma.game.count(), prisma.hand.count(), prisma.user.aggregate({ _sum: { chips: true } }),
  ]);
  const live = getManager().all().filter((g) => g.status === 'RUNNING');
  res.json({
    users, rooms, games, hands, online: onlineUserIds().length, liveTables: live.length,
    totalChips: chips._sum.chips ?? 0,
    liveGames: live.map((g) => ({ id: g.id, name: g.config.name, mode: g.config.mode, players: g.table.seats.filter(Boolean).length, hand: g.table.handNumber })),
  });
}));

adminRouter.get('/users', ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : '';
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {},
    orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, username: true, email: true, role: true, banned: true, chips: true, createdAt: true, lastSeenAt: true, _count: { select: { handPlayers: true } } },
  });
  res.json({ users: users.map((u) => ({ ...u, hands: u._count.handPlayers, online: isOnline(u.id) })) });
}));

adminRouter.post('/users/:id', ah(async (req, res) => {
  const userId = id.parse(req.params.id);
  const body = z.object({
    banned: z.boolean().optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    chipsDelta: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  }).parse(req.body);
  if (userId === req.user!.id && (body.banned || body.role === 'USER')) throw new HttpError(400, 'Vous ne pouvez pas vous retirer vos propres droits');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const data: { banned?: boolean; role?: 'USER' | 'ADMIN'; chips?: number } = {};
  if (body.banned !== undefined) data.banned = body.banned;
  if (body.role) data.role = body.role;
  if (body.chipsDelta) data.chips = Math.max(0, user.chips + body.chipsDelta);
  await prisma.user.update({ where: { id: userId }, data });
  if (body.banned) {
    await prisma.session.deleteMany({ where: { userId } });
    notifyUser(userId, 'account:banned', {});
    for (const rt of getManager().all()) if (rt.table.seatOf(userId) !== -1 || rt.registered.includes(userId)) await rt.kick(req.user!.id, userId).catch(() => undefined);
  }
  await audit('admin.user_update', req.user!.id, userId, body);
  res.json({ ok: true });
}));

adminRouter.get('/rooms', ah(async (_req, res) => {
  const rooms = await prisma.room.findMany({
    orderBy: { createdAt: 'desc' }, take: 200,
    include: { owner: { select: { username: true } }, _count: { select: { members: true, games: true } } },
  });
  res.json({ rooms: rooms.map((r) => ({ id: r.id, name: r.name, owner: r.owner.username, members: r._count.members, games: r._count.games, createdAt: r.createdAt, inviteCode: r.inviteCode })) });
}));

adminRouter.delete('/rooms/:id', ah(async (req, res) => {
  const roomId = id.parse(req.params.id);
  await deleteRoom(roomId);
  await audit('admin.room_delete', req.user!.id, roomId);
  res.json({ ok: true });
}));

adminRouter.get('/hands', ah(async (_req, res) => {
  const hands = await prisma.hand.findMany({
    orderBy: { endedAt: 'desc' }, take: 100,
    select: { id: true, handNumber: true, potTotal: true, board: true, endedAt: true, game: { select: { name: true, room: { select: { name: true } } } }, _count: { select: { players: true } } },
  });
  res.json({ hands: hands.map((h) => ({ id: h.id, handNumber: h.handNumber, pot: h.potTotal, board: h.board, endedAt: h.endedAt, game: h.game.name, room: h.game.room.name, players: h._count.players })) });
}));

adminRouter.get('/audit', ah(async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ logs });
}));
