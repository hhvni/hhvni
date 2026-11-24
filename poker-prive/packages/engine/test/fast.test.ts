import { describe, expect, it } from 'vitest';
import { freshDeck, shuffle } from '../src/cards.js';
import { evaluateBest, fastScore } from '../src/evaluator.js';

describe('Évaluateur rapide', () => {
  it('donne exactement le même score que l’évaluateur de référence (200 000 mains)', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 200_000; i++) {
      const n = 5 + (i % 3);
      const cards = shuffle(freshDeck(), rand).slice(0, n);
      const ref = evaluateBest(cards).score;
      const fast = fastScore(cards);
      if (ref !== fast) throw new Error(`${cards.join(' ')} : ${ref} ≠ ${fast}`);
    }
    expect(true).toBe(true);
  }, 120_000);
});
