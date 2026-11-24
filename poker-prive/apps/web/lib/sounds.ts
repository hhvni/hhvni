'use client';
/**
 * Sons de table « physiques », calculés dans le navigateur (aucun fichier) :
 *
 *  - jeton : choc de céramique = transitoire de bruit + modes de résonance
 *    inharmoniques (3–9 kHz) très amortis, petit « corps » grave ;
 *  - pile de jetons : rebonds de plus en plus rapprochés et faibles ;
 *  - carte distribuée : souffle de glisse (bruit filtré balayé) + tape sur le tapis ;
 *  - parole : deux coups de phalange sur la table (bois feutré) ;
 *  - une légère réverbération de pièce donne de la profondeur.
 *
 * Chaque son existe en plusieurs variantes tirées au hasard pour éviter
 * l'effet « mitraillette » d'un échantillon répété. Le contexte audio ne
 * démarre qu'après une interaction de l'utilisateur (règle des navigateurs).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: ConvolverNode | null = null;
const bank = new Map<string, AudioBuffer[]>();

type Synth = (sr: number, rnd: () => number) => Float32Array;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    // Petite pièce : réponse impulsionnelle de bruit décroissant (≈ 0,35 s)
    wet = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 0.35);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * 0.5;
    }
    wet.buffer = ir;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.16;
    wet.connect(wetGain).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** À appeler sur un clic de l'utilisateur pour autoriser le son. */
export function unlockAudio(): void {
  const c = audio();
  if (c && bank.size === 0) for (const k of Object.keys(SYNTHS)) variants(k);
}

// ─────────────────────────── Synthèse ───────────────────────────

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Ajoute un mode amorti (sinus) à partir de l'échantillon `at`. */
function mode(out: Float32Array, sr: number, at: number, freq: number, decay: number, amp: number) {
  const n = Math.min(out.length - at, Math.floor(sr * decay * 7));
  const w = (2 * Math.PI * freq) / sr;
  const k = Math.exp(-1 / (sr * decay));
  let e = amp;
  for (let i = 0; i < n; i++) {
    out[at + i]! += Math.sin(w * i) * e;
    e *= k;
  }
}

/** Bruit filtré (passe-bande simple à deux pôles) avec enveloppe. */
function noiseBand(out: Float32Array, sr: number, at: number, dur: number, f0: number, f1: number, q: number, amp: number, env: (x: number) => number, rnd: () => number) {
  const n = Math.min(out.length - at, Math.floor(sr * dur));
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x);
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp(-w / (2 * q));
    const a1 = 2 * r * Math.cos(w);
    const a2 = -r * r;
    const y = (rnd() * 2 - 1) * (1 - r) + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    out[at + i]! += y * amp * env(x);
  }
}

/** Choc d'un jeton en céramique. */
function clack(out: Float32Array, sr: number, at: number, amp: number, rnd: () => number) {
  const base = 0.85 + rnd() * 0.3;
  noiseBand(out, sr, at, 0.006, 5000, 7000, 0.7, amp * 2.2, (x) => 1 - x, rnd);
  const modes: [number, number, number][] = [[3100, 0.018, 0.5], [4650, 0.012, 0.42], [6300, 0.009, 0.3], [8200, 0.006, 0.2], [2150, 0.02, 0.18]];
  for (const [f, d, a] of modes) mode(out, sr, at, f * base * (0.97 + rnd() * 0.06), d * (0.8 + rnd() * 0.4), a * amp);
  mode(out, sr, at, 340 * base, 0.012, amp * 0.25); // corps
}

/** Tape d'une carte sur le feutre. */
function tap(out: Float32Array, sr: number, at: number, amp: number, rnd: () => number) {
  noiseBand(out, sr, at, 0.025, 900, 500, 0.8, amp, (x) => Math.pow(1 - x, 2), rnd);
  mode(out, sr, at, 150 + rnd() * 30, 0.02, amp * 0.35);
}

/** Souffle d'une carte qui glisse. */
function slide(out: Float32Array, sr: number, at: number, dur: number, amp: number, rnd: () => number, f0 = 1800, f1 = 4200) {
  noiseBand(out, sr, at, dur, f0, f1, 0.9, amp, (x) => Math.sin(Math.PI * Math.pow(x, 0.7)) ** 2, rnd);
}

