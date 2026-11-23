/**
 * Tests d'intégration de bout en bout : vrai serveur HTTP + Socket.IO + PostgreSQL.
 * Couvre comptes, salons, invitations, permissions, parties multijoueurs,
 * isolation des cartes privées, doubles actions, déconnexions/reconnexions,
 * conservation des jetons, historique, statistiques et tournoi complet.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameView } from '@poker/engine';
import { prisma } from '../src/db.js';
import { startServer } from '../src/index.js';
import { TestClient } from './client.js';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
let server: { close: () => Promise<void> };
const tag = Date.now().toString(36).slice(-5);

async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Room", "AuditLog" CASCADE');
}

/** Fait jouer automatiquement un client quand c'est son tour. */
function autoPlay(c: TestClient, strategy: (s: GameView) => { type: string; amount?: number }) {
  let lastSeq = -1;
  let reloading = false;
  const handler = async (s: GameView) => {
    // Recharge automatique quand le joueur est à court (règle de la table)
    if (s.mode === 'CASH' && s.me.canReload && s.me.seat >= 0 && s.seats[s.me.seat]!.stack === 0 && !reloading) {
      reloading = true;
      await c.emit('game:reload', { gameId: s.gameId });
      reloading = false;
    }
    if (!s.me.legal || s.turn?.userId !== c.userId || s.actionSeq === lastSeq) return;
    lastSeq = s.actionSeq;
    const a = strategy(s);
    await c.emit('game:action', { gameId: s.gameId, ...a, seq: s.actionSeq });
  };
  c.socket!.on('game:state', handler);
  return () => c.socket?.off('game:state', handler);
}

/** Vérifie qu'aucune carte adverse n'est visible pendant une main en cours. */
function assertNoLeak(c: TestClient) {
  for (const s of c.states) {
    if (s.result) continue;
    for (const seat of s.seats) {
      if (!seat || seat.userId === c.userId || !seat.cards) continue;
      const visible = seat.cards.some((x) => x !== null);
      if (visible) expect(seat.allIn || s.seats.filter((x) => x?.inHand && !x.allIn).length <= 1).toBe(true);
    }
  }
}

const randomStrategy = (s: GameView) => {
  const l = s.me.legal!;
  const r = Math.random();
  if (r < 0.12) return { type: 'fold' };
  if (r < 0.75) return { type: l.canCheck ? 'check' : 'call' };
  if (r < 0.98 && (l.canBet || l.canRaise)) return { type: l.canBet ? 'bet' : 'raise', amount: l.minTo };
  return { type: 'allin' };
};

