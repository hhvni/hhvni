/** Règles de blinds et mains jetées, de bout en bout (serveur réel + robots). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { GameView } from '@poker/engine';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { resetDb, TestClient } from './client.js';

const PORT = 3995;
const BASE = `http://localhost:${PORT}`;
let server: { close: () => Promise<void> };
beforeAll(async () => {
  await resetDb();
  server = await startServer(PORT, false); });
afterAll(async () => { await server.close(); await prisma.$disconnect(); });

it("un joueur arrivé en cours de partie attend la grosse blinde, ou paie pour jouer tout de suite", async () => {
  const tag = Date.now().toString(36).slice(-5);
  const host = new TestClient(BASE, `hote${tag}`);
  const late = new TestClient(BASE, `retard${tag}`);
  await host.register();
  await late.register();
  const roomId = (await host.api('POST', '/rooms', { name: 'Règles' })).data.room.id;
  const code = (await host.api('GET', `/rooms/${roomId}`)).data.room.inviteCode;
  await late.api('POST', '/rooms/join', { code });
  const gid = (await host.api('POST', `/rooms/${roomId}/games`, { name: 'Règles', mode: 'CASH', actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
  await host.connect();
  await host.emit('game:join', { gameId: gid });
  for (let i = 0; i < 3; i++) expect((await host.emit('game:addBot', { gameId: gid })).ok).toBe(true);
  await host.emit('game:start', { gameId: gid });
  await host.waitFor((s) => s.handNumber >= 2, 30_000);

  await late.connect();
  await late.emit('game:join', { gameId: gid });
  expect((await late.emit('game:sit', { gameId: gid, seat: 5, buyIn: 10000 })).ok).toBe(true);
  const st = await late.waitFor((s) => s.me.seat === 5);
  expect(st.me.postNowAmount).toBe(100);
  expect(st.seats[5]!.waitingBB).toBe(true);
  // Il n'est pas servi tant qu'il attend…
  const h = st.handNumber;
  const next = await late.waitFor((s) => s.handNumber > h && !!s.turn, 30_000);
  const servedFree = next.me.cards.length === 2 && !next.seats[5]!.isBigBlind;
  expect(servedFree).toBe(false);
  // …puis il paie pour jouer tout de suite
  const r = await late.emit('game:postNow', { gameId: gid });
  expect(r.ok === true || r.code === 'NOT_WAITING').toBe(true);
  const dealt = await late.waitFor((s) => s.me.cards.length === 2, 60_000);
  expect(dealt.seats[5]!.waitingBB).toBe(false);
  host.disconnect();
  late.disconnect();
});

it('au showdown, un perdant qui a suivi jette sa main : ses cartes ne sont jamais envoyées', async () => {
  const tag = Date.now().toString(36).slice(-5);
  const me = new TestClient(BASE, `muck${tag}`);
  await me.register();
  const roomId = (await me.api('POST', '/rooms', { name: 'Muck' })).data.room.id;
  const gid = (await me.api('POST', `/rooms/${roomId}/games`, { name: 'Muck', mode: 'CASH', actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
  await me.connect();
  await me.emit('game:join', { gameId: gid });
  await me.emit('game:sit', { gameId: gid, seat: 0, buyIn: 10000 });
  for (let i = 0; i < 2; i++) await me.emit('game:addBot', { gameId: gid });
  let last = -1;
  me.socket!.on('game:state', async (s: GameView) => {
    if (!s.me.legal || s.actionSeq === last) return;
    last = s.actionSeq;
    await me.emit('game:action', { gameId: gid, type: s.me.legal.canCheck ? 'check' : 'call', seq: s.actionSeq });
  });
  await me.emit('game:start', { gameId: gid });
  const withMuck = await me.waitFor((s) => !!s.result && s.result.mucked.length > 0, 90_000);
  for (const id of withMuck.result!.mucked) {
    if (id === me.userId) continue;
    const seat = withMuck.seats.find((x) => x?.userId === id)!;
    expect(seat.cards === null || seat.cards.every((c) => c === null)).toBe(true);
  }
  me.disconnect();
}, 120_000);
