'use client';
import { motion } from 'framer-motion';
import { compact } from '@/lib/format';
import { cx } from '../ui';

/** Dénominations et couleurs des jetons (inspirées des standards de casino). */
const DENOMS = [
  { v: 100000, c: '#e9a23b', e: '#fff3d1' },
  { v: 25000, c: '#7c3aed', e: '#e9ddff' },
  { v: 5000, c: '#ea580c', e: '#ffe5d1' },
  { v: 1000, c: '#facc15', e: '#3b2f06' },
  { v: 500, c: '#a855f7', e: '#f5e8ff' },
  { v: 100, c: '#111827', e: '#e5e7eb' },
  { v: 25, c: '#16a34a', e: '#e7fbe9' },
  { v: 5, c: '#dc2626', e: '#ffe1e1' },
  { v: 1, c: '#e5e7eb', e: '#1f2937' },
];

/** Décompose un montant en au plus `max` jetons visibles. */
function breakdown(amount: number, max = 6): { c: string; e: string }[] {
  const out: { c: string; e: string }[] = [];
  let rest = amount;
  for (const d of DENOMS) {
    while (rest >= d.v && out.length < max) {
      out.push(d);
      rest -= d.v;
    }
  }
  if (out.length === 0 && amount > 0) out.push(DENOMS[DENOMS.length - 1]!);
  return out.reverse();
}

export function Chip({ color, edge, size = 18 }: { color: string; edge: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" aria-hidden>
      <circle cx="12" cy="12" r="11.5" fill={color} />
      <circle cx="12" cy="12" r="11.5" fill="none" stroke={edge} strokeWidth="3" strokeDasharray="3.6 4.4" />
      <circle cx="12" cy="12" r="7" fill={color} stroke={edge} strokeOpacity="0.6" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="11.5" fill="url(#chipShine)" />
      <defs>
        <radialGradient id="chipShine" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Pile de jetons + montant (mise devant un joueur, pot…). */
export function ChipStack({ amount, size = 18, label = true, className, vertical }: { amount: number; size?: number; label?: boolean; className?: string; vertical?: boolean }) {
  const chips = breakdown(amount);
  return (
    <motion.div
      layout
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.5, opacity: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 260 }}
      className={cx('flex items-center gap-1.5', vertical && 'flex-col', className)}
    >
      <div className="relative" style={{ width: size, height: size + (chips.length - 1) * 3 }}>
        {chips.map((c, i) => (
          <div key={i} className="absolute left-0" style={{ bottom: i * 3 }}>
            <Chip color={c.c} edge={c.e} size={size} />
          </div>
        ))}
      </div>
      {label && <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold tabular text-ink ring-1 ring-white/10">{compact(amount)}</span>}
    </motion.div>
  );
}
