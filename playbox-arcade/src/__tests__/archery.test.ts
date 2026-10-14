import { drawDrop, scoreArrow, swayAmplitude, volleyConfig, windDrift } from '../games/archery/logic';

describe('tir à l’arc', () => {
  it('compte les anneaux de 10 à 1 et le X', () => {
    expect(scoreArrow(0, 0, 100)).toEqual({ points: 10, x: true });
    expect(scoreArrow(8, 0, 100)).toEqual({ points: 10, x: false });
    expect(scoreArrow(15, 0, 100).points).toBe(9);
    expect(scoreArrow(95, 0, 100).points).toBe(1);
    expect(scoreArrow(101, 0, 100).points).toBe(0);
  });

  it('éloigne la cible à chaque volée', () => {
    const radii = [0, 1, 2, 3, 4].map((i) => volleyConfig(i, () => 0.5).radius);
    expect([...radii].sort((a, b) => b - a)).toEqual(radii);
  });

  it('le vent pousse dans son sens, plus fort de loin', () => {
    expect(windDrift(5, 30)).toBeGreaterThan(0);
    expect(windDrift(-5, 30)).toBeLessThan(0);
    expect(Math.abs(windDrift(5, 70))).toBeGreaterThan(Math.abs(windDrift(5, 18)));
  });

  it('un arc mal bandé fait chuter la flèche', () => {
    expect(drawDrop(1)).toBe(0);
    expect(drawDrop(0.5)).toBeGreaterThan(0);
  });

  it('la fatigue augmente le tremblement après 3 s', () => {
    expect(swayAmplitude(5, false)).toBeGreaterThan(swayAmplitude(2, false));
    expect(swayAmplitude(2, true)).toBeLessThan(swayAmplitude(2, false));
  });
});
