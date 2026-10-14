/** Analyse d'un geste de « lancer » (glisser rapide) à partir des positions échantillonnées. */
export interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface Flick {
  /** Position où le mouvement rapide a commencé (point de visée verrouillé). */
  originX: number;
  originY: number;
  /** Vecteur du lancer (unités logiques). */
  dx: number;
  dy: number;
  /** Vitesse moyenne du lancer (unités / s). */
  speed: number;
  /** Angle en radians (0 = droite, -PI/2 = haut). */
  angle: number;
  /** Écart latéral du milieu du geste par rapport à la ligne droite (courbure, + = vers la droite). */
  curve: number;
  duration: number;
}

export class FlickTracker {
  samples: Sample[] = [];

  reset() {
    this.samples = [];
  }

  add(x: number, y: number, t = Date.now() / 1000) {
    this.samples.push({ x, y, t });
    if (this.samples.length > 90) this.samples.shift();
  }

  get last(): Sample | undefined {
    return this.samples[this.samples.length - 1];
  }

  /**
   * Repère la dernière phase rapide du geste. Le doigt peut d'abord viser lentement
   * puis lancer d'un coup sec : seul le coup sec compte comme lancer.
   */
  analyze(minSpeed = 260): Flick | null {
    const s = this.samples.slice();
    // L'événement de relâchement répète souvent la dernière position : on l'ignore
    // tant que le doigt n'est pas resté immobile assez longtemps pour « annuler » le lancer.
    while (s.length > 2) {
      const a = s[s.length - 2];
      const b = s[s.length - 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5 && b.t - a.t < 0.08) s.pop();
      else break;
    }
    if (s.length < 2) return null;
    const end = s[s.length - 1];
    let i = s.length - 1;
    while (i > 0) {
      const a = s[i - 1];
      const b = s[i];
      const dt = Math.max(1e-3, b.t - a.t);
      const v = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      // Les très petits intervalles sont trop bruités pour juger d'un arrêt.
      if (v < minSpeed && dt > 0.012) break;
      i--;
    }
    const start = s[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const duration = Math.max(0.016, end.t - start.t);
    const length = Math.hypot(dx, dy);
    if (length < 1) return null;
    // Courbure : distance signée du point médian du geste à la corde.
    const mid = s[Math.floor((i + s.length - 1) / 2)];
    const curve = ((mid.x - start.x) * dy - (mid.y - start.y) * dx) / length;
    return {
      originX: start.x,
      originY: start.y,
      dx,
      dy,
      speed: length / duration,
      angle: Math.atan2(dy, dx),
      curve: -curve,
      duration,
    };
  }
}
