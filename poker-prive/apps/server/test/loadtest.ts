/**
 * Test de charge : N tables simultanées, chacune avec M joueurs-robots connectés
 * en WebSocket qui jouent aléatoirement. Mesure le débit de mains, la latence
 * des accusés de réception et vérifie la conservation des jetons.
 *
 * Usage : npm run loadtest -- [tables=20] [joueurs=6] [secondes=30]
 * (utilise la base LOADTEST_DATABASE_URL, par défaut poker_test)
 */
import type { GameView } from '@poker/engine';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { getManager } from '../src/realtime/socket.js';
import { TestClient } from './client.js';

const [tables = 20, players = 6, seconds = 30] = process.argv.slice(2).map(Number);
const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const tag = Date.now().toString(36);

async function main() {
  const server = await startServer(PORT, false);
  console.log(`▶ ${tables} tables × ${players} joueurs pendant ${seconds} s`);
  const latencies: number[] = [];
  let errors = 0;
  let throttled = 0;
  const errorKinds = new Map<string, number>();
  let actions = 0;
  const gameIds: string[] = [];
  const allClients: TestClient[] = [];

  for (let t = 0; t < tables; t++) {
    const clients = Array.from({ length: players }, (_, i) => new TestClient(BASE, `lt${tag}t${t}p${i}`));
    for (const c of clients) {
      await c.register();
      await c.connect();
    }
    const owner = clients[0]!;
    const room = (await owner.api('POST', '/rooms', { name: `Charge ${t}` })).data.room;
    for (const c of clients.slice(1)) await c.api('POST', '/rooms/join', { code: room.inviteCode });
    const game = (await owner.api('POST', `/rooms/${room.id}/games`, { name: `T${t}`, mode: 'CASH', maxSeats: Math.max(players, 2), actionSeconds: 20, timeBankSeconds: 0, reloadMode: 'busted' })).data.game;
    gameIds.push(game.id);
    for (const [i, c] of clients.entries()) {
      await c.emit('game:join', { gameId: game.id });
      await c.emit('game:sit', { gameId: game.id, seat: i, buyIn: 10000 });
      let last = -1;
      c.socket!.on('game:state', async (s: GameView) => {
        if (s.me.canReload && s.seats[s.me.seat]?.stack === 0) await c.emit('game:reload', { gameId: s.gameId });
        if (!s.me.legal || s.actionSeq === last) return;
        last = s.actionSeq;
        const l = s.me.legal;
        const r = Math.random();
        const a = r < 0.15 ? { type: 'fold' } : r < 0.8 ? { type: l.canCheck ? 'check' : 'call' } : (l.canBet || l.canRaise) ? { type: l.canBet ? 'bet' : 'raise', amount: l.minTo } : { type: 'call' };
        const t0 = performance.now();
        const res = await c.emit('game:action', { gameId: s.gameId, ...a, seq: s.actionSeq });
        latencies.push(performance.now() - t0);
        actions++;
        if (!res.ok && res.code === 'RATE') throttled++;
        else if (!res.ok && res.code !== 'STALE') {
          errors++;
          errorKinds.set(res.error ?? '?', (errorKinds.get(res.error ?? '?') ?? 0) + 1);
        }
      });
    }
    await owner.emit('game:start', { gameId: game.id });
    allClients.push(...clients);
  }

  const start = Date.now();
  const handsAt = () => gameIds.reduce((s, id) => s + (getManager().peek(id)?.table.handNumber ?? 0), 0);
  const h0 = handsAt();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const hands = handsAt() - h0;
  const elapsed = (Date.now() - start) / 1000;

  for (const c of allClients) c.disconnect();
  for (const id of gameIds) await getManager().peek(id)?.flush();

  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.floor((latencies.length - 1) * p)]?.toFixed(1) ?? '-';
  // Conservation : (solde + tapis sur table) = solde initial pour chaque joueur
  const users = await prisma.user.findMany({ where: { username: { startsWith: `lt${tag}` } }, select: { id: true, chips: true } });
  const onTables = gameIds.flatMap((id) => getManager().peek(id)!.table.seats.filter(Boolean).map((s) => s!.stack)).reduce((a, b) => a + b, 0);
  const reloads = await prisma.gamePlayer.aggregate({ where: { gameId: { in: gameIds } }, _sum: { buyIn: true } });
  const total = users.reduce((s, u) => s + u.chips, 0) + onTables;
  const expected = users.length * 100_000;

  console.log(`✔ ${hands} mains jouées en ${elapsed.toFixed(1)} s (${(hands / elapsed).toFixed(1)} mains/s sur ${tables} tables)`);
  console.log(`✔ ${actions} actions — latence d'accusé p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, p99 ${pct(0.99)} ms`);
  console.log(`${errors === 0 ? '✔' : '✘'} ${errors} erreur(s) d'action inattendue(s)`, errorKinds.size ? Object.fromEntries(errorKinds) : '');
  console.log(`${total === expected ? '✔' : '✘'} Conservation des jetons : ${total} / ${expected} (caves cumulées ${reloads._sum.buyIn})`);
  console.log(`  ${throttled} action(s) freinée(s) par l'anti-flood (15 req/s par connexion), le délai d'action prend alors le relais`);
  console.log(`  Mémoire : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} Mo`);
  await server.close();
  await prisma.$disconnect();
  process.exit(errors === 0 && total === expected ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
