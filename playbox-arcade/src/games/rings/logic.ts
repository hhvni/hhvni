/** Quille du lancer d'anneaux, en coordonnées « sol » : gx ∈ [-1, 1] (gauche/droite), d ∈ [0, 1] (proche/loin). */
export interface Peg {
  gx: number;
  d: number;
  points: number;
  golden?: boolean;
}

export const BASE_PEGS: Peg[] = [
  { gx: -0.55, d: 0.15, points: 10 },
  { gx: 0, d: 0.12, points: 10 },
  { gx: 0.55, d: 0.15, points: 10 },
  { gx: -0.42, d: 0.48, points: 20 },
  { gx: 0.42, d: 0.48, points: 20 },
  { gx: -0.3, d: 0.82, points: 30 },
  { gx: 0.3, d: 0.82, points: 30 },
  { gx: 0, d: 0.66, points: 50, golden: true },
];

/** Projection perspective du sol vers l'écran. */
export function project(gx: number, d: number, h: number, w = 400) {
  const yNear = h * 0.8;
  const yFar = h * 0.4;
  const s = 1 - 0.62 * d;
  // Puissance signée : d peut être légèrement négatif (anneau tombé trop court).
  const k = Math.sign(d) * Math.pow(Math.abs(d), 0.85);
  return { x: w / 2 + gx * 170 * s, y: yNear - (yNear - yFar) * k, s };
}

/** Convertit un lancer (angle et vitesse) en point d'impact au sol. */
export function landingFromFlick(dx: number, dy: number, speed: number) {
  const lateral = dx / Math.max(1, Math.abs(dy));
  const gx = Math.max(-1.2, Math.min(1.2, lateral * 1.5));
  const d = Math.max(-0.1, Math.min(1.2, (speed - 450) / 1400));
  return { gx, d };
}

/** Résultat d'un anneau : quille attrapée, presque, ou raté. */
export function resolveRing(gx: number, d: number, pegs: Peg[], assist: boolean): { peg: Peg | null; near: boolean } {
  const tolX = assist ? 0.13 : 0.09;
  const tolD = assist ? 0.09 : 0.06;
  let best: { peg: Peg; score: number } | null = null;
  for (const p of pegs) {
    // Plus la quille est loin, plus la tolérance latérale est réduite (perspective).
    const nx = (gx - p.gx) / tolX;
    const nd = (d - p.d) / tolD;
    const score = Math.hypot(nx, nd);
    if (!best || score < best.score) best = { peg: p, score };
  }
  if (best && best.score <= 1) return { peg: best.peg, near: false };
  return { peg: null, near: !!best && best.score <= 2.2 };
}
