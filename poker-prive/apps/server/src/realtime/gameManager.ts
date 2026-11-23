/**
 * Registre des tables actives en mémoire. Charge une partie depuis la base à la
 * demande et restaure les parties en cours au démarrage du serveur.
 */
import type { GameConfig } from '@poker/engine';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { GameRuntime, type GameBroadcaster, type RuntimeInit } from './gameRuntime.js';

export class GameManager {
  private runtimes = new Map<string, GameRuntime>();
  private loading = new Map<string, Promise<GameRuntime | null>>();

  constructor(private io: GameBroadcaster) {}

  peek(gameId: string): GameRuntime | undefined {
    return this.runtimes.get(gameId);
  }

  all(): GameRuntime[] {
    return [...this.runtimes.values()];
  }

  async get(gameId: string): Promise<GameRuntime | null> {
    const existing = this.runtimes.get(gameId);
    if (existing) return existing;
    let p = this.loading.get(gameId);
    if (!p) {
      p = this.load(gameId).finally(() => this.loading.delete(gameId));
      this.loading.set(gameId, p);
    }
    return p;
  }

  private async load(gameId: string): Promise<GameRuntime | null> {
    const g = await prisma.game.findUnique({ where: { id: gameId } });
    if (!g) return null;
    const rt = new GameRuntime(
      {
        id: g.id, roomId: g.roomId, config: g.config as unknown as GameConfig, status: g.status,
        createdById: g.createdById, snapshot: (g.snapshot as unknown as RuntimeInit['snapshot']) ?? null,
      },
      this.io,
    );
    await this.refreshAdminsFor(rt);
    this.runtimes.set(gameId, rt);
    if (g.snapshot && g.status !== 'FINISHED') rt.resume();
    return rt;
  }

  /** Restaure toutes les parties non terminées (après un redémarrage). */
  async restoreAll(): Promise<void> {
    const candidates = await prisma.game.findMany({ where: { status: { in: ['RUNNING', 'PAUSED', 'WAITING'] } }, select: { id: true, snapshot: true } });
    const games = candidates.filter((g) => g.snapshot !== null);
    for (const g of games) {
      try {
        await this.get(g.id);
      } catch (err) {
        logger.error({ err, gameId: g.id }, 'Restauration impossible');
      }
    }
    if (games.length) logger.info(`${games.length} partie(s) restaurée(s)`);
  }

  async refreshAdmins(roomId: string): Promise<void> {
    for (const rt of this.runtimes.values()) if (rt.roomId === roomId) await this.refreshAdminsFor(rt);
  }

  private async refreshAdminsFor(rt: GameRuntime): Promise<void> {
    const admins = await prisma.roomMember.findMany({
      where: { roomId: rt.roomId, role: { in: ['OWNER', 'ADMIN'] }, banned: false },
      select: { userId: true },
    });
    const siteAdmins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    rt.roomAdmins = new Set([...admins.map((a) => a.userId), ...siteAdmins.map((a) => a.id)]);
  }

  unload(gameId: string): void {
    const rt = this.runtimes.get(gameId);
    if (rt) {
      rt.dispose();
      this.runtimes.delete(gameId);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((rt) => rt.flush()));
    for (const rt of this.runtimes.values()) rt.dispose();
  }
}
