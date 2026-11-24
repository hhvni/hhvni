import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { ah, HttpError, requireAuth } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { hashToken, SESSION_COOKIE } from '../auth/sessions.js';
import { isOnline } from '../realtime/socket.js';
import { userHud, userStats } from '../services/stats.js';
import { BOT_EMAIL_DOMAIN } from '../services/bots.js';
import { UsernameSchema } from './auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

export const uploadDir = resolve(process.cwd(), env.UPLOAD_DIR);

/** Recharge gratuite du solde virtuel : jusqu'à 10 000 jetons, une fois par 24 h, si le solde est bas. */
const REFILL_TARGET = 10_000;
const REFILL_THRESHOLD = 2_000;

usersRouter.get('/me', ah(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, username: true, email: true, role: true, avatarUrl: true, chips: true, createdAt: true, lastRefillAt: true },
  });
  const nextRefill = u.lastRefillAt ? new Date(u.lastRefillAt.getTime() + 86400_000) : null;
  res.json({
    user: u,
    stats: await userStats(u.id),
    refill: { available: u.chips < REFILL_THRESHOLD && (!nextRefill || nextRefill < new Date()), target: REFILL_TARGET, threshold: REFILL_THRESHOLD, nextAt: nextRefill },
  });
}));

usersRouter.patch('/me', ah(async (req, res) => {
  const body = z.object({
    username: UsernameSchema.optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  }).parse(req.body);
  const data: { username?: string; passwordHash?: string } = {};
  if (body.username) {
    const taken = await prisma.user.findFirst({ where: { username: { equals: body.username, mode: 'insensitive' }, NOT: { id: req.user!.id } } });
    if (taken) throw new HttpError(409, 'Ce pseudonyme est déjà pris');
    data.username = body.username;
  }
  if (body.newPassword) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, u.passwordHash))) throw new HttpError(400, 'Mot de passe actuel incorrect');
    data.passwordHash = await hashPassword(body.newPassword);
  }
  const u = await prisma.user.update({ where: { id: req.user!.id }, data, select: { id: true, username: true, avatarUrl: true, role: true } });
  // Changement de mot de passe : toutes les autres sessions sont révoquées
  if (data.passwordHash) await prisma.session.deleteMany({ where: { userId: u.id, NOT: { tokenHash: hashToken(req.cookies?.[SESSION_COOKIE] ?? '') } } });
  res.json({ user: u });
}));

/**
 * Avatar : image envoyée en data URL (déjà redimensionnée côté client).
 * Le type est vérifié par signature binaire, pas par l'extension déclarée.
 */
usersRouter.post('/me/avatar', ah(async (req, res) => {
  const { dataUrl } = z.object({ dataUrl: z.string().max(700_000) }).parse(req.body);
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Format accepté : PNG, JPEG ou WebP');
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > 512 * 1024) throw new HttpError(400, 'Image trop lourde (512 Ko max)');
  const sig = buf.subarray(0, 12);
  const isPng = sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  const isWebp = sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP';
  const ext = isPng ? 'png' : isJpeg ? 'jpg' : isWebp ? 'webp' : null;
  if (!ext) throw new HttpError(400, 'Fichier image invalide');
  await mkdir(uploadDir, { recursive: true });
  const name = `${req.user!.id}-${randomBytes(6).toString('hex')}.${ext}`;
  await writeFile(join(uploadDir, name), buf);
  const old = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarUrl: true } });
  const avatarUrl = `/uploads/${name}`;
  await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl } });
  if (old?.avatarUrl?.startsWith('/uploads/')) await unlink(join(uploadDir, old.avatarUrl.slice('/uploads/'.length).replace(/[^\w.-]/g, ''))).catch(() => undefined);
  res.json({ avatarUrl });
}));

usersRouter.delete('/me/avatar', ah(async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: null } });
  res.json({ ok: true });
}));

usersRouter.post('/me/refill', ah(async (req, res) => {
  const cutoff = new Date(Date.now() - 86400_000);
  const r = await prisma.user.updateMany({
    where: { id: req.user!.id, chips: { lt: REFILL_THRESHOLD }, OR: [{ lastRefillAt: null }, { lastRefillAt: { lt: cutoff } }] },
    data: { chips: REFILL_TARGET, lastRefillAt: new Date() },
  });
  if (r.count !== 1) throw new HttpError(400, `Recharge possible une fois par jour si votre solde est inférieur à ${REFILL_THRESHOLD.toLocaleString('fr-FR')}`);
  res.json({ chips: REFILL_TARGET });
}));

usersRouter.get('/search', ah(async (req, res) => {
  const q = z.string().trim().min(2).max(20).parse(req.query.q);
  const users = await prisma.user.findMany({
    where: { username: { contains: q, mode: 'insensitive' }, banned: false, NOT: [{ id: req.user!.id }, { email: { endsWith: BOT_EMAIL_DOMAIN } }] },
    select: { id: true, username: true, avatarUrl: true }, take: 10,
  });
  res.json({ users: users.map((u) => ({ ...u, online: isOnline(u.id) })) });
}));

// ─── Notes personnelles sur les joueurs (visibles seulement par leur auteur) ───

const NOTE_COLORS = ['none', 'red', 'orange', 'green', 'blue', 'purple'] as const;
const NoteInput = z.object({ text: z.string().max(1000).default(''), color: z.enum(NOTE_COLORS).default('none') });

usersRouter.get('/notes', ah(async (req, res) => {
  const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const notes = ids.length
    ? await prisma.playerNote.findMany({ where: { authorId: req.user!.id, targetId: { in: ids } }, select: { targetId: true, text: true, color: true } })
    : [];
  res.json({ notes: Object.fromEntries(notes.map((n) => [n.targetId, { text: n.text, color: n.color }])) });
}));

usersRouter.put('/:id/note', ah(async (req, res) => {
  const targetId = z.string().max(40).parse(req.params.id);
  if (targetId === req.user!.id) throw new HttpError(400, 'Pas de note sur soi-même');
  const parsed = NoteInput.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Note invalide');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw new HttpError(404, 'Joueur introuvable');
  const { text, color } = parsed.data;
  if (!text.trim() && color === 'none') {
    await prisma.playerNote.deleteMany({ where: { authorId: req.user!.id, targetId } });
    return res.json({ note: null });
  }
  const note = await prisma.playerNote.upsert({
    where: { authorId_targetId: { authorId: req.user!.id, targetId } },
    create: { authorId: req.user!.id, targetId, text: text.trim(), color },
    update: { text: text.trim(), color },
    select: { text: true, color: true },
  });
  res.json({ note });
}));

/** Statistiques compactes affichées au survol d'un joueur à la table. */
usersRouter.get('/:id/hud', ah(async (req, res) => {
  const id = z.string().max(40).parse(req.params.id);
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId.slice(0, 40) : undefined;
  res.json({ hud: await userHud(id, roomId) });
}));

usersRouter.get('/:id', ah(async (req, res) => {
  const id = z.string().max(40).parse(req.params.id);
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, avatarUrl: true, createdAt: true, banned: true } });
  if (!u || u.banned) throw new HttpError(404, 'Joueur introuvable');
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
  res.json({ user: { ...u, online: isOnline(u.id) }, stats: await userStats(u.id, roomId) });
}));
