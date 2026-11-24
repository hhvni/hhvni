import { describe, expect, it } from 'vitest';
import { makeTable, rigDeck, stacksOf } from './helpers.js';

const total = (t: ReturnType<typeof makeTable>) => Object.values(stacksOf(t)).reduce((a, b) => a + b, 0);

describe('Straddle', () => {
  it('le joueur après la grosse blinde mise 2 BB, l’action part après lui et il parle en dernier', () => {
    const t = makeTable([1000, 1000, 1000, 1000]);
    t.config.straddle = true;
    t.setStraddle('p3', true); // bouton 0, SB 1, BB 2 → UTG = 3
    const h = t.startHand();
    expect(h.straddleSeat).toBe(3);
    expect(h.players.find((p) => p.seat === 3)!.streetBet).toBe(200);
    expect(h.currentBet).toBe(200);
    expect(t.currentPlayerId()).toBe('p0'); // premier à parler : après le straddler
    expect(t.legalActions('p0')!.callAmount).toBe(200);
    expect(t.legalActions('p0')!.minTo).toBe(400); // relance minimum : 4 BB
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'call' });
    // Le straddler a l'option (il parle en dernier)
    expect(t.currentPlayerId()).toBe('p3');
    expect(t.legalActions('p3')!.canCheck).toBe(true);
    expect(t.legalActions('p3')!.canRaise).toBe(true);
    t.act('p3', { type: 'check' });
    expect(t.hand!.street).toBe('flop');
  });

  it('refusé si la table ne l’autorise pas ; pas de straddle à 2 joueurs', () => {
    const t = makeTable([1000, 1000, 1000]);
    expect(() => t.setStraddle('p0', true)).toThrow(/désactivé/);
    const hu = makeTable([1000, 1000]);
    hu.config.straddle = true;
    hu.setStraddle('p0', true);
    hu.setStraddle('p1', true);
    expect(hu.startHand().straddleSeat).toBeNull();
  });

  it('le straddle tourne : seul le joueur en position UTG le paie', () => {
    const t = makeTable([1000, 1000, 1000, 1000]);
    t.config.straddle = true;
    t.setStraddle('p3', true);
    t.startHand();
    while (!t.hand!.finished) t.act(t.currentPlayerId()!, { type: 'fold' });
    const h2 = t.startHand(); // bouton 1, SB 2, BB 3 → UTG 0 (pas de straddle)
    expect(h2.straddleSeat).toBeNull();
    expect(total(t)).toBe(4000);
  });
});

describe('Run it twice', () => {
  const allInHU = (accept: boolean) => {
    const t = makeTable([1000, 1000]);
    t.config.runItTwice = true;
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: 'Kc Kd' }, '2c 7d 9h Js 3c'));
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'call' });
    expect(t.hand!.pendingRunout).toBe(true);
    expect(t.hand!.finished).toBe(false);
    expect(t.hand!.board).toHaveLength(0);
    t.resolveRunout(accept ? 2 : 1);
    return t;
  };

  it('le tapis est mis en pause pour décider, puis joué une fois si refusé', () => {
    const t = allInHU(false);
    expect(t.hand!.finished).toBe(true);
    expect(t.hand!.board2).toBeUndefined();
    expect(stacksOf(t)).toEqual({ p0: 2000, p1: 0 });
  });

  it('accepté : deux boards différents, chaque moitié du pot à son gagnant', () => {
    const t = allInHU(true);
    const h = t.hand!;
    expect(h.finished).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(h.board2).toHaveLength(5);
    expect(h.board2!.some((c) => h.board.includes(c))).toBe(false); // aucune carte commune (tapis préflop)
    const runs = h.events.filter((e) => e.type === 'potAwarded');
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.type === 'potAwarded' && r.amount)).toEqual([1000, 1000]);
    expect(total(t)).toBe(2000);
  });

  it('tapis au flop : les deux boards partagent le flop', () => {
    const t = makeTable([1000, 1000]);
    t.config.runItTwice = true;
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: 'Kc Kd' }, '2c 7d 9h Js 3c'));
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'check' });
    t.act('p1', { type: 'allin' });
    t.act('p0', { type: 'call' });
    t.resolveRunout(2);
    const h = t.hand!;
    expect(h.board2!.slice(0, 3)).toEqual(h.board.slice(0, 3));
    expect(h.board2!.slice(3)).not.toEqual(h.board.slice(3));
    expect(total(t)).toBe(2000);
  });

  it('jeton indivisible au premier déroulé, pots secondaires coupés en deux', () => {
    const t = makeTable([301, 1000, 1000]);
    t.config.runItTwice = true;
    t.startHand();
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'allin' });
    t.act('p2', { type: 'call' });
    t.resolveRunout(2);
    expect(total(t)).toBe(2301);
    const amounts = t.hand!.events.filter((e) => e.type === 'potAwarded').map((e) => (e.type === 'potAwarded' ? e.amount : 0));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(2301);
  });

  it('fuzzing : 500 tapis joués deux fois, jetons toujours conservés', () => {
    for (let i = 0; i < 500; i++) {
      const n = 2 + (i % 4);
      const t = makeTable(Array.from({ length: n }, (_, k) => 200 + ((k * 137 + i * 61) % 1800)));
      t.config.runItTwice = true;
      const before = total(t);
      t.startHand();
      let guard = 0;
      while (!t.hand!.finished && guard++ < 50) {
        if (t.hand!.pendingRunout) t.resolveRunout(i % 2 ? 2 : 1);
        else t.act(t.currentPlayerId()!, { type: 'allin' });
      }
      expect(t.hand!.finished).toBe(true);
      expect(total(t)).toBe(before);
    }
  });
});

describe('Straddle général (bomb pot)', () => {
  it('tout le monde pose 2 BB, pas d’enchères préflop, le jeu reprend au flop', () => {
    const t = makeTable([1000, 1000, 1000, 1000]);
    const h = t.startHand(undefined, undefined, { bombPot: 200 });
    expect(h.bombPot).toBe(200);
    expect(h.players.every((p) => p.totalBet === 200 && p.stack === 800)).toBe(true);
    expect(h.street).toBe('flop');
    expect(h.board).toHaveLength(3);
    expect(h.events.some((e) => e.type === 'action' && e.street === 'preflop')).toBe(false);
    // Premier à parler au flop : à gauche du bouton, personne n'a misé
    expect(t.currentPlayerId()).toBe('p1');
    expect(t.legalActions('p1')!.canCheck).toBe(true);
    expect(t.currentPots()[0]!.amount).toBe(800);
    while (!t.hand!.finished) t.act(t.currentPlayerId()!, { type: 'check' });
    expect(total(t)).toBe(4000);
  });

  it('joueur trop court : tapis en posant, le reste se joue normalement', () => {
    const t = makeTable([150, 1000, 1000]);
    const h = t.startHand(undefined, undefined, { bombPot: 200 });
    expect(h.players.find((p) => p.playerId === 'p0')!.allIn).toBe(true);
    while (!t.hand!.finished) t.act(t.currentPlayerId()!, { type: 'check' });
    expect(total(t)).toBe(2150);
  });

  it('la main suivante reprend normalement avec blinds', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand(undefined, undefined, { bombPot: 200 });
    while (!t.hand!.finished) t.act(t.currentPlayerId()!, { type: 'check' });
    const h2 = t.startHand();
    expect(h2.bombPot).toBeUndefined();
    expect(h2.street).toBe('preflop');
    expect(h2.currentBet).toBe(100);
  });
});
