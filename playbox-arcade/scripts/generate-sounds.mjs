// Génère les effets sonores et la musique du jeu (synthèse pure, aucune ressource tierce).
// Usage : node scripts/generate-sounds.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

const RATE = 22050;
const OUT = join(process.cwd(), 'assets', 'sounds');
mkdirSync(OUT, { recursive: true });

let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const square = (f, t) => (Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1);
const tri = (f, t) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * t));

function tone(buf, start, dur, freqFn, wave, vol, attack = 0.005, release = 0.08) {
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  let phaseT = 0;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const f = typeof freqFn === 'function' ? freqFn(t / dur) : freqFn;
    phaseT += f / RATE;
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
    buf[s0 + i] += wave(1, phaseT) * vol * Math.max(0, env);
  }
}

function noise(buf, start, dur, vol, envFn, lowpass = 0.2) {
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  let last = 0;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    last += (rnd() - last) * lowpass;
    buf[s0 + i] += last * vol * envFn(i / n);
  }
}

function write(name, buf) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  const data = Buffer.alloc(44 + buf.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + buf.length * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(buf.length * 2, 40);
  buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
  writeFileSync(join(OUT, `${name}.wav`), data);
  console.log(`${name}.wav  ${(data.length / 1024).toFixed(1)} Ko`);
}

// Clic d'interface
{
  const b = buffer(0.06);
  tone(b, 0, 0.06, (p) => 1400 - p * 500, sine, 0.5, 0.001, 0.05);
  write('click', b);
}
// Lancer (souffle)
{
  const b = buffer(0.28);
  noise(b, 0, 0.28, 0.7, (p) => Math.sin(Math.PI * p) ** 2, 0.12);
  tone(b, 0, 0.28, (p) => 500 + p * 700, sine, 0.08);
  write('throw', b);
}
// Impact (planche, cible)
{
  const b = buffer(0.2);
  tone(b, 0, 0.2, (p) => 180 - p * 100, sine, 0.9, 0.001, 0.18);
  noise(b, 0, 0.05, 0.6, (p) => 1 - p, 0.6);
  write('impact', b);
}
// Frappe de balle
{
  const b = buffer(0.15);
  tone(b, 0, 0.15, (p) => 140 - p * 60, sine, 0.9, 0.001, 0.13);
  noise(b, 0, 0.03, 0.5, (p) => 1 - p, 0.5);
  write('kick', b);
}
// But (foule + accord)
{
  const b = buffer(1.6);
  noise(b, 0, 1.6, 0.5, (p) => Math.min(1, p * 6) * (1 - p) ** 0.7, 0.08);
  [523.25, 659.25, 783.99].forEach((f, i) => tone(b, 0.05 + i * 0.07, 0.9, f, tri, 0.18, 0.01, 0.4));
  tone(b, 0.3, 1.0, 1046.5, tri, 0.15, 0.01, 0.5);
  write('goal', b);
}
// Bonne réponse
{
  const b = buffer(0.35);
  tone(b, 0, 0.12, 659.25, tri, 0.45);
  tone(b, 0.1, 0.25, 987.77, tri, 0.45, 0.005, 0.15);
  write('correct', b);
}
// Mauvaise réponse
{
  const b = buffer(0.4);
  tone(b, 0, 0.4, (p) => 240 - p * 90, square, 0.18, 0.005, 0.15);
  write('wrong', b);
}
// Victoire
{
  const b = buffer(1.3);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(b, i * 0.11, i === 3 ? 0.85 : 0.2, f, tri, 0.4, 0.005, i === 3 ? 0.5 : 0.08));
  tone(b, 0.33, 0.85, 783.99, tri, 0.2, 0.01, 0.5);
  write('victory', b);
}
// Musique d'ambiance en boucle (8 s, 120 BPM)
{
  const beat = 0.5;
  const b = buffer(beat * 16);
  const bass = [130.81, 130.81, 174.61, 174.61, 110.0, 110.0, 146.83, 196.0];
  bass.forEach((f, i) => {
    tone(b, i * beat * 2, beat * 0.9, f, tri, 0.22, 0.01, 0.2);
    tone(b, i * beat * 2 + beat, beat * 0.9, f * 2, tri, 0.12, 0.01, 0.2);
  });
  const lead = [523.25, 0, 659.25, 783.99, 698.46, 0, 659.25, 587.33, 523.25, 0, 440, 523.25, 587.33, 0, 659.25, 0];
  lead.forEach((f, i) => f && tone(b, i * beat, beat * 0.45, f, square, 0.05, 0.005, 0.1));
  for (let i = 0; i < 32; i++) noise(b, i * (beat / 2), 0.04, i % 2 ? 0.08 : 0.15, (p) => 1 - p, 0.9);
  write('music', b);
}
