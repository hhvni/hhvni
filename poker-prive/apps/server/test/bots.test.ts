/** Robots de test : ajout, jeu autonome, conservation des jetons, tournoi. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { getManager } from '../src/realtime/socket.js';
import { resetDb, TestClient } from './client.js';

const PORT = 3997;
const BASE = `http://localhost:${PORT}`;
let server: { close: () => Promise<void> };
const tag = Date.now().toString(36).slice(-5);

beforeAll(async () => {
  await resetDb();
  server = await startServer(PORT, false);
});
afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe('Robots', () => {
  const admin = new TestClient(BASE, `boss${tag}`);
  const guest = new TestClient(BASE, `invit${tag}`);
  let roomId = '';

  it('cash game : un humain contre deux robots, les mains avancent seules', async () => {
    await admin.register();
    await guest.register();
    roomId = (await admin.api('POST', '/rooms', { name: 'Test robots' })).data.room.id;
    const code = (await admin.api('GET', `/rooms/${roomId}`)).data.room.inviteCode;
    await guest.api('POST', '/rooms/join', { code });
    const gid = (await admin.api('POST', `/rooms/${roomId}/games`, { name: 'Robots', mode: 'CASH', actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
    await admin.connect();
    await guest.connect();
    await admin.emit('game:join', { gameId: gid });
    await guest.emit('game:join', { gameId: gid });
    expect((await guest.emit('game:addBot', { gameId: gid })).ok).toBe(false); // pas admin
    expect((await admin.emit('game:sit', { gameId: gid, seat: 0, buyIn: 10000 })).ok).toBe(true);
    expect((await admin.emit('game:addBot', { gameId: gid })).ok).toBe(true);
    expect((await admin.emit('game:addBot', { gameId: gid })).ok).toBe(true);
    const st = await admin.waitFor((s) => s.seats.filter((x) => x?.isBot).length === 2);
    expect(st.seats.filter((x) => x?.isBot).every((x) => x!.connected)).toBe(true);
    // L'humain joue « parole/suivre », les robots jouent seuls
    let last = -1;
    const play = async (s: import('@poker/engine').GameView) => {
      if (!s.me.legal || s.actionSeq === last) return;
      last = s.actionSeq;
      await admin.emit('game:action', { gameId: gid, type: s.me.legal.canCheck ? 'check' : 'call', seq: s.actionSeq });
    };
    admin.socket!.on('game:state', play);
    await admin.emit('game:start', { gameId: gid });
    await admin.waitFor((s) => s.handNumber >= 12, 60_000);
    // Les robots n'ont jamais d'action refusée : la main se termine toujours
    const rt = getManager().peek(gid)!;
    const total = rt.table.seats.reduce((n, s) => n + (s?.stack ?? 0), 0);
    expect(total).toBe(30000 + (await prisma.gamePlayer.aggregate({ where: { gameId: gid }, _sum: { buyIn: true } }))._sum.buyIn! - 30000);
    // Retirer un robot
    const bot = admin.state!.seats.find((s) => s?.isBot)!;
    expect((await admin.emit('game:removeBot', { gameId: gid, userId: bot.userId })).ok).toBe(true);
    // Les robots n'apparaissent pas dans les classements
    const lb = await admin.api('GET', '/stats/leaderboard?scope=global');
    expect(lb.data.rows.some((r: { username: string }) => r.username.startsWith('Robot'))).toBe(false);
    admin.socket!.off('game:state', play);
    await admin.emit('game:leave', { gameId: gid });
  });

  it('tournoi entre robots jusqu’au vainqueur', async () => {
    const gid = (await admin.api('POST', `/rooms/${roomId}/games`, { name: 'SNG robots', mode: 'TOURNAMENT', maxSeats: 4, startingStack: 1000, smallBlind: 50, bigBlind: 100, actionSeconds: 5, timeBankSeconds: 0, levelMinutes: 1 })).data.game.id;
    await new Promise((r) => setTimeout(r, 2500)); // laisse se recharger le limiteur anti-flood
    await admin.emit('game:join', { gameId: gid });
    for (let i = 0; i < 4; i++) expect((await admin.emit('game:addBot', { gameId: gid })).error).toBeUndefined();
    expect((await admin.emit('game:addBot', { gameId: gid })).ok).toBe(false); // complet
    expect((await admin.emit('game:start', { gameId: gid })).ok).toBe(true);
    const end = await admin.waitFor((s) => s.gameId === gid && s.status === 'FINISHED', 90_000);
    expect(end.tournament!.results.map((r) => r.place).sort()).toEqual([1, 2, 3, 4]);
    admin.disconnect();
    guest.disconnect();
  });
});
