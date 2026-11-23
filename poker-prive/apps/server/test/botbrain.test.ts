/** Comportement des robots : style « régulier » mesuré sur des milliers de mains simulées. */
import { describe, expect, it } from 'vitest';
import { computeHandStats, parseCards, PokerTable, type Card } from '@poker/engine';
import { decide, percentile } from '../src/services/botBrain.js';

function simulate(players: number, hands: number, stack = 10000) {
  const t = new PokerTable({ smallBlind: 50, bigBlind: 100, ante: 0, maxSeats: 9 });
  for (let i = 0; i < players; i++) t.sit(i, `b${i}`, `Bot${i}`, stack);
  let vpip = 0, pfr = 0, seen = 0, preflopAllIn = 0, decisions = 0, timeMs = 0, maxMs = 0, showdowns = 0;
  for (let n = 0; n < hands; n++) {
    // Tapis remis à 100 BB à chaque main (cash game)
    for (const s of t.seats) if (s) s.stack = stack;
    const h = t.startHand();
    let guard = 0;
    while (!h.finished && guard++ < 300) {
      const id = t.currentPlayerId()!;
      const t0 = performance.now();
      const d = decide(h, id, t.legalActions(id)!);
      const dt = performance.now() - t0;
      timeMs += dt; maxMs = Math.max(maxMs, dt); decisions++;
      t.act(id, { type: d.type === 'fold' && t.legalActions(id)!.canCheck ? 'check' : d.type, amount: d.amount });
    }
    const stats = computeHandStats(h.events);
    for (const s of stats) { seen++; if (s.vpip) vpip++; if (s.pfr) pfr++; }
    if (h.events.some((e) => e.type === 'action' && e.street === 'preflop' && e.allIn)) preflopAllIn++;
    if (h.events.some((e) => e.type === 'showdown')) showdowns++;
  }
  return { vpip: vpip / seen, pfr: pfr / seen, preflopAllIn: preflopAllIn / hands, avgMs: timeMs / decisions, maxMs, showdowns: showdowns / hands };
}

describe('Cerveau des robots', () => {
  it('classement préflop cohérent', () => {
    const p = (s: string) => percentile(parseCards(s) as Card[]);
    expect(p('As Ah')).toBeLessThan(0.01);
    expect(p('Ks Kd')).toBeLessThan(p('Ah Qd'));
    expect(p('Ah Ks')).toBeLessThan(p('Th 9h'));
    expect(p('7c 2d')).toBeGreaterThan(0.9);
  });

  it('6 joueurs à 100 BB : style régulier, pas de tapis préflop à tout-va', () => {
    const r = simulate(6, 600);
    console.log('6-max', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))));
    expect(r.vpip).toBeGreaterThan(0.16);
    expect(r.vpip).toBeLessThan(0.36);
    expect(r.pfr).toBeGreaterThan(0.1);
    expect(r.pfr).toBeLessThan(r.vpip);
    expect(r.preflopAllIn).toBeLessThan(0.04);
    expect(r.maxMs).toBeLessThan(400);
  }, 120_000);

  it('heads-up : jeu plus large mais toujours maîtrisé', () => {
    const r = simulate(2, 600);
    console.log('HU', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))));
    expect(r.vpip).toBeGreaterThan(0.4);
    expect(r.preflopAllIn).toBeLessThan(0.06);
  }, 120_000);

  it('tapis court (8 BB) : tapis ou se coucher', () => {
    const r = simulate(6, 300, 800);
    expect(r.preflopAllIn).toBeGreaterThan(0.15);
  }, 120_000);
});
