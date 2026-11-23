import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { isProd } from './config.js';
import { logger } from './logger.js';
import { HttpError, loadUser, sameOrigin } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { uploadDir, usersRouter } from './routes/users.js';
import { friendsRouter } from './routes/friends.js';
import { roomsRouter } from './routes/rooms.js';
import { gamesRouter, handsRouter } from './routes/games.js';
import { statsRouter } from './routes/stats.js';
import { adminRouter } from './routes/admin.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", ...(isProd ? [] : ["'unsafe-eval'"])],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // Caméra / micro autorisés uniquement pour ce site
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', fallthrough: false, dotfiles: 'deny', index: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  const api = express.Router();
  api.use(express.json({ limit: '800kb' }));
  api.use(cookieParser());
  api.use(sameOrigin);
  api.use(loadUser);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/friends', friendsRouter);
  api.use('/rooms', roomsRouter);
  api.use('/games', gamesRouter);
  api.use('/hands', handsRouter);
  api.use('/stats', statsRouter);
  api.use('/admin', adminRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Route inconnue', 'NOT_FOUND')));
  api.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Requête invalide', code: 'VALIDATION' });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalide', code: 'BAD_JSON' });
    }
    logger.error({ err, path: req.path }, 'Erreur API');
    res.status(500).json({ error: 'Erreur interne du serveur', code: 'INTERNAL' });
  });
  app.use('/api', api);
  return app;
}
