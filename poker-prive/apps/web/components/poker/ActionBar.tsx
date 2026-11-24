'use client';
/**
 * Commandes de jeu : se coucher, parole, suivre, miser/relancer (curseur +
 * tailles prédéfinies), tapis, pré-actions et raccourcis clavier.
 * Les montants proposés sont bornés par les limites légales envoyées par le
 * serveur, qui revalide tout de toute façon.
 *
 * Raccourcis (ordinateur) : F se coucher · C parole/suivre · R miser/relancer ·
 * Entrée valider la mise · A tapis · 1 à 8 tailles · ↑ ↓ ajuster.
 */
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameView, LegalActions } from '@poker/engine';
import { formatBB, useDisplayPrefs, useMoney } from '@/lib/displayPrefs';
import { cx } from '../ui';

export type PreAction = 'checkFold' | 'check' | 'callAny' | null;

interface Props {
  state: GameView;
  onAction: (type: string, amount?: number) => Promise<boolean>;
}

interface Size {
  label: string;
  to: number;
}

/** Tailles de mise proposées selon la situation (préflop / postflop, ouverture / relance). */
function sizes(l: LegalActions, bb: number, preflop: boolean): Size[] {
  const clamp = (x: number) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(x)));
  const toCall = l.currentBet - l.streetBet;
  const potAfterCall = l.pot + toCall;
  const potTo = (f: number) => (l.currentBet === 0 ? potAfterCall * f : l.currentBet + potAfterCall * f);
  const fr = (n: number) => String(n).replace('.', ',');
  const list: Size[] = [{ label: 'Min', to: l.minTo }];
  if (preflop && l.currentBet <= bb) {
    for (const m of [2, 2.5, 3, 4]) list.push({ label: `${fr(m)} BB`, to: clamp(bb * m) });
    list.push({ label: 'Pot', to: clamp(potTo(1)) });
  } else if (preflop) {
    for (const m of [2.5, 3, 4]) list.push({ label: `${fr(m)}×`, to: clamp(l.currentBet * m) });
    list.push({ label: 'Pot', to: clamp(potTo(1)) });
  } else {
    for (const [f, label] of [[0.33, '33 %'], [0.5, '50 %'], [0.66, '66 %'], [0.75, '75 %'], [1, 'Pot'], [1.5, '150 %']] as const) {
      list.push({ label, to: clamp(potTo(f)) });
    }
  }
  // Pas de doublons ni de tailles équivalentes au tapis (le bouton Tapis existe)
  const seen = new Set<number>();
  return list.filter((s) => {
    if (s.to >= l.maxTo || seen.has(s.to)) return false;
    seen.add(s.to);
    return true;
  });
}

/** Ignore les raccourcis quand on écrit dans un champ (chat…). */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t.isContentEditable);
}

