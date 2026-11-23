import { describe, expect, it } from 'vitest';
import { Deck, freshDeck, secureRandomInt, shuffle } from '../src/cards.js';

describe('Jeu de cartes et mélange', () => {
  it('52 cartes uniques', () => {
    expect(new Set(freshDeck()).size).toBe(52);
    const d = new Deck();
    const all = Array.from({ length: 52 }, () => d.draw());
    expect(new Set(all).size).toBe(52);
    expect(() => d.draw()).toThrow();
  });
  it('secureRandomInt reste dans les bornes', () => {
    for (let i = 0; i < 10000; i++) {
      const v = secureRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
  it('Fisher-Yates : distribution uniforme des positions (khi-deux)', () => {
    const N = 60000;
    const counts = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
    for (let i = 0; i < N; i++) {
      const arr = shuffle([0, 1, 2, 3]);
      arr.forEach((v, pos) => counts[v]![pos]!++);
    }
    const expected = N / 4;
    let chi = 0;
    for (const row of counts) for (const c of row) chi += (c - expected) ** 2 / expected;
    // 9 degrés de liberté : seuil p=0.001 ≈ 27.9
    expect(chi).toBeLessThan(27.9);
  });
});
