/** Les robots restent à la table après avoir perdu des coups (recharge automatique). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { GameView } from '@poker/engine';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { TestClient } from './client.js';

const PORT = 3996;
const BASE = `http://localhost:${PORT}`;
let server: { close: () => Promise<void> };
beforeAll(async () => { server = await startServer(PORT, false); });
afterAll(async () => { await server.close(); await prisma.$disconnect(); });

it('les robots restent assis même quand le joueur gagne et les élimine', async () => {
  const me = new TestClient(BASE, `stay${Date.now().toString(36).slice(-5)}`);
  await me.register();
  const roomId = (await me.api('POST', '/rooms', { name: 'Stay' })).data.room.id;
  const gid = (await me.api('POST', `/rooms/${roomId}/games`, { name: 'Stay', mode: 'CASH', actionSeconds: 5, timeBankSeconds: 0 })).data.game.id;
  await me.connect();
  await me.emit('game:join', { gameId: gid });
  await me.emit('game:sit', { gameId: gid, seat: 0, buyIn: 20000 });
  for (let i = 0; i < 3; i++) expect((await me.emit('game:addBot', { gameId: gid })).ok).toBe(true);
  const logs: string[] = [];
  me.socket!.on('game:log', (p: { line: { text: string } }) => logs.push(p.line.text));
  let last = -1;
  me.socket!.on('game:state', async (s: GameView) => {
    if (s.me.canReload && s.seats[s.me.seat]?.stack === 0) await me.emit('game:reload', { gameId: gid });
    if (!s.me.legal || s.actionSeq === last) return;
    last = s.actionSeq;
    await me.emit('game:action', { gameId: gid, type: 'allin', seq: s.actionSeq });
  });
  await me.emit('game:start', { gameId: gid });
  await me.waitFor((s) => s.handNumber >= 40, 90_000);
  const bots = me.state!.seats.filter((s) => s?.isBot).length;
  console.log(logs.filter((l) => /quitte|recharge|exclu/.test(l)).slice(0, 15).join('\n'));
  expect(bots).toBe(3);
  // Redémarrage simulé : la partie est rechargée depuis son instantané
  const { getManager } = await import('../src/realtime/socket.js');
  await getManager().peek(gid)!.flush();
  getManager().unload(gid);
  const rt = (await getManager().get(gid))!;
  const botMetas = [...rt.meta.values()].filter((m) => m.bot);
  expect(botMetas).toHaveLength(3);
  expect(botMetas.every((m) => m.connected && m.disconnectedAt === null)).toBe(true);
  me.disconnect();
});
