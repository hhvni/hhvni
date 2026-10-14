import { FlickTracker } from '../engine/flick';
import { firstTurn, nextShot, winnerIndex } from '../engine/turns';

describe('FlickTracker', () => {
  it('isole le coup sec final et ignore la visée lente', () => {
    const f = new FlickTracker();
    // visée lente vers la droite
    for (let i = 0; i <= 10; i++) f.add(100 + i, 500, i * 0.05);
    // lancer rapide vers le haut
    for (let i = 1; i <= 6; i++) f.add(110, 500 - i * 20, 0.5 + i * 0.016);
    // relâchement : même position répétée
    f.add(110, 380, 0.6);
    const r = f.analyze(300)!;
    expect(r).not.toBeNull();
    expect(r.originX).toBeCloseTo(110);
    expect(r.originY).toBeCloseTo(500);
    expect(r.dy).toBeCloseTo(-120);
    expect(r.speed).toBeGreaterThan(1000);
  });

  it('annule un lancer si le doigt s’arrête avant de relâcher', () => {
    const f = new FlickTracker();
    for (let i = 0; i <= 5; i++) f.add(100, 500 - i * 20, i * 0.016);
    f.add(100, 400, 0.5);
    const r = f.analyze(300);
    expect(r === null || r.speed < 300).toBe(true);
  });

  it('mesure la courbure du geste', () => {
    const f = new FlickTracker();
    const pts = 12;
    for (let i = 0; i <= pts; i++) {
      const k = i / pts;
      f.add(200 + Math.sin(Math.PI * k) * 40, 600 - k * 240, k * 0.25);
    }
    expect(f.analyze(100)!.curve).toBeGreaterThan(20);
  });
});

describe('tours', () => {
  it('alterne les joueurs et termine après la dernière manche', () => {
    const cfg = { rounds: 2, players: 2, perTurn: 2 };
    let s = firstTurn();
    const seen: string[] = [];
    while (!s.done) {
      seen.push(`${s.round}-${s.player}-${s.shot}`);
      s = nextShot(s, cfg);
    }
    expect(seen).toEqual(['0-0-0', '0-0-1', '0-1-0', '0-1-1', '1-0-0', '1-0-1', '1-1-0', '1-1-1']);
  });

  it('désigne le gagnant ou l’égalité', () => {
    expect(winnerIndex([10, 30])).toBe(1);
    expect(winnerIndex([20, 20])).toBe(-1);
  });
});
