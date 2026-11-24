import { describe, expect, it } from 'vitest';
import { PokerTable } from '../src/table.js';
import { makeTable, rigDeck } from './helpers.js';

const cash = (stacks: number[]) => {
  const t = makeTable(stacks, { maxSeats: 6 });
  t.config.enforceBlindRules = true;
  return t;
};
const foldAround = (t: PokerTable) => {
  while (!t.hand!.finished) {
    const id = t.currentPlayerId()!;
    t.act(id, { type: t.legalActions(id)!.canCheck ? 'check' : 'fold' });
  }
};
const dealt = (t: PokerTable) => t.hand!.players.map((p) => p.playerId).sort();

describe('Règles de blinds (cash game)', () => {
  it("avant la première main, tout le monde est servi sans attendre", () => {
    const t = cash([1000, 1000, 1000]);
    t.startHand();
    expect(dealt(t)).toEqual(['p0', 'p1', 'p2']);
  });

  it('un nouveau venu attend que la grosse blinde arrive à sa place', () => {
    const t = cash([1000, 1000, 1000, 0, 0, 0]);
    t.stand('p3'); t.stand('p4'); t.stand('p5');
    t.startHand(); // bouton 0, SB 1, BB 2
    foldAround(t);
    t.sit(3, 'new', 'Nouveau', 1000);
    expect(t.seats[3]!.waitBB).toBe(true);
    // Main 2 : bouton 1, SB 2, la BB devrait aller au siège 3 → le nouveau entre en grosse blinde
    const h2 = t.startHand();
    expect(h2.bbSeat).toBe(3);
    expect(dealt(t)).toContain('new');
    expect(h2.players.find((p) => p.playerId === 'new')!.streetBet).toBe(100);
    expect(t.seats[3]!.waitBB).toBe(false);
  });

  it('payer 1 BB pour jouer tout de suite', () => {
    const t = cash([1000, 1000, 1000, 0, 0, 0]);
    t.stand('p3'); t.stand('p4'); t.stand('p5');
    t.startHand();
    foldAround(t);
    t.startHand(); // bouton 1, SB 2, BB 0
    foldAround(t);
    t.sit(5, 'new', 'Nouveau', 1000); // la BB n'arrive pas tout de suite au siège 5
    expect(t.postNowAmount('new')).toBe(100);
    // Sans payer : pas servi
    const h3 = t.startHand(); // bouton 2, SB 0, BB 1
    expect(dealt(t)).not.toContain('new');
    foldAround(t);
    t.requestPostNow('new');
    const h4 = t.startHand();
    const p = h4.players.find((x) => x.playerId === 'new')!;
    expect(p).toBeDefined();
    expect(p.streetBet).toBe(100); // BB « live »
    expect(h4.events.some((e) => e.type === 'blind' && e.kind === 'post' && e.playerId === 'new')).toBe(true);
    void h3;
  });

  it("esquiver ses blindes en s'absentant ne marche plus : blinde manquée à repayer", () => {
    const t = cash([1000, 1000, 1000, 1000]);
    t.startHand(); // bouton 0, SB 1, BB 2
    foldAround(t);
    // p3 serait SB puis BB : il s'absente juste avant
    t.setSittingOut('p3', true);
    t.startHand(); // bouton 1, SB 2, BB 0 (p3 sauté)
    foldAround(t);
    t.startHand(); // bouton 2, SB 0, BB 1
    foldAround(t);
    expect(t.seats[3]!.missedBB).toBe(true);
    expect(t.seats[3]!.missedSB).toBe(true);
    t.setSittingOut('p3', false);
    expect(t.seats[3]!.waitBB).toBe(true);
    expect(t.postNowAmount('p3')).toBe(150); // BB live + SB morte
    t.requestPostNow('p3');
    const total = () => t.seats.reduce((n, s) => n + (s?.stack ?? 0), 0) + (t.hand && !t.hand.finished ? t.hand.players.reduce((n, p) => n + p.totalBet, 0) : 0);
    const before = total();
    const h = t.startHand();
    const p3 = h.players.find((x) => x.playerId === 'p3')!;
    expect(p3.streetBet).toBe(100);
    expect(p3.totalBet).toBe(150);
    expect(h.events.some((e) => e.type === 'blind' && e.kind === 'dead' && e.amount === 50)).toBe(true);
    foldAround(t);
    expect(total()).toBe(before);
    expect(t.seats[3]!.missedBB).toBe(false);
  });

  it('en tournoi (règles désactivées) personne n’attend', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    foldAround(t);
    t.sit(3, 'late', 'Tard', 1000);
    t.startHand();
    expect(dealt(t)).toContain('late');
  });
});

describe('Showdown : mains jetées', () => {
  it('sans mise à la river, le premier à gauche du bouton montre d’office, puis le gagnant', () => {
    const t = makeTable([1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: '7c 2d' }, 'Kc 9d 4h 3s Js'));
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'check' });
    for (let i = 0; i < 6; i++) t.act(t.currentPlayerId()!, { type: 'check' });
    const sd = t.hand!.events.find((e) => e.type === 'showdown');
    if (sd?.type !== 'showdown') throw new Error('pas de showdown');
    // Personne n'a misé à la river : le premier à gauche du bouton (p1) montre d'office
    expect(sd.hands.map((h) => h.playerId).sort()).toEqual(['p0', 'p1']);
  });

  it('le dernier agresseur montre en premier et un perdant qui suit jette sa main', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: '7c 2d', 2: 'Kd Qd' }, 'Kc 9d 4h 3s Js'));
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'check' });
    for (let i = 0; i < 6; i++) t.act(t.currentPlayerId()!, { type: 'check' });
    // River : p0 mise, les deux autres suivent
    t.act('p1', { type: 'check' });
    t.act('p2', { type: 'check' });
    t.act('p0', { type: 'bet', amount: 200 });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'call' });
    const sd = t.hand!.events.find((e) => e.type === 'showdown');
    if (sd?.type !== 'showdown') throw new Error('pas de showdown');
    expect(sd.hands.map((h) => h.playerId)).toEqual(['p0']); // AA gagne, montre
    expect(sd.mucked!.sort()).toEqual(['p1', 'p2']);
    expect(t.hand!.players.find((p) => p.playerId === 'p1')!.shown).toBe(false);
  });

  it('un perdant agresseur à la river doit montrer', () => {
    const t = makeTable([1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: '7c 2d', 1: 'As Ah' }, 'Kc 9d 4h 3s Js'));
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'check' });
    for (let i = 0; i < 4; i++) t.act(t.currentPlayerId()!, { type: 'check' });
    t.act('p1', { type: 'check' });
    t.act('p0', { type: 'bet', amount: 300 }); // bluff
    t.act('p1', { type: 'call' });
    const sd = t.hand!.events.find((e) => e.type === 'showdown');
    if (sd?.type !== 'showdown') throw new Error('pas de showdown');
    expect(sd.hands.map((h) => h.playerId).sort()).toEqual(['p0', 'p1']);
  });

  it('montrer volontairement ses cartes après un coup gagné sans showdown', () => {
    const t = makeTable([1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'raise', amount: 300 });
    t.act('p1', { type: 'fold' });
    expect(() => t.showCards('p0')).not.toThrow();
    expect(t.hand!.players.find((p) => p.playerId === 'p0')!.shown).toBe(true);
    expect(() => t.showCards('p0')).toThrow(/déjà/);
  });
});