const sec = (sr: number, s: number) => new Float32Array(Math.floor(sr * s));

const SYNTHS: Record<string, Synth> = {
  chip(sr, rnd) {
    const o = sec(sr, 0.25);
    clack(o, sr, 0, 0.5, rnd);
    return o;
  },
  /** Petite pile posée : 3 à 5 jetons qui se tassent. */
  stack(sr, rnd) {
    const o = sec(sr, 0.45);
    let t = 0;
    let gap = 0.028 + rnd() * 0.015;
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      clack(o, sr, Math.floor(t * sr), 0.55 * Math.pow(0.8, i), rnd);
      t += gap;
      gap *= 0.72 + rnd() * 0.1;
    }
    tap(o, sr, 0, 0.25, rnd);
    return o;
  },
  /** Gros tapis : la pile entière poussée vers le centre. */
  push(sr, rnd) {
    const o = sec(sr, 0.9);
    slide(o, sr, 0, 0.35, 0.18, rnd, 700, 1600);
    let t = 0.18;
    for (let i = 0; i < 14; i++) {
      clack(o, sr, Math.floor(t * sr), 0.35 + rnd() * 0.25, rnd);
      t += 0.012 + rnd() * 0.03;
    }
    return o;
  },
  /** Ramassage du pot : jetons qui glissent et s'entrechoquent. */
  rake(sr, rnd) {
    const o = sec(sr, 1.1);
    slide(o, sr, 0, 0.7, 0.14, rnd, 600, 1400);
    let t = 0.05;
    for (let i = 0; i < 22; i++) {
      clack(o, sr, Math.floor(t * sr), 0.18 + rnd() * 0.3, rnd);
      t += 0.015 + rnd() * 0.035;
    }
    return o;
  },
  deal(sr, rnd) {
    const o = sec(sr, 0.22);
    const d = 0.08 + rnd() * 0.03;
    slide(o, sr, 0, d, 0.35, rnd);
    tap(o, sr, Math.floor((d - 0.01) * sr), 0.45, rnd);
    return o;
  },
  /** Carte retournée face visible. */
  flip(sr, rnd) {
    const o = sec(sr, 0.18);
    slide(o, sr, 0, 0.05, 0.25, rnd, 2500, 5000);
    noiseBand(o, sr, Math.floor(0.045 * sr), 0.012, 3500, 2500, 1.2, 0.9, (x) => 1 - x, rnd);
    tap(o, sr, Math.floor(0.05 * sr), 0.3, rnd);
    return o;
  },
  /** Cartes jetées : glisse plus longue et étouffée. */
  muck(sr, rnd) {
    const o = sec(sr, 0.35);
    slide(o, sr, 0, 0.22, 0.3, rnd, 900, 2200);
    tap(o, sr, Math.floor(0.2 * sr), 0.3, rnd);
    return o;
  },
  /** Coup de phalange sur la table. */
  knock(sr, rnd) {
    const o = sec(sr, 0.2);
    noiseBand(o, sr, 0, 0.012, 1500, 800, 0.8, 0.9, (x) => 1 - x, rnd);
    mode(o, sr, 0, 118 + rnd() * 12, 0.045, 0.75);
    mode(o, sr, 0, 245 + rnd() * 20, 0.025, 0.35);
    mode(o, sr, 0, 520 + rnd() * 40, 0.012, 0.2);
    return o;
  },
  /** Mélange « riffle » des cartes. */
  shuffle(sr, rnd) {
    const o = sec(sr, 0.9);
    let t = 0.02;
    for (let i = 0; i < 46; i++) {
      noiseBand(o, sr, Math.floor(t * sr), 0.008, 3000, 4500, 1.5, 0.35 + rnd() * 0.2, (x) => 1 - x, rnd);
      t += 0.006 + 0.012 * Math.pow(i / 46, 1.5) + rnd() * 0.004;
    }
    tap(o, sr, Math.floor((t + 0.04) * sr), 0.5, rnd);
    return o;
  },
};

