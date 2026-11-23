/**
 * Couche temps réel (Socket.IO) :
 *  - authentification par cookie de session + vérification d'origine ;
 *  - présence en ligne ;
 *  - commandes de jeu (validées par zod puis par le runtime) ;
 *  - chat et réactions ;
 *  - signalisation WebRTC (les flux audio/vidéo vont de pair à pair, ils ne
 *    transitent jamais par ce serveur).
 */
import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { REACTIONS, type ChatMessageView, type LogLine } from '@poker/engine';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { isAllowedOrigin } from '../auth/middleware.js';
import { SESSION_COOKIE, userFromToken, type AuthUser } from '../auth/sessions.js';
import { getMembership } from '../services/access.js';
import { GameManager } from './gameManager.js';
import { GameError, type GameBroadcaster, type GameRuntime } from './gameRuntime.js';

interface SocketData {
  user: AuthUser;
  games: Set<string>;
  rooms: Set<string>;
  rtc: string | null;
  bucket: { tokens: number; at: number };
  chatBucket: { tokens: number; at: number };
}
type S = Socket<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>, Record<string, never>, SocketData>;

/** Nombre de connexions par utilisateur (présence). */
const online = new Map<string, number>();
export const isOnline = (userId: string) => (online.get(userId) ?? 0) > 0;
export const onlineUserIds = () => [...online.keys()];

let ioRef: Server | null = null;
let managerRef: GameManager | null = null;
export const getIO = () => ioRef!;
export const getManager = () => managerRef!;

