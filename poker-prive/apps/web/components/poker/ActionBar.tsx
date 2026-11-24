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
          <button key={k} onClick={() => setPre(pre === k ? null : k)} className={cx('flex items-center gap-2 rounded-xl bg-gradient-to-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 backdrop-blur transition', pre === k ? 'from-[#2a2110] to-[#0b0d12] text-gold-300 ring-gold-400/70' : 'from-[#12151d]/95 to-[#07090d]/95 text-muted ring-white/10 hover:text-ink hover:ring-gold-400/30')}>
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
  const isAllIn = allInOnly || amount >= l.maxTo;

  const sizing = canAggro && !allInOnly && (
    <div className="space-y-2 rounded-2xl bg-gradient-to-b from-[#12151d]/95 to-[#07090d]/95 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.55)] ring-1 ring-gold-400/20 backdrop-blur">
      {/* Tailles prédéfinies : de vrais jetons */}
      <div className="-my-1 flex justify-start gap-1.5 overflow-x-auto px-1 py-1.5 scroll-thin md:justify-between">
        {sc.map((s, i) => (
          <SizeChip key={s.label} label={s.label} active={amount === s.to} onClick={() => setAmount(s.to)} hint={keyboard ? `Touche ${i + 1}` : undefined} />
        ))}
        <SizeChip label="Tapis" danger active={amount === l.maxTo} onClick={() => setAmount(l.maxTo)} hint={keyboard ? 'Touche A' : undefined} />
      </div>
      {/* Curseur + montant */}
      <div className="flex items-center gap-2">
        <StepButton label="−" onClick={() => setAmount((a) => Math.max(l.minTo, a - step))} aria="Diminuer" />
        <input
          type="range"
          className="bet-slider min-w-0 flex-1"
          min={l.minTo}
          max={l.maxTo}
          step={1}
          value={amount}
          style={{ ['--p' as string]: `${pct}%` }}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label="Montant de la mise"
        />
        <StepButton label="+" onClick={() => setAmount((a) => Math.min(l.maxTo, a + step))} aria="Augmenter" />
        <div className="flex shrink-0 flex-col items-end">
          <input
            type="number"
            inputMode="numeric"
            className="h-8 w-[5.2rem] rounded-lg bg-black/60 px-2 text-right font-display text-base font-bold tabular text-gold-300 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] outline-none ring-1 ring-gold-400/25 focus:ring-gold-400/70"
            value={amount}
            min={l.minTo}
            max={l.maxTo}
            onChange={(e) => setAmount(Number(e.target.value))}
            onBlur={() => setAmount((a) => Math.max(l.minTo, Math.min(l.maxTo, Math.round(a) || l.minTo)))}
            onKeyDown={(e) => e.key === 'Enter' && confirmBet()}
            aria-label="Montant exact"
          />
          <span className="mt-0.5 text-[10px] leading-none tabular text-muted">
            {formatBB(amount, bb, true)} · {potShare} % pot
          </span>
        </div>
      </div>
    </div>
  );

  const buttons = (
    <div className="grid grid-cols-3 gap-2">
      <ActionButton tone="fold" onClick={() => act('fold')} disabled={busy} kbd={keyboard ? 'F' : undefined} label="Se coucher" />
      {l.canCheck ? (
        <ActionButton tone="call" onClick={() => act('check')} disabled={busy} kbd={keyboard ? 'C' : undefined} label="Parole" />
      ) : (
        <ActionButton
          tone="call"
          onClick={() => act('call')}
          disabled={busy}
          kbd={keyboard ? 'C' : undefined}
          label={l.callAmount >= l.stack ? 'Suivre à tapis' : 'Suivre'}
          amount={money(l.callAmount, true)}
        />
      )}
      {canAggro ? (
        <ActionButton
          tone={isAllIn ? 'allin' : 'raise'}
          onClick={confirmBet}
          disabled={busy}
          kbd={keyboard ? 'R' : undefined}
          label={isAllIn ? 'Tapis' : l.canBet ? 'Miser' : 'Relancer à'}
          amount={money(isAllIn ? l.maxTo : amount, true)}
        />
      ) : (
        <ActionButton tone="raise" disabled label="Relance" amount="impossible" />
      )}
    </div>
  );

  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 260 }} className="mx-auto w-full px-1">
      {simple && (
        <p className="mb-1.5 text-center text-xs text-muted">
          {l.canCheck ? 'Personne n’a misé : vous pouvez checker (parole) gratuitement ou miser.' : `Pour rester dans le coup, suivez ${money(l.callAmount, true)}. Sinon couchez-vous.`}
        </p>
      )}
      {/* Mobile : mise au-dessus des boutons. Ordinateur : mise à gauche, boutons à droite,
          le centre reste libre pour la plaque du joueur. */}
      <div
        className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_clamp(150px,18vw,230px)_minmax(0,1fr)] md:items-end md:gap-0"
        title={keyboard ? 'Clavier : F se coucher · C parole/suivre · R ou Entrée miser · 1–8 tailles · ↑↓ ajuster (Maj = 1 BB) · A tapis' : undefined}
      >
        <div className="md:col-start-1 md:max-w-[440px] md:justify-self-end md:pr-3">{sizing}</div>
        <div className="md:col-start-3 md:w-full md:max-w-[440px] md:pl-3">{buttons}</div>
      </div>
    </motion.div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="hidden rounded border border-current/30 bg-black/25 px-1 font-sans text-[9px] font-semibold opacity-60 md:inline">{children}</kbd>;
}

