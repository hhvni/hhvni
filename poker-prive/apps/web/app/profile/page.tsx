'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt, signed, timeAgo } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { StatsView, type UserStats } from '@/components/StatsView';
import { MiniCards } from '@/components/poker/PlayingCard';
import { Avatar, Badge, Button, cx, Empty, Input, PageLoader, Panel, useToast } from '@/components/ui';
import { AVATAR_PRESETS, PRESET_PREFIX } from '@/components/ui/avatars';

interface HandItem { id: string; handNumber: number; board: string[]; pot: number; endedAt: string; game: string; room: string; cards: string[]; net: number; won: boolean }

export default function ProfilePage() {
  return (
    <AppShell>
      <Profile />
    </AppShell>
  );
}

/** Redimensionne une image en 256×256 (recadrage centré) côté navigateur. */
async function resizeImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return canvas.toDataURL('image/webp', 0.85);
}

function Profile() {
  const { me, refresh, logout } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [hands, setHands] = useState<HandItem[] | null>(null);
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState({ current: '', next: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([api<{ stats: UserStats }>('/users/me'), api<{ hands: HandItem[] }>('/hands/mine?limit=40')]);
    setStats(p.stats);
    setHands(h.hands);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setUsername(me?.username ?? ''), [me?.username]);

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      await api('/users/me/avatar', { body: { dataUrl } });
      await refresh();
      toast('Photo de profil mise à jour', 'success');
    } catch (err) {
      toast((err as Error).message || 'Image invalide', 'error');
    } finally {
      e.target.value = '';
    }
  }

  async function save(body: Record<string, string>) {
    try {
      await api('/users/me', { method: 'PATCH', body });
      await refresh();
      toast('Profil enregistré', 'success');
      setPwd({ current: '', next: '' });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  if (!me || !stats) return <PageLoader />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <button onClick={() => fileRef.current?.click()} className="group relative" title="Changer de photo">
          <Avatar name={me.username} url={me.avatarUrl} size={88} ring="0 0 0 3px rgba(236,201,119,0.5)" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-semibold opacity-0 transition group-hover:opacity-100">Modifier</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onAvatar} />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold">{me.username}</h1>
          <p className="text-sm text-muted">Solde : <span className="font-semibold text-gold-300">{fmt(me.chips)}</span> jetons virtuels</p>
          <div className="mt-2 flex gap-2">
            {me.role === 'ADMIN' && <Badge tone="gold">Administrateur</Badge>}
            <Link href={`/players/${me.id}`}><Badge>Voir mon profil public</Badge></Link>
          </div>
        </div>
        <div className="flex gap-2">
          {me.avatarUrl && <Button variant="subtle" size="sm" onClick={async () => { await api('/users/me/avatar', { method: 'DELETE' }); await refresh(); }}>{me.avatarUrl.startsWith(PRESET_PREFIX) ? 'Retirer l’avatar' : 'Retirer la photo'}</Button>}
          <Button variant="subtle" size="sm" onClick={() => void logout()}>Se déconnecter</Button>
        </div>
      </div>

      <Panel title="Choisir un avatar">
        <p className="mb-3 text-xs text-muted">Collection noir &amp; or — ou cliquez sur votre photo ci-dessus pour envoyer la vôtre.</p>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-8 lg:grid-cols-10">
          {AVATAR_PRESETS.map((p) => {
            const selected = me.avatarUrl === PRESET_PREFIX + p.id;
            return (
              <button
                key={p.id}
                type="button"
                title={p.label}
                aria-pressed={selected}
                onClick={async () => {
                  try {
                    await api('/users/me/avatar/preset', { body: { id: p.id } });
                    await refresh();
                  } catch (err) {
                    toast((err as Error).message, 'error');
                  }
                }}
                className={cx('flex flex-col items-center gap-1 rounded-xl p-1.5 transition hover:bg-white/5', selected && 'bg-gold-400/10 ring-1 ring-gold-400/60')}
              >
                <Avatar name={p.label} url={PRESET_PREFIX + p.id} size={52} />
                <span className="text-[10px] text-muted">{p.label}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <StatsView stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Mes dernières mains">
          {!hands || hands.length === 0 ? (
            <Empty>Aucune main jouée pour l&apos;instant.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {hands.map((h) => (
                <li key={h.id}>
                  <Link href={`/hands/${h.id}`} className="flex items-center gap-3 py-2.5 hover:bg-white/[0.02]">
                    <MiniCards cards={h.cards} />
                    <span className="hidden w-[140px] shrink-0 sm:block">{h.board.length ? <MiniCards cards={h.board} /> : <span className="text-xs text-faint">—</span>}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{h.game} <span className="text-faint">· {h.room}</span></span>
                      <span className="text-xs text-faint">Main #{h.handNumber} · {timeAgo(h.endedAt)}</span>
                    </span>
                    <span className={h.net > 0 ? 'font-semibold tabular text-success' : h.net < 0 ? 'tabular text-danger' : 'tabular text-muted'}>{signed(h.net)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Pseudonyme">
            <div className="space-y-3">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} aria-label="Pseudonyme" />
              <Button variant="gold" className="w-full" disabled={username === me.username} onClick={() => save({ username })}>Enregistrer</Button>
            </div>
          </Panel>
          <Panel title="Mot de passe">
            <div className="space-y-3">
              <Input type="password" label="Actuel" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" />
              <Input type="password" label="Nouveau" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" minLength={8} hint="Les autres sessions seront déconnectées" />
              <Button className="w-full" disabled={!pwd.current || pwd.next.length < 8} onClick={() => save({ currentPassword: pwd.current, newPassword: pwd.next })}>Changer</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
