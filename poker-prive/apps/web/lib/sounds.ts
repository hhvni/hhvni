'use client';
/**
 * Sons de table synthétisés avec Web Audio (aucun fichier à télécharger) :
 * jetons, cartes, parole (toc-toc), se coucher, gain du pot, « à vous », tic-tac.
 * Le contexte audio ne démarre qu'après une interaction de l'utilisateur
 * (règle des navigateurs).
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    const len = ctx.sampleRate * 0.5;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** À appeler sur un clic de l'utilisateur pour autoriser le son. */
export function unlockAudio(): void {
  audio();
}

function burst(at: number, { freq, q = 1, dur, gain, type = 'bandpass' as BiquadFilterType }: { freq: number; q?: number; dur: number; gain: number; type?: BiquadFilterType }) {
  const c = audio();
  if (!c || !noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + at;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

function tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Cliquetis de jetons (n jetons). */
function chips(n = 3, at = 0) {
  for (let i = 0; i < n; i++) {
    const t = at + i * (0.035 + Math.random() * 0.03);
    burst(t, { freq: 3200 + Math.random() * 1800, q: 6, dur: 0.06, gain: 0.35 });
    tone(t, 2400 + Math.random() * 900, 0.05, 0.04, 'triangle');
  }
}

export const sounds = {
  bet: () => chips(3),
  allIn: () => {
    chips(7);
    tone(0, 110, 0.5, 0.12, 'sine', 70);
  },
  check: () => {
    tone(0, 180, 0.09, 0.22, 'sine', 120);
    tone(0.12, 180, 0.09, 0.22, 'sine', 120);
  },
  fold: () => burst(0, { freq: 1200, q: 0.7, dur: 0.18, gain: 0.25, type: 'lowpass' }),
  card: (n = 1) => {
    for (let i = 0; i < Math.min(n, 8); i++) burst(i * 0.09, { freq: 2600, q: 0.8, dur: 0.09, gain: 0.3, type: 'highpass' });
  },
  win: () => {
    chips(9, 0.05);
    tone(0.1, 880, 0.18, 0.06, 'triangle');
    tone(0.22, 1320, 0.25, 0.05, 'triangle');
  },
  turn: () => {
    tone(0, 660, 0.12, 0.1, 'sine');
    tone(0.13, 990, 0.18, 0.1, 'sine');
  },
  tick: () => tone(0, 1500, 0.04, 0.06, 'square'),
  /** Battement de cœur pendant le suspense de la river. */
  heartbeat: (beats = 3) => {
    for (let i = 0; i < beats; i++) {
      tone(i * 0.85, 62, 0.16, 0.3, 'sine', 45);
      tone(i * 0.85 + 0.2, 58, 0.18, 0.22, 'sine', 42);
    }
  },
  /** Retournement lent de la river. */
  reveal: () => {
    burst(0, { freq: 1800, q: 0.6, dur: 0.35, gain: 0.25, type: 'bandpass' });
    tone(0.25, 523, 0.5, 0.05, 'triangle');
  },
};
