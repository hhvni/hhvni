'use client';
/**
 * Commandes de jeu : se coucher, parole, suivre, miser/relancer (curseur +
 * raccourcis), tapis, et pré-actions. Les montants proposés sont bornés par
 * les limites légales envoyées par le serveur, qui revalide tout de toute façon.
 */
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameView, LegalActions } from '@poker/engine';
import { fmt } from '@/lib/format';
import { cx } from '../ui';

export type PreAction = 'checkFold' | 'check' | 'callAny' | null;

interface Props {
  state: GameView;
  onAction: (type: string, amount?: number) => Promise<boolean>;
}

function shortcuts(l: LegalActions, bb: number, preflop: boolean) {
  const clamp = (x: number) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(x)));
  const toCall = l.currentBet - l.streetBet;
  const potAfterCall = l.pot + toCall;
  const list: { label: string; to: number }[] = [];
  if (preflop) {
    const unit = l.currentBet <= bb ? bb : l.currentBet;
    const prefix = l.currentBet <= bb ? 'BB' : '×';
    for (const m of [2, 2.5, 3]) list.push({ label: prefix === 'BB' ? `${String(m).replace('.', ',')} BB` : `${String(m).replace('.', ',')}×`, to: clamp(unit * m) });
  }
  for (const f of [0.5, 0.75, 1]) {
    const to = l.currentBet === 0 ? potAfterCall * f : l.currentBet + potAfterCall * f;
    list.push({ label: `${f * 100} %`, to: clamp(to) });
  }
  return list;
}

