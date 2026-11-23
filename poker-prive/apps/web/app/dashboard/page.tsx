'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import { fmt, signed } from '@/lib/format';
import { AppShell, ChipIcon } from '@/components/AppShell';
import { Avatar, Badge, Button, Empty, Input, Modal, OnlineDot, Panel, Stat, useToast } from '@/components/ui';

interface RoomItem {
  id: string;
  name: string;
  owner: string;
  members: number;
  maxPlayers: number;
  role: string;
  hasPassword: boolean;
  activeGames: { id: string; name: string; mode: string; status: string }[];
  seated: number;
}
interface Friend { friendshipId: string; id: string; username: string; avatarUrl: string | null; online: boolean }
interface MeResp {
  user: { chips: number; username: string };
  stats: { handsPlayed: number; handsWon: number; winRate: number; cumulative: number; tournamentsWon: number; gamesPlayed: number };
  refill: { available: boolean; target: number; threshold: number; nextAt: string | null };
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { me, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [rooms, setRooms] = useState<RoomItem[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [profile, setProfile] = useState<MeResp | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = useCallback(async () => {
    const [r, f, p] = await Promise.all([
      api<{ rooms: RoomItem[] }>('/rooms'),
      api<{ friends: Friend[] }>('/friends'),
      api<MeResp>('/users/me'),
    ]);
    setRooms(r.rooms);
    setFriends(f.friends);
    setProfile(p);
  }, []);

  useEffect(() => {
    void load();
    const s = getSocket();
    const onPresence = (p: { userId: string; online: boolean }) => setFriends((fs) => fs.map((f) => (f.id === p.userId ? { ...f, online: p.online } : f)));
    s.on('presence:update', onPresence);
    s.on('friends:update', load);
    return () => {
      s.off('presence:update', onPresence);
      s.off('friends:update', load);
    };
  }, [load]);

  async function createRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ room: { id: string } }>('/rooms', { body: { name: f.get('name'), password: f.get('password') || undefined, maxPlayers: Number(f.get('maxPlayers') || 10) } });
      router.push(`/rooms/${r.room.id}?new=1`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  async function joinRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    const m = /join\/([A-Za-z0-9]+)/.exec(code);
    router.push(`/join/${(m?.[1] ?? code).toUpperCase()}`);
  }

  async function refill() {
    try {
      await api('/users/me/refill', { body: {} });
      toast('Solde rechargé !', 'success');
      await Promise.all([refresh(), load()]);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  const online = friends.filter((f) => f.online);
  const s = profile?.stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">Bonsoir,</p>
          <h1 className="font-display text-3xl font-bold">{me?.username}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setJoinOpen(true)}>Rejoindre avec un code</Button>
          <Button variant="gold" onClick={() => setCreateOpen(true)}>+ Créer un salon</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel flex items-center gap-4 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/10 ring-1 ring-gold-400/25"><ChipIcon size={24} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-faint">Solde virtuel</div>
            <div className="text-xl font-semibold tabular text-gold-300">{fmt(profile?.user.chips ?? me?.chips ?? 0)}</div>
          </div>
          {profile?.refill.available && <Button size="sm" variant="gold" onClick={refill}>Recharger</Button>}
        </div>
        <Stat label="Mains jouées" value={fmt(s?.handsPlayed ?? 0)} sub={`${s?.winRate ?? 0} % gagnées`} />
        <Stat label="Gains cumulés" value={signed(s?.cumulative ?? 0)} tone={(s?.cumulative ?? 0) >= 0 ? 'green' : 'red'} sub={`${s?.gamesPlayed ?? 0} parties`} />
        <Stat label="Tournois gagnés" value={s?.tournamentsWon ?? 0} tone="gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Mes salons">
          {rooms === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
          ) : rooms.length === 0 ? (
            <Empty icon="♠">
              Vous n&apos;avez encore aucun salon.
              <Button variant="gold" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>Créer mon premier salon</Button>
            </Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {rooms.map((r) => (
                <li key={r.id}>
                  <Link href={`/rooms/${r.id}`} className="group block rounded-xl bg-night-950/40 p-4 ring-1 ring-white/6 transition hover:bg-night-950/70 hover:ring-gold-400/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold group-hover:text-gold-300">{r.name}</h3>
                        <p className="text-xs text-muted">par {r.owner} · {r.members}/{r.maxPlayers} membres</p>
                      </div>
                      <div className="flex gap-1">
                        {r.role !== 'PLAYER' && <Badge tone="gold">{r.role === 'OWNER' ? 'Créateur' : 'Admin'}</Badge>}
                        {r.hasPassword && <Badge>🔒</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.activeGames.length === 0 ? (
                        <span className="text-xs text-faint">Aucune table ouverte</span>
                      ) : (
                        r.activeGames.map((g) => (
                          <Badge key={g.id} tone={g.status === 'RUNNING' ? 'green' : 'neutral'}>
                            {g.status === 'RUNNING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />}
                            {g.name} · {g.mode === 'CASH' ? 'Cash' : 'Tournoi'}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Amis en ligne · ${online.length}`} action={<Link href="/friends" className="text-xs text-gold-300 hover:underline">Gérer</Link>}>
          {friends.length === 0 ? (
            <Empty>Ajoutez vos amis pour les inviter en un clic.</Empty>
          ) : (
            <ul className="space-y-1">
              {[...friends].sort((a, b) => Number(b.online) - Number(a.online)).slice(0, 12).map((f) => (
                <li key={f.id}>
                  <Link href={`/players/${f.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <span className="relative">
                      <Avatar name={f.username} url={f.avatarUrl} size={32} />
                      <span className="absolute -bottom-0.5 -right-0.5"><OnlineDot online={f.online} /></span>
                    </span>
                    <span className={f.online ? 'text-ink' : 'text-muted'}>{f.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau salon privé">
        <form onSubmit={createRoom} className="space-y-4">
          <Input name="name" label="Nom du salon" placeholder="Le poker du jeudi" required minLength={2} maxLength={40} autoFocus />
          <Input name="password" type="password" label="Mot de passe (facultatif)" placeholder="Laisser vide pour aucun" maxLength={100} />
          <Input name="maxPlayers" type="number" label="Nombre maximum de membres" defaultValue={10} min={2} max={50} />
          <Button type="submit" variant="gold" className="w-full">Créer le salon</Button>
        </form>
      </Modal>
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Rejoindre un salon">
        <form onSubmit={joinRoom} className="space-y-4">
          <Input name="code" label="Code ou lien d'invitation" placeholder="ex. K7M2QXPA" required autoFocus />
          <Button type="submit" variant="gold" className="w-full">Continuer</Button>
        </form>
      </Modal>
    </div>
  );
}
