import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { adminEmails, env } from '../config.js';
import { ah, HttpError } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, destroySession, SESSION_COOKIE } from '../auth/sessions.js';
import { audit } from '../services/access.js';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: env.NODE_ENV === 'test' ? 10_000 : 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez plus tard' } });

export const UsernameSchema = z.string().trim().min(3, 'Pseudonyme : 3 caractères minimum').max(20, 'Pseudonyme : 20 caractères maximum')
  .regex(/^[\p{L}\p{N}_.-]+$/u, 'Pseudonyme : lettres, chiffres, _ . - uniquement');

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail invalide').max(120),
  username: UsernameSchema,
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
});
const LoginSchema = z.object({ login: z.string().trim().min(1).max(120), password: z.string().min(1).max(200) });

authRouter.post('/register', limiter, ah(async (req, res) => {
  const data = RegisterSchema.parse(req.body);
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { username: { equals: data.username, mode: 'insensitive' } }] },
    select: { email: true },
  });
  if (exists) throw new HttpError(409, exists.email === data.email ? 'Cet e-mail est déjà utilisé' : 'Ce pseudonyme est déjà pris', 'CONFLICT');
  const isFirst = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      email: data.email, username: data.username, passwordHash: await hashPassword(data.password),
      chips: env.STARTING_BANKROLL,
      role: isFirst || adminEmails.has(data.email) ? 'ADMIN' : 'USER',
    },
  });
  await createSession(res, user.id, req);
  await audit('auth.register', user.id, null, undefined, req.ip);
  res.status(201).json({ user: { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl } });
}));

authRouter.post('/login', limiter, ah(async (req, res) => {
  const { login, password } = LoginSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: { equals: login, mode: 'insensitive' } }] },
  });
  // Vérification systématique pour un temps de réponse homogène
  const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) {
    await audit('auth.login_failed', user?.id ?? null, null, { login: login.slice(0, 60) }, req.ip);
    throw new HttpError(401, 'Identifiants incorrects', 'BAD_CREDENTIALS');
  }
  if (user.banned) throw new HttpError(403, 'Ce compte a été suspendu', 'BANNED');
  await createSession(res, user.id, req);
  await audit('auth.login', user.id, null, undefined, req.ip);
  res.json({ user: { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl } });
}));

authRouter.post('/logout', ah(async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE], res);
  res.json({ ok: true });
}));

authRouter.get('/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, username: true, email: true, role: true, avatarUrl: true, chips: true } });
  res.json({ user: u });
}));