export function ActionBar({ state, onAction }: Props) {
  const l = state.me.legal;
  const bb = state.tournament?.bigBlind ?? state.config.bigBlind;
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pre, setPre] = useState<PreAction>(null);
  const lastSeq = useRef(-1);
  const preflop = state.street === 'preflop';
  const mySeat = state.me.seat >= 0 ? state.seats[state.me.seat] : null;
  const inHand = !!mySeat?.inHand && !mySeat.allIn;

  // Réinitialise le montant à chaque nouvelle décision
  useEffect(() => {
    if (l && state.actionSeq !== lastSeq.current) {
      lastSeq.current = state.actionSeq;
      setAmount(l.minTo);
      setBusy(false);
    }
  }, [l, state.actionSeq]);

  // Les pré-actions sont annulées à chaque nouvelle main
  useEffect(() => setPre(null), [state.handNumber]);

  // Exécution automatique d'une pré-action quand vient notre tour
  useEffect(() => {
    if (!l || !pre || busy) return;
    const p = pre;
    setPre(null);
    if (p === 'checkFold') void act(l.canCheck ? 'check' : 'fold');
    else if (p === 'check' && l.canCheck) void act('check');
    else if (p === 'callAny') void act(l.canCall ? 'call' : 'check');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, pre]);

  const sc = useMemo(() => (l && (l.canBet || l.canRaise) ? shortcuts(l, bb, preflop) : []), [l, bb, preflop]);

  async function act(type: string, amt?: number) {
    if (busy) return;
    setBusy(true); // anti double-clic
    const ok = await onAction(type, amt);
    if (!ok) setBusy(false);
  }

  if (!l) {
    if (!inHand || state.result) return <div className="h-14" />;
    // Pas notre tour : pré-actions
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 py-2">
        {([['checkFold', 'Parole / Coucher'], ['check', 'Parole'], ['callAny', 'Suivre tout']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setPre(pre === k ? null : k)} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition', pre === k ? 'bg-gold-400/15 text-gold-300 ring-gold-400/60' : 'bg-white/5 text-muted ring-white/10 hover:text-ink')}>
            <span className={cx('flex h-4 w-4 items-center justify-center rounded border', pre === k ? 'border-gold-400 bg-gold-400 text-night-950' : 'border-white/30')}>{pre === k && '✓'}</span>
            {label}
          </button>
        ))}
      </div>
    );
  }

  const canAggro = l.canBet || l.canRaise;
  const allInOnly = canAggro && l.minTo >= l.maxTo;
  const pct = canAggro && l.maxTo > l.minTo ? ((amount - l.minTo) / (l.maxTo - l.minTo)) * 100 : 100;
  const step = Math.max(1, Math.round(bb / 2));
  const simple = state.config.uiLevel === 'simple';

  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto w-full max-w-3xl space-y-2.5 px-1">
      {simple && (
        <p className="text-center text-xs text-muted">
          {l.canCheck ? 'Personne n’a misé : vous pouvez checker (parole) gratuitement ou miser.' : `Pour rester dans le coup, suivez ${fmt(l.callAmount)} jetons. Sinon couchez-vous.`}
        </p>
      )}
      {canAggro && !allInOnly && (
        <div className="space-y-2 rounded-2xl bg-night-900/85 p-2.5 ring-1 ring-white/8 backdrop-blur">
          <div className="flex flex-wrap justify-center gap-1.5">
            {sc.map((s) => (
              <button key={s.label} onClick={() => setAmount(s.to)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition', amount === s.to ? 'bg-gold-400/20 text-gold-300 ring-gold-400/60' : 'bg-white/5 text-muted ring-white/10 hover:text-ink')}>
                {s.label}
              </button>
            ))}
            <button onClick={() => setAmount(l.maxTo)} className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold ring-1', amount === l.maxTo ? 'bg-danger/25 text-[#ffb3ba] ring-danger/60' : 'bg-white/5 text-muted ring-white/10 hover:text-ink')}>
              Tapis
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className="h-8 w-8 shrink-0 rounded-lg bg-white/5 text-lg text-muted ring-1 ring-white/10" onClick={() => setAmount((a) => Math.max(l.minTo, a - step))} aria-label="Diminuer">−</button>
            <input
              type="range"
              className="slider min-w-0 flex-1"
              min={l.minTo}
              max={l.maxTo}
              step={1}
              value={amount}
              style={{ ['--p' as string]: `${pct}%` }}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Montant de la mise"
            />
            <button className="h-8 w-8 shrink-0 rounded-lg bg-white/5 text-lg text-muted ring-1 ring-white/10" onClick={() => setAmount((a) => Math.min(l.maxTo, a + step))} aria-label="Augmenter">+</button>
            <input
              type="number"
              inputMode="numeric"
              className="h-9 w-24 shrink-0 rounded-lg border border-white/10 bg-night-950/70 px-2 text-right text-sm font-semibold tabular text-gold-300 outline-none focus:border-gold-400/60"
              value={amount}
              min={l.minTo}
              max={l.maxTo}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount((a) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(a) || l.minTo)))}
              aria-label="Montant exact"
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <ActionButton tone="fold" onClick={() => act('fold')} disabled={busy}>
          Se coucher
        </ActionButton>
        {l.canCheck ? (
          <ActionButton tone="call" onClick={() => act('check')} disabled={busy}>Parole</ActionButton>
        ) : (
          <ActionButton tone="call" onClick={() => act('call')} disabled={busy}>
            {l.callAmount >= l.stack ? 'Tapis' : 'Suivre'} <span className="tabular">{fmt(l.callAmount)}</span>
          </ActionButton>
        )}
        {canAggro ? (
          allInOnly || amount >= l.maxTo ? (
            <ActionButton tone="allin" onClick={() => act('allin')} disabled={busy}>
              Tapis <span className="tabular">{fmt(l.maxTo)}</span>
            </ActionButton>
          ) : (
            <ActionButton tone="raise" onClick={() => act(l.canBet ? 'bet' : 'raise', Math.max(l.minTo, Math.min(l.maxTo, Math.round(amount))))} disabled={busy}>
              {l.canBet ? 'Miser' : 'Relancer à'} <span className="tabular">{fmt(amount)}</span>
            </ActionButton>
          )
        ) : (
          <ActionButton tone="raise" disabled>Relance impossible</ActionButton>
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({ tone, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: 'fold' | 'call' | 'raise' | 'allin' }) {
  const tones = {
    fold: 'from-[#3a1f26] to-[#2a141a] text-[#ffb3ba] ring-danger/40 hover:from-[#4a2530]',
    call: 'from-[#1f3a6b] to-[#152a52] text-white ring-info/40 hover:from-[#26478a]',
    raise: 'from-gold-300 via-gold-400 to-gold-600 text-night-950 ring-gold-300/60',
    allin: 'from-[#e8616c] to-[#a3202c] text-white ring-danger/60',
  };
  return (
    <button
      className={cx('flex h-12 flex-col items-center justify-center rounded-2xl bg-gradient-to-b text-sm font-bold leading-tight shadow-lg ring-1 transition active:scale-[0.97] disabled:opacity-40 sm:h-14 sm:flex-row sm:gap-1.5 sm:text-base', tones[tone])}
      {...rest}
    >
      {children}
    </button>
  );
}
