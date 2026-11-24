'use client';
/**
 * Effets des grands moments à la fin d'un coup :
 *  - main monstre (carré, quinte flush, quinte flush royale) ;
 *  - bad beat : le gagnant était nettement derrière quand l'argent est parti à tapis ;
 *  - gros pot (au moins 50 grosses blindes).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '@poker/engine';
import { useMoney } from '@/lib/displayPrefs';

export type CelebrationKind = 'monster' | 'badbeat' | 'big';
export interface Celebration {
  id: string;
  kind: CelebrationKind;
  title: string;
  subtitle: string;
}

const BIG_POT_BB = 50;

/** Détecte le grand moment du coup qui vient de se terminer (au plus un par coup). */
export function useCelebration(state: GameView | null): Celebration | null {
  const money = useMoney();
  // Première estimation des chances au moment du tapis, par coup
  const firstEquity = useRef<{ hand: number; eq: Map<string, number> } | null>(null);
  const [current, setCurrent] = useState<Celebration | null>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!state?.equity || state.result) return;
    if (firstEquity.current?.hand === state.handNumber) return;
    firstEquity.current = { hand: state.handNumber, eq: new Map(state.equity.map((e) => [e.userId, e.win + e.tie / 2])) };
  }, [state?.equity, state?.result, state?.handNumber]);

  const found = useMemo((): Celebration | null => {
    const r = state?.result;
    if (!state || !r) return null;
    const name = (id: string) => state.seats.find((s) => s?.userId === id)?.username ?? '?';
    const winners = [...new Set(r.pots.flatMap((p) => p.winners))];
    const id = `${state.gameId}-${r.handNumber}`;
    const total = r.pots.reduce((a, p) => a + p.amount, 0);

    // 1) Main monstre gagnante
    const monster = r.shown.find((s) => winners.includes(s.userId) && /^(Carré|Quinte flush)/.test(s.description));
    if (monster) {
      const royal = /royale/.test(monster.description);
      return {
        id, kind: 'monster',
        title: royal ? 'QUINTE FLUSH ROYALE !' : monster.description.startsWith('Quinte flush') ? 'QUINTE FLUSH !' : 'CARRÉ !',
        subtitle: `${name(monster.userId)} · ${monster.description}`,
      };
    }

    // 2) Bad beat : un gagnant était à moins de 25 % au moment du tapis
    const eq = firstEquity.current?.hand === r.handNumber ? firstEquity.current.eq : null;
    if (eq && winners.length === 1) {
      const w = winners[0]!;
      const p = eq.get(w);
      if (p !== undefined && p < 0.25) {
        const fav = [...eq.entries()].filter(([u]) => u !== w).sort((a, b) => b[1] - a[1])[0];
        return {
          id, kind: 'badbeat', title: 'BAD BEAT !',
          subtitle: `${name(w)} gagne avec ${Math.max(1, Math.round(p * 100))} % de chances${fav ? ` contre ${name(fav[0])}` : ''}`,
        };
      }
    }

    // 3) Gros pot
    const bb = state.tournament?.bigBlind ?? state.config.bigBlind;
    if (bb > 0 && total >= BIG_POT_BB * bb) {
      return { id, kind: 'big', title: 'GROS POT !', subtitle: `${winners.map(name).join(' & ')} ${winners.length > 1 ? 'partagent' : 'remporte'} ${money(total)}` };
    }
    return null;
  }, [state, money]);

  useEffect(() => {
    if (!found || shown.current === found.id) return;
    shown.current = found.id;
    // Laisser d'abord apparaître le bandeau du vainqueur
    const t1 = setTimeout(() => setCurrent(found), 500);
    const t2 = setTimeout(() => setCurrent((c) => (c?.id === found.id ? null : c)), 4300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [found]);

  return current;
}

const PALETTE: Record<CelebrationKind, { text: string; glow: string; confetti: string[] }> = {
  monster: { text: 'from-[#fff6d6] via-[#ecc977] to-[#b88a2e]', glow: 'rgba(236,201,119,0.75)', confetti: ['#ecc977', '#f6dea0', '#ffffff', '#d9ad4f', '#b88a2e'] },
  big: { text: 'from-[#fff6d6] via-[#ecc977] to-[#d9ad4f]', glow: 'rgba(236,201,119,0.55)', confetti: ['#ecc977', '#f6dea0', '#3ccf8e', '#ffffff'] },
  badbeat: { text: 'from-[#ffd1d5] via-[#e05561] to-[#9b1d2a]', glow: 'rgba(224,85,97,0.65)', confetti: ['#e05561', '#ffffff', '#8f9ab3'] },
};

export function CelebrationOverlay({ c }: { c: Celebration | null }) {
  const particles = useMemo(() => {
    if (!c) return [];
    const n = c.kind === 'big' ? 36 : 60;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 140 + Math.random() * 260;
      return {
        i,
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist * 0.7 - 40,
        fall: 120 + Math.random() * 160,
        rot: Math.random() * 720 - 360,
        size: 5 + Math.random() * 7,
        round: Math.random() < 0.4,
        color: PALETTE[c.kind].confetti[i % PALETTE[c.kind].confetti.length]!,
        delay: Math.random() * 0.15,
      };
    });
  }, [c]);

  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} aria-live="polite">
          {/* Voile */}
          <motion.div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${PALETTE[c.kind].glow.replace(/[\d.]+\)$/, '0.22)')}, transparent 60%)` }} />
          {/* Éclats / confettis */}
          {c.kind !== 'badbeat' && particles.map((p) => (
            <motion.span
              key={p.i}
              className="absolute left-1/2 top-[42%]"
              style={{ width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? 999 : 2, boxShadow: `0 0 6px ${p.color}` }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
              animate={{ x: p.x, y: [0, p.y, p.y + p.fall], opacity: [1, 1, 0], rotate: p.rot, scale: 1 }}
              transition={{ duration: 2.4, delay: p.delay, ease: 'easeOut', times: [0, 0.35, 1] }}
            />
          ))}
          {/* Titre */}
          <motion.div
            className="relative flex flex-col items-center px-4 text-center"
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
            animate={c.kind === 'badbeat' ? { scale: 1, opacity: 1, rotate: 0, x: [0, -10, 10, -7, 7, -3, 0] } : { scale: [0.3, 1.15, 1], opacity: 1, rotate: 0 }}
            transition={c.kind === 'badbeat' ? { duration: 0.7, x: { delay: 0.3, duration: 0.5 } } : { duration: 0.6, ease: 'easeOut' }}
          >
            <span className="flex items-center gap-2 sm:gap-3">
            <span className="text-3xl sm:text-5xl" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }}>{c.kind === 'badbeat' ? '😱' : c.kind === 'monster' ? '👑' : '💰'}</span>
            <span
              className={`bg-gradient-to-b ${PALETTE[c.kind].text} bg-clip-text font-display text-4xl font-black tracking-wide text-transparent sm:text-6xl`}
              style={{ filter: `drop-shadow(0 0 18px ${PALETTE[c.kind].glow}) drop-shadow(0 4px 2px rgba(0,0,0,0.6))` }}
            >
              {c.title}
            </span>
            </span>
            <motion.span className="mt-2 rounded-full bg-black/60 px-4 py-1 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur sm:text-base" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              {c.subtitle}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
