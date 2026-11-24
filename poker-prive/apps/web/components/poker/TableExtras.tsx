'use client';
/**
 * Compléments de la table :
 *  - revue rapide du dernier coup (sans quitter la table) ;
 *  - statistiques au survol d'un joueur (HUD) ;
 *  - notes personnelles sur les joueurs (avec étiquette de couleur).
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Card, HandEvent } from '@poker/engine';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/displayPrefs';
import { Avatar, Button, cx, Modal, PageLoader } from '../ui';
import { MiniCards } from './PlayingCard';

// ═══════════════════════════ Notes ═══════════════════════════

export type NoteColor = 'none' | 'red' | 'orange' | 'green' | 'blue' | 'purple';
export interface PlayerNote { text: string; color: NoteColor }

export const NOTE_COLORS: { id: NoteColor; label: string; css: string }[] = [
  { id: 'none', label: 'Aucune', css: 'bg-white/15' },
  { id: 'red', label: 'Dangereux', css: 'bg-red-500' },
  { id: 'orange', label: 'Agressif', css: 'bg-orange-400' },
  { id: 'green', label: 'Facile', css: 'bg-emerald-400' },
  { id: 'blue', label: 'Serré', css: 'bg-sky-400' },
  { id: 'purple', label: 'Imprévisible', css: 'bg-violet-400' },
];
export const noteColorCss = (c: NoteColor) => NOTE_COLORS.find((x) => x.id === c)?.css ?? 'bg-white/15';

/** Notes de l'utilisateur sur les joueurs présents à la table. */
export function usePlayerNotes(userIds: string[]) {
  const [notes, setNotes] = useState<Record<string, PlayerNote>>({});
  const key = [...userIds].sort().join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void api<{ notes: Record<string, PlayerNote> }>(`/users/notes?ids=${encodeURIComponent(key)}`)
      .then((r) => alive && setNotes((n) => ({ ...n, ...r.notes })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  const save = async (userId: string, note: PlayerNote) => {
    const r = await api<{ note: PlayerNote | null }>(`/users/${userId}/note`, { method: 'PUT', body: note });
    setNotes((n) => {
      const next = { ...n };
      if (r.note) next[userId] = r.note;
      else delete next[userId];
      return next;
    });
  };
  return { notes, save };
}

export function NoteEditor({ note, onSave }: { note: PlayerNote | undefined; onSave: (n: PlayerNote) => Promise<void> }) {
  const [text, setText] = useState(note?.text ?? '');
  const [color, setColor] = useState<NoteColor>(note?.color ?? 'none');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = text !== (note?.text ?? '') || color !== (note?.color ?? 'none');
  return (
    <div className="space-y-2 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">📝 Ma note</span>
        <span className="text-[10px] text-faint">Visible uniquement par vous</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setColor(c.id)}
            className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition', color === c.id ? 'bg-white/10 text-ink ring-gold-400/70' : 'text-muted ring-white/10 hover:ring-white/30')}
          >
            <span className={cx('h-2.5 w-2.5 rounded-full', c.css)} />
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        rows={3}
        placeholder="Ex. : bluffe beaucoup à la river, se couche face aux 3-bets…"
        className="w-full resize-none rounded-lg bg-night-900/80 px-3 py-2 text-sm text-ink ring-1 ring-white/10 placeholder:text-faint focus:outline-none focus:ring-gold-400/60"
      />
      <div className="flex items-center justify-end gap-2">
        {state === 'saved' && !dirty && <span className="text-xs text-success">Enregistrée ✓</span>}
        {state === 'error' && <span className="text-xs text-danger">Échec de l&apos;enregistrement</span>}
        <Button
          size="sm"
          variant="gold"
          disabled={!dirty || state === 'saving'}
          onClick={async () => {
            setState('saving');
            try {
              await onSave({ text, color });
              setState('saved');
            } catch {
              setState('error');
            }
          }}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════ HUD ═══════════════════════════

export interface Hud { hands: number; vpip: number | null; pfr: number | null; threeBet: number | null; af: number | null; wtsd: number | null; wsd: number | null }

const hudCache = new Map<string, { at: number; hud: Hud }>();

/** Statistiques d'un joueur (mises en cache une minute). */
export function useHud(userId: string | null, roomId?: string): Hud | null {
  const key = userId ? `${userId}|${roomId ?? ''}` : '';
  const [hud, setHud] = useState<Hud | null>(() => (key ? hudCache.get(key)?.hud ?? null : null));
  useEffect(() => {
    if (!key || !userId) return;
    const cached = hudCache.get(key);
    if (cached) setHud(cached.hud);
    if (cached && Date.now() - cached.at < 60_000) return;
    let alive = true;
    void api<{ hud: Hud }>(`/users/${userId}/hud${roomId ? `?roomId=${roomId}` : ''}`)
      .then((r) => {
        hudCache.set(key, { at: Date.now(), hud: r.hud });
        if (alive) setHud(r.hud);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, userId, roomId]);
  return hud;
}

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}`);

/** Lecture rapide du style d'après VPIP / PFR. */
function hudStyle(h: Hud): string | null {
  if (h.hands < 20 || h.vpip === null || h.pfr === null) return null;
  const loose = h.vpip > 30;
  const tight = h.vpip < 18;
  const passive = h.pfr < h.vpip * 0.45;
  if (tight && !passive) return 'Serré-agressif';
  if (tight) return 'Très serré';
  if (loose && passive) return 'Suit beaucoup';
  if (loose) return 'Large et agressif';
  return passive ? 'Plutôt passif' : 'Équilibré';
}

export function HudStats({ hud, compact }: { hud: Hud | null; compact?: boolean }) {
  if (!hud) return <div className="text-[11px] text-faint">Chargement des stats…</div>;
  if (hud.hands === 0) return <div className="text-[11px] text-faint">Aucune main enregistrée</div>;
  const items: [string, string, string][] = [
    ['VPIP', pct(hud.vpip), 'Mains jouées volontairement (%)'],
    ['PFR', pct(hud.pfr), 'Relances préflop (%)'],
    ['3B', pct(hud.threeBet), '3-bet (%)'],
    ['AF', hud.af === null ? '∞' : hud.af.toFixed(1), 'Facteur d’agression après le flop'],
    ['WTSD', pct(hud.wtsd), 'Va jusqu’au showdown (%)'],
  ];
  const style = hudStyle(hud);
  return (
    <div>
      <div className={cx('grid gap-x-2 gap-y-0.5', compact ? 'grid-cols-5' : 'grid-cols-5')}>
        {items.map(([k, v, t]) => (
          <div key={k} className="text-center" title={t}>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-faint">{k}</div>
            <div className="text-xs font-bold tabular text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted">
        <span>{hud.hands} main{hud.hands > 1 ? 's' : ''}{hud.hands < 30 && ' · échantillon faible'}</span>
        {style && <span className="font-semibold text-gold-300">{style}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════ Dernier coup ═══════════════════════════

interface HandRow { id: string; handNumber: number }
interface HandDetail {
  id: string;
  handNumber: number;
  board: Card[];
  potTotal: number;
  events: HandEvent[];
  players: { userId: string; username: string; avatarUrl: string | null; seat: number; net: number; won: boolean; cards: Card[] }[];
}

const STREET_FR: Record<string, string> = { preflop: 'Préflop', flop: 'Flop', turn: 'Turn', river: 'River' };

export function LastHandModal({ open, onClose, gameId }: { open: boolean; onClose: () => void; gameId: string }) {
  const money = useMoney();
  const [list, setList] = useState<HandRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const [hand, setHand] = useState<HandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setHand(null);
    setError(null);
    void api<{ hands: HandRow[] }>(`/hands/game/${gameId}`).then((r) => setList(r.hands)).catch((e: Error) => setError(e.message));
  }, [open, gameId]);

  const current = list?.[index];
  useEffect(() => {
    if (!open || !current) return;
    let alive = true;
    setHand(null);
    void api<{ hand: HandDetail }>(`/hands/${current.id}`).then((r) => alive && setHand(r.hand)).catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, current]);

  const streets = useMemo(() => (hand ? summarize(hand) : []), [hand]);
  const board2 = useMemo(() => {
    const e = hand?.events.find((x): x is Extract<HandEvent, { type: 'secondBoard' }> => x.type === 'secondBoard');
    return e?.cards ?? null; // seulement les nouvelles cartes (les communes sont sur le 1er board)
  }, [hand]);

  return (
    <Modal open={open} onClose={onClose} title={current ? `Coup #${current.handNumber}` : 'Dernier coup'} wide>
      {error ? <p className="text-sm text-danger">{error}</p> : list === null ? <PageLoader /> : list.length === 0 ? (
        <p className="text-sm text-muted">Aucun coup terminé pour l&apos;instant.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" disabled={index >= list.length - 1} onClick={() => setIndex((i) => i + 1)}>‹ Précédent</Button>
            <span className="text-xs text-muted">{index === 0 ? 'Dernier coup joué' : `${index} coup${index > 1 ? 's' : ''} avant`}</span>
            <Button size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Suivant ›</Button>
          </div>
          {!hand ? <PageLoader /> : (
            <>
              <div className="flex flex-col items-center gap-1.5">
                {hand.board.length ? <MiniCards cards={hand.board} size="sm" /> : <span className="text-xs text-faint">Pas de flop</span>}
                {board2 && <div className="flex items-center gap-1.5"><span className="text-[10px] uppercase text-gold-300">2ᵉ board :</span><MiniCards cards={board2} /></div>}
                <span className="text-xs text-muted">Pot total <span className="font-semibold tabular text-gold-300">{money(hand.potTotal)}</span></span>
              </div>

              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[...hand.players].sort((a, b) => b.net - a.net).map((p) => (
                  <li key={p.userId} className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1', p.won ? 'bg-gold-400/10 ring-gold-400/40' : 'bg-white/[0.03] ring-white/5')}>
                    <Avatar name={p.username} url={p.avatarUrl} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.won && '🏆 '}{p.username}</span>
                    {p.cards.length ? <MiniCards cards={p.cards} /> : <MiniCards cards={[null, null]} />}
                    <span className={cx('w-16 text-right text-sm font-semibold tabular', p.net > 0 ? 'text-success' : p.net < 0 ? 'text-danger' : 'text-muted')}>
                      {p.net > 0 ? '+' : ''}{money(p.net)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                {streets.map((s) => (
                  <div key={s.key} className="rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/5">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gold-300">
                      {s.title}
                      {s.cards.length > 0 && <MiniCards cards={s.cards} />}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.lines.map((l, i) => (
                        <span key={i} className={cx('rounded-full px-2 py-0.5 text-[11px]', TONE[l.tone])}>{l.text}</span>
                      ))}
                      {s.lines.length === 0 && <span className="text-[11px] text-faint">—</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Link href={`/hands/${hand.id}`} className="text-sm font-semibold text-gold-300 hover:underline">Replay pas à pas ▸</Link>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );

  function summarize(h: HandDetail) {
    const name = (id: string) => h.players.find((p) => p.userId === id)?.username ?? '?';
    type Line = { text: string; tone: keyof typeof TONE };
    const out: { key: string; title: string; cards: Card[]; lines: Line[] }[] = [];
    let cur = { key: 'preflop', title: 'Préflop', cards: [] as Card[], lines: [] as Line[] };
    out.push(cur);
    for (const e of h.events) {
      switch (e.type) {
        case 'blind':
          cur.lines.push({ text: `${name(e.playerId)} ${e.kind === 'sb' ? 'SB' : e.kind === 'bb' ? 'BB' : e.kind === 'bomb' ? '💣' : e.kind === 'straddle' ? 'straddle' : 'blinde'} ${money(e.amount)}`, tone: 'muted' });
          break;
        case 'action': {
          const n = name(e.playerId);
          const text = e.allIn && e.action !== 'fold' ? `${n} tapis ${money(e.to)}`
            : e.action === 'raise' ? `${n} relance ${money(e.to)}`
            : e.action === 'bet' ? `${n} mise ${money(e.to)}`
            : e.action === 'call' ? `${n} suit ${money(e.amount)}`
            : e.action === 'check' ? `${n} parole` : `${n} se couche`;
          const tone = e.allIn ? 'allin' : e.action === 'raise' || e.action === 'bet' ? 'aggro' : e.action === 'call' ? 'call' : e.action === 'fold' ? 'fold' : 'muted';
          cur.lines.push({ text, tone });
          break;
        }
        case 'street':
          cur = { key: `${e.street}-${out.length}`, title: STREET_FR[e.street] ?? e.street, cards: e.cards, lines: [] };
          out.push(cur);
          break;
        case 'uncalled':
          cur.lines.push({ text: `${money(e.amount)} rendus à ${name(e.playerId)}`, tone: 'muted' });
          break;
        case 'showdown':
          cur = { key: `sd-${out.length}`, title: e.run ? `Abattage · board ${e.run}` : 'Abattage', cards: [], lines: [] };
          out.push(cur);
          for (const s of e.hands) cur.lines.push({ text: `${name(s.playerId)} : ${s.description}`, tone: 'muted' });
          for (const m of e.mucked ?? []) cur.lines.push({ text: `${name(m)} jette sa main`, tone: 'fold' });
          break;
        case 'potAwarded':
          cur.lines.push({ text: `🏆 ${e.winners.map(name).join(' & ')} ${e.winners.length > 1 ? 'partagent' : 'gagne'} ${money(e.amount)}${e.description ? ` · ${e.description}` : ''}`, tone: 'win' });
          break;
        default:
          break;
      }
    }
    return out;
  }
}

const TONE = {
  muted: 'bg-white/[0.06] text-muted',
  fold: 'bg-white/[0.04] text-faint line-through decoration-white/20',
  call: 'bg-sky-400/15 text-sky-200',
  aggro: 'bg-gold-400/15 text-gold-300',
  allin: 'bg-danger/80 text-white font-semibold',
  win: 'bg-gold-400 text-night-950 font-semibold',
} as const;
