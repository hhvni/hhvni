import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/cards.js';
import { compareHands, evaluateBest, HandCategory } from '../src/evaluator.js';

const ev = (s: string) => evaluateBest(parseCards(s));
const cmp = (a: string, b: string) => compareHands(parseCards(a), parseCards(b));

describe('Évaluateur : les dix combinaisons', () => {
  const cases: [string, HandCategory, string][] = [
    ['As Ks Qs Js Ts 2d 3c', HandCategory.RoyalFlush, 'Quinte flush royale'],
    ['9h 8h 7h 6h 5h Ac Ad', HandCategory.StraightFlush, 'Quinte flush hauteur Neuf'],
    ['Qc Qd Qh Qs 2c 3d 4h', HandCategory.FourOfAKind, 'Carré de Dames'],
    ['Kc Kd Kh 7s 7c 2d 3h', HandCategory.FullHouse, 'Full, Rois par les Sept'],
    ['Ad 9d 7d 4d 2d Kc Qh', HandCategory.Flush, 'Couleur hauteur As'],
    ['9c Td Jh Qs Kd 2c 3c', HandCategory.Straight, 'Quinte hauteur Roi'],
    ['7c 7d 7h Ks 2d 4c 9h', HandCategory.ThreeOfAKind, 'Brelan de Sept'],
    ['Jc Jd 4h 4s Ad 2c 8h', HandCategory.TwoPair, 'Double paire, Valets et Quatre'],
    ['Tc Td 4h 3s Ad 2c 8h', HandCategory.OnePair, 'Paire de Dix'],
    ['Ac Jd 9h 7s 5d 3c 2h', HandCategory.HighCard, 'Carte haute As'],
  ];
  for (const [cards, cat, desc] of cases) {
    it(desc, () => {
      const r = ev(cards);
      expect(r.category).toBe(cat);
      expect(r.description).toBe(desc);
      expect(r.cards).toHaveLength(5);
    });
  }
  it('ordre des catégories', () => {
    const scores = cases.map(([c]) => ev(c).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i - 1]!).toBeGreaterThan(scores[i]!);
  });
});

describe('Quintes avec As bas', () => {
  it('A-2-3-4-5 est une quinte hauteur 5', () => {
    const r = ev('Ac 2d 3h 4s 5d Kc Qh');
    expect(r.category).toBe(HandCategory.Straight);
    expect(r.description).toBe('Quinte hauteur Cinq');
  });
  it('la roue perd contre 2-3-4-5-6', () => {
    expect(cmp('Ac 2d 3h 4s 5d Kc Kh', '6c 2d 3h 4s 5d Kc Kh')).toBe(-1);
  });
  it('quinte flush à la roue', () => {
    const r = ev('Ah 2h 3h 4h 5h Kd Qd');
    expect(r.category).toBe(HandCategory.StraightFlush);
    expect(r.ranks).toEqual([5, 4, 3, 2, 1]);
  });
  it('pas de quinte qui « tourne » (Q-K-A-2-3)', () => {
    expect(ev('Qc Kd Ah 2s 3d 8c 9h').category).toBe(HandCategory.HighCard);
  });
  it('la plus haute quinte parmi 7 cartes est retenue', () => {
    expect(ev('Ac 2d 3h 4s 5d 6c 7h').description).toBe('Quinte hauteur Sept');
  });
});

describe('Kickers et égalités', () => {
  it('paire identique, le kicker décide', () => {
    expect(cmp('Ac Ad Kh 7s 4d 3c 2h', 'Ah As Qh 7c 4d 3c 2h')).toBe(1);
  });
  it('kicker au-delà des 5 cartes ignoré → égalité', () => {
    // Board : A A K Q J ; les mains 3 et 2 ne jouent pas
    expect(cmp('Ac Ad Kh Qs Jd 3c 2h', 'Ac Ad Kh Qs Jd 3h 2s')).toBe(0);
  });
  it('double paire : le kicker décide', () => {
    expect(cmp('Kc Kd 8h 8s Ad 2c 3h', 'Kh Ks 8c 8d Qd 2c 3h')).toBe(1);
  });
  it('double paire : la 3e paire du board ne compte pas, meilleur kicker', () => {
    // board 9 9 5 5 2 : A > K en kicker
    expect(cmp('9c 9d 5h 5s 2d Ac 3h', '9c 9d 5h 5s 2d Kc 3h')).toBe(1);
  });
  it('brelan avec deux kickers', () => {
    expect(cmp('7c 7d 7h As 9d 2c 3h', '7c 7d 7h As 8d 2c 3h')).toBe(1);
  });
  it('couleurs identiques : comparaison carte par carte', () => {
    expect(cmp('Ah Kh 9h 5h 3h 2c 2d', 'Ah Kh 9h 5h 2h Qc Qd')).toBe(1);
    expect(cmp('Ah Kh 9h 5h 3h', 'As Ks 9s 5s 3s')).toBe(0);
  });
  it('full : le brelan prime sur la paire', () => {
    expect(cmp('3c 3d 3h Ks Kd', '2c 2d 2h As Ad')).toBe(1);
  });
  it('full avec deux brelans : meilleur full retenu', () => {
    const r = ev('9c 9d 9h 4s 4d 4c 2h');
    expect(r.category).toBe(HandCategory.FullHouse);
    expect(r.ranks).toEqual([9, 9, 9, 4, 4]);
  });
  it('carré : le kicker compte', () => {
    expect(cmp('5c 5d 5h 5s Ad', '5c 5d 5h 5s Kd')).toBe(1);
  });
  it('le board joue pour les deux → égalité', () => {
    const board = 'Ts Js Qs Ks As';
    expect(cmp(`${board} 2c 3d`, `${board} 4h 7c`)).toBe(0);
  });
  it('quinte égale → partage', () => {
    expect(cmp('5c 6d 7h 8s 9d Ac 2h', '5c 6d 7h 8s 9d Kc 2h')).toBe(0);
  });
  it('refuse les cartes en double', () => {
    expect(() => ev('Ac Ac Kh 7s 4d')).toThrow();
  });
});
