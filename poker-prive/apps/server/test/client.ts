/** Client de test : HTTP (fetch + cookie) et Socket.IO, comme un vrai navigateur. */
import { io, type Socket } from 'socket.io-client';
import { prisma } from '../src/db.js';

/** Repart d'une base vide (chaque fichier de test est indépendant). */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Room", "AuditLog" CASCADE');
}
import type { GameView } from '@poker/engine';

export class TestClient {
  cookie = '';
  socket: Socket | null = null;
  state: GameView | null = null;
  states: GameView[] = [];
  userId = '';
  private waiters: { pred: (s: GameView) => boolean; resolve: (s: GameView) => void }[] = [];

  constructor(public base: string, public name: string) {}

  async api<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: this.base, cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    return { status: res.status, data: (await res.json()) as T };
  }

  async register(): Promise<void> {
    const r = await this.api('POST', '/auth/register', { email: `${this.name}@test.local`, username: this.name, password: 'motdepasse123' });
    if (r.status !== 201) throw new Error(`register ${this.name}: ${JSON.stringify(r.data)}`);
    this.userId = r.data.user.id;
  }

  async connect(): Promise<void> {
    this.socket = io(this.base, { transports: ['websocket'], extraHeaders: { cookie: this.cookie, origin: this.base }, reconnection: false, forceNew: true });
    this.socket.on('game:state', (s: GameView) => {
      this.state = s;
      this.states.push(s);
      if (this.states.length > 400) this.states.shift();
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(s)) {
          w.resolve(s);
          return false;
        }
        return true;
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('connect', () => resolve());
      this.socket!.once('connect_error', (e) => reject(e));
    });
  }

  /** Envoie une commande ; si l'anti-flood freine, réessaie après une seconde (comme un humain). */
  async emit<T = any>(event: string, payload: unknown): Promise<T & { ok: boolean; error?: string; code?: string }> {
    for (let attempt = 0; ; attempt++) {
      const res = await new Promise<T & { ok: boolean; error?: string; code?: string }>((resolve) => this.socket!.emit(event, payload, resolve));
      if (res.code !== 'RATE' || attempt >= 3 || event === 'game:action') return res;
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  waitFor(pred: (s: GameView) => boolean, timeout = 15_000): Promise<GameView> {
    if (this.state && pred(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name}: délai dépassé en attente d'un état. Dernier: ${JSON.stringify(this.state && { hand: this.state.handNumber, status: this.state.status, turn: this.state.turn, seats: this.state.seats.map((s) => s && [s.username, s.stack, s.sittingOut, s.connected]), result: !!this.state.result })}`)), timeout);
      this.waiters.push({ pred, resolve: (s) => { clearTimeout(t); resolve(s); } });
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
