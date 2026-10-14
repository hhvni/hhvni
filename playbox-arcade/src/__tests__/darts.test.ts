import { powerOffset, scoreDart, SECTORS, IDEAL_SPEED } from '../games/darts/logic';

const R = 170; // rayon écran = millimètres pour simplifier

function polar(deg: number, r: number) {
  // deg : 0 = haut, sens horaire (repère écran, y vers le bas)
  const a = ((deg - 90) * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
}

describe('scoreDart', () => {
  it('compte le bull et le 25', () => {
    expect(scoreDart(0, 0, R)).toMatchObject({ points: 50, kind: 'bull' });
    expect(scoreDart(10, 0, R)).toMatchObject({ points: 25, kind: 'outerBull' });
  });

  it('respecte l’ordre réglementaire des secteurs', () => {
    SECTORS.forEach((n, i) => {
      const [x, y] = polar(i * 18, 60);
      expect(scoreDart(x, y, R)).toMatchObject({ points: n, multiplier: 1 });
    });
  });

  it('détecte triples et doubles', () => {
    const [tx, ty] = polar(0, 103);
    expect(scoreDart(tx, ty, R)).toMatchObject({ points: 60, label: 'T20' });
    const [dx, dy] = polar(18, 166);
    expect(scoreDart(dx, dy, R)).toMatchObject({ points: 2, label: 'D1' });
  });

  it('renvoie raté hors de la cible', () => {
    expect(scoreDart(0, -200, R)).toMatchObject({ points: 0, kind: 'miss' });
  });

  it('s’adapte au rayon d’affichage', () => {
    const [x, y] = polar(0, 103 / 2);
    expect(scoreDart(x, y, R / 2).points).toBe(60);
  });
});

describe('powerOffset', () => {
  it('ne dévie pas un lancer à la vitesse idéale', () => {
    expect(powerOffset(IDEAL_SPEED, false)).toEqual({ dy: 0, verdict: 'perfect' });
  });
  it('fait tomber un lancer trop doux et monter un lancer trop fort', () => {
    const soft = powerOffset(IDEAL_SPEED * 0.4, false);
    const hard = powerOffset(IDEAL_SPEED * 1.8, false);
    expect(soft.verdict).toBe('soft');
    expect(soft.dy).toBeGreaterThan(0);
    expect(hard.verdict).toBe('hard');
    expect(hard.dy).toBeLessThan(0);
  });
  it('élargit la tolérance avec l’aide à la visée', () => {
    expect(powerOffset(IDEAL_SPEED * 1.3, false).verdict).toBe('hard');
    expect(powerOffset(IDEAL_SPEED * 1.3, true).verdict).toBe('perfect');
  });
});
