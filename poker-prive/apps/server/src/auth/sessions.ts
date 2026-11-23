/**
 * Sessions côté serveur : un jeton aléatoire de 256 bits est envoyé dans un
 * cookie httpOnly ; seule son empreinte SHA-256 est stockée en base. Une fuite
 * de la base ne permet donc pas d'usurper une session.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import { isProd } from '../config.js';

export const SESSION_COOKIE = 'pp_session';
const SESSION_DAYS = 30;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AuthUser {
  id: string;
  username: string;
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
}

export async function createSession(res: Response, userId: string, req: Request): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token), userId, expiresAt,
      userAgent: req.get('user-agent')?.slice(0, 200) ?? null, ip: req.ip ?? null,
    },
  });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', expires: expiresAt });
}

export async function destroySession(token: string | undefined, res: Response): Promise<void> {
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Résout un jeton en utilisateur (null si invalide, expiré ou banni). */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token || token.length > 100) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt < new Date() || s.user.banned) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  return { id: s.user.id, username: s.user.username, role: s.user.role, avatarUrl: s.user.avatarUrl };
}
