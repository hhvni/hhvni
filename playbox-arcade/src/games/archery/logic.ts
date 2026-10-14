/** Score d'une flèche : anneaux 1 à 10, « X » au centre du 10. */
export function scoreArrow(dx: number, dy: number, radius: number): { points: number; x: boolean } {
  const r = Math.hypot(dx, dy) / radius;
  if (r > 1) return { points: 0, x: false };
  if (r <= 0.05) return { points: 10, x: true };
  return { points: Math.max(1, 10 - Math.floor(r * 10)), x: false };
}

/** Configuration d'une volée : la cible s'éloigne (rayon plus petit) et le vent forcit. */
export function volleyConfig(index: number, rnd: () => number = Math.random) {
  const distances = [18, 30, 40, 50, 70];
  const radii = [100, 84, 70, 58, 46];
  const i = Math.min(index, distances.length - 1);
  const maxWind = 4 + i * 4;
  const wind = Math.round((rnd() * 2 - 1) * maxWind);
  return { distance: distances[i], radius: radii[i], wind };
}

/** Dérive latérale (unités logiques) due au vent, plus forte de loin. */
export function windDrift(windKmh: number, distance: number) {
  return windKmh * (distance / 30) * 1.6;
}

/** Chute de la flèche si l'arc n'est pas complètement bandé. */
export function drawDrop(draw: number) {
  return draw >= 0.95 ? 0 : (1 - draw) * 130;
}

/** Amplitude du tremblement selon le temps de maintien (fatigue après 3 s). */
export function swayAmplitude(holdSeconds: number, assist: boolean) {
  const base = assist ? 2 : 4.5;
  const fatigue = Math.max(0, holdSeconds - 3) * (assist ? 3 : 7);
  return Math.min(22, base + fatigue);
}
