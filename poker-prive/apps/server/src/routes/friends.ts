import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, HttpError, requireAuth } from '../auth/middleware.js';
import { isOnline, notifyUser } from '../realtime/socket.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

export async function friendIds(userId: string): Promise<string[]> {
  const f = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return f.map((x) => (x.requesterId === userId ? x.addresseeId : x.requesterId));
}

friendsRouter.get('/', ah(async (req, res) => {
  const me = req.user!.id;
  const all = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: me }, { addresseeId: me }] },
    include: {
      requester: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
      addressee: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const f of all) {
    const other = f.requesterId === me ? f.addressee : f.requester;
    const item = { friendshipId: f.id, ...other, online: isOnline(other.id) };
    if (f.status === 'ACCEPTED') friends.push(item);
    else if (f.addresseeId === me) incoming.push(item);
    else outgoing.push(item);
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  res.json({ friends, incoming, outgoing });
}));

friendsRouter.post('/request', ah(async (req, res) => {
  const { username } = z.object({ username: z.string().trim().min(1).max(20) }).parse(req.body);
  const me = req.user!.id;
  const target = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' }, banned: false } });
  if (!target) throw new HttpError(404, 'Joueur introuvable');
  if (target.id === me) throw new HttpError(400, 'Vous ne pouvez pas vous ajouter vous-même');
  const existing = await prisma.friendship.findFirst({
    where: { OR: [{ requesterId: me, addresseeId: target.id }, { requesterId: target.id, addresseeId: me }] },
  });
  if (existing) {
    // Demande croisée : acceptation automatique
    if (existing.status === 'PENDING' && existing.addresseeId === me) {
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
      notifyUser(target.id, 'friends:update', {});
      return res.json({ status: 'ACCEPTED' });
    }
    throw new HttpError(409, existing.status === 'ACCEPTED' ? 'Vous êtes déjà amis' : 'Demande déjà envoyée');
  }
  await prisma.friendship.create({ data: { requesterId: me, addresseeId: target.id } });
  notifyUser(target.id, 'friends:update', { request: req.user!.username });
  res.status(201).json({ status: 'PENDING' });
}));

friendsRouter.post('/:id/accept', ah(async (req, res) => {
  const f = await prisma.friendship.findUnique({ where: { id: z.string().max(40).parse(req.params.id) } });
  if (!f || f.addresseeId !== req.user!.id || f.status !== 'PENDING') throw new HttpError(404, 'Demande introuvable');
  await prisma.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED' } });
  notifyUser(f.requesterId, 'friends:update', {});
  res.json({ ok: true });
}));

friendsRouter.delete('/:id', ah(async (req, res) => {
  const f = await prisma.friendship.findUnique({ where: { id: z.string().max(40).parse(req.params.id) } });
  if (!f || (f.addresseeId !== req.user!.id && f.requesterId !== req.user!.id)) throw new HttpError(404, 'Introuvable');
  await prisma.friendship.delete({ where: { id: f.id } });
  notifyUser(f.requesterId === req.user!.id ? f.addresseeId : f.requesterId, 'friends:update', {});
  res.json({ ok: true });
}));
