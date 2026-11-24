'use client';
/**
 * Rendu de la table : tapis, sièges, cartes, mises, pots, résultat.
 * Purement visuel : toutes les données viennent de la vue filtrée du serveur.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateBest, isCard, type Card, type GameView, type PublicSeat } from '@poker/engine';
import { setDisplayPrefs, useDisplayPrefs, useMoney } from '@/lib/displayPrefs';
import type { Reaction } from '@/lib/useGame';
import type { VideoChat } from '@/lib/useVideoChat';
import { Badge, cx } from '../ui';
import { ChipStack } from './Chips';
import { PlayingCard } from './PlayingCard';
import { VideoTile } from './VideoTile';
import { FeltDecor } from './FeltDecor';

interface Props {
  state: GameView;
  now: () => number;
  reactions: Reaction[];
  video: VideoChat;
  videoSize: number;
  showRemoteVideo: boolean;
  feltTheme: 'black' | 'green' | 'blue';
  onSit?: (seat: number) => void;
  onSeatMenu?: (seat: PublicSeat) => void;
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const f = () => setNarrow(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return narrow;
}

/** Position (en %) d'un siège sur l'ellipse ; l'index 0 est en bas au centre. */
function ellipse(index: number, n: number, rx: number, ry: number) {
  const a = Math.PI / 2 + (2 * Math.PI * index) / n;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

export function TableView({ state, now, reactions, video, videoSize, showRemoteVideo, feltTheme, onSit, onSeatMenu }: Props) {
  const narrow = useIsNarrow();
  const n = state.config.maxSeats;
  const mySeat = state.me.seat;
  // Rotation : le joueur connecté est toujours en bas
  const rotation = mySeat >= 0 ? mySeat : 0;
  const displayIndex = (seat: number) => (seat - rotation + n) % n;

  const winners = useMemo(() => new Set(state.result?.pots.flatMap((p) => p.winners) ?? []), [state.result]);
  // Déroulé d'un tapis en cours (cartes retournées, résultat pas encore affiché)
  const runoutView = !state.result && (!!state.equity || !!state.suspense);

  /** Position (en %) de la mise d'un siège. Le joueur du bas a de grandes cartes : sa mise est plus haute. */
  const betPos = (i: number) => {
    const bottom = displayIndex(i) === 0;
    return ellipse(displayIndex(i), n, narrow ? 22 : 30, bottom ? (narrow ? 13 : 16) : narrow ? 19 : 23);
  };

  // Ramassage des mises vers le pot à la fin de chaque tour d'enchères
  const prevBets = useRef<{ hand: number; bets: Map<number, number> }>({ hand: -1, bets: new Map() });
  const [flying, setFlying] = useState<{ id: number; x: number; y: number; amount: number }[]>([]);
  useEffect(() => {
    const prev = prevBets.current;
    const now = new Map<number, number>();
    state.seats.forEach((s, i) => s && s.streetBet > 0 && now.set(i, s.streetBet));
    if (prev.hand === state.handNumber) {
      const moved: { id: number; x: number; y: number; amount: number }[] = [];
      for (const [i, amount] of prev.bets) {
        if (!now.has(i)) {
          const p = betPos(i);
          moved.push({ id: Date.now() + Math.random(), x: p.x, y: p.y, amount });
        }
      }
      if (moved.length) {
        setFlying((f) => [...f, ...moved]);
        setTimeout(() => setFlying((f) => f.filter((x) => !moved.includes(x))), 650);
      }
    }
    prevBets.current = { hand: state.handNumber, bets: now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seats, state.handNumber]);
  const bestCards = useMemo(() => {
    if (!state.result || state.board2) return new Set<string>();
    const ids = new Set(state.result.pots.flatMap((p) => p.winners));
    return new Set(state.result.shown.filter((s) => ids.has(s.userId)).flatMap((s) => s.best));
  }, [state.result]);

  const myHand = useMemo(() => {
    const cards = state.me.cards;
    const mine = state.me.seat >= 0 ? state.seats[state.me.seat] : null;
    if (!mine || mine.folded) return null;
    if (cards.length !== 2 || state.board.length < 3 || !cards.every(isCard)) return null;
    try {
      return evaluateBest([...cards, ...state.board] as Card[]).description;
    } catch {
      return null;
    }
  }, [state.me.cards, state.board, state.me.seat, state.seats]);

  const seatsList = state.seats.map((s, i) => ({ s, i }));
  const rx = narrow ? 39 : 46.5;
  const ry = narrow ? 45.5 : 44;

  return (
    <div
      className={cx('relative mx-auto w-full transition-[max-height,max-width] duration-300', narrow ? 'aspect-[0.66]' : 'aspect-[2.05]')}
      style={narrow
        ? { maxHeight: `calc(100dvh - ${state.me.legal ? 300 : 210}px)`, maxWidth: `calc((100dvh - ${state.me.legal ? 300 : 210}px) * 0.66)` }
        : { maxHeight: 'calc(100dvh - 210px)', maxWidth: 'calc((100dvh - 210px) * 2.05)' }}
    >
      {/* Rail + tapis */}
      <div className={cx('rail absolute rounded-[999px]', narrow ? 'inset-[7%_6%]' : 'inset-[9%_7%]')} data-theme={feltTheme}>
        <div className={cx('felt absolute overflow-hidden rounded-[999px]', narrow ? 'inset-[10px]' : 'inset-[14px]')} data-theme={feltTheme}>
          <div className="felt-texture absolute inset-0" />
          {feltTheme !== 'black' && (
            <>
              <div className="absolute inset-[7%] rounded-[999px] border border-white/[0.07]" />
              <div className="pointer-events-none absolute left-1/2 top-[24%] hidden -translate-x-1/2 select-none whitespace-nowrap font-display text-2xl font-bold tracking-[0.3em] text-white/[0.07] md:block">CERCLE PRIVÉ</div>
            </>
          )}
        </div>
      </div>
      {feltTheme === 'black' && (
        <FeltDecor n={n} rotation={rotation} insetX={narrow ? 0.06 : 0.07} insetY={narrow ? 0.07 : 0.09} feltInset={narrow ? 10 : 14} seatRx={rx} seatRy={ry} />
      )}

      {/* Centre : pot + board */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 sm:gap-3">
        {state.bombPot && <div className="rounded-full bg-danger/80 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg">💣 Straddle général</div>}
        <PotsDisplay state={state} />
        <div className="flex gap-1 sm:gap-1.5">
          {Array.from({ length: 5 }, (_, i) => {
            const c = state.board[i];
            return (
              <div key={i} className="relative rounded-[7px] bg-black/15 ring-1 ring-white/[0.06]" style={{ width: narrow ? 36 : 50, height: narrow ? 50 : 70 }}>
                <AnimatePresence>
                  {!c && i === 4 && state.suspense === 1 && <SuspenseCard size={narrow ? 'sm' : 'md'} />}
                  {c && (
                    <motion.div key={`${state.handNumber}-${c}`} className="absolute inset-0" {...cardAnim(i, runoutView)}>
                      <PlayingCard card={c} size={narrow ? 'sm' : 'md'} highlight={bestCards.has(c)} dim={!!state.result && bestCards.size > 0 && !bestCards.has(c)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        {/* Second board (run it twice) */}
        {state.board2 && (
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="mr-1 rounded bg-gold-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-300">2ᵉ board</span>
            {Array.from({ length: 5 }, (_, i) => {
              const c = state.board2![i];
              return (
                <div key={i} className="relative rounded-[6px] bg-black/15 ring-1 ring-white/[0.06]" style={{ width: narrow ? 30 : 40, height: narrow ? 42 : 56 }}>
                  <AnimatePresence>
                    {!c && i === 4 && state.suspense === 2 && <SuspenseCard size={narrow ? 'xs' : 'sm'} />}
                    {c && (
                      <motion.div key={`b2-${state.handNumber}-${c}`} className="absolute inset-0" {...cardAnim(i, runoutView)}>
                        <PlayingCard card={c} size={narrow ? 'xs' : 'sm'} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
        <AnimatePresence>
          {state.result && state.result.pots[0] && (
            <motion.div initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-black/55 px-4 py-1.5 text-center text-xs font-semibold text-gold-300 ring-1 ring-gold-400/40 backdrop-blur sm:text-sm">
              {(state.result.pots.some((p) => p.run) ? state.result.pots.filter((p, i, a) => a.findIndex((x) => x.run === p.run) === i) : [state.result.pots[0]]).map((pot, i) => (
                <div key={i}>
                  {pot.run && <span className="mr-1 text-[10px] uppercase text-white/60">{pot.run === 1 ? '1ᵉʳ board' : '2ᵉ board'}</span>}
                  {pot.winners.map((id) => state.seats.find((s) => s?.userId === id)?.username ?? '?').join(' & ')}
                  {pot.description ? ` · ${pot.description}` : ' remporte le pot'}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!state.result && myHand && state.config.uiLevel !== 'expert' && <div className="rounded-full bg-black/35 px-3 py-0.5 text-[11px] text-white/80">Votre main : <span className="font-semibold text-gold-300">{myHand}</span></div>}
      </div>

      {/* Mises devant les joueurs */}
      {seatsList.map(({ s, i }) => {
        if (!s || s.streetBet <= 0) return null;
        const p = betPos(i);
        return (
          <div key={`bet-${i}`} className="absolute z-[25] -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <ChipStack amount={s.streetBet} size={narrow ? 14 : 18} />
          </div>
        );
      })}

      {/* Bouton dealer */}
      {state.buttonSeat >= 0 && (() => {
        const p = ellipse(displayIndex(state.buttonSeat) + 0.3, n, narrow ? 27 : 35, narrow ? 29 : 31);
        return (
          <motion.div layout className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-b from-white to-[#d7dbe3] text-[11px] font-black text-night-950 shadow-[0_2px_6px_rgba(0,0,0,0.6)] ring-1 ring-black/20" style={{ left: `${p.x}%`, top: `${p.y}%` }} transition={{ type: 'spring', damping: 20 }}>
            D
          </motion.div>
        );
      })()}

      {/* Mises ramassées vers le pot */}
      {flying.map((f) => (
        <motion.div
          key={f.id}
          className="pointer-events-none absolute z-[24] -translate-x-1/2 -translate-y-1/2"
          initial={{ left: `${f.x}%`, top: `${f.y}%`, opacity: 1, scale: 1 }}
          animate={{ left: '50%', top: '36%', opacity: [1, 1, 0], scale: 0.85 }}
          transition={{ duration: 0.55, ease: 'easeIn' }}
        >
          <ChipStack amount={f.amount} size={narrow ? 14 : 18} label={false} />
        </motion.div>
      ))}

      {/* Jetons gagnés qui glissent vers le vainqueur */}
      <AnimatePresence>
        {state.result && state.result.pots.flatMap((pot, pi) => pot.winners.map((w) => {
          const seat = state.seats.find((s) => s?.userId === w);
          if (!seat) return null;
          const p = ellipse(displayIndex(seat.seat), n, rx * 0.8, ry * 0.8);
          return (
            <motion.div key={`win-${state.result!.handNumber}-${pi}-${w}`} className="pointer-events-none absolute z-[26] -translate-x-1/2 -translate-y-1/2" initial={{ left: '50%', top: '36%', opacity: 0, scale: 1.15 }} animate={{ left: ['50%', '50%', `${p.x}%`, `${p.x}%`], top: ['36%', '36%', `${p.y}%`, `${p.y}%`], opacity: [0, 1, 1, 0], scale: [1.15, 1.15, 1, 1] }} transition={{ duration: 1.5, delay: 0.55 + pi * 0.35, ease: 'easeInOut', times: [0, 0.3, 0.85, 1] }}>
              <ChipStack amount={Math.floor(pot.amount / pot.winners.length)} size={18} />
            </motion.div>
          );
        }))}
      </AnimatePresence>

      {/* Caméras des spectateurs (joueurs non assis) */}
      {showRemoteVideo && (() => {
        const seated = new Set(state.seats.filter(Boolean).map((x) => x!.userId));
        const watchers = video.remote.filter((r) => !seated.has(r.userId) && (r.cam || r.mic));
        if (watchers.length === 0) return null;
        return (
          <div className="absolute left-1 top-1 z-30 flex max-w-[60%] flex-wrap gap-2 rounded-xl bg-black/40 p-1.5 backdrop-blur" aria-label="Spectateurs en vidéo">
            {watchers.map((r) => (
              <div key={r.userId} className="flex flex-col items-center">
                <VideoTile name="?" avatarUrl={null} stream={r.stream} camOn={r.cam} micOn={r.mic} speaking={video.speaking.has(r.userId)} size={Math.round(videoSize * 0.8)} rtcActive link={r.state} />
                <span className="mt-0.5 text-[9px] text-muted">Spectateur</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Sièges */}
      {seatsList.map(({ s, i }) => {
        const p = ellipse(displayIndex(i), n, rx, ry);
        return (
          <div key={i} className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {s ? (
              <Seat
                seat={s}
                state={state}
                now={now}
                isMe={s.userId === state.me.userId}
                narrow={narrow}
                winner={winners.has(s.userId)}
                bestCards={bestCards}
                video={video}
                videoSize={videoSize}
                showRemoteVideo={showRemoteVideo}
                reaction={reactions.filter((r) => r.userId === s.userId).at(-1)}
                onMenu={onSeatMenu}
                bottom={displayIndex(i) === 0}
              />
            ) : (
              onSit && state.me.seat < 0 && state.mode === 'CASH' && state.status !== 'FINISHED' ? (
                <button onClick={() => onSit(i)} className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-gold-400/50 bg-black/30 text-[10px] font-semibold uppercase leading-tight text-gold-300 transition hover:scale-105 hover:bg-gold-400/15 sm:h-14 sm:w-14">
                  S&apos;asseoir
                </button>
              ) : (
                <div className="h-10 w-10 rounded-full border border-white/[0.06] bg-black/15 sm:h-12 sm:w-12" />
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function PotsDisplay({ state }: { state: GameView }) {
  const money = useMoney();
  const { bbMode } = useDisplayPrefs();
  if (state.totalPot <= 0) return <div className="h-7" />;
  const pots = state.pots;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => setDisplayPrefs({ bbMode: !bbMode })}
        title={bbMode ? 'Afficher en jetons' : 'Afficher en grosses blindes'}
        className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/10 hover:ring-gold-400/40 sm:text-sm"
      >
        Pot <span className="tabular text-gold-300">{money(state.totalPot, true)}</span>
      </button>
      {pots.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {pots.map((p, i) => (
            <div key={i} className="flex items-center gap-1" title={i === 0 ? 'Pot principal' : `Pot secondaire ${i}`}>
              <ChipStack amount={p.amount} size={14} label={false} />
              <span className="text-[11px] font-semibold tabular text-white/80">{i === 0 ? 'Principal' : `Side ${i}`} {money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnRing({ deadline, totalMs, now, size, timeBank }: { deadline: number; totalMs: number; now: () => number; size: number; timeBank: boolean }) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLeft(Math.max(0, Math.min(1, (deadline - now()) / totalMs)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [deadline, totalMs, now]);
  const r = size / 2 + 4;
  const c = 2 * Math.PI * r;
  const color = timeBank ? '#4f8ff7' : left > 0.5 ? '#3ccf8e' : left > 0.2 ? '#ecc977' : '#e05561';
  return (
    <svg className="pointer-events-none absolute -left-[6px] -top-[6px] -rotate-90" width={size + 12} height={size + 12} aria-hidden>
      <circle cx={size / 2 + 6} cy={size / 2 + 6} r={r} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="4" />
      <circle cx={size / 2 + 6} cy={size / 2 + 6} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left)} />
    </svg>
  );
}

function Seat({
  seat, state, now, isMe, narrow, winner, bestCards, video, videoSize, showRemoteVideo, reaction, onMenu, bottom,
}: {
  seat: PublicSeat;
  state: GameView;
  now: () => number;
  isMe: boolean;
  narrow: boolean;
  winner: boolean;
  bestCards: Set<string>;
  video: VideoChat;
  videoSize: number;
  showRemoteVideo: boolean;
  reaction?: Reaction;
  onMenu?: (s: PublicSeat) => void;
  bottom: boolean;
}) {
  const { bbMode } = useDisplayPrefs();
  const money = useMoney();
  const turn = state.turn?.userId === seat.userId ? state.turn : null;
  const remote = video.remote.find((r) => r.userId === seat.userId);
  const size = Math.round(videoSize * (narrow ? 0.72 : 1) * (isMe && narrow ? 1.05 : 1));
  const stream = isMe ? video.local : showRemoteVideo ? remote?.stream ?? null : null;
  const camOn = isMe ? video.camOn : !!remote?.cam;
  const micOn = isMe ? video.micOn : !!remote?.mic;
  const speaking = isMe ? video.speaking.has('__local__') : video.speaking.has(seat.userId);
  const shownCards = seat.cards;
  const cardSize = isMe ? (narrow ? 'sm' : 'md') : narrow ? 'xs' : 'sm';
  const result = state.result?.shown.find((x) => x.userId === seat.userId);
  const eq = state.equity?.find((e) => e.userId === seat.userId);
  const eqLeader = !!eq && !!state.equity && eq.win > 0 && eq.win >= Math.max(...state.equity.map((e) => e.win));

  return (
    <div className={cx('relative flex flex-col items-center', seat.folded && !winner && 'opacity-55')}>
      {/* Cartes */}
      <div className={cx('flex', isMe ? 'mb-1 gap-1' : '-mb-3 -space-x-3', bottom && isMe && 'order-first')}>
        <AnimatePresence>
          {shownCards?.map((c, k) => (
            <motion.div
              key={`${state.handNumber}-${k}-${c ?? 'x'}`}
              initial={{ y: -40, x: 0, opacity: 0, scale: 0.6, rotate: -10 }}
              animate={{ y: 0, x: 0, opacity: 1, scale: 1, rotate: isMe ? (k === 0 ? -4 : 4) : k === 0 ? -8 : 8 }}
              exit={{ opacity: 0, y: -12, scale: 0.8 }}
              transition={{ type: 'spring', damping: 16, stiffness: 220, delay: k * 0.12 }}
            >
              <PlayingCard card={c} faceDown={!c} size={cardSize} flip={!!c && !isMe} highlight={!!c && bestCards.has(c) && !!state.result} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Avatar / vidéo + minuteur */}
      <button type="button" onClick={() => onMenu?.(seat)} className={cx('relative rounded-full', winner && 'shadow-[0_0_0_3px_#ecc977,0_0_28px_rgba(236,201,119,0.7)]')} aria-label={`Siège de ${seat.username}`}>
        {turn && <TurnRing deadline={turn.deadline} totalMs={turn.totalMs} now={now} size={size} timeBank={turn.usingTimeBank} />}
        <VideoTile
          name={seat.username}
          avatarUrl={seat.avatarUrl}
          stream={stream}
          camOn={camOn}
          micOn={micOn}
          speaking={speaking}
          size={size}
          isLocal={isMe}
          version={isMe ? video.localVersion : undefined}
          rtcActive={isMe ? video.camOn || video.micOn : !!remote}
          link={isMe ? undefined : remote?.state}
        />
        {!seat.connected && <span className="absolute -right-1 -top-1 rounded-full bg-night-900 px-1 text-[10px]" title="Déconnecté">📡</span>}
        <AnimatePresence>
          {reaction && (
            <motion.span key={reaction.id} className="absolute -top-6 left-1/2 text-2xl" initial={{ opacity: 0, y: 10, x: '-50%', scale: 0.5 }} animate={{ opacity: 1, y: -18, scale: 1.2 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.5 }}>
              {reaction.emoji}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Plaque nom + tapis */}
      <div className={cx('relative -mt-2 min-w-[84px] rounded-lg bg-gradient-to-b from-night-700/95 to-night-900/95 px-2.5 py-1 text-center shadow-lg ring-1 sm:min-w-[104px]', turn ? 'ring-gold-400/70' : 'ring-white/10')}>
        <div className="max-w-[96px] truncate text-[11px] font-semibold leading-tight text-ink sm:max-w-[120px] sm:text-xs">{seat.isBot && '🤖 '}{seat.username}</div>
        <button
          type="button"
          onClick={() => setDisplayPrefs({ bbMode: !bbMode })}
          title={bbMode ? 'Afficher en jetons' : 'Afficher en grosses blindes'}
          className="block w-full cursor-pointer text-[11px] font-bold leading-tight tabular text-gold-300 hover:brightness-125 sm:text-[13px]"
        >
          {seat.allIn && seat.inHand ? 'TAPIS' : money(seat.stack)}
        </button>
        <div className="absolute -right-2 -top-2 flex gap-0.5">
          {seat.isSmallBlind && <span className="rounded bg-info/90 px-1 text-[9px] font-bold text-white">SB</span>}
          {seat.isBigBlind && <span className="rounded bg-gold-500 px-1 text-[9px] font-bold text-night-950">BB</span>}
          {seat.isStraddle && <span className="rounded bg-danger px-1 text-[9px] font-bold text-white" title="Straddle (2 BB)">STR</span>}
        </div>
      </div>

      {/* Dernière action / statut */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <AnimatePresence mode="wait">
          {eq ? (
            <motion.span
              key={`eq-${state.board.length}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cx('flex items-baseline gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular shadow-lg ring-1', eqLeader ? 'bg-gold-400 text-night-950 ring-gold-200' : 'bg-black/80 text-white ring-white/20')}
              title="Probabilité de gagner le coup"
            >
              {pctLabel(eq.win)}
              {eq.tie >= 0.005 && <span className="text-[9px] font-semibold opacity-80">+{pctLabel(eq.tie)} égalité</span>}
            </motion.span>
          ) : result ? (
            <motion.span key="res" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center rounded-xl bg-black/70 px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-gold-300">
              {state.result?.shown2 ? (
                <>
                  <span><span className="text-white/50">1 : </span>{result.description}</span>
                  <span><span className="text-white/50">2 : </span>{state.result.shown2.find((x) => x.userId === seat.userId)?.description}</span>
                </>
              ) : result.description}
            </motion.span>
          ) : state.result?.mucked.includes(seat.userId) ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-muted">Main jetée</span>
          ) : seat.waitingBB && !seat.sittingOut ? (
            <Badge tone="blue">Attend la BB</Badge>
          ) : seat.pendingRebuy ? (
            <Badge tone="gold">Rebuy ?</Badge>
          ) : seat.sittingOut ? (
            <Badge>Absent</Badge>
          ) : seat.lastAction ? (
            <motion.span key={seat.lastAction} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', seat.lastAction === 'Tapis' ? 'bg-danger text-white' : seat.lastAction === 'Couché' ? 'bg-black/60 text-muted' : 'bg-black/60 text-ink')}>
              {(() => {
                const m = /^(Mise|Relance) (.+)$/.exec(seat.lastAction);
                return m ? `${m[1]} ${money(Number(m[2]!.replace(/\D/g, '')), true)}` : seat.lastAction;
              })()}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** 0,62 → « 62 % » ; arrondi au dixième sous 10 % (ex. « 4,5 % »). */
function pctLabel(p: number): string {
  const v = p * 100;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v > 0 && v < 10 ? 1 : 0 })} %`;
}

/** Animation d'arrivée d'une carte du board ; la river d'un tapis se retourne lentement. */
function cardAnim(i: number, runout: boolean) {
  if (runout && i === 4) {
    // River d'un tapis : la carte se découvre lentement de gauche à droite,
    // pendant que la carte face cachée glisse (effet « squeeze » des retransmissions)
    return {
      initial: { clipPath: 'inset(0% 100% 0% 0% round 7px)', scale: 1.12, opacity: 1 },
      animate: { clipPath: 'inset(0% 0% 0% 0% round 7px)', scale: [1.12, 1.12, 1], opacity: 1 },
      exit: { opacity: 0, scale: 0.8 },
      transition: { clipPath: { duration: 2.2, ease: [0.55, 0, 0.25, 1] as const }, scale: { duration: 2.8, times: [0, 0.8, 1] } },
    };
  }
  return {
    initial: { y: -30, opacity: 0, rotateY: 180 },
    animate: { y: 0, opacity: 1, rotateY: 0 },
    exit: { opacity: 0, scale: 0.8 },
    transition: runout
      ? { duration: 0.7, ease: 'easeOut' as const, delay: i < 3 ? i * 0.25 : 0 }
      : { type: 'spring' as const, damping: 18, stiffness: 200, delay: i < 3 ? i * 0.08 : 0 },
  };
}

/** River encore face cachée pendant le suspense : halo doré qui pulse. */
function SuspenseCard({ size }: { size: 'xs' | 'sm' | 'md' }) {
  return (
    <motion.div
      key="suspense"
      className="absolute inset-0 z-10 rounded-[7px]"
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1, boxShadow: ['0 0 0 0 rgba(236,201,119,0.0)', '0 0 22px 6px rgba(236,201,119,0.55)', '0 0 0 0 rgba(236,201,119,0.0)'] }}
      exit={{ x: '105%', opacity: [1, 1, 0], transition: { duration: 2.2, ease: [0.55, 0, 0.25, 1], opacity: { times: [0, 0.85, 1], duration: 2.2 } } }}
      transition={{ y: { duration: 0.5 }, opacity: { duration: 0.5 }, boxShadow: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }}
    >
      <motion.div animate={{ rotate: [0, -1.5, 1.5, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}>
        <PlayingCard faceDown size={size} />
      </motion.div>
    </motion.div>
  );
}
