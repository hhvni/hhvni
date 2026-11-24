'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REACTIONS, type GameView, type PublicSeat } from '@poker/engine';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { emit } from '@/lib/socket';
import { fmt, mmss } from '@/lib/format';
import { useGame } from '@/lib/useGame';
import { BigBlindContext, setDisplayPrefs, useDisplayPrefs } from '@/lib/displayPrefs';
import { useVideoChat, type VideoChat } from '@/lib/useVideoChat';
import { TableView } from '@/components/poker/TableView';
import { ActionBar } from '@/components/poker/ActionBar';
import { ChatBox } from '@/components/poker/ChatBox';
import { MiniCards } from '@/components/poker/PlayingCard';
import { StreamAudio } from '@/components/poker/VideoTile';
import { Avatar, Badge, Button, cx, Modal, PageLoader, Select, Tabs, Toggle, useToast } from '@/components/ui';

interface Prefs { sound: boolean; videoSize: number; showRemote: boolean; felt: 'black' | 'green' | 'blue' }
const DEFAULT_PREFS: Prefs = { sound: true, videoSize: 64, showRemote: true, felt: 'black' };

function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pp-table-prefs-v2');
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const update = useCallback((p: Partial<Prefs>) => {
    setPrefs((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem('pp-table-prefs-v2', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [prefs, update];
}

/** Petit signal sonore discret quand c'est à vous de jouer. */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.26);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* audio indisponible */
  }
}

export default function GamePage() {
  const me = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  if (!me) return <PageLoader />;
  return <Game gameId={id} />;
}

function Game({ gameId }: { gameId: string }) {
  const toast = useToast();
  const { state, logs, messages, reactions, connected, error, joined, send, now } = useGame(gameId);
  const [prefs, setPrefs] = usePrefs();
  const video = useVideoChat(gameId, joined);
  const [panel, setPanel] = useState<'chat' | 'log' | 'info'>('chat');
  const [panelOpen, setPanelOpen] = useState(false);
  const [sitSeat, setSitSeat] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuSeat, setMenuSeat] = useState<PublicSeat | null>(null);
  const myTurnSeq = useRef(-1);

  // Son quand c'est notre tour
  useEffect(() => {
    if (state?.me.legal && state.actionSeq !== myTurnSeq.current) {
      myTurnSeq.current = state.actionSeq;
      if (prefs.sound) beep();
    }
  }, [state?.me.legal, state?.actionSeq, prefs.sound]);

  const run = useCallback(async (event: string, payload: Record<string, unknown> = {}, success?: string) => {
    const r = await send(event, payload);
    if (!r.ok) toast(r.error ?? 'Action impossible', 'error');
    else if (success) toast(success, 'success');
    return r.ok;
  }, [send, toast]);

  const onAction = useCallback(async (type: string, amount?: number) => {
    if (!state) return false;
    const r = await send('game:action', { type, amount, seq: state.actionSeq });
    if (!r.ok && r.code !== 'STALE') toast(r.error ?? 'Action refusée', 'error');
    return r.ok;
  }, [send, state, toast]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg">{error}</p>
        <Link href="/dashboard"><Button variant="gold">Retour à l&apos;accueil</Button></Link>
      </div>
    );
  }
  if (!state) return <PageLoader />;
  return (
    <BigBlindContext.Provider value={state.tournament?.bigBlind ?? state.config.bigBlind}>
      {renderGame()}
    </BigBlindContext.Provider>
  );

  function renderGame() {
  if (!state) return null;
  const mySeat = state.me.seat >= 0 ? (state.seats[state.me.seat] ?? null) : null;
  const isAdmin = state.me.isRoomAdmin;
  const t = state.tournament;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Audio des autres joueurs (indépendant de l'affichage vidéo) */}
      {video.remote.filter((r) => r.mic).map((r) => <StreamAudio key={r.userId} stream={r.stream} />)}

      {/* En-tête */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-night-900/80 px-3 backdrop-blur-xl sm:px-4">
        <Link href={`/rooms/${state.roomId}`} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink" aria-label="Retour au salon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold sm:text-base">{state.name}</h1>
            <StatusBadge status={state.status} />
            {!connected && <Badge tone="red">Reconnexion…</Badge>}
          </div>
          <p className="truncate text-[11px] text-muted">
            {state.mode === 'CASH' ? 'Cash game' : 'Tournoi'} · Blinds {fmt(t?.smallBlind ?? state.config.smallBlind)}/{fmt(t?.bigBlind ?? state.config.bigBlind)}
            {(t?.ante ?? state.config.ante) > 0 && ` · Ante ${fmt(t?.ante ?? state.config.ante)}`}
            {state.handNumber > 0 && ` · Main #${state.handNumber}`}
            {state.spectators > 0 && ` · ${state.spectators} spectateur${state.spectators > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <BBToggle />
          <IconButton title={video.micOn ? 'Couper le micro' : 'Activer le micro'} active={video.micOn} onClick={() => void video.enableMic(!video.micOn)}>
            {video.micOn ? <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /> : <path d="M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M17 16.9A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.1 1.2M12 19v3" />}
          </IconButton>
          <IconButton title={video.camOn ? 'Couper la caméra' : 'Activer la caméra'} active={video.camOn} onClick={() => void video.enableCam(!video.camOn)}>
            {video.camOn ? <path d="M23 7l-7 5 7 5V7zM1 5h15v14H1z" /> : <path d="M3 3l18 18M16 16v3H1V5h4M9 5h7v7M23 7l-7 5 7 5V7z" />}
          </IconButton>
          <IconButton title="Réglages vidéo et table" onClick={() => setVideoOpen(true)}>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.4 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </IconButton>
          <IconButton title="Historique des mains" onClick={() => setHistoryOpen(true)}>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />
          </IconButton>
          <IconButton title="Discussion et journal" className="lg:hidden" onClick={() => setPanelOpen(true)}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Zone de jeu */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {t && state.status !== 'WAITING' && <TournamentHud state={state} now={now} />}
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 pt-7 sm:px-6 md:pt-2">
            <TableView
              state={state}
              now={now}
              reactions={reactions}
              video={video}
              videoSize={prefs.videoSize}
              showRemoteVideo={prefs.showRemote}
              feltTheme={prefs.felt}
              onSit={(seat) => setSitSeat(seat)}
              onSeatMenu={(s) => setMenuSeat(s)}
            />
          </div>

          <AnimatePresence>
            {state.mode === 'TOURNAMENT' && state.status === 'WAITING' && <TournamentLobby state={state} run={run} />}
          </AnimatePresence>

          {/* Barre de contrôle */}
          <div className="z-20 shrink-0 space-y-2 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-1 sm:px-4">
            <ControlStrip state={state} run={run} isAdmin={isAdmin} mySeat={mySeat} />
            <ActionBar state={state} onAction={onAction} />
          </div>
        </main>

        {/* Panneau latéral (desktop) */}
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-white/5 bg-night-900/60 p-3 lg:flex">
          <SidePanel tab={panel} setTab={setPanel} state={state} logs={logs} messages={messages} gameId={gameId} />
        </aside>
      </div>

      {/* Panneau latéral (mobile) */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div className="fixed inset-0 z-40 bg-black/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPanelOpen(false)}>
            <motion.div className="absolute inset-x-0 bottom-0 flex h-[75dvh] flex-col rounded-t-2xl bg-night-850 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] ring-1 ring-white/10" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" />
              <SidePanel tab={panel} setTab={setPanel} state={state} logs={logs} messages={messages} gameId={gameId} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SitModal seat={sitSeat} state={state} onClose={() => setSitSeat(null)} run={run} />
      <VideoSettings open={videoOpen} onClose={() => setVideoOpen(false)} video={video} prefs={prefs} setPrefs={setPrefs} />
      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} gameId={gameId} />
      <SeatMenu seat={menuSeat} state={state} onClose={() => setMenuSeat(null)} run={run} />
      <RebuyPrompt state={state} run={run} now={now} />
      {video.error && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-danger/90 px-4 py-2 text-sm text-white">{video.error}</div>}
    </div>
  );
  }
}

/** Bascule jetons ↔ grosses blindes. */
function BBToggle() {
  const { bbMode } = useDisplayPrefs();
  return (
    <button
      onClick={() => setDisplayPrefs({ bbMode: !bbMode })}
      title={bbMode ? 'Afficher les montants en jetons' : 'Afficher les montants en grosses blindes'}
      aria-label={bbMode ? 'Afficher les montants en jetons' : 'Afficher les montants en grosses blindes'}
      className={cx('rounded-lg px-2 py-1.5 text-xs font-bold transition', bbMode ? 'bg-gold-400/20 text-gold-300 ring-1 ring-gold-400/50' : 'text-muted ring-1 ring-white/10 hover:text-ink')}
    >
      BB
    </button>
  );
}

function IconButton({ children, title, onClick, active, className }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean; className?: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className={cx('rounded-lg p-2 transition', active ? 'bg-success/15 text-success' : 'text-muted hover:bg-white/5 hover:text-ink', className)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function StatusBadge({ status }: { status: GameView['status'] }) {
  if (status === 'RUNNING') return <Badge tone="green"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />Live</Badge>;
  if (status === 'PAUSED') return <Badge tone="gold">Pause</Badge>;
  if (status === 'FINISHED') return <Badge>Terminée</Badge>;
  return <Badge tone="blue">En attente</Badge>;
}

type Run = (event: string, payload?: Record<string, unknown>, success?: string) => Promise<boolean>;

/** Bandeau contextuel : démarrage, recharge, absence, départ, commandes admin, réactions. */
function ControlStrip({ state, run, isAdmin, mySeat }: { state: GameView; run: Run; isAdmin: boolean; mySeat: PublicSeat | null }) {
  const [reactOpen, setReactOpen] = useState(false);
  const seated = !!mySeat;
  const activePlayers = state.seats.filter((s) => s && s.stack > 0 && !s.sittingOut).length;
  return (
    <div className={cx('items-center gap-2 overflow-x-auto scroll-thin [&>*]:shrink-0 md:flex-wrap md:justify-center md:overflow-visible', state.me.legal ? 'hidden md:flex' : 'flex')}>
      {isAdmin && state.status === 'WAITING' && state.mode === 'CASH' && (
        <Button size="sm" variant="gold" onClick={() => run('game:start', {}, 'Table ouverte')}>Démarrer la partie</Button>
      )}
      {isAdmin && state.status === 'RUNNING' && <Button size="sm" variant="ghost" onClick={() => run('game:pause', {})}>Pause</Button>}
      {isAdmin && state.status === 'PAUSED' && <Button size="sm" variant="gold" onClick={() => run('game:start', {})}>Reprendre</Button>}
      {isAdmin && state.mode === 'CASH' && state.status !== 'FINISHED' && (
        <Button size="sm" variant="subtle" onClick={() => confirm('Fermer la table ? Chaque joueur récupère ses jetons.') && run('game:close', {})}>Fermer la table</Button>
      )}
      {isAdmin && state.mode === 'CASH' && state.status !== 'FINISHED' && state.seats.some((s) => !s) && (
        <Button size="sm" variant="ghost" onClick={() => run('game:addBot', {}, 'Robot ajouté')}>🤖 Ajouter un robot</Button>
      )}
      {state.status === 'RUNNING' && activePlayers < 2 && <span className="text-xs text-muted">En attente d&apos;au moins deux joueurs…</span>}
      {state.status === 'WAITING' && state.mode === 'CASH' && !isAdmin && <span className="text-xs text-muted">L&apos;administrateur va démarrer la partie.</span>}
      {state.me.canReload && <Button size="sm" variant="gold" onClick={() => run('game:reload', {}, 'Jetons rechargés')}>Recharger {fmt(state.me.reloadAmount)}</Button>}
      {state.me.canAddon && <Button size="sm" variant="gold" onClick={() => run('game:addon', {}, 'Add-on pris')}>Add-on +{fmt(state.config.addonStack)}</Button>}
      {seated && state.status !== 'FINISHED' && (
        mySeat!.sittingOut && !mySeat!.pendingRebuy ? (
          <Button size="sm" variant="success" onClick={() => run('game:away', { away: false })}>Je suis de retour</Button>
        ) : (
          <Button size="sm" variant="subtle" onClick={() => run('game:away', { away: true })}>M&apos;absenter</Button>
        )
      )}
      {seated && state.mode === 'CASH' && (
        state.me.leavingAfterHand ? <Badge>Départ après la main</Badge> : <Button size="sm" variant="subtle" onClick={() => run('game:stand', {})}>Quitter la table</Button>
      )}
      <div className="relative">
        <Button size="sm" variant="subtle" onClick={() => setReactOpen((x) => !x)} aria-label="Réactions">😀</Button>
        <AnimatePresence>
          {reactOpen && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-10 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-xl bg-night-800 p-1.5 shadow-2xl ring-1 ring-white/10">
              {REACTIONS.map((e) => (
                <button key={e} className="rounded-lg p-1 text-xl hover:bg-white/10" onClick={() => { void run('chat:react', { emoji: e }); setReactOpen(false); }}>{e}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SidePanel({ tab, setTab, state, logs, messages, gameId }: { tab: 'chat' | 'log' | 'info'; setTab: (t: 'chat' | 'log' | 'info') => void; state: GameView; logs: ReturnType<typeof useGame>['logs']; messages: ReturnType<typeof useGame>['messages']; gameId: string }) {
  const toast = useToast();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length, tab]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={tab} onChange={setTab} className="mb-3 self-center" items={[{ value: 'chat', label: 'Chat' }, { value: 'log', label: 'Journal' }, { value: 'info', label: 'Joueurs' }]} />
      {tab === 'chat' && (
        <ChatBox messages={messages} compact onSend={async (text) => {
          const r = await emit('chat:send', { roomId: state.roomId, gameId, text });
          if (!r.ok) toast(r.error ?? 'Erreur', 'error');
        }} />
      )}
      {tab === 'log' && (
        <div ref={logRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-xs scroll-thin">
          {logs.map((l) => (
            <p key={l.id} className={cx(l.kind === 'win' && 'font-semibold text-gold-300', l.kind === 'hand' && 'mt-2 font-semibold text-info', l.kind === 'system' && 'italic text-faint', l.kind === 'action' && 'text-ink/85')}>
              {l.text}
            </p>
          ))}
        </div>
      )}
      {tab === 'info' && (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scroll-thin">
          {state.seats.filter((s): s is PublicSeat => !!s).sort((a, b) => b.stack - a.stack).map((s) => (
            <div key={s.userId} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
              <Avatar name={s.username} url={s.avatarUrl} size={26} />
              <Link href={`/players/${s.userId}`} className="min-w-0 flex-1 truncate text-sm hover:text-gold-300">{s.username}</Link>
              {!s.connected && <span title="Déconnecté">📡</span>}
              <span className="text-sm font-semibold tabular text-gold-300">{fmt(s.stack)}</span>
            </div>
          ))}
          {state.tournament && state.tournament.results.length > 0 && (
            <div className="pt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-faint">Classement</div>
              {state.tournament.results.map((r) => (
                <div key={r.userId} className="flex justify-between py-0.5 text-sm"><span>{r.place}. {r.username}</span>{r.prize > 0 && <span className="text-gold-300">+{fmt(r.prize)}</span>}</div>
              ))}
            </div>
          )}
          <Link href={`/rooms/${state.roomId}`} className="block pt-3 text-center text-xs text-muted hover:text-ink">Voir le salon</Link>
        </div>
      )}
    </div>
  );
}

function TournamentHud({ state, now }: { state: GameView; now: () => number }) {
  const t = state.tournament!;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = t.onBreak ? (t.breakEndsAt ?? 0) - now() : t.levelEndsAt ? t.levelEndsAt - now() : null;
  return (
    <div className="absolute left-2 top-2 z-20 rounded-xl bg-night-900/85 px-3 py-2 text-xs ring-1 ring-white/10 backdrop-blur sm:left-4 sm:top-4">
      <div className="flex items-center gap-2 font-semibold">
        {t.onBreak ? <span className="text-info">Pause</span> : <span>Niveau {t.level}</span>}
        {remaining !== null && <span className="tabular text-gold-300">{mmss(remaining)}</span>}
      </div>
      <div className="text-muted">{fmt(t.smallBlind)}/{fmt(t.bigBlind)}{t.ante ? ` (${fmt(t.ante)})` : ''}{t.nextLevel && ` → ${fmt(t.nextLevel.smallBlind)}/${fmt(t.nextLevel.bigBlind)}`}</div>
      <div className="text-muted">{t.remaining}/{t.entrants} joueurs restants</div>
      {state.status === 'FINISHED' && t.results[0] && <div className="mt-1 font-semibold text-gold-300">🏆 {t.results.find((r) => r.place === 1)?.username}</div>}
    </div>
  );
}

function TournamentLobby({ state, run }: { state: GameView; run: Run }) {
  const t = state.tournament!;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center bg-night-950/70 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md space-y-4 bg-night-850/95 p-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Tournoi</p>
          <h2 className="font-display text-2xl font-bold">{state.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Tapis {fmt(state.config.startingStack)} · Blinds {fmt(state.config.smallBlind)}/{fmt(state.config.bigBlind)} · Niveaux de {state.config.levelMinutes} min
          </p>
          <p className="text-sm text-muted">{state.config.buyIn > 0 ? `Inscription ${fmt(state.config.buyIn)} jetons` : 'Inscription gratuite'}{state.config.rebuyAllowed ? ' · Rebuy' : ''}{state.config.addonAllowed ? ' · Add-on' : ''}</p>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-xs text-faint"><span>Inscrits</span><span>{t.entrants}/{state.config.maxSeats}</span></div>
          <div className="flex flex-wrap gap-2">
            {t.registered.map((p) => (
              <span key={p.userId} className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm"><Avatar name={p.username} url={p.avatarUrl} size={22} />{p.username}</span>
            ))}
            {t.registered.length === 0 && <span className="text-sm text-faint">Personne pour l&apos;instant.</span>}
          </div>
        </div>
        {t.prizes.length > 0 && <p className="text-center text-xs text-muted">Répartition actuelle : {t.prizes.map((p, i) => `${i + 1}er ${fmt(p)}`).join(' · ').replace('2er', '2e').replace('3er', '3e')}</p>}
        <div className="flex gap-2">
          {state.me.registered ? (
            <Button className="flex-1" onClick={() => run('game:unregister', {})}>Se désinscrire</Button>
          ) : (
            <Button className="flex-1" variant="gold" onClick={() => run('game:register', {}, 'Inscription confirmée')}>S&apos;inscrire</Button>
          )}
          {state.me.isRoomAdmin && <Button variant="success" className="flex-1" disabled={t.entrants < 2} onClick={() => run('game:start', {})}>Lancer le tournoi</Button>}
        </div>
        {state.me.isRoomAdmin && t.entrants < state.config.maxSeats && (
          <Button variant="ghost" className="w-full" onClick={() => run('game:addBot', {}, 'Robot inscrit')}>🤖 Ajouter un robot pour tester</Button>
        )}
        <Link href={`/rooms/${state.roomId}`} className="block text-center text-xs text-muted hover:text-ink">← Retour au salon</Link>
      </div>
    </motion.div>
  );
}

function SitModal({ seat, state, onClose, run }: { seat: number | null; state: GameView; onClose: () => void; run: Run }) {
  const [buyIn, setBuyIn] = useState(state.config.startingStack);
  useEffect(() => setBuyIn(Math.min(Math.max(state.config.startingStack, state.config.minBuyIn), state.config.maxBuyIn)), [state.config, seat]);
  const max = Math.min(state.config.maxBuyIn, state.me.bankroll);
  const tooPoor = state.me.bankroll < state.config.minBuyIn;
  return (
    <Modal open={seat !== null} onClose={onClose} title={`S'asseoir au siège ${(seat ?? 0) + 1}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Votre solde : <span className="font-semibold text-gold-300">{fmt(state.me.bankroll)}</span> jetons virtuels.</p>
        {tooPoor ? (
          <p className="rounded-lg bg-danger/10 p-3 text-sm text-[#ffb3ba]">Solde insuffisant pour la cave minimum ({fmt(state.config.minBuyIn)}). Rechargez votre solde depuis l&apos;accueil.</p>
        ) : (
          <>
            <div className="text-center text-3xl font-bold tabular text-gold-300">{fmt(buyIn)}</div>
            <input type="range" className="slider w-full" min={state.config.minBuyIn} max={max} step={Math.max(1, state.config.bigBlind)} value={buyIn} style={{ ['--p' as string]: `${max > state.config.minBuyIn ? ((buyIn - state.config.minBuyIn) / (max - state.config.minBuyIn)) * 100 : 100}%` }} onChange={(e) => setBuyIn(Number(e.target.value))} aria-label="Montant de la cave" />
            <div className="flex justify-between text-xs text-faint"><span>Min {fmt(state.config.minBuyIn)}</span><span>Max {fmt(max)}</span></div>
            <Button variant="gold" size="lg" className="w-full" onClick={async () => { if (await run('game:sit', { seat, buyIn })) onClose(); }}>Prendre place</Button>
          </>
        )}
      </div>
    </Modal>
  );
}

function SeatMenu({ seat, state, onClose, run }: { seat: PublicSeat | null; state: GameView; onClose: () => void; run: Run }) {
  if (!seat) return null;
  const isMe = seat.userId === state.me.userId;
  return (
    <Modal open={!!seat} onClose={onClose} title={seat.username}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={seat.username} url={seat.avatarUrl} size={48} />
          <div>
            <div className="text-lg font-semibold tabular text-gold-300">{fmt(seat.stack)} jetons</div>
            <div className="text-xs text-muted">{seat.connected ? 'Connecté' : 'Déconnecté'} · Time bank {seat.timeBank} s</div>
          </div>
        </div>
        <Link href={`/players/${seat.userId}`} className="block"><Button className="w-full">Voir le profil et les statistiques</Button></Link>
        {state.me.isRoomAdmin && seat.isBot && (
          <Button className="w-full" onClick={async () => { if (await run('game:removeBot', { userId: seat.userId }, 'Le robot quitte la table')) onClose(); }}>
            Retirer ce robot
          </Button>
        )}
        {state.me.isRoomAdmin && !isMe && !seat.isBot && (
          <Button variant="danger" className="w-full" onClick={async () => { if (confirm(`Exclure ${seat.username} de la table ?`) && (await run('game:kick', { userId: seat.userId }, 'Joueur exclu'))) onClose(); }}>
            Exclure de la table
          </Button>
        )}
      </div>
    </Modal>
  );
}

function RebuyPrompt({ state, run, now }: { state: GameView; run: Run; now: () => number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.me.canRebuy) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [state.me.canRebuy]);
  void now;
  return (
    <Modal open={state.me.canRebuy} onClose={() => undefined} title="Vous n'avez plus de jetons">
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted">Le rebuy est autorisé : reprenez {fmt(state.config.startingStack)} jetons{state.config.buyIn ? ` pour ${fmt(state.config.buyIn)} de votre solde` : ''}.</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => run('game:declineRebuy', {})}>Non merci</Button>
          <Button variant="gold" className="flex-1" onClick={() => run('game:rebuy', {}, 'Rebuy effectué')}>Rebuy</Button>
        </div>
      </div>
    </Modal>
  );
}

function VideoSettings({ open, onClose, video, prefs, setPrefs }: { open: boolean; onClose: () => void; video: VideoChat; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  useEffect(() => {
    if (open) void video.refreshDevices();
  }, [open, video]);
  return (
    <Modal open={open} onClose={onClose} title="Caméra, micro et table">
      <div className="space-y-4">
        <p className="rounded-lg bg-white/[0.04] p-3 text-xs text-muted">
          Caméra et micro sont facultatifs et ne s&apos;activent jamais sans votre action. Les flux passent directement entre les joueurs du salon et ne sont jamais enregistrés.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={video.camOn ? 'success' : 'ghost'} onClick={() => void video.enableCam(!video.camOn, video.camId)}>{video.camOn ? '📷 Caméra active' : '📷 Activer la caméra'}</Button>
          <Button variant={video.micOn ? 'success' : 'ghost'} onClick={() => void video.enableMic(!video.micOn, video.micId)}>{video.micOn ? '🎙️ Micro actif' : '🎙️ Activer le micro'}</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="subtle" onClick={() => { void video.enableCam(true, video.camId); void video.enableMic(false); }}>Caméra uniquement</Button>
          <Button size="sm" variant="subtle" onClick={() => { void video.enableCam(true, video.camId); void video.enableMic(true, video.micId); }}>Caméra + micro</Button>
        </div>
        {video.devices.cams.length > 0 && (
          <Select label="Caméra" value={video.camId ?? ''} onChange={(e) => void video.enableCam(true, e.target.value)}>
            {video.devices.cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i + 1}`}</option>)}
          </Select>
        )}
        {video.devices.mics.length > 0 && (
          <Select label="Microphone" value={video.micId ?? ''} onChange={(e) => void video.enableMic(true, e.target.value)}>
            {video.devices.mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micro ${i + 1}`}</option>)}
          </Select>
        )}
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Taille des vignettes</span>
          <Tabs value={String(prefs.videoSize)} onChange={(v) => setPrefs({ videoSize: Number(v) })} items={[{ value: '52', label: 'Petite' }, { value: '64', label: 'Moyenne' }, { value: '84', label: 'Grande' }, { value: '104', label: 'Très grande' }]} />
        </div>
        <div className="space-y-1 border-t border-white/6 pt-3">
          <Toggle label="Afficher la vidéo des autres joueurs" checked={prefs.showRemote} onChange={(v) => setPrefs({ showRemote: v })} />
          <Toggle label="Son « à vous de jouer »" checked={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
          <DisplayToggles />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Tapis</span>
          <Tabs value={prefs.felt} onChange={(v) => setPrefs({ felt: v })} items={[{ value: 'black', label: 'Noir & or' }, { value: 'green', label: 'Vert casino' }, { value: 'blue', label: 'Bleu nuit' }]} />
        </div>
      </div>
    </Modal>
  );
}