export function ActionBar({ state, onAction }: Props) {
  const l = state.me.legal;
  const bb = state.tournament?.bigBlind ?? state.config.bigBlind;
  const [amount, setAmount] = useState(0);
  const money = useMoney();
  const { keyboard } = useDisplayPrefs();
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

  const act = useCallback(async (type: string, amt?: number) => {
    if (busy) return;
    setBusy(true); // anti double-clic
    const ok = await onAction(type, amt);
    if (!ok) setBusy(false);
  }, [busy, onAction]);

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

  const sc = useMemo(() => (l && (l.canBet || l.canRaise) ? sizes(l, bb, preflop) : []), [l, bb, preflop]);
  const canAggro = !!l && (l.canBet || l.canRaise);
  const allInOnly = !!l && canAggro && l.minTo >= l.maxTo;
  const step = Math.max(1, Math.round(bb / 2));

  const confirmBet = useCallback(() => {
    if (!l || !canAggro) return;
    if (allInOnly || amount >= l.maxTo) void act('allin');
    else void act(l.canBet ? 'bet' : 'raise', Math.max(l.minTo, Math.min(l.maxTo, Math.round(amount))));
  }, [l, canAggro, allInOnly, amount, act]);

  // ─── Raccourcis clavier ───
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (!l) {
        // Pas notre tour : pré-actions
        if (!inHand || state.result) return;
        if (k === 'f') setPre((p) => (p === 'checkFold' ? null : 'checkFold'));
        else if (k === 'c') setPre((p) => (p === 'check' ? null : 'check'));
        else return;
        e.preventDefault();
        return;
      }
      if (k === 'f') void act('fold');
      else if (k === 'c' || k === 'x') void act(l.canCheck ? 'check' : 'call');
      else if (k === 'r' || k === 'b' || k === 'enter') confirmBet();
      else if (k === 'a' && canAggro) setAmount(l.maxTo);
      else if ((k === 'arrowup' || k === '+') && canAggro) setAmount((a) => Math.min(l.maxTo, a + (e.shiftKey ? bb : step)));
      else if ((k === 'arrowdown' || k === '-') && canAggro) setAmount((a) => Math.max(l.minTo, a - (e.shiftKey ? bb : step)));
      else if (/^[1-8]$/.test(k) && sc[Number(k) - 1]) setAmount(sc[Number(k) - 1]!.to);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, l, inHand, state.result, act, confirmBet, canAggro, sc, bb, step]);

  if (!l) {
    if (!inHand || state.result) return <div className="h-14 md:h-0" />;
    // Pas notre tour : pré-actions, sur le côté (ordinateur) ou en ligne (mobile)
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 py-2 md:absolute md:bottom-4 md:left-4 md:z-20 md:flex-col md:items-stretch md:py-0">
        {([['checkFold', 'Parole / Coucher', 'F'], ['check', 'Parole', 'C'], ['callAny', 'Suivre tout', '']] as const).map(([k, label, key]) => (
          <button key={k} onClick={() => setPre(pre === k ? null : k)} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1 backdrop-blur transition', pre === k ? 'bg-gold-400/15 text-gold-300 ring-gold-400/60' : 'bg-night-900/80 text-muted ring-white/10 hover:text-ink')}>
            <span className={cx('flex h-4 w-4 items-center justify-center rounded border', pre === k ? 'border-gold-400 bg-gold-400 text-night-950' : 'border-white/30')}>{pre === k && '✓'}</span>
            <span className="flex-1 text-left">{label}</span>
            {keyboard && key && <Kbd>{key}</Kbd>}
          </button>
        ))}
      </div>
    );
  }

  const pct = canAggro && l.maxTo > l.minTo ? ((amount - l.minTo) / (l.maxTo - l.minTo)) * 100 : 100;
  const simple = state.config.uiLevel === 'simple';
  const toCall = l.currentBet - l.streetBet;
  const potAfterCall = l.pot + toCall;
  const potShare = potAfterCall > 0 ? Math.round(((l.currentBet === 0 ? amount : amount - l.currentBet) / potAfterCall) * 100) : 0;

  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto w-full max-w-3xl space-y-2.5 px-1 md:max-w-5xl">
      {simple && (
        <p className="text-center text-xs text-muted">
          {l.canCheck ? 'Personne n’a misé : vous pouvez checker (parole) gratuitement ou miser.' : `Pour rester dans le coup, suivez ${money(l.callAmount, true)}. Sinon couchez-vous.`}
        </p>
      )}
      {/* Mobile : panneau de mise au-dessus des boutons ; ordinateur : sur le côté droit */}
      <div className="flex flex-col gap-2.5 md:flex-row-reverse md:items-end md:gap-3">
        {canAggro && !allInOnly && (
          <div className="space-y-2 rounded-2xl bg-night-900/85 p-2.5 ring-1 ring-white/8 backdrop-blur md:w-[50%] md:shrink-0 md:space-y-1.5 md:p-2">
            <div className="flex justify-start gap-1 overflow-x-auto scroll-thin md:justify-center">
              {sc.map((s, i) => (
                <button key={s.label} onClick={() => setAmount(s.to)} title={keyboard ? `Touche ${i + 1}` : undefined} className={cx('shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ring-1 transition', amount === s.to ? 'bg-gold-400/20 text-gold-300 ring-gold-400/60' : 'bg-white/5 text-muted ring-white/10 hover:text-ink')}>
                  {s.label}
                </button>
              ))}
              <button onClick={() => setAmount(l.maxTo)} title={keyboard ? 'Touche A' : undefined} className={cx('shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ring-1', amount === l.maxTo ? 'bg-danger/25 text-[#ffb3ba] ring-danger/60' : 'bg-white/5 text-muted ring-white/10 hover:text-ink')}>
                Tapis
              </button>
            </div>
            <div className="flex items-center gap-2">
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
                className="h-9 w-[5.5rem] shrink-0 rounded-lg border border-white/10 bg-night-950/70 px-2 text-right text-sm font-semibold tabular text-gold-300 outline-none focus:border-gold-400/60"
                value={amount}
                min={l.minTo}
                max={l.maxTo}
                onChange={(e) => setAmount(Number(e.target.value))}
                onBlur={() => setAmount((a) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(a) || l.minTo)))}
                onKeyDown={(e) => e.key === 'Enter' && confirmBet()}
                aria-label="Montant exact"
              />
              <span className="hidden w-[4.5rem] shrink-0 text-right text-[11px] leading-tight tabular text-muted sm:block">
                {formatBB(amount, bb, true)}
                <br />
                <span className="text-faint">{potShare} % du pot</span>
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 md:flex-1">
          <ActionButton tone="fold" onClick={() => act('fold')} disabled={busy} kbd={keyboard ? 'F' : undefined}>
            Se coucher
          </ActionButton>
          {l.canCheck ? (
            <ActionButton tone="call" onClick={() => act('check')} disabled={busy} kbd={keyboard ? 'C' : undefined}>Parole</ActionButton>
          ) : (
            <ActionButton tone="call" onClick={() => act('call')} disabled={busy} kbd={keyboard ? 'C' : undefined}>
              {l.callAmount >= l.stack ? 'Tapis' : 'Suivre'} <span className="tabular">{money(l.callAmount, true)}</span>
            </ActionButton>
          )}
          {canAggro ? (
            <ActionButton tone={allInOnly || amount >= l.maxTo ? 'allin' : 'raise'} onClick={confirmBet} disabled={busy} kbd={keyboard ? 'R' : undefined}>
              {allInOnly || amount >= l.maxTo ? 'Tapis' : l.canBet ? 'Miser' : 'Relancer à'} <span className="tabular">{money(allInOnly || amount >= l.maxTo ? l.maxTo : amount, true)}</span>
            </ActionButton>
          ) : (
            <ActionButton tone="raise" disabled>Relance impossible</ActionButton>
          )}
        </div>
      </div>
      {keyboard && (
        <p className="hidden text-center text-[10px] text-faint md:block">
          Clavier : <b>F</b> se coucher · <b>C</b> parole / suivre · <b>R</b> ou <b>Entrée</b> miser · <b>1–8</b> tailles · <b>↑ ↓</b> ajuster (Maj = 1 BB) · <b>A</b> tapis
        </p>
      )}
    </motion.div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="hidden rounded border border-white/20 bg-black/30 px-1 font-sans text-[10px] font-semibold opacity-70 md:inline">{children}</kbd>;
}

function ActionButton({ tone, children, kbd, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: 'fold' | 'call' | 'raise' | 'allin'; kbd?: string }) {
  const tones = {
    fold: 'from-[#3a1f26] to-[#2a141a] text-[#ffb3ba] ring-danger/40 hover:from-[#4a2530]',
    call: 'from-[#1f3a6b] to-[#152a52] text-white ring-info/40 hover:from-[#26478a]',
    raise: 'from-gold-300 via-gold-400 to-gold-600 text-night-950 ring-gold-300/60',
    allin: 'from-[#e8616c] to-[#a3202c] text-white ring-danger/60',
  };
  return (
    <button
      className={cx('relative flex h-12 flex-col items-center justify-center rounded-2xl bg-gradient-to-b text-sm font-bold leading-tight shadow-lg ring-1 transition active:scale-[0.97] disabled:opacity-40 sm:h-14 sm:flex-row sm:gap-1.5 sm:text-base', tones[tone])}
      {...rest}
    >
      {children}
      {kbd && <span className="absolute right-2 top-1.5"><Kbd>{kbd}</Kbd></span>}
    </button>
  );
}