/** Rendu brut d'un son (tests et prévisualisation). */
export function renderSound(name: string, sampleRate: number, variant = 0): Float32Array {
  return SYNTHS[name]!(sampleRate, seeded(name.length * 7919 + variant * 104729 + 17));
}

function variants(name: string): AudioBuffer[] {
  const cached = bank.get(name);
  if (cached) return cached;
  const c = audio();
  if (!c) return [];
  const list: AudioBuffer[] = [];
  for (let v = 0; v < 4; v++) {
    const data = SYNTHS[name]!(c.sampleRate, seeded(name.length * 7919 + v * 104729 + 17));
    // Normalisation douce
    let peak = 0;
    for (const x of data) peak = Math.max(peak, Math.abs(x));
    const k = peak > 0 ? 0.9 / peak : 1;
    const buf = c.createBuffer(1, data.length, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) ch[i] = data[i]! * k;
    list.push(buf);
  }
  bank.set(name, list);
  return list;
}

/** Joue une variante d'un son, avec un léger décalage de hauteur et de panoramique. */
function play(name: string, { at = 0, gain = 0.6, pan = 0, rate = 1 }: { at?: number; gain?: number; pan?: number; rate?: number } = {}) {
  const c = audio();
  if (!c || !master) return;
  const vs = variants(name);
  if (!vs.length) return;
  const src = c.createBufferSource();
  src.buffer = vs[Math.floor(Math.random() * vs.length)]!;
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = c.createGain();
  g.gain.value = gain;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.2));
  src.connect(g).connect(p);
  p.connect(master);
  if (wet) p.connect(wet);
  src.start(c.currentTime + at);
}

/** Petite note de synthèse (signaux d'interface : « à vous », tic-tac, fanfare). */
function tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const c = audio();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  if (wet) g.connect(wet);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sounds = {
  bet: () => play('stack', { gain: 0.7 }),
  allIn: () => {
    play('push', { gain: 0.8 });
    tone(0.05, 92, 0.6, 0.12, 'sine', 60);
  },
  check: () => {
    play('knock', { gain: 0.8 });
    play('knock', { at: 0.14, gain: 0.7 });
  },
  fold: () => play('muck', { gain: 0.55 }),
  card: (n = 1) => {
    if (n >= 6) {
      play('shuffle', { gain: 0.5 });
      for (let i = 0; i < Math.min(n, 8); i++) play('deal', { at: 0.75 + i * 0.11, gain: 0.45, pan: (i % 2 ? 0.3 : -0.3) });
      return;
    }
    for (let i = 0; i < Math.min(n, 5); i++) play('flip', { at: i * 0.16, gain: 0.6 });
  },
  win: () => {
    play('rake', { gain: 0.75 });
    play('stack', { at: 0.75, gain: 0.6 });
  },
  turn: () => {
    tone(0, 660, 0.14, 0.08, 'sine');
    tone(0.13, 990, 0.2, 0.08, 'sine');
  },
  tick: () => tone(0, 1500, 0.035, 0.04, 'square'),
  /** Battement de cœur pendant le suspense de la river. */
  heartbeat: (beats = 3) => {
    for (let i = 0; i < beats; i++) {
      tone(i * 0.85, 62, 0.16, 0.3, 'sine', 45);
      tone(i * 0.85 + 0.2, 58, 0.18, 0.22, 'sine', 42);
    }
  },
  /** Retournement lent de la river. */
  reveal: () => {
    play('flip', { gain: 0.8, rate: 0.85 });
    tone(0.12, 523, 0.5, 0.04, 'triangle');
  },
  /** Fanfare des grands moments (gros pot, carré, quinte flush, bad beat). */
  fanfare: (kind: 'big' | 'monster' | 'badbeat') => {
    if (kind === 'badbeat') {
      tone(0, 392, 0.35, 0.09, 'triangle', 370);
      tone(0.32, 349, 0.35, 0.09, 'triangle', 330);
      tone(0.64, 294, 0.8, 0.1, 'triangle', 262);
      return;
    }
    const notes = kind === 'monster' ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(i * 0.11, f, 0.45, 0.07, 'triangle'));
    tone(notes.length * 0.11, notes.at(-1)! * 1.5, 0.9, 0.05, 'sine');
    play('rake', { at: 0.2, gain: 0.6 });
  },
};
