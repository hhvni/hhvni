'use client';
/**
 * Roulette du straddle général : la roue tourne chez tous les joueurs et
 * s'arrête sur le montant tiré par le serveur (2 à 10 grosses blindes).
 */
import { animate, AnimatePresence, motion, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { sounds } from '@/lib/sounds';

export const SPIN_MS = 5200;
const HOLD_MS = 2200;
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const SEG = 360 / VALUES.length;
const TURNS = 6;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const COLORS = ['#0b0e15', '#8e1b28', '#0b0e15', '#b88a2e', '#0b0e15', '#8e1b28', '#0b0e15', '#b88a2e', '#5a0f19'];

function segPath(i: number, r: number) {
  const a0 = ((i * SEG - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SEG - 90) * Math.PI) / 180;
  return `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
}

export function StraddleRoulette({ spin, now, sound }: { spin: { value: number; by: string; at: number } | null; now: () => number; sound: boolean }) {
  const [visible, setVisible] = useState<{ value: number; by: string; at: number } | null>(null);
  const [landed, setLanded] = useState(false);
  const rotate = useMotionValue(0);
  // Le tirage est figé à son début : les mises à jour de l'état ne relancent pas l'animation
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const nowRef = useRef(now);
  nowRef.current = now;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const spinAt = spin?.at ?? null;

  useEffect(() => {
    const spin = spinRef.current;
    if (!spin || spinAt === null) return;
    const now = nowRef.current;
    const sound = soundRef.current;
    const elapsed = now() - spin.at;
    if (elapsed > SPIN_MS + HOLD_MS) return; // tirage ancien (reconnexion) : rien à montrer
    const idx = VALUES.indexOf(spin.value);
    const target = TURNS * 360 - (idx * SEG + SEG / 2);
    const remaining = Math.max(0, SPIN_MS - elapsed);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let anim: ReturnType<typeof animate> | null = null;
    setVisible(spin);
    setLanded(remaining === 0);

    if (remaining === 0) {
      rotate.set(target);
    } else {
      const start = elapsed / SPIN_MS;
      const from = target * easeOut(start);
      rotate.set(from);
      anim = animate(rotate, target, { duration: remaining / 1000, ease: (t) => (easeOut(start + t * (1 - start)) - easeOut(start)) / (1 - easeOut(start)) });
      // Cliquets : un « clic » chaque fois qu'une case passe sous le repère
      if (sound) {
        for (let k = Math.ceil(from / SEG); k * SEG < target; k++) {
          const t = 1 - Math.cbrt(1 - (k * SEG) / target); // instant (0..1) où l'angle k·SEG est atteint
          const at = t * SPIN_MS - elapsed;
          if (at > 0) timers.push(setTimeout(() => sounds.wheelTick(), at));
        }
      }
      timers.push(setTimeout(() => {
        setLanded(true);
        if (sound) sounds.wheelStop();
      }, remaining));
    }
    timers.push(setTimeout(() => setVisible(null), remaining + HOLD_MS));
    return () => {
      timers.forEach(clearTimeout);
      anim?.stop();
    };
  }, [spinAt, rotate]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={visible.at}
          className="pointer-events-none absolute inset-0 z-[36] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-black/60 px-4 py-1 text-sm font-semibold text-white ring-1 ring-white/10">
              🎡 Roulette du straddle · lancée par <span className="text-gold-300">{visible.by}</span>
            </div>
            <div className="relative h-[min(64vw,300px)] w-[min(64vw,300px)]">
              {/* Repère */}
              <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.7))' }}>
                <svg width="30" height="34" viewBox="0 0 30 34"><path d="M15 34 L2 6 Q15 -4 28 6 Z" fill="#ecc977" stroke="#fff3cf" strokeWidth="1.5" /></svg>
              </div>
              <motion.svg viewBox="-110 -110 220 220" className="h-full w-full" style={{ rotate }}>
                <defs>
                  <radialGradient id="rl-rim" cx="50%" cy="50%" r="50%">
                    <stop offset="0.86" stopColor="#d9ad4f" />
                    <stop offset="0.93" stopColor="#fff1c4" />
                    <stop offset="1" stopColor="#8a6420" />
                  </radialGradient>
                </defs>
                <circle r="108" fill="url(#rl-rim)" />
                {VALUES.map((v, i) => {
                  const mid = ((i * SEG + SEG / 2 - 90) * Math.PI) / 180;
                  const gold = COLORS[i] === '#b88a2e';
                  return (
                    <g key={v}>
                      <path d={segPath(i, 96)} fill={COLORS[i]} stroke="#ecc977" strokeWidth="1.2" />
                      <text
                        x={70 * Math.cos(mid)}
                        y={70 * Math.sin(mid)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="Georgia, serif"
                        fontWeight="700"
                        fontSize="19"
                        fill={gold ? '#0a0d14' : '#f6dea0'}
                        transform={`rotate(${i * SEG + SEG / 2} ${70 * Math.cos(mid)} ${70 * Math.sin(mid)})`}
                      >
                        {v}
                      </text>
                    </g>
                  );
                })}
                <circle r="34" fill="#0a0d14" stroke="#ecc977" strokeWidth="2" />
                <text textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, serif" fontWeight="700" fontSize="15" fill="#ecc977">BB</text>
              </motion.svg>
            </div>
            <motion.div
              className="rounded-2xl bg-black/70 px-5 py-2 text-center ring-1 ring-gold-400/50"
              animate={landed ? { scale: [0.8, 1.15, 1], opacity: 1 } : { opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.45 }}
            >
              {landed ? (
                <>
                  <div className="font-display text-3xl font-black text-gold-300 sm:text-4xl">{visible.value} BB</div>
                  <div className="text-xs text-white/80">Straddle général à la prochaine main · tout le monde pose {visible.value} BB</div>
                </>
              ) : (
                <div className="text-sm font-semibold text-white/80">La roue tourne…</div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