/** Taille de mise prédéfinie, dessinée comme un jeton de casino. */
function SizeChip({ label, active, danger, onClick, hint }: { label: string; active: boolean; danger?: boolean; onClick: () => void; hint?: string }) {
  const edge = danger ? '#e05561' : '#ecc977';
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cx('group relative flex h-10 w-10 shrink-0 items-center md:h-11 md:w-11 justify-center rounded-full transition active:scale-95', active ? 'scale-105' : 'opacity-80 hover:opacity-100')}
      style={{
        background: `radial-gradient(circle, ${active ? (danger ? '#5c1520' : '#2a2110') : '#0d1018'} 0 54%, transparent 55%), repeating-conic-gradient(${edge} 0 20deg, ${active ? '#0b0d12' : '#1b1f29'} 20deg 45deg)`,
        boxShadow: active ? `0 0 0 2px ${edge}, 0 0 14px ${danger ? 'rgba(224,85,97,0.6)' : 'rgba(236,201,119,0.55)'}` : '0 2px 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <span className={cx('flex flex-col items-center px-0.5 text-center text-[10px] font-extrabold leading-none tracking-tight', active ? (danger ? 'text-[#ffb3ba]' : 'text-gold-300') : 'text-white/85')}>
        {/ BB$/.test(label) ? (
          <>
            {label.replace(/ BB$/, '')}
            <span className="mt-px text-[7px] font-bold opacity-70">BB</span>
          </>
        ) : label.replace(' %', '%')}
      </span>
    </button>
  );
}

function StepButton({ label, onClick, aria }: { label: string; onClick: () => void; aria: string }) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#232834] to-[#0e1117] text-lg font-bold leading-none text-gold-300 shadow-[0_2px_5px_rgba(0,0,0,0.6)] ring-1 ring-gold-400/30 transition hover:ring-gold-400/70 active:scale-95"
      onClick={onClick}
      aria-label={aria}
    >
      {label}
    </button>
  );
}

/** Bouton d'action « laque noire et or » : intitulé en petit, montant en grand. */
function ActionButton({ tone, label, amount, kbd, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: 'fold' | 'call' | 'raise' | 'allin'; label: string; amount?: string; kbd?: string }) {
  const tones = {
    fold: { box: 'from-[#1d1114] to-[#0b0607] ring-[#e05561]/45 hover:ring-[#e05561]/80', text: 'text-[#ff8f99]', bar: 'bg-[#e05561]' },
    call: { box: 'from-[#0f1a16] to-[#060a08] ring-[#3ccf8e]/40 hover:ring-[#3ccf8e]/75', text: 'text-[#7ee3b5]', bar: 'bg-[#3ccf8e]' },
    raise: { box: 'from-[#f6dea0] via-[#ecc977] to-[#b88a2e] ring-[#fff3cf]/70 hover:brightness-110', text: 'text-[#16110a]', bar: 'bg-[#fff3cf]' },
    allin: { box: 'from-[#e8616c] to-[#8e1b28] ring-[#ffb3ba]/60 hover:brightness-110', text: 'text-white', bar: 'bg-white' },
  }[tone];
  return (
    <button
      className={cx(
        'group relative flex h-[52px] flex-col items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b shadow-[0_6px_16px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 transition active:translate-y-px disabled:opacity-40 sm:h-[60px]',
        tones.box,
      )}
      {...rest}
    >
      <span className={cx('absolute inset-x-6 top-0 h-[2px] rounded-b-full opacity-80', tones.bar)} />
      <span className={cx('text-[10px] font-bold uppercase tracking-[0.14em] sm:text-[11px]', tones.text, amount ? 'opacity-80' : 'text-[13px] sm:text-sm')}>{label}</span>
      {amount && <span className={cx('font-display text-lg font-bold leading-tight tabular sm:text-xl', tones.text)}>{amount}</span>}
      {kbd && <span className={cx('absolute bottom-1 right-1.5', tones.text)}><Kbd>{kbd}</Kbd></span>}
    </button>
  );
}
