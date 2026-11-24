/** Run it twice et straddle, de bout en bout (serveur réel + robots). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { GameView } from '@poker/engine';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { resetDb, TestClient } from './client.js';

const PORT = 3994;
const BASE = `http://localhost:${PORT}`;
let server: { close: () => Promise<void> };
beforeAll(async () => {
  await resetDb();
  server = await startServer(PORT, false); });
afterAll(async () => { await server.close(); await prisma.$disconnect(); });

it('tapis : vote « deux fois », deux boards, jetons conservés ; straddle général limité à une fois toutes les 15 mains', async () => {
  const me = new TestClient(BASE, `rit${Date.now().toString(36).slice(-5)}`);
  await me.register();
  const roomId = (await me.api('POST', '/rooms', { name: 'RIT' })).data.room.id;
  const gid = (await me.api('POST', `/rooms/${roomId}/games`, { name: 'RIT', mode: 'CASH', startingStack: 1000, smallBlind: 50, bigBlind: 100, minBuyIn: 500, maxBuyIn: 1000, actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
  await me.connect();
  await me.emit('game:join', { gameId: gid });
  await me.emit('game:sit', { gameId: gid, seat: 0, buyIn: 1000 });
  for (let i = 0; i < 3; i++) await me.emit('game:addBot', { gameId: gid });
  expect((await me.emit('game:bomb', { gameId: gid })).ok).toBe(true);
  expect((await me.emit('game:bomb', { gameId: gid })).code).toBe('PENDING');
  let last = -1;
  let sawStraddle = false;
  let voted = false;
  me.socket!.on('game:state', async (s: GameView) => {
    if (s.bombPot) sawStraddle = true;
    if (s.me.canVoteRunout && !voted) {
      voted = true;
      await me.emit('game:runout', { gameId: gid, accept: true });
    }
    if (s.me.canReload && s.seats[0]?.stack === 0) await me.emit('game:reload', { gameId: gid });
    if (!s.me.legal || s.actionSeq === last) return;
    last = s.actionSeq;
    await me.emit('game:action', { gameId: gid, type: 'allin', seq: s.actionSeq });
  });
  await me.emit('game:start', { gameId: gid });
  const twice = await me.waitFor((s) => !!s.result && !!s.board2 && s.board2.length === 5, 90_000);
  expect(twice.result!.pots.some((p) => p.run === 2)).toBe(true);
  expect(twice.board.length).toBe(5);
  expect(sawStraddle).toBe(true);
  // Délai : pas de nouveau straddle général avant 15 mains
  const again = await me.emit('game:bomb', { gameId: gid });
  if (me.state!.handNumber < 15) expect(again.code).toBe('COOLDOWN');
  // Conservation : jetons des sièges + caves = cohérent
  const { getManager } = await import('../src/realtime/socket.js');
  const rt = getManager().peek(gid)!;
  await rt.flush();
  const gp = await prisma.gamePlayer.aggregate({ where: { gameId: gid }, _sum: { buyIn: true, cashOut: true } });
  // Pendant une main, le tapis vivant d'un joueur est celui de la main (+ ce qu'il a misé)
  const live = rt.table.hand && !rt.table.hand.finished ? rt.table.hand : null;
  const onTable = rt.table.seats.reduce((n, s) => {
    if (!s) return n;
    const hp = live?.players.find((p) => p.playerId === s.playerId);
    return n + (hp ? hp.stack + hp.totalBet : s.stack);
  }, 0);
  expect(onTable + (gp._sum.cashOut ?? 0)).toBe(gp._sum.buyIn);
  me.disconnect();
}, 150_000);

it('roulette du straddle : montant tiré entre 2 et 10 BB, posé par tout le monde à la main suivante', async () => {
  const me = new TestClient(BASE, `rou${Date.now().toString(36).slice(-5)}`);
  await me.register();
  const roomId = (await me.api('POST', '/rooms', { name: 'Roulette' })).data.room.id;
  const gid = (await me.api('POST', `/rooms/${roomId}/games`, { name: 'Roulette', mode: 'CASH', startingStack: 5000, smallBlind: 50, bigBlind: 100, minBuyIn: 2000, maxBuyIn: 5000, actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
  await me.connect();
  await me.emit('game:join', { gameId: gid });
  await me.emit('game:sit', { gameId: gid, seat: 0, buyIn: 5000 });
  for (let i = 0; i < 2; i++) await me.emit('game:addBot', { gameId: gid });
  expect((await me.emit('game:bomb', { gameId: gid, roulette: true })).ok).toBe(true);
  const spun = await me.waitFor((s) => !!s.bombSpin, 10_000);
  const value = spun.bombSpin!.value;
  expect(value).toBeGreaterThanOrEqual(2);
  expect(value).toBeLessThanOrEqual(10);
  expect(spun.me.bomb.pendingBB).toBe(value);
  let last = -1;
  me.socket!.on('game:state', async (s: GameView) => {
    if (!s.me.legal || s.actionSeq === last) return;
    last = s.actionSeq;
    await me.emit('game:action', { gameId: gid, type: s.me.legal.canCheck ? 'check' : 'fold', seq: s.actionSeq });
  });
  await me.emit('game:start', { gameId: gid });
  const bomb = await me.waitFor((s) => s.bombPot, 30_000);
  expect(bomb.bombBB).toBe(value);
  const { getManager } = await import('../src/realtime/socket.js');
  const h = getManager().peek(gid)!.table.hand!;
  const posts = h.events.filter((e) => e.type === 'blind' && e.kind === 'bomb');
  expect(posts.length).toBe(3);
  for (const e of posts) if (e.type === 'blind') expect(e.amount).toBe(value * 100);
}, 60_000);
