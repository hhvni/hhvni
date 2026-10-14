/** Ordre réglementaire des secteurs, dans le sens horaire depuis le haut. */
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Rayons officiels en millimètres (cercle extérieur du double = 170 mm). */
export const RINGS_MM = {
  bull: 6.35,
  outerBull: 15.9,
  tripleIn: 99,
  tripleOut: 107,
  doubleIn: 162,
  doubleOut: 170,
};

export interface DartHit {
  points: number;
  base: number;
  multiplier: 0 | 1 | 2 | 3;
  label: string;
  kind: 'miss' | 'single' | 'double' | 'triple' | 'outerBull' | 'bull';
}

/**
 * Score d'une fléchette à partir de sa position relative au centre.
 * @param radius rayon à l'écran du cercle extérieur du double.
 */
export function scoreDart(dx: number, dy: number, radius: number): DartHit {
  const r = (Math.hypot(dx, dy) / radius) * RINGS_MM.doubleOut;
  if (r <= RINGS_MM.bull) return { points: 50, base: 50, multiplier: 1, label: 'BULL', kind: 'bull' };
  if (r <= RINGS_MM.outerBull) return { points: 25, base: 25, multiplier: 1, label: '25', kind: 'outerBull' };
  if (r > RINGS_MM.doubleOut) return { points: 0, base: 0, multiplier: 0, label: 'RATÉ', kind: 'miss' };
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  const base = SECTORS[Math.floor((deg + 9) / 18) % 20];
  if (r >= RINGS_MM.doubleIn) return { points: base * 2, base, multiplier: 2, label: `D${base}`, kind: 'double' };
  if (r >= RINGS_MM.tripleIn && r <= RINGS_MM.tripleOut) return { points: base * 3, base, multiplier: 3, label: `T${base}`, kind: 'triple' };
  return { points: base, base, multiplier: 1, label: `${base}`, kind: 'single' };
}

/** Vitesse de lancer idéale (unités logiques / s) et tolérance « parfait ». */
export const IDEAL_SPEED = 1500;
export const PERFECT_TOLERANCE = 0.25;

/**
 * Décalage vertical selon la force du lancer : trop doux → la fléchette tombe,
 * trop fort → elle monte. Renvoie aussi un verdict pour l'affichage.
 */
export function powerOffset(speed: number, assist: boolean): { dy: number; verdict: 'soft' | 'perfect' | 'hard' } {
  const ratio = speed / IDEAL_SPEED - 1;
  const tol = PERFECT_TOLERANCE * (assist ? 1.6 : 1);
  if (Math.abs(ratio) <= tol) return { dy: 0, verdict: 'perfect' };
  const excess = ratio > 0 ? ratio - tol : ratio + tol;
  const dy = Math.max(-70, Math.min(70, -excess * 75));
  return { dy, verdict: ratio > 0 ? 'hard' : 'soft' };
}