/** Notifie un utilisateur sur toutes ses connexions. */
export function notifyUser(userId: string, event: string, payload: unknown): void {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

export function emitToRoom(roomId: string, event: string, payload: unknown): void {
  ioRef?.to(`room:${roomId}`).emit(event, payload);
}

function take(bucket: { tokens: number; at: number }, rate: number, burst: number): boolean {
  const now = Date.now();
  bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * rate);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

const GameIdSchema = z.object({ gameId: z.string().min(1).max(40) });
const ActionSchema = GameIdSchema.extend({
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']),
  amount: z.number().int().nonnegative().max(1_000_000_000).optional(),
  seq: z.number().int().nonnegative(),
});
const SitSchema = GameIdSchema.extend({ seat: z.number().int().min(0).max(9), buyIn: z.number().int().positive().max(1_000_000_000) });
const ChatSchema = z.object({ roomId: z.string().min(1).max(40), gameId: z.string().max(40).optional(), text: z.string().trim().min(1).max(300) });
const ReactSchema = GameIdSchema.extend({ emoji: z.enum(REACTIONS) });
const SignalSchema = z.object({ to: z.string().min(1).max(40), data: z.unknown() });
const MediaSchema = z.object({ cam: z.boolean(), mic: z.boolean() });

export function setupSockets(http: HttpServer): { io: Server; manager: GameManager } {
  const io = new Server(http, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  ioRef = io;

  // Diffusion coalescée des états de table : un envoi par tick d'événements.
  const pending = new Set<GameRuntime>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    for (const rt of pending) {
      const sockets = io.sockets.adapter.rooms.get(`game:${rt.id}`);
      if (!sockets) continue;
      const users = new Set<string>();
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid) as S | undefined;
        if (s) users.add(s.data.user.id);
      }
      rt.spectatorCount = [...users].filter((u) => rt.table.seatOf(u) === -1).length;
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid) as S | undefined;
        if (s) s.emit('game:state', rt.viewFor(s.data.user.id));
      }
    }
    pending.clear();
  };
  const broadcaster: GameBroadcaster = {
    state(rt) {
      pending.add(rt);
      if (!scheduled) {
        scheduled = true;
        setImmediate(flush);
      }
    },
    log(gameId: string, line: LogLine) {
      io.to(`game:${gameId}`).emit('game:log', { gameId, line });
    },
    toUser: notifyUser,
  };
  const manager = new GameManager(broadcaster);
  managerRef = manager;

  // ─── Authentification du handshake ───
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !isAllowedOrigin(origin, socket.handshake.headers.host)) return next(new Error('Origine non autorisée'));
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const user = await userFromToken(cookies[SESSION_COOKIE]);
      if (!user) return next(new Error('UNAUTHENTICATED'));
      const data = socket.data as SocketData;
      data.user = user;
      data.games = new Set();
      data.rooms = new Set();
      data.rtc = null;
      data.bucket = { tokens: 30, at: Date.now() };
      data.chatBucket = { tokens: 5, at: Date.now() };
      next();
    } catch (e) {
      next(e as Error);
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as unknown as S;
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    const count = (online.get(user.id) ?? 0) + 1;
    online.set(user.id, count);
    if (count === 1) void broadcastPresence(user.id, true);
    void prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    /** Enregistre un gestionnaire avec validation, limitation de débit et accusé de réception. */
    const on = <T>(event: string, schema: z.ZodType<T>, handler: (data: T) => Promise<unknown> | unknown) => {
      socket.on(event, async (payload: unknown, ack?: (r: unknown) => void) => {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        if (!take(socket.data.bucket, 15, 30)) return reply({ ok: false, error: 'Trop de requêtes, ralentissez', code: 'RATE' });
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply({ ok: false, error: 'Requête invalide' });
        try {
          const result = await handler(parsed.data);
          reply({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
        } catch (e) {
          if (e instanceof GameError) return reply({ ok: false, error: e.message, code: e.code });
          logger.error({ err: e, event }, 'Erreur socket');
          reply({ ok: false, error: 'Erreur interne' });
        }
      });
    };

    /** Récupère une table à laquelle le socket est abonné (contrôle d'accès fait au join). */
    const joined = async (gameId: string): Promise<GameRuntime> => {
      if (!socket.data.games.has(gameId)) throw new GameError('NOT_JOINED', "Rejoignez d'abord la table");
      const rt = await manager.get(gameId);
      if (!rt) throw new GameError('NOT_FOUND', 'Partie introuvable');
      return rt;
    };

    on('game:join', GameIdSchema, async ({ gameId }) => {
      const rt = await manager.get(gameId);
      if (!rt) throw new GameError('NOT_FOUND', 'Partie introuvable');
      const m = await getMembership(rt.roomId, user.id, user.role);
      if (!m) throw new GameError('FORBIDDEN', "Vous n'avez pas accès à ce salon");
      if (user.role === 'ADMIN') rt.roomAdmins.add(user.id);
      socket.join(`game:${gameId}`);
      socket.data.games.add(gameId);
      await rt.loadBankroll(user.id);
      rt.onConnect(user.id);
      const messages = await recentChat(rt.roomId, gameId);
      socket.emit('game:state', rt.viewFor(user.id));
      return { logs: rt.recentLogs(), messages };
    });

    on('game:leave', GameIdSchema, ({ gameId }) => {
      leaveGame(gameId);
    });

    on('game:action', ActionSchema, async ({ gameId, type, amount, seq }) => {
      (await joined(gameId)).act(user.id, type, amount, seq);
    });
    on('game:sit', SitSchema, async ({ gameId, seat, buyIn }) => (await joined(gameId)).sit(user, seat, buyIn));
    on('game:stand', GameIdSchema, async ({ gameId }) => (await joined(gameId)).standUp(user.id));
    on('game:away', GameIdSchema.extend({ away: z.boolean() }), async ({ gameId, away }) => (await joined(gameId)).setAway(user.id, away));
    on('game:reload', GameIdSchema, async ({ gameId }) => (await joined(gameId)).reload(user.id));
    on('game:register', GameIdSchema, async ({ gameId }) => (await joined(gameId)).register(user));
    on('game:unregister', GameIdSchema, async ({ gameId }) => (await joined(gameId)).unregister(user.id));
    on('game:rebuy', GameIdSchema, async ({ gameId }) => (await joined(gameId)).rebuy(user.id));
    on('game:declineRebuy', GameIdSchema, async ({ gameId }) => (await joined(gameId)).declineRebuy(user.id));
    on('game:addon', GameIdSchema, async ({ gameId }) => (await joined(gameId)).addon(user.id));
    on('game:start', GameIdSchema, async ({ gameId }) => (await joined(gameId)).start(user.id));
    on('game:pause', GameIdSchema, async ({ gameId }) => (await joined(gameId)).pause(user.id));
    on('game:close', GameIdSchema, async ({ gameId }) => (await joined(gameId)).close(user.id));
    on('game:kick', GameIdSchema.extend({ userId: z.string().max(40) }), async ({ gameId, userId }) => (await joined(gameId)).kick(user.id, userId));

    // ─── Salons (lobby) ───
    on('room:join', z.object({ roomId: z.string().max(40) }), async ({ roomId }) => {
      const m = await getMembership(roomId, user.id, user.role);
      if (!m) throw new GameError('FORBIDDEN', "Vous n'avez pas accès à ce salon");
      socket.join(`room:${roomId}`);
      socket.data.rooms.add(roomId);
    });
    on('room:leave', z.object({ roomId: z.string().max(40) }), ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      socket.data.rooms.delete(roomId);
    });

    // ─── Chat ───
    on('chat:send', ChatSchema, async ({ roomId, gameId, text }) => {
      if (!take(socket.data.chatBucket, 0.5, 5)) throw new GameError('RATE', 'Vous envoyez trop de messages');
      const m = await getMembership(roomId, user.id, user.role);
      if (!m) throw new GameError('FORBIDDEN', "Vous n'avez pas accès à ce salon");
      if (gameId) {
        const g = await prisma.game.findUnique({ where: { id: gameId }, select: { roomId: true } });
        if (!g || g.roomId !== roomId) throw new GameError('FORBIDDEN', 'Partie invalide');
      }
      const msg = await prisma.chatMessage.create({ data: { roomId, gameId: gameId ?? null, userId: user.id, text } });
      const view: ChatMessageView = {
        id: msg.id, userId: user.id, username: user.username, avatarUrl: user.avatarUrl, kind: 'USER', text, createdAt: msg.createdAt.toISOString(),
      };
      io.to(gameId ? `game:${gameId}` : `room:${roomId}`).emit('chat:message', { roomId, gameId: gameId ?? null, message: view });
    });
    on('chat:react', ReactSchema, async ({ gameId, emoji }) => {
      if (!take(socket.data.chatBucket, 0.5, 5)) throw new GameError('RATE', 'Doucement sur les réactions');
      const rt = await joined(gameId);
      io.to(`game:${gameId}`).emit('chat:reaction', { gameId, userId: user.id, seat: rt.table.seatOf(user.id), emoji, at: Date.now() });
    });

    // ─── Signalisation WebRTC ───
    on('rtc:join', GameIdSchema, async ({ gameId }) => {
      await joined(gameId);
      if (socket.data.rtc) socket.leave(`rtc:${socket.data.rtc}`);
      socket.data.rtc = gameId;
      const room = `rtc:${gameId}`;
      const peers: { socketId: string; userId: string }[] = [];
      for (const sid of io.sockets.adapter.rooms.get(room) ?? []) {
        const s = io.sockets.sockets.get(sid) as S | undefined;
        if (s && s.id !== socket.id) peers.push({ socketId: s.id, userId: s.data.user.id });
      }
      socket.join(room);
      socket.to(room).emit('rtc:peer-joined', { socketId: socket.id, userId: user.id });
      return { peers, selfId: socket.id };
    });
    on('rtc:signal', SignalSchema, ({ to, data }) => {
      const target = io.sockets.sockets.get(to) as S | undefined;
      // Les deux pairs doivent être dans la même salle vidéo
      if (!target || !socket.data.rtc || target.data.rtc !== socket.data.rtc) throw new GameError('RTC', 'Pair inconnu');
      if (JSON.stringify(data ?? null).length > 20_000) throw new GameError('RTC', 'Message trop volumineux');
      target.emit('rtc:signal', { from: socket.id, userId: user.id, data });
    });
    on('rtc:media', MediaSchema, ({ cam, mic }) => {
      if (!socket.data.rtc) return;
      socket.to(`rtc:${socket.data.rtc}`).emit('rtc:media', { socketId: socket.id, userId: user.id, cam, mic });
    });
    on('rtc:leave', z.object({}).passthrough(), () => leaveRtc());

    function leaveRtc(): void {
      if (!socket.data.rtc) return;
      const room = `rtc:${socket.data.rtc}`;
      socket.to(room).emit('rtc:peer-left', { socketId: socket.id, userId: user.id });
      socket.leave(room);
      socket.data.rtc = null;
    }

    function leaveGame(gameId: string): void {
      if (socket.data.rtc === gameId) leaveRtc();
      socket.leave(`game:${gameId}`);
      socket.data.games.delete(gameId);
      const rt = manager.peek(gameId);
      if (!rt) return;
      // L'utilisateur est-il encore présent sur cette table via une autre connexion ?
      const still = [...(io.sockets.adapter.rooms.get(`game:${gameId}`) ?? [])].some(
        (sid) => (io.sockets.sockets.get(sid) as S | undefined)?.data.user.id === user.id,
      );
      if (!still) rt.onDisconnect(user.id);
      broadcaster.state(rt);
    }

    socket.on('disconnect', () => {
      for (const gameId of [...socket.data.games]) leaveGame(gameId);
      const n = (online.get(user.id) ?? 1) - 1;
      if (n <= 0) {
        online.delete(user.id);
        void broadcastPresence(user.id, false);
      } else online.set(user.id, n);
    });
  });

  return { io, manager };
}

async function recentChat(roomId: string, gameId: string): Promise<ChatMessageView[]> {
  const msgs = await prisma.chatMessage.findMany({
    where: { roomId, gameId }, orderBy: { createdAt: 'desc' }, take: 50,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });
  return msgs.reverse().map((m) => ({
    id: m.id, userId: m.userId, username: m.user?.username ?? null, avatarUrl: m.user?.avatarUrl ?? null,
    kind: m.kind, text: m.text, createdAt: m.createdAt.toISOString(),
  }));
}

/** Prévient les amis d'un utilisateur de son changement de présence. */
async function broadcastPresence(userId: string, isOn: boolean): Promise<void> {
  const friends = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  for (const f of friends) {
    const other = f.requesterId === userId ? f.addresseeId : f.requesterId;
    notifyUser(other, 'presence:update', { userId, online: isOn });
  }
}
