/**
 * Géométrie du but et physique simplifiée des tirs.
 * Repère « plan du but » : u ∈ [0, 1] de poteau gauche à poteau droit, v ∈ [0, 1] du sol à la barre.
 */
export interface GoalGeo {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export function goalGeo(h: number, w = 400): GoalGeo {
  const width = Math.min(340, w * 0.85);
  const height = width * 0.36;
  const bottom = Math.max(height + 90, h * 0.38);
  const left = (w - width) / 2;
  return { left, right: left + width, top: bottom - height, bottom, width, height };
}

export function toScreen(g: GoalGeo, u: number, v: number) {
  return { x: g.left + u * g.width, y: g.bottom - v * g.height };
}

export interface ShotInput {
  ballX: number;
  ballY: number;
  dx: number;
  dy: number;
  speed: number;
  curve: number;
}

/** Point visé dans le plan du but à partir d'un geste de tir. */
export function shotTarget(g: GoalGeo, s: ShotInput, assist: boolean) {
  // On prolonge la direction du geste jusqu'à la ligne de but.
  const k = (s.ballY - g.bottom) / Math.max(1, -s.dy);
  const x = s.ballX + s.dx * k;
  const u = (x - g.left) / g.width;
  // Vitesse → hauteur. Une tolérance plus large en mode assisté.
  const minSpeed = 550;
  const range = assist ? 1700 : 1300;
  const v = Math.max(0, (s.speed - minSpeed) / range) * 1.15;
  return { u, v };
}

export type ShotOutcome = 'goal' | 'saved' | 'post' | 'wide' | 'over' | 'wall';

/** Les « lucarnes » : coins supérieurs du but. */
export function isTopCorner(u: number, v: number) {
  return v >= 0.62 && v <= 1 && (u <= 0.16 || u >= 0.84);
}

/** Cadre : poteaux/barre touchés si l'impact est à moins de `postW` du montant. */
export function frameOutcome(u: number, v: number, postW = 0.025): ShotOutcome | null {
  if (v > 1 + postW || u < -postW || u > 1 + postW) return v > 1 + postW ? 'over' : 'wide';
  const nearPost = Math.abs(u) <= postW || Math.abs(u - 1) <= postW;
  const nearBar = Math.abs(v - 1) <= postW * 2.2;
  if ((nearPost && v <= 1 + postW) || (nearBar && u >= -postW && u <= 1 + postW)) return 'post';
  return null;
}

/** Plongeon du gardien : position (u, v) des gants à la fin du plongeon. */
export interface Dive {
  u: number;
  v: number;
}

/**
 * Le gardien choisit un côté. `skill` ∈ [0, 1] = probabilité de lire le tir.
 * Quand il lit le tir, il plonge près du point visé ; sinon il part au hasard.
 */
export function chooseDive(target: { u: number; v: number }, skill: number, rnd: () => number = Math.random): Dive {
  if (rnd() < skill) {
    return { u: Math.max(0.12, Math.min(0.88, target.u + (rnd() - 0.5) * 0.18)), v: Math.max(0.15, Math.min(0.8, target.v + (rnd() - 0.5) * 0.25)) };
  }
  const r = rnd();
  if (r < 0.2) return { u: 0.5, v: 0.3 };
  return { u: r < 0.6 ? 0.2 : 0.8, v: 0.25 + rnd() * 0.45 };
}

/** Le gardien arrête le tir si les gants couvrent l'impact (ellipse d'envergure). */
export function keeperSaves(dive: Dive, target: { u: number; v: number }, reach = { u: 0.16, v: 0.3 }) {
  const du = (target.u - dive.u) / reach.u;
  const dv = (target.v - dive.v) / reach.v;
  return du * du + dv * dv <= 1;
}

export function resolveShot(target: { u: number; v: number }, dive: Dive | null): ShotOutcome {
  const frame = frameOutcome(target.u, target.v);
  if (frame) return frame;
  if (dive && !isTopCorner(target.u, target.v) && keeperSaves(dive, target)) return 'saved';
  return 'goal';
}

/** Hauteur du ballon (unités « hauteur de but ») au paramètre t ∈ [0, 1] du tir. */
export function ballHeight(v: number, loft: number, t: number) {
  return v * t + loft * Math.sin(Math.PI * t);
}

/** Bombé de la trajectoire : un tir haut monte davantage avant de redescendre. */
export function loftFor(v: number) {
  return 0.18 + Math.max(0, Math.min(1.2, v)) * 0.35;
}
