import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.js';
import { SESSION_COOKIE, userFromToken, type AuthUser } from './sessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR') {
    super(message);
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const u = await userFromToken(req.cookies?.[SESSION_COOKIE]);
    if (u) req.user = u;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Authentification requise', 'UNAUTHENTICATED'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Authentification requise', 'UNAUTHENTICATED'));
  if (req.user.role !== 'ADMIN') return next(new HttpError(403, 'Réservé aux administrateurs', 'FORBIDDEN'));
  next();
}

/** Vérifie qu'une origine (en-tête Origin/Referer) correspond au site. */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;
  try {
    const o = new URL(origin);
    return o.host === new URL(env.PUBLIC_URL).host || (!!host && o.host === host);
  } catch {
    return false;
  }
}

/**
 * Protection CSRF : pour toute requête modifiant l'état, l'en-tête Origin (ou
 * Referer) doit correspondre au site. Combiné au cookie SameSite=Lax et au
 * corps JSON obligatoire, cela bloque les soumissions inter-sites.
 */
export function sameOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (isAllowedOrigin(req.get('origin') ?? req.get('referer'), req.get('host'))) return next();
  next(new HttpError(403, 'Origine non autorisée', 'CSRF'));
}

/** Enveloppe une route async pour transmettre les erreurs à Express. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
