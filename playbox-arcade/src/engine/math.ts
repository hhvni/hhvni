export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const randRange = (min: number, max: number, rnd: () => number = Math.random) => min + (max - min) * rnd();

/** Approximation gaussienne (Box-Muller) pour la dispersion des tirs. */
export function gaussian(rnd: () => number = Math.random) {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Point sur une courbe de Bézier quadratique. */
export function quadBezier(p0: number, p1: number, p2: number, t: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}
