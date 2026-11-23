import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, requireAuth } from '../auth/middleware.js';
import { isOnline, onlineUserIds } from '../realtime/socket.js';
import { requireMember } from '../services/access.js';
import { leaderboard } from '../services/stats.js';
import { friendIds } from './friends.js';

export const statsRouter = Router();
statsRouter.use(requireAuth);

/** Classement : entre amis (par défaut), par salon, ou global. */
statsRouter.get('/leaderboard', ah(async (req, res) => {
  const q = z.object({ scope: z.enum(['friends', 'room', 'global']).default('friends'), roomId: z.string().max(40).optional() }).parse(req.query);
  let rows;
  if (q.scope === 'room' && q.roomId) {
    await requireMember(q.roomId, req.user!);
    rows = await leaderboard({ roomId: q.roomId });
  } else if (q.scope === 'global') {
    rows = await leaderboard({});
  } else {
    rows = await leaderboard({ userIds: [req.user!.id, ...(await friendIds(req.user!.id))] });
  }
  res.json({ rows: rows.map((r, i) => ({ rank: i + 1, ...r, online: isOnline(r.userId) })) });
}));

/** Invitations reçues (non vues). */
statsRouter.get('/invitations', ah(async (req, res) => {
  const inv = await prisma.invitation.findMany({
    where: { toId: req.user!.id, seen: false }, orderBy: { createdAt: 'desc' }, take: 20,
    include: { room: { select: { name: true, inviteCode: true } }, from: { select: { username: true } } },
  });
  res.json({ invitations: inv.map((i) => ({ id: i.id, roomId: i.roomId, roomName: i.room.name, code: i.room.inviteCode, from: i.from.username, gameId: i.gameId, createdAt: i.createdAt })) });
}));

statsRouter.post('/invitations/:id/seen', ah(async (req, res) => {
  await prisma.invitation.updateMany({ where: { id: z.string().max(40).parse(req.params.id), toId: req.user!.id }, data: { seen: true } });
  res.json({ ok: true });
}));

statsRouter.get('/online', ah(async (_req, res) => {
  res.json({ count: onlineUserIds().length });
}));