interface HandRow { id: string; handNumber: number; board: string[]; potTotal: number; endedAt: string; winners: string[] }

function HistoryModal({ open, onClose, gameId }: { open: boolean; onClose: () => void; gameId: string }) {
  const [hands, setHands] = useState<HandRow[] | null>(null);
  useEffect(() => {
    if (open) void api<{ hands: HandRow[] }>(`/hands/game/${gameId}`).then((r) => setHands(r.hands));
  }, [open, gameId]);
  const list = useMemo(() => hands ?? [], [hands]);
  return (
    <Modal open={open} onClose={onClose} title="Historique des mains" wide>
      {hands === null ? <PageLoader /> : list.length === 0 ? (
        <p className="text-sm text-muted">Aucune main terminée pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {list.map((h) => (
            <li key={h.id}>
              <Link href={`/hands/${h.id}`} className="flex items-center gap-3 px-1 py-2.5 hover:bg-white/[0.03]">
                <span className="w-12 text-xs text-faint">#{h.handNumber}</span>
                <span className="w-[140px] shrink-0">{h.board.length ? <MiniCards cards={h.board} /> : <span className="text-xs text-faint">Sans flop</span>}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{h.winners.join(', ')}</span>
                <span className="text-sm font-semibold tabular text-gold-300">{fmt(h.potTotal)}</span>
                <span className="text-xs text-gold-300">Revoir ▸</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function DisplayToggles() {
  const d = useDisplayPrefs();
  return (
    <>
      <Toggle label="Montants en grosses blindes" hint="Ex. 50 → 0,5 BB · 100 → 1 BB (aussi via le bouton BB en haut)" checked={d.bbMode} onChange={(v) => setDisplayPrefs({ bbMode: v })} />
      <Toggle label="Jeu 4 couleurs" hint="Carreaux bleus et trèfles verts, plus lisible ; sinon jeu classique rouge et noir" checked={d.fourColor} onChange={(v) => setDisplayPrefs({ fourColor: v })} />
    </>
  );
}
