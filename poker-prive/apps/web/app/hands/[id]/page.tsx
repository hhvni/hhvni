'use client';
/** Replay pas à pas d'une main terminée, reconstruit à partir du journal d'événements. */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { HandEvent } from '@poker/engine';
import { api } from '@/lib/api';
import { fmt, signed } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { PlayingCard } from '@/components/poker/PlayingCard';
import { ChipStack } from '@/components/poker/Chips';
import { Avatar, Button, cx, Empty, PageLoader, Panel } from '@/components/ui';

interface HandResp {
  hand: {
    id: string; handNumber: number; board: string[]; potTotal: number; startedAt: string;
    game: { id: string; name: string; roomId: string; mode: string };
    events: HandEvent[];
    players: { userId: string; username: string; avatarUrl: string | null; seat: number; net: number; won: boolean; cards: string[] }[];
  };
}

interface Frame {
  text: string;
  board: string[];
  pot: number;
  players: Record<string, { stack: number; bet: number; folded: boolean; action: string | null; shown: string[] | null; won: number }>;
}

const ACTIONS: Record<string, string> = { fold: 'se couche', check: 'parole', call: 'suit', bet: 'mise', raise: 'relance à', allin: 'tapis' };

function buildFrames(h: HandResp['hand']): Frame[] {
  const name = (id: string) => h.players.find((p) => p.userId === id)?.username ?? '?';
  const frames: Frame[] = [];
  let cur: Frame = { text: '', board: [], pot: 0, players: {} };
  const push = (text: string) => {
    cur = { ...structuredClone(cur), text };
    frames.push(cur);
  };
  for (const e of h.events) {
    switch (e.type) {
      case 'handStart':
        cur.players = Object.fromEntries(e.players.map((p) => [p.playerId, { stack: p.stack, bet: 0, folded: false, action: null, shown: null, won: 0 }]));
        push(`Main #${e.handNumber} — blinds ${fmt(e.smallBlind)}/${fmt(e.bigBlind)}${e.ante ? `, ante ${fmt(e.ante)}` : ''}`);
        break;
      case 'ante':
        cur.players[e.playerId]!.stack -= e.amount;
        cur.pot += e.amount;
        break;
      case 'blind': {
        const p = cur.players[e.playerId]!;
        p.stack -= e.amount;
        p.bet += e.amount;
        p.action = e.kind === 'sb' ? 'SB' : 'BB';
        push(`${name(e.playerId)} paie la ${e.kind === 'sb' ? 'petite' : 'grosse'} blind (${fmt(e.amount)})`);
        break;
      }
      case 'action': {
        const p = cur.players[e.playerId]!;
        p.stack -= e.amount;
        p.bet = e.to;
        if (e.action === 'fold') p.folded = true;
        p.action = e.allIn ? 'Tapis' : ACTIONS[e.action] ?? e.action;
        push(`${name(e.playerId)} ${e.allIn ? `est à tapis (${fmt(e.to)})` : `${ACTIONS[e.action]}${e.action === 'bet' || e.action === 'raise' ? ` ${fmt(e.to)}` : e.action === 'call' ? ` ${fmt(e.amount)}` : ''}`}`);
        break;
      }
      case 'uncalled':
        cur.players[e.playerId]!.stack += e.amount;
        cur.players[e.playerId]!.bet -= e.amount;
        push(`${fmt(e.amount)} non suivis rendus à ${name(e.playerId)}`);
        break;
      case 'street':
        for (const p of Object.values(cur.players)) {
          cur.pot += p.bet;
          p.bet = 0;
          p.action = null;
        }
        cur.board = e.board;
        push(`${e.street === 'flop' ? 'Flop' : e.street === 'turn' ? 'Turn' : 'River'}`);
        break;
      case 'reveal':
        for (const x of e.hands) cur.players[x.playerId]!.shown = x.hole;
        push('Cartes dévoilées (tapis)');
        break;
      case 'showdown':
        for (const p of Object.values(cur.players)) {
          cur.pot += p.bet;
          p.bet = 0;
        }
        for (const x of e.hands) {
          cur.players[x.playerId]!.shown = x.hole;
          cur.players[x.playerId]!.action = x.description;
        }
        push('Abattage');
        break;
      case 'potAwarded':
        for (const p of Object.values(cur.players)) {
          cur.pot += p.bet;
          p.bet = 0;
        }
        for (const [id, amt] of Object.entries(e.shares)) {
          cur.players[id]!.stack += amt;
          cur.players[id]!.won += amt;
        }
        cur.pot -= e.amount;
        push(`${e.winners.map(name).join(' et ')} ${e.winners.length > 1 ? 'se partagent' : 'remporte'} ${fmt(e.amount)}${e.description ? ` (${e.description})` : ''}`);
        break;
      default:
        break;
    }
  }
  return frames;
}

