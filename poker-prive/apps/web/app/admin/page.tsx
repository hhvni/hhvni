'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt, timeAgo } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { MiniCards } from '@/components/poker/PlayingCard';
import { Badge, Button, Empty, Input, OnlineDot, PageLoader, Panel, Stat, Tabs, useToast } from '@/components/ui';

interface Overview { users: number; rooms: number; games: number; hands: number; online: number; liveTables: number; totalChips: number; liveGames: { id: string; name: string; mode: string; players: number; hand: number }[] }
interface U { id: string; username: string; email: string; role: 'USER' | 'ADMIN'; banned: boolean; chips: number; createdAt: string; lastSeenAt: string; hands: number; online: boolean }
interface R { id: string; name: string; owner: string; members: number; games: number; createdAt: string; inviteCode: string }
interface H { id: string; handNumber: number; pot: number; board: string[]; endedAt: string; game: string; room: string; players: number }
interface L { id: string; type: string; userId: string | null; targetId: string | null; data: unknown; ip: string | null; createdAt: string }

export default function AdminPage() {
  return (
    <AppShell>
      <Admin />
    </AppShell>
  );
}

function Admin() {
  const { me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'rooms' | 'hands' | 'audit'>('users');
  const [ov, setOv] = useState<Overview | null>(null);
  const [users, setUsers] = useState<U[]>([]);
  const [rooms, setRooms] = useState<R[]>([]);
  const [hands, setHands] = useState<H[]>([]);
  const [logs, setLogs] = useState<L[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setOv(await api<Overview>('/admin/overview'));
    if (tab === 'users') setUsers((await api<{ users: U[] }>(`/admin/users?q=${encodeURIComponent(q)}`)).users);
    if (tab === 'rooms') setRooms((await api<{ rooms: R[] }>('/admin/rooms')).rooms);
    if (tab === 'hands') setHands((await api<{ hands: H[] }>('/admin/hands')).hands);
    if (tab === 'audit') setLogs((await api<{ logs: L[] }>('/admin/audit')).logs);
  }, [tab, q]);
  useEffect(() => {
    if (me?.role === 'ADMIN') void load();
  }, [load, me?.role]);

  if (me?.role !== 'ADMIN') return <Empty icon="🔒">Espace réservé aux administrateurs.</Empty>;
  if (!ov) return <PageLoader />;

  const updateUser = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/admin/users/${id}`, { body });
      toast('Utilisateur mis à jour', 'success');
      void load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Administration</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Stat label="Utilisateurs" value={fmt(ov.users)} />
        <Stat label="En ligne" value={fmt(ov.online)} tone="green" />
        <Stat label="Salons" value={fmt(ov.rooms)} />
        <Stat label="Parties" value={fmt(ov.games)} />
        <Stat label="Tables actives" value={fmt(ov.liveTables)} tone="gold" />
        <Stat label="Mains jouées" value={fmt(ov.hands)} />
        <Stat label="Jetons en circulation" value={fmt(ov.totalChips)} />
      </div>
      {ov.liveGames.length > 0 && (
        <Panel title="Tables en cours">
          <div className="flex flex-wrap gap-2">
            {ov.liveGames.map((g) => <Link key={g.id} href={`/games/${g.id}`}><Badge tone="green">{g.name} · {g.players} joueurs · main #{g.hand}</Badge></Link>)}
          </div>
        </Panel>
      )}
      <Tabs value={tab} onChange={setTab} items={[{ value: 'users', label: 'Utilisateurs' }, { value: 'rooms', label: 'Salons' }, { value: 'hands', label: 'Mains' }, { value: 'audit', label: 'Journal' }]} />
      <Panel>
        {tab === 'users' && (
          <div className="space-y-3">
            <Input placeholder="Rechercher (pseudo ou e-mail)" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint"><th className="py-2">Joueur</th><th>E-mail</th><th className="text-right">Solde</th><th className="text-right">Mains</th><th>Vu</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="py-2"><span className="flex items-center gap-2"><OnlineDot online={u.online} /><Link className="hover:text-gold-300" href={`/players/${u.id}`}>{u.username}</Link>{u.role === 'ADMIN' && <Badge tone="gold">Admin</Badge>}{u.banned && <Badge tone="red">Banni</Badge>}</span></td>
                      <td className="text-muted">{u.email}</td>
                      <td className="text-right tabular">{fmt(u.chips)}</td>
                      <td className="text-right tabular text-muted">{fmt(u.hands)}</td>
                      <td className="text-xs text-faint">{timeAgo(u.lastSeenAt)}</td>
                      <td className="space-x-1 py-1 text-right">
                        <Button size="sm" variant="subtle" onClick={() => { const v = prompt('Jetons à ajouter (négatif pour retirer) :', '10000'); if (v && Number.isInteger(Number(v))) void updateUser(u.id, { chipsDelta: Number(v) }); }}>Jetons</Button>
                        {u.id !== me.id && <Button size="sm" variant="subtle" onClick={() => updateUser(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role === 'ADMIN' ? 'Retirer admin' : 'Admin'}</Button>}
                        {u.id !== me.id && <Button size="sm" variant="subtle" className={u.banned ? '' : 'text-danger'} onClick={() => (u.banned || confirm(`Bannir ${u.username} ?`)) && updateUser(u.id, { banned: !u.banned })}>{u.banned ? 'Débannir' : 'Bannir'}</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === 'rooms' && (
          <ul className="divide-y divide-white/5">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Link href={`/rooms/${r.id}`} className="flex-1 hover:text-gold-300">{r.name} <span className="text-faint">· par {r.owner} · {r.members} membres · {r.games} parties · code {r.inviteCode}</span></Link>
                <Button size="sm" variant="subtle" className="text-danger" onClick={async () => {
                  if (!confirm(`Supprimer le salon « ${r.name} » ?`)) return;
                  try { await api(`/admin/rooms/${r.id}`, { method: 'DELETE' }); void load(); } catch (e) { toast((e as Error).message, 'error'); }
                }}>Supprimer</Button>
              </li>
            ))}
          </ul>
        )}
        {tab === 'hands' && (
          <ul className="divide-y divide-white/5">
            {hands.map((h) => (
              <li key={h.id}>
                <Link href={`/hands/${h.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-white/[0.02]">
                  <span className="w-[140px]">{h.board.length ? <MiniCards cards={h.board} /> : '—'}</span>
                  <span className="flex-1">{h.room} · {h.game} · #{h.handNumber} · {h.players} joueurs</span>
                  <span className="tabular text-gold-300">{fmt(h.pot)}</span>
                  <span className="text-xs text-faint">{timeAgo(h.endedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {tab === 'audit' && (
          <ul className="space-y-1 font-mono text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-3 border-b border-white/5 py-1">
                <span className="text-faint">{new Date(l.createdAt).toLocaleString('fr-FR')}</span>
                <span className="text-gold-300">{l.type}</span>
                <span className="text-muted">{l.userId ?? '—'} → {l.targetId ?? '—'}</span>
                <span className="text-faint">{l.ip}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
