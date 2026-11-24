import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/cards.js';
import { allInEquity } from '../src/equity.js';

const h = (s: string) => parseCards(s);

describe('Probabilités de gain à tapis', () => {
  it('AA contre KK préflop ≈ 82 %', () => {
    const [aa, kk] = allInEquity([h('As Ah'), h('Ks Kh')], [], 8000);
    expect(aa!.win).toBeGreaterThan(0.79);
    expect(aa!.win).toBeLessThan(0.85);
    expect(kk!.win).toBeGreaterThan(0.15);
  });
  it('exact au turn : tirage couleur contre paire (9 outs sur 44)', () => {
    const [flush, pair] = allInEquity([h('Ah 2h'), h('Kc Kd')], h('Kh 7h 3s 9c'));
    // 9 cœurs restants, mais 9h et 3h donnent un full aux Rois : 7 outs sur 44
    expect(flush!.win).toBeCloseTo(7 / 44, 5);
    expect(flush!.win + pair!.win + flush!.tie).toBeCloseTo(1, 5);
  });
  it('exact au flop (990 tableaux) et somme = 100 %', () => {
    const r = allInEquity([h('Qs Qd'), h('Js Ts')], h('9s 8d 2c'));
    expect(r[0]!.win + r[1]!.win + r[0]!.tie).toBeCloseTo(1, 5);
  });
  it('partage certain quand le board joue', () => {
    const r = allInEquity([h('2c 3d'), h('4c 5d')], h('As Ks Qs Js Ts'));
    expect(r[0]).toEqual({ win: 0, tie: 1 });
  });
  it('3 joueurs : les probabilités somment à 1', () => {
    const r = allInEquity([h('As Ah'), h('Ks Kh'), h('7c 2d')], [], 4000);
    const sum = r.reduce((s, x) => s + x.win, 0) + Math.max(...r.map((x) => x.tie));
    expect(sum).toBeGreaterThan(0.97);
    expect(sum).toBeLessThan(1.03);
  });
});
