'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt, signed } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { Avatar, cx, Empty, OnlineDot, PageLoader, Panel, Select, Tabs } from '@/components/ui';

interface Row { rank: number; userId: string; username: string; avatarUrl: string | null; hands: number; handsWon: number; net: number; tournamentsWon: number; online: boolean }

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Leaderboard />
      </Suspense>
    </AppShell>
  );
}

function Leaderboard() {
  const params = useSearchParams();
  const { me } = useAuth();
  const [scope, setScope] = useState<'friends' | 'room' | 'global'>(params.get('room') ? 'room' : 'friends');
  const [roomId, setRoomId] = useState(params.get('room') ?? '');
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void api<{ rooms: { id: string; name: string }[] }>('/rooms').then((r) => {
      setRooms(r.rooms);
      if (!roomId && r.rooms[0]) setRoomId(r.rooms[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scope === 'room' && !roomId) return;
    setRows(null);
    void api<{ rows: Row[] }>(`/stats/leaderboard?scope=${scope}${scope === 'room' ? `&roomId=${roomId}` : ''}`).then((r) => setRows(r.rows));
  }, [scope, roomId]);

  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="font-display text-3xl font-bold">Classement</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={scope} onChange={setScope} items={[{ value: 'friends', label: 'Entre amis' }, { value: 'room', label: 'Par salon' }, { value: 'global', label: 'Général' }]} />
          {scope === 'room' && rooms.length > 0 && (
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-9 w-48" aria-label="Salon">
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </div>
      </div>
      <Panel>
        {rows === null ? <PageLoader /> : rows.length === 0 ? (
          <Empty icon="🏆">Aucune partie enregistrée pour ce classement.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pl-2">#</th><th>Joueur</th><th className="text-right">Gains virtuels</th><th className="text-right">Mains</th><th className="text-right">% gagnées</th><th className="pr-2 text-right">Tournois</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className={cx('border-t border-white/5', r.userId === me?.id && 'bg-gold-400/[0.06]')}>
                    <td className="w-10 py-2.5 pl-2 text-base">{medal(r.rank)}</td>
                    <td>
                      <Link href={`/players/${r.userId}`} className="flex items-center gap-2.5 hover:text-gold-300">
                        <span className="relative"><Avatar name={r.username} url={r.avatarUrl} size={30} /><span className="absolute -bottom-0.5 -right-0.5"><OnlineDot online={r.online} /></span></span>
                        <span className="font-medium">{r.username}</span>
                      </Link>
                    </td>
                    <td className={cx('text-right font-semibold tabular', r.net >= 0 ? 'text-success' : 'text-danger')}>{signed(r.net)}</td>
                    <td className="text-right tabular text-muted">{fmt(r.hands)}</td>
                    <td className="text-right tabular text-muted">{r.hands ? `${Math.round((r.handsWon / r.hands) * 100)} %` : '—'}</td>
                    <td className="pr-2 text-right tabular text-gold-300">{r.tournamentsWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
