import { challengesForDate } from '../store/daily';
import { levelInfo, xpToNext } from '../store/level';
import { applyGameResult, buyCosmetic, claimChallenge, createProfile, equipCosmetic, migrateSave, rewardFor } from '../store/progression';
import type { GameResult } from '../store/types';

const NOW = new Date(2026, 9, 14, 12).getTime();

function result(partial: Partial<GameResult> = {}): GameResult {
  return { gameId: 'darts', mode: 'solo', score: 300, performance: 0.6, stats: { bullseyes: 2 }, summary: [], ...partial };
}

describe('niveaux', () => {
  it('calcule le niveau à partir de l’XP cumulée', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(xpToNext(1)).level).toBe(2);
    expect(levelInfo(xpToNext(1) + xpToNext(2) - 1)).toMatchObject({ level: 2, current: xpToNext(2) - 1 });
  });
});

describe('applyGameResult', () => {
  it('donne XP et pièces, enregistre le record et les totaux', () => {
    const p0 = createProfile(NOW);
    const { profile, summary } = applyGameResult(p0, result(), 'precision', NOW);
    const reward = rewardFor(result());
    expect(summary.xp).toBe(reward.xp);
    expect(profile.coins).toBe(p0.coins + reward.coins);
    expect(profile.perGame.darts).toMatchObject({ plays: 1, best: 300 });
    expect(profile.totals.bullseyes).toBe(2);
    expect(summary.newBest).toBe(true);
    expect(profile.recent[0]).toBe('darts');
    expect(summary.newAchievements).toEqual(expect.arrayContaining(['first_game', 'bullseye']));
  });

  it('ne signale un nouveau record que s’il est battu', () => {
    let p = createProfile(NOW);
    p = applyGameResult(p, result({ score: 300 }), 'precision', NOW).profile;
    const lower = applyGameResult(p, result({ score: 200 }), 'precision', NOW);
    expect(lower.summary.newBest).toBe(false);
    expect(lower.profile.perGame.darts.best).toBe(300);
  });

  it('n’attribue pas de record aux jeux sans score', () => {
    const { profile, summary } = applyGameResult(createProfile(NOW), result({ gameId: 'deep-talk', scored: false, score: 5 }), 'couple', NOW);
    expect(summary.newBest).toBe(false);
    expect(profile.perGame['deep-talk'].best).toBe(0);
  });

  it('débloque « Explorateur » après les trois univers', () => {
    let p = createProfile(NOW);
    p = applyGameResult(p, result(), 'precision', NOW).profile;
    p = applyGameResult(p, result({ gameId: 'penalty' }), 'football', NOW).profile;
    const r = applyGameResult(p, result({ gameId: 'know-me' }), 'couple', NOW);
    expect(r.summary.newAchievements).toContain('explorer');
  });
});

describe('défis du jour', () => {
  it('sont déterministes et couvrent les trois univers', () => {
    const a = challengesForDate('2026-10-14');
    expect(a).toEqual(challengesForDate('2026-10-14'));
    expect(a.map((c) => c.group)).toEqual(['precision', 'football', 'couple']);
  });

  it('progressent avec les parties et se réclament une seule fois', () => {
    const date = '2026-10-14';
    const [precision] = challengesForDate(date);
    let p = createProfile(NOW);
    // Une partie qui remplit à coup sûr le défi précision du jour.
    const stats: Record<string, number> = { bullseyes: 10, tens: 10, ringsOn: 10 };
    const gameId = precision.stat.startsWith('score:') ? precision.stat.slice(6) : 'darts';
    for (let i = 0; i < 3; i++) p = applyGameResult(p, result({ gameId, score: 999, stats }), 'precision', NOW).profile;
    expect(p.daily.progress[precision.id]).toBeGreaterThanOrEqual(precision.target);
    const claimed = claimChallenge(p, precision.id);
    expect(claimed.coins).toBe(p.coins + precision.reward);
    expect(claimChallenge(claimed, precision.id)).toBe(claimed);
  });
});

describe('vestiaire', () => {
  it('achète si les pièces suffisent puis équipe', () => {
    let p = { ...createProfile(NOW), coins: 500 };
    p = buyCosmetic(p, 'dart-neon');
    expect(p.cosmetics.owned).toContain('dart-neon');
    expect(p.coins).toBe(380);
    p = equipCosmetic(p, 'dart', 'dart-neon');
    expect(p.cosmetics.equipped.dart).toBe('dart-neon');
  });

  it('refuse un achat trop cher ou un objet non possédé', () => {
    const p = { ...createProfile(NOW), coins: 10 };
    expect(buyCosmetic(p, 'dart-gold')).toBe(p);
    expect(equipCosmetic(p, 'dart', 'dart-gold')).toBe(p);
  });
});

describe('migrateSave', () => {
  it('répare une sauvegarde partielle ou corrompue', () => {
    expect(migrateSave(null).profile.name).toBe('Joueur');
    const m = migrateSave({ profile: { name: 'Lou', coins: 12 }, settings: { sound: false } });
    expect(m.profile.name).toBe('Lou');
    expect(m.settings.sound).toBe(false);
    expect(m.settings.music).toBe(true);
    expect(m.profile.cosmetics.equipped.dart).toBe('dart-classic');
  });
});
