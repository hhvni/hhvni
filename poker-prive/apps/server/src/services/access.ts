/** Contrôles d'accès aux salons (utilisés par l'API REST et les sockets). */
import type { RoomRole } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../auth/middleware.js';

export interface Membership {
  roomId: string;
  userId: string;
  role: RoomRole;
}

/** Retourne l'adhésion active (non bannie) ou null. Les administrateurs du site ont accès à tout. */
export async function getMembership(roomId: string, userId: string, siteRole?: string): Promise<Membership | null> {
  const m = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (m && !m.banned) return { roomId, userId, role: m.role };
  if (siteRole === 'ADMIN') {
    const exists = await prisma.room.count({ where: { id: roomId } });
    if (exists) return { roomId, userId, role: 'ADMIN' };
  }
  return null;
}

export async function requireMember(roomId: string, user: { id: string; role: string }): Promise<Membership> {
  const m = await getMembership(roomId, user.id, user.role);
  if (!m) throw new HttpError(403, 'Vous ne faites pas partie de ce salon', 'NOT_MEMBER');
  return m;
}

export async function requireRoomAdmin(roomId: string, user: { id: string; role: string }): Promise<Membership> {
  const m = await requireMember(roomId, user);
  if (m.role === 'PLAYER') throw new HttpError(403, 'Réservé aux administrateurs du salon', 'FORBIDDEN');
  return m;
}

export async function audit(type: string, userId: string | null, targetId: string | null, data?: object, ip?: string): Promise<void> {
  await prisma.auditLog.create({ data: { type, userId, targetId, data: data ?? undefined, ip: ip ?? null } }).catch(() => undefined);
}
