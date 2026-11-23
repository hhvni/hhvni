import { describe, expect, it } from 'vitest';
import { buildPots, distributePots } from '../src/pots.js';

describe('Pots secondaires', () => {
  it('pot simple', () => {
    expect(buildPots([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 100, folded: false },
    ])).toEqual([{ amount: 200, eligible: ['a', 'b'] }]);
  });
  it('trois all-in de tailles différentes', () => {
    const pots = buildPots([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 300, folded: false },
      { playerId: 'c', amount: 500, folded: false },
      { playerId: 'd', amount: 500, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 400, eligible: ['a', 'b', 'c', 'd'] },
      { amount: 600, eligible: ['b', 'c', 'd'] },
      { amount: 400, eligible: ['c', 'd'] },
    ]);
  });
  it("jetons d'un joueur couché dans les pots, sans éligibilité", () => {
    const pots = buildPots([
      { playerId: 'a', amount: 50, folded: false },
      { playerId: 'b', amount: 200, folded: true },
      { playerId: 'c', amount: 200, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligible: ['a', 'c'] },
      { amount: 300, eligible: ['c'] },
    ]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(450);
  });
  it('partage avec jeton indivisible au premier à gauche du bouton', () => {
    const [award] = distributePots([{ amount: 301, eligible: ['a', 'b'] }], { a: 10, b: 10 }, ['b', 'a']);
    expect(award!.shares).toEqual({ b: 151, a: 150 });
  });
  it('pot secondaire gagné par un autre joueur que le pot principal', () => {
    const pots = buildPots([
      { playerId: 'short', amount: 100, folded: false },
      { playerId: 'x', amount: 400, folded: false },
      { playerId: 'y', amount: 400, folded: false },
    ]);
    const awards = distributePots(pots, { short: 100, x: 50, y: 10 }, ['short', 'x', 'y']);
    expect(awards[0]!.shares).toEqual({ short: 300 });
    expect(awards[1]!.shares).toEqual({ x: 600 });
  });
  it('égalité dans le pot secondaire seulement', () => {
    const pots = buildPots([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 250, folded: false },
      { playerId: 'c', amount: 250, folded: false },
    ]);
    const awards = distributePots(pots, { a: 99, b: 50, c: 50 }, ['a', 'b', 'c']);
    expect(awards[0]!.shares).toEqual({ a: 300 });
    expect(awards[1]!.shares).toEqual({ b: 150, c: 150 });
  });
});
