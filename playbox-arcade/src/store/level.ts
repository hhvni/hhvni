/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpToNext(level: number): number {
  return 100 + (level - 1) * 50;
}

export function levelInfo(totalXp: number) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  const needed = xpToNext(level);
  return { level, current: remaining, needed, progress: remaining / needed };
}