export default function HandPage() {
  return (
    <AppShell>
      <Replay />
    </AppShell>
  );
}

function Replay() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<HandResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    api<HandResp>(`/hands/${id}`).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  const frames = useMemo(() => (data ? buildFrames(data.hand) : []), [data]);
  useEffect(() => {
    if (!playing) return;
    if (step >= frames.length - 1) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => s + 1), 1100);
    return () => clearTimeout(t);
  }, [playing, step, frames.length]);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <PageLoader />;
  const h = data.hand;
  const f = frames[step];
  if (!f) return <Empty>Main vide.</Empty>;
  const sorted = [...h.players].sort((a, b) => a.seat - b.seat);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/games/${h.game.id}`} className="text-xs text-muted hover:text-ink">← {h.game.name}</Link>
        <h1 className="font-display text-2xl font-bold">Main #{h.handNumber}</h1>
        <p className="text-sm text-muted">{new Date(h.startedAt).toLocaleString('fr-FR')} · Pot total {fmt(h.potTotal)}</p>
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="felt relative flex min-h-[200px] flex-col items-center justify-center gap-3 p-6">
          <div className="felt-texture absolute inset-0" />
          <div className="relative rounded-full bg-black/40 px-3 py-1 text-sm">Pot <span className="font-semibold text-gold-300">{fmt(f.pot)}</span></div>
          <div className="relative flex gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-[70px] w-[50px] rounded-[7px] bg-black/15 ring-1 ring-white/5">
                <AnimatePresence>{f.board[i] && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><PlayingCard card={f.board[i]} /></motion.div>}</AnimatePresence>
              </div>
            ))}
          </div>
          <motion.p key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative text-center text-sm font-semibold text-white">{f.text}</motion.p>
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-white/5 p-3">
          <Button size="sm" onClick={() => { setPlaying(false); setStep(0); }} aria-label="Début">⏮</Button>
          <Button size="sm" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} aria-label="Précédent">◀</Button>
          <Button size="sm" variant="gold" onClick={() => { if (step >= frames.length - 1) setStep(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : 'Lecture'}</Button>
          <Button size="sm" onClick={() => { setPlaying(false); setStep((s) => Math.min(frames.length - 1, s + 1)); }} aria-label="Suivant">▶</Button>
          <Button size="sm" onClick={() => { setPlaying(false); setStep(frames.length - 1); }} aria-label="Fin">⏭</Button>
          <span className="ml-2 text-xs tabular text-faint">{step + 1}/{frames.length}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => {
          const st = f.players[p.userId];
          if (!st) return null;
          const cards = st.shown ?? (p.cards.length ? p.cards : null);
          return (
            <div key={p.userId} className={cx('panel flex items-center gap-3 p-3', st.folded && 'opacity-50', st.won > 0 && 'ring-1 ring-gold-400/60')}>
              <Avatar name={p.username} url={p.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.username}</div>
                <div className="text-xs tabular text-gold-300">{fmt(st.stack)}</div>
                {st.action && <div className="truncate text-xs text-muted">{st.action}</div>}
              </div>
              {st.bet > 0 && <ChipStack amount={st.bet} size={14} />}
              <div className="flex gap-0.5">
                {(cards ?? [null, null]).map((c, i) => <PlayingCard key={i} card={c} faceDown={!c} size="sm" />)}
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Résultat">
        <ul className="space-y-1 text-sm">
          {sorted.map((p) => (
            <li key={p.userId} className="flex justify-between"><span>{p.username}</span><span className={p.net > 0 ? 'text-success' : p.net < 0 ? 'text-danger' : 'text-muted'}>{signed(p.net)}</span></li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
