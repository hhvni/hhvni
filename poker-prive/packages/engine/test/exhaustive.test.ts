import { describe, expect, it } from 'vitest';
import { freshDeck } from '../src/cards.js';
import { evaluate5, HandCategory } from '../src/evaluator.js';

/**
 * Vérification exhaustive : les 2 598 960 mains de 5 cartes doivent produire
 * exactement les fréquences connues de chaque combinaison.
 */
describe('Évaluateur : vérification exhaustive des 2 598 960 mains', () => {
  it('fréquences exactes par catégorie', () => {
    const d = freshDeck();
    const counts = new Array<number>(10).fill(0);
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let e = c + 1; e < 51; e++)
            for (let f = e + 1; f < 52; f++) counts[evaluate5([d[a]!, d[b]!, d[c]!, d[e]!, d[f]!]).category]!++;
    expect(counts[HandCategory.RoyalFlush]).toBe(4);
    expect(counts[HandCategory.StraightFlush]).toBe(36);
    expect(counts[HandCategory.FourOfAKind]).toBe(624);
    expect(counts[HandCategory.FullHouse]).toBe(3744);
    expect(counts[HandCategory.Flush]).toBe(5108);
    expect(counts[HandCategory.Straight]).toBe(10200);
    expect(counts[HandCategory.ThreeOfAKind]).toBe(54912);
    expect(counts[HandCategory.TwoPair]).toBe(123552);
    expect(counts[HandCategory.OnePair]).toBe(1098240);
    expect(counts[HandCategory.HighCard]).toBe(1302540);
  }, 120_000);
});
