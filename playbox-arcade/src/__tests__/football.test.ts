import { chooseDive, frameOutcome, goalGeo, isTopCorner, keeperSaves, resolveShot, shotTarget } from '../games/football/logic';
import { landingFromFlick, resolveRing, BASE_PEGS, project } from '../games/rings/logic';

describe('football', () => {
  const g = goalGeo(760);

  it('un tir droit vise le centre du but', () => {
    const target = shotTarget(g, { ballX: 200, ballY: 580, dx: 0, dy: -150, speed: 1200, curve: 0 }, false);
    expect(target.u).toBeCloseTo(0.5);
    expect(target.v).toBeGreaterThan(0);
  });

  it('un tir en biais part sur le côté', () => {
    const left = shotTarget(g, { ballX: 200, ballY: 580, dx: -60, dy: -150, speed: 1200, curve: 0 }, false);
    expect(left.u).toBeLessThan(0.3);
  });

  it('distingue cadre, poteau et hors cadre', () => {
    expect(frameOutcome(0.5, 0.5)).toBeNull();
    expect(frameOutcome(0, 0.5)).toBe('post');
    expect(frameOutcome(0.5, 1.4)).toBe('over');
    expect(frameOutcome(-0.3, 0.5)).toBe('wide');
  });

  it('le gardien arrête un tir dans sa zone, pas une lucarne', () => {
    expect(keeperSaves({ u: 0.5, v: 0.3 }, { u: 0.52, v: 0.35 })).toBe(true);
    expect(keeperSaves({ u: 0.2, v: 0.3 }, { u: 0.8, v: 0.3 })).toBe(false);
    expect(isTopCorner(0.08, 0.85)).toBe(true);
    expect(resolveShot({ u: 0.08, v: 0.85 }, { u: 0.08, v: 0.85 })).toBe('goal');
    expect(resolveShot({ u: 0.5, v: 0.3 }, { u: 0.5, v: 0.3 })).toBe('saved');
  });

  it('un gardien qui lit le tir plonge du bon côté', () => {
    const dive = chooseDive({ u: 0.85, v: 0.4 }, 1, () => 0.5);
    expect(dive.u).toBeGreaterThan(0.6);
  });
});

describe('lancer d’anneaux', () => {
  it('un lancer plus rapide va plus loin', () => {
    expect(landingFromFlick(0, -100, 1600).d).toBeGreaterThan(landingFromFlick(0, -100, 800).d);
  });

  it('attrape la quille visée et signale les quasi-réussites', () => {
    const golden = BASE_PEGS.find((p) => p.golden)!;
    expect(resolveRing(golden.gx, golden.d, BASE_PEGS, false).peg).toBe(golden);
    const near = resolveRing(golden.gx + 0.15, golden.d, BASE_PEGS, false);
    expect(near.peg).toBeNull();
    expect(near.near).toBe(true);
  });

  it('projette sans valeur invalide même trop court', () => {
    const p = project(0, -0.1, 700);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
