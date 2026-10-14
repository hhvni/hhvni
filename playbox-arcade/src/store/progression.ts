import type { CategoryId } from '../theme/colors';
import { ACHIEVEMENTS } from './achievements';
import { challengesForDate } from './daily';
import { COSMETICS, DEFAULT_EQUIPPED, CosmeticSlot } from './cosmetics';
import { levelInfo } from './level';
import { todayKey } from './random';
import type { GameResult, Profile, RewardSummary, SaveData, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  language: 'fr',
  reduceMotion: false,
  aimAssist: false,
};

export function createProfile(now = Date.now()): Profile {
  return {
    name: 'Joueur',
    xp: 0,
    coins: 50,
    gamesPlayed: 0,
    perGame: {},
    totals: {},
    achievements: {},
    recent: [],
    categoriesPlayed: [],
    daily: { date: todayKey(new Date(now)), progress: {}, claimed: [] },
    cosmetics: {
      owned: [DEFAULT_EQUIPPED.dart, DEFAULT_EQUIPPED.ball, DEFAULT_EQUIPPED.arrow],
      equipped: { ...DEFAULT_EQUIPPED },
    },
    preferredMode: 'solo',
    createdAt: now,
  };
}

export function createSave(): SaveData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, profile: createProfile() };
}

/** Fusionne une sauvegarde lue sur le disque avec les valeurs par défaut (champs ajoutés plus tard). */
export function migrateSave(raw: unknown): SaveData {
  const base = createSave();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<SaveData>;
  const p = (data.profile ?? {}) as Partial<Profile>;
  return {
    version: 1,
    settings: { ...base.settings, ...(data.settings ?? {}) },
    profile: {
      ...base.profile,
      ...p,
      perGame: { ...(p.perGame ?? {}) },
      totals: { ...(p.totals ?? {}) },
      achievements: { ...(p.achievements ?? {}) },
      recent: Array.isArray(p.recent) ? p.recent : [],
      categoriesPlayed: Array.isArray(p.categoriesPlayed) ? p.categoriesPlayed : [],
      daily: p.daily && typeof p.daily.date === 'string' ? p.daily : base.profile.daily,
      cosmetics: {
        owned: Array.from(new Set([...(base.profile.cosmetics.owned), ...(p.cosmetics?.owned ?? [])])),
        equipped: { ...base.profile.cosmetics.equipped, ...(p.cosmetics?.equipped ?? {}) },
      },
    },
  };
}

/** Réinitialise les défis si la date a changé. */
export function ensureDaily(profile: Profile, date = todayKey()): Profile {
  if (profile.daily.date === date) return profile;
  return { ...profile, daily: { date, progress: {}, claimed: [] } };
}

export function rewardFor(result: GameResult) {
  const perf = Math.max(0, Math.min(1, result.performance));
  return {
    xp: Math.round(25 + perf * 75),
    coins: Math.round(5 + perf * 25),
  };
}

function statValues(result: GameResult, category: CategoryId): Record<string, number> {
  return {
    ...result.stats,
    plays: 1,
    [`plays:${category}`]: 1,
    [`score:${result.gameId}`]: result.score,
  };
}

export function applyGameResult(
  input: Profile,
  result: GameResult,
  category: CategoryId,
  now = Date.now(),
): { profile: Profile; summary: RewardSummary } {
  let profile = ensureDaily(input, todayKey(new Date(now)));
  const levelBefore = levelInfo(profile.xp).level;
  const { xp, coins } = rewardFor(result);

  const prev = profile.perGame[result.gameId];
  const scored = result.scored !== false;
  const previousBest = prev?.best ?? 0;
  const newBest = scored && (!prev || result.score > prev.best) && result.score > 0;

  const totals = { ...profile.totals };
  for (const [k, v] of Object.entries(result.stats)) totals[k] = (totals[k] ?? 0) + v;

  const values = statValues(result, category);
  const progress = { ...profile.daily.progress };
  const completedChallenges: string[] = [];
  for (const c of challengesForDate(profile.daily.date)) {
    const v = values[c.stat];
    if (v === undefined) continue;
    const before = progress[c.id] ?? 0;
    const after = c.kind === 'sum' ? before + v : Math.max(before, v);
    progress[c.id] = after;
    if (before < c.target && after >= c.target) completedChallenges.push(c.id);
  }

  profile = {
    ...profile,
    xp: profile.xp + xp,
    coins: profile.coins + coins,
    gamesPlayed: profile.gamesPlayed + 1,
    totals,
    perGame: {
      ...profile.perGame,
      [result.gameId]: {
        plays: (prev?.plays ?? 0) + 1,
        best: scored ? Math.max(previousBest, result.score) : 0,
        totalScore: (prev?.totalScore ?? 0) + result.score,
        lastPlayed: now,
      },
    },
    recent: [result.gameId, ...profile.recent.filter((id) => id !== result.gameId)].slice(0, 6),
    categoriesPlayed: profile.categoriesPlayed.includes(category)
      ? profile.categoriesPlayed
      : [...profile.categoriesPlayed, category],
    daily: { ...profile.daily, progress },
  };

  const unlocked = unlockAchievements(profile, now);
  profile = unlocked.profile;

  return {
    profile,
    summary: {
      xp,
      coins,
      levelBefore,
      levelAfter: levelInfo(profile.xp).level,
      newBest,
      previousBest,
      newAchievements: unlocked.ids,
      completedChallenges,
    },
  };
}

export function unlockAchievements(profile: Profile, now = Date.now()) {
  const ids: string[] = [];
  const achievements = { ...profile.achievements };
  for (const a of ACHIEVEMENTS) {
    if (!achievements[a.id] && a.check(profile)) {
      achievements[a.id] = now;
      ids.push(a.id);
    }
  }
  return { profile: ids.length ? { ...profile, achievements } : profile, ids };
}

export function claimChallenge(profile: Profile, challengeId: string): Profile {
  const def = challengesForDate(profile.daily.date).find((c) => c.id === challengeId);
  if (!def) return profile;
  if (profile.daily.claimed.includes(challengeId)) return profile;
  if ((profile.daily.progress[challengeId] ?? 0) < def.target) return profile;
  return {
    ...profile,
    coins: profile.coins + def.reward,
    daily: { ...profile.daily, claimed: [...profile.daily.claimed, challengeId] },
  };
}

export function buyCosmetic(profile: Profile, id: string): Profile {
  const item = COSMETICS.find((c) => c.id === id);
  if (!item || profile.cosmetics.owned.includes(id) || profile.coins < item.price) return profile;
  const next = {
    ...profile,
    coins: profile.coins - item.price,
    cosmetics: { ...profile.cosmetics, owned: [...profile.cosmetics.owned, id] },
  };
  return unlockAchievements(next).profile;
}

export function equipCosmetic(profile: Profile, slot: CosmeticSlot, id: string): Profile {
  if (!profile.cosmetics.owned.includes(id)) return profile;
  return { ...profile, cosmetics: { ...profile.cosmetics, equipped: { ...profile.cosmetics.equipped, [slot]: id } } };
}