beforeAll(async () => {
  await resetDb();
  server = await startServer(PORT, false);
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe('Comptes et sécurité', () => {
  it('inscription, connexion, session, déconnexion', async () => {
    const c = new TestClient(BASE, `eve${tag}`);
    await c.register();
    expect((await c.api('GET', '/auth/me')).data.user.username).toBe(`eve${tag}`);
    expect((await c.api('POST', '/auth/logout')).status).toBe(200);
    c.cookie = '';
    expect((await c.api('GET', '/auth/me')).data.user).toBeNull();
    const bad = await c.api('POST', '/auth/login', { login: `eve${tag}`, password: 'mauvais' });
    expect(bad.status).toBe(401);
    const ok = await c.api('POST', '/auth/login', { login: `eve${tag}@test.local`, password: 'motdepasse123' });
    expect(ok.status).toBe(200);
  });

  it('refuse les requêtes inter-sites (CSRF) et les accès non authentifiés', async () => {
    const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    expect(res.status).toBe(403);
    const anon = await fetch(`${BASE}/api/rooms`);
    expect(anon.status).toBe(401);
  });

  it('les mots de passe sont hachés (jamais stockés en clair)', async () => {
    const u = await prisma.user.findFirstOrThrow({ where: { username: `eve${tag}` } });
    expect(u.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(u.passwordHash).not.toContain('motdepasse123');
  });

  it('valide les saisies (injection, formats)', async () => {
    const c = new TestClient(BASE, 'x');
    const r = await c.api('POST', '/auth/register', { email: 'pas-un-email', username: "Robert'); DROP TABLE", password: 'abc' });
    expect(r.status).toBe(400);
  });
});

describe('Salons, invitations et cash game multijoueur', () => {
  const alice = new TestClient(BASE, `alice${tag}`);
  const bob = new TestClient(BASE, `bob${tag}`);
  const carol = new TestClient(BASE, `carol${tag}`);
  const dave = new TestClient(BASE, `dave${tag}`);
  let roomId = '';
  let code = '';
  let gameId = '';

  it('création de salon, code, mot de passe et permissions', async () => {
    for (const c of [alice, bob, carol, dave]) await c.register();
    const r = await alice.api('POST', '/rooms', { name: 'Soirée du jeudi', password: 'secret', maxPlayers: 10 });
    expect(r.status).toBe(201);
    roomId = r.data.room.id;
    code = r.data.room.inviteCode;
    expect((await bob.api('POST', '/rooms/join', { code, password: 'faux' })).status).toBe(403);
    expect((await bob.api('POST', '/rooms/join', { code, password: 'secret' })).status).toBe(200);
    // Invitation directe d'un ami : pas de mot de passe requis
    await alice.api('POST', '/friends/request', { username: carol.name });
    const fr = await carol.api('GET', '/friends');
    await carol.api('POST', `/friends/${fr.data.incoming[0].friendshipId}/accept`);
    expect((await alice.api('POST', `/rooms/${roomId}/invite`, { userId: carol.userId })).status).toBe(200);
    expect((await carol.api('POST', '/rooms/join', { code })).status).toBe(200);
    // Un joueur ne peut pas créer de table ni modifier le salon
    expect((await bob.api('POST', `/rooms/${roomId}/games`, { name: 'x', mode: 'CASH' })).status).toBe(403);
    expect((await bob.api('PATCH', `/rooms/${roomId}`, { name: 'piraté' })).status).toBe(403);
    // Un non-membre ne voit pas le salon
    expect((await dave.api('GET', `/rooms/${roomId}`)).status).toBe(403);
  });

  it('création de table avec validation des paramètres', async () => {
    const bad = await alice.api('POST', `/rooms/${roomId}/games`, { name: 'Bad', mode: 'CASH', smallBlind: 500, bigBlind: 100 });
    expect(bad.status).toBe(400);
    const r = await alice.api('POST', `/rooms/${roomId}/games`, {
      name: 'Table conviviale', mode: 'CASH', maxSeats: 6, startingStack: 10000, smallBlind: 50, bigBlind: 100,
      actionSeconds: 5, timeBankSeconds: 0, reloadMode: 'below',
    });
    expect(r.status).toBe(201);
    gameId = r.data.game.id;
  });

  it('accès temps réel réservé aux membres', async () => {
    await dave.connect();
    const r = await dave.emit('game:join', { gameId });
    expect(r.ok).toBe(false);
    dave.disconnect();
  });

  it('les joueurs s’assoient, l’admin démarre, les mains se jouent', async () => {
    for (const c of [alice, bob, carol]) {
      await c.connect();
      const j = await c.emit('game:join', { gameId });
      expect(j.ok).toBe(true);
    }
    expect((await alice.emit('game:sit', { gameId, seat: 0, buyIn: 10000 })).ok).toBe(true);
    expect((await bob.emit('game:sit', { gameId, seat: 0, buyIn: 10000 })).error).toMatch(/occupé/);
    expect((await bob.emit('game:sit', { gameId, seat: 2, buyIn: 999999 })).ok).toBe(false);
    expect((await bob.emit('game:sit', { gameId, seat: 2, buyIn: 10000 })).ok).toBe(true);
    expect((await carol.emit('game:sit', { gameId, seat: 4, buyIn: 8000 })).ok).toBe(true);
    expect((await bob.emit('game:start', { gameId })).ok).toBe(false); // pas admin
    expect((await alice.emit('game:start', { gameId })).ok).toBe(true);

    const s = await alice.waitFor((x) => x.handNumber >= 1 && !!x.turn);
    // Chaque joueur voit ses 2 cartes, jamais celles des autres
    for (const c of [alice, bob, carol]) {
      const st = await c.waitFor((x) => x.handNumber === s.handNumber);
      expect(st.me.cards).toHaveLength(2);
      for (const seat of st.seats) if (seat && seat.userId !== c.userId) expect(seat.cards).toEqual([null, null]);
    }

    // Action hors tour refusée
    const notTurn = [alice, bob, carol].find((c) => c.userId !== s.turn!.userId)!;
    const r1 = await notTurn.emit('game:action', { gameId, type: 'call', seq: notTurn.state!.actionSeq });
    expect(r1.ok).toBe(false);
    // Double clic : la deuxième action identique est rejetée
    const turnC = [alice, bob, carol].find((c) => c.userId === s.turn!.userId)!;
    const seq = turnC.state!.actionSeq;
    const [a1, a2] = await Promise.all([
      turnC.emit('game:action', { gameId, type: 'call', seq }),
      turnC.emit('game:action', { gameId, type: 'call', seq }),
    ]);
    expect([a1.ok, a2.ok].filter(Boolean)).toHaveLength(1);
    // Manipulation : montant supérieur au tapis refusé
    const nextTurn = await alice.waitFor((x) => !!x.turn && x.actionSeq > seq);
    const who = [alice, bob, carol].find((c) => c.userId === nextTurn.turn!.userId)!;
    const st = await who.waitFor((x) => x.actionSeq === nextTurn.actionSeq);
    const over = await who.emit('game:action', { gameId, type: 'raise', amount: 10_000_000, seq: st.actionSeq });
    expect(over.ok).toBe(false);

    const stops = [alice, bob, carol].map((c) => autoPlay(c, randomStrategy));
    await alice.waitFor((x) => x.handNumber >= 15, 60_000);
    stops.forEach((f) => f());
    for (const c of [alice, bob, carol]) assertNoLeak(c);
  });

  it('déconnexion : la partie continue, le joueur passe absent, puis se reconnecte', async () => {
    const stops = [alice, carol].map((c) => autoPlay(c, (s) => ({ type: s.me.legal!.canCheck ? 'check' : 'call' })));
    // Recharge (règle « below ») pour garantir deux joueurs actifs
    for (const c of [alice, carol]) {
      const r = await c.emit('game:reload', { gameId });
      if (!r.ok) expect(r.error).toMatch(/Recharge non autorisée/);
    }
    await alice.waitFor((x) => x.seats.filter((s) => s && s.stack > 0 && !s.sittingOut).length >= 2);
    const bobId = bob.userId;
    bob.disconnect();
    const st = await alice.waitFor((x) => x.seats.some((s) => s?.userId === bobId && !s.connected));
    expect(st.status).toBe('RUNNING');
    // Après deux délais écoulés, bob est mis en absent et n'est plus servi
    await alice.waitFor((x) => x.seats.some((s) => s?.userId === bobId && s.sittingOut), 30_000);
    const h = alice.state!.handNumber;
    await alice.waitFor((x) => x.handNumber >= h + 2, 30_000);
    // Reconnexion : l'état complet est renvoyé
    await bob.connect();
    const j = await bob.emit('game:join', { gameId });
    expect(j.ok).toBe(true);
    const back = await bob.waitFor((x) => x.me.seat === 2);
    expect(back.seats[2]!.connected).toBe(true);
    expect((await bob.emit('game:away', { gameId, away: false })).ok).toBe(true);
    stops.forEach((f) => f());
  });

  it('chat, réactions et validation', async () => {
    const got = new Promise((resolve) => carol.socket!.once('chat:message', resolve));
    expect((await alice.emit('chat:send', { roomId, gameId, text: 'Bonne chance à tous !' })).ok).toBe(true);
    const msg = (await got) as { message: { text: string } };
    expect(msg.message.text).toBe('Bonne chance à tous !');
    expect((await alice.emit('chat:react', { gameId, emoji: '🔥' })).ok).toBe(true);
    expect((await alice.emit('chat:react', { gameId, emoji: '<script>' })).ok).toBe(false);
  });

  it('chacun quitte la table : conservation exacte des jetons virtuels', async () => {
    const stops = [alice, bob, carol].map((c) => autoPlay(c, (s) => ({ type: 'fold' })));
    for (const c of [alice, bob, carol]) expect((await c.emit('game:stand', { gameId })).ok).toBe(true);
    await alice.waitFor((x) => x.seats.every((s) => s === null), 30_000);
    stops.forEach((f) => f());
    const rt = (await import('../src/realtime/socket.js')).getManager().peek(gameId)!;
    await rt.flush();
    const users = await prisma.user.findMany({ where: { id: { in: [alice.userId, bob.userId, carol.userId] } } });
    expect(users.reduce((s, u) => s + u.chips, 0)).toBe(300_000);
    const hands = await prisma.hand.count({ where: { gameId } });
    expect(hands).toBeGreaterThanOrEqual(15);
  });

  it('historique, replay masqué et statistiques', async () => {
    const list = await bob.api('GET', `/hands/game/${gameId}`);
    expect(list.data.hands.length).toBeGreaterThan(0);
    // Trouver une main où alice n'a pas montré ses cartes
    const hp = await prisma.handPlayer.findFirst({ where: { userId: alice.userId, shown: false, hand: { gameId } } });
    if (hp) {
      const r = await bob.api('GET', `/hands/${hp.handId}`);
      const aliceView = r.data.hand.players.find((p: { userId: string }) => p.userId === alice.userId);
      expect(aliceView.cards).toEqual([]);
      const own = await alice.api('GET', `/hands/${hp.handId}`);
      expect(own.data.hand.players.find((p: { userId: string }) => p.userId === alice.userId).cards).toHaveLength(2);
    }
    const me = await alice.api('GET', '/users/me');
    expect(me.data.stats.handsPlayed).toBeGreaterThanOrEqual(15);
    expect(me.data.stats.advanced.vpip).toBeGreaterThanOrEqual(0);
    const lb = await alice.api('GET', `/stats/leaderboard?scope=room&roomId=${roomId}`);
    expect(lb.data.rows.length).toBe(3);
    expect(lb.data.rows.reduce((s: number, r: { net: number }) => s + r.net, 0)).toBe(0);
    const results = await alice.api('GET', `/games/${gameId}/results`);
    expect(results.data.players.reduce((s: number, p: { net: number }) => s + p.net, 0)).toBe(0);
  });

  it('modération : bannissement d’un membre', async () => {
    expect((await bob.api('POST', `/rooms/${roomId}/members/${carol.userId}/ban`)).status).toBe(403);
    expect((await alice.api('POST', `/rooms/${roomId}/members/${carol.userId}/ban`)).status).toBe(200);
    expect((await carol.api('GET', `/rooms/${roomId}`)).status).toBe(403);
    expect((await carol.emit('game:join', { gameId })).ok).toBe(false);
  });

  it('tournoi Sit & Go jusqu’au vainqueur', async () => {
    await alice.api('POST', `/rooms/${roomId}/members/${carol.userId}/unban`);
    const r = await alice.api('POST', `/rooms/${roomId}/games`, {
      name: 'SNG', mode: 'TOURNAMENT', maxSeats: 3, startingStack: 1000, smallBlind: 50, bigBlind: 100,
      actionSeconds: 5, timeBankSeconds: 0, buyIn: 1000, levelMinutes: 5,
    });
    expect(r.status).toBe(201);
    const tid = r.data.game.id as string;
    for (const c of [alice, bob, carol]) {
      expect((await c.emit('game:join', { gameId: tid })).ok).toBe(true);
      expect((await c.emit('game:register', { gameId: tid })).ok).toBe(true);
    }
    const stops = [alice, bob, carol].map((c) => autoPlay(c, () => ({ type: 'allin' })));
    expect((await alice.emit('game:start', { gameId: tid })).ok).toBe(true);
    const end = await alice.waitFor((x) => x.gameId === tid && x.status === 'FINISHED', 60_000);
    stops.forEach((f) => f());
    expect(end.tournament!.results.map((x) => x.place).sort()).toEqual([1, 2, 3]);
    expect(end.tournament!.prizes).toEqual([3000]);
    const rt = (await import('../src/realtime/socket.js')).getManager().peek(tid)!;
    await rt.flush();
    const gp = await prisma.gamePlayer.findMany({ where: { gameId: tid } });
    expect(gp.map((p) => p.place).sort()).toEqual([1, 2, 3]);
    const users = await prisma.user.findMany({ where: { id: { in: [alice.userId, bob.userId, carol.userId] } } });
    expect(users.reduce((s, u) => s + u.chips, 0)).toBe(300_000);
    for (const c of [alice, bob, carol]) c.disconnect();
  });
});
