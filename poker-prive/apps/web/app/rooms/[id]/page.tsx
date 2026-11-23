'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import type { ChatMessageView } from '@poker/engine';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { emit, getSocket } from '@/lib/socket';
import { fmt } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { CreateGameForm } from '@/components/CreateGameForm';
import { ChatBox } from '@/components/poker/ChatBox';
import { Avatar, Badge, Button, Empty, Input, Modal, OnlineDot, PageLoader, Panel, useToast } from '@/components/ui';

interface Member { userId: string; username: string; avatarUrl: string | null; role: 'OWNER' | 'ADMIN' | 'PLAYER'; banned: boolean; online: boolean }
interface GameItem { id: string; name: string; mode: 'CASH' | 'TOURNAMENT'; status: string; smallBlind: number; bigBlind: number; maxSeats: number; startingStack: number; buyIn: number; seated: number; registered: number; hands: number }
interface RoomResp {
  room: { id: string; name: string; ownerId: string; maxPlayers: number; rules: string; hasPassword: boolean; inviteCode: string };
  myRole: 'OWNER' | 'ADMIN' | 'PLAYER';
  members: Member[];
  games: GameItem[];
}

const STATUS: Record<string, { label: string; tone: 'green' | 'gold' | 'neutral' | 'blue' }> = {
  WAITING: { label: 'En attente', tone: 'blue' },
  RUNNING: { label: 'En cours', tone: 'green' },
  PAUSED: { label: 'En pause', tone: 'gold' },
  FINISHED: { label: 'Terminée', tone: 'neutral' },
};

export default function RoomPage() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Room />
      </Suspense>
    </AppShell>
  );
}

function Room() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<RoomResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(params.get('new') === '1');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [showFinished, setShowFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<RoomResp>(`/rooms/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
    void api<{ messages: ChatMessageView[] }>(`/rooms/${id}/messages`).then((r) => setMessages(r.messages)).catch(() => undefined);
    const s = getSocket();
    const join = () => void emit('room:join', { roomId: id });
    join();
    s.on('connect', join);
    const onUpdate = (p: { roomId: string }) => p.roomId === id && void load();
    const onDeleted = (p: { roomId: string }) => {
      if (p.roomId === id) {
        toast('Ce salon a été supprimé', 'error');
        router.push('/dashboard');
      }
    };
    const onMsg = (p: { roomId: string; gameId: string | null; message: ChatMessageView }) => {
      if (p.roomId === id && !p.gameId) setMessages((m) => [...m.slice(-99), p.message]);
    };
    s.on('room:update', onUpdate);
    s.on('room:deleted', onDeleted);
    s.on('chat:message', onMsg);
    return () => {
      void emit('room:leave', { roomId: id });
      s.off('connect', join);
      s.off('room:update', onUpdate);
      s.off('room:deleted', onDeleted);
      s.off('chat:message', onMsg);
    };
  }, [id, load, router, toast]);

  if (error) return <Empty icon="🔒">{error}<Link href="/dashboard" className="mt-2 text-gold-300 hover:underline">Retour</Link></Empty>;
  if (!data) return <PageLoader />;

  const isAdmin = data.myRole !== 'PLAYER' || me?.role === 'ADMIN';
  const isOwner = data.myRole === 'OWNER';
  const active = data.games.filter((g) => g.status !== 'FINISHED');
  const finished = data.games.filter((g) => g.status === 'FINISHED');
  const visibleMembers = data.members.filter((m) => !m.banned);

  async function memberAction(userId: string, action: 'kick' | 'ban' | 'unban' | 'admin' | 'player') {
    try {
      if (action === 'admin' || action === 'player') await api(`/rooms/${id}/members/${userId}/role`, { body: { role: action === 'admin' ? 'ADMIN' : 'PLAYER' } });
      else await api(`/rooms/${id}/members/${userId}/${action}`, { body: {} });
      toast('Modification enregistrée', 'success');
      void load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function leaveRoom() {
    if (!confirm('Quitter ce salon ?')) return;
    try {
      await api(`/rooms/${id}/leave`, { body: {} });
      router.push('/dashboard');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/dashboard" className="text-xs text-muted hover:text-ink">← Mes salons</Link>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-bold">
            {data.room.name}
            {data.room.hasPassword && <span className="text-base" title="Protégé par mot de passe">🔒</span>}
          </h1>
          <p className="mt-1 text-sm text-muted">{visibleMembers.length}/{data.room.maxPlayers} membres · {visibleMembers.filter((m) => m.online).length} en ligne</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setInviteOpen(true)}>Inviter</Button>
          <Link href={`/leaderboard?room=${id}`}><Button variant="subtle">Classement</Button></Link>
          {isAdmin && <Button variant="subtle" onClick={() => setSettingsOpen(true)}>Paramètres</Button>}
          {isAdmin && <Button variant="gold" onClick={() => setCreateOpen(true)}>+ Nouvelle table</Button>}
        </div>
      </div>

      {data.room.rules && <div className="panel whitespace-pre-line p-4 text-sm text-muted"><span className="mr-2 font-semibold text-ink">Règles du salon :</span>{data.room.rules}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel title="Tables">
            {active.length === 0 ? (
              <Empty icon="🂠">
                Aucune table ouverte.
                {isAdmin ? <Button variant="gold" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>Ouvrir une table</Button> : <span>Un administrateur doit en ouvrir une.</span>}
              </Empty>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {active.map((g) => <GameCard key={g.id} g={g} />)}
              </ul>
            )}
            {finished.length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowFinished((x) => !x)} className="text-xs text-muted hover:text-ink">
                  {showFinished ? '▾' : '▸'} Parties terminées ({finished.length})
                </button>
                {showFinished && <ul className="mt-3 grid gap-3 md:grid-cols-2">{finished.map((g) => <GameCard key={g.id} g={g} />)}</ul>}
              </div>
            )}
          </Panel>

          <Panel title="Membres">
            <ul className="divide-y divide-white/5">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-2.5">
                  <span className="relative">
                    <Avatar name={m.username} url={m.avatarUrl} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5"><OnlineDot online={m.online} /></span>
                  </span>
                  <Link href={`/players/${m.userId}`} className={m.banned ? 'text-faint line-through' : 'hover:text-gold-300'}>{m.username}</Link>
                  {m.role === 'OWNER' && <Badge tone="gold">Créateur</Badge>}
                  {m.role === 'ADMIN' && <Badge tone="blue">Admin</Badge>}
                  {m.banned && <Badge tone="red">Banni</Badge>}
                  {isAdmin && m.role !== 'OWNER' && m.userId !== me?.id && (
                    <div className="ml-auto flex flex-wrap justify-end gap-1">
                      {isOwner && !m.banned && (m.role === 'ADMIN'
                        ? <Button size="sm" variant="subtle" onClick={() => memberAction(m.userId, 'player')}>Retirer admin</Button>
                        : <Button size="sm" variant="subtle" onClick={() => memberAction(m.userId, 'admin')}>Nommer admin</Button>)}
                      {m.banned ? (
                        <Button size="sm" variant="subtle" onClick={() => memberAction(m.userId, 'unban')}>Débannir</Button>
                      ) : (
                        <>
                          <Button size="sm" variant="subtle" onClick={() => confirm(`Exclure ${m.username} du salon ?`) && memberAction(m.userId, 'kick')}>Exclure</Button>
                          <Button size="sm" variant="subtle" className="text-danger" onClick={() => confirm(`Bannir ${m.username} ?`) && memberAction(m.userId, 'ban')}>Bannir</Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!isOwner && <button onClick={leaveRoom} className="mt-4 text-xs text-muted hover:text-danger">Quitter ce salon</button>}
          </Panel>
        </div>

        <Panel title="Discussion du salon" className="flex h-[560px] flex-col">
          <ChatBox messages={messages} onSend={async (text) => {
            const r = await emit('chat:send', { roomId: id, text });
            if (!r.ok) toast(r.error ?? 'Erreur', 'error');
          }} />
        </Panel>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle table" wide>
        <CreateGameForm roomId={id} onCreated={(gid) => router.push(`/games/${gid}`)} />
      </Modal>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} room={data.room} members={data.members} />
      {isAdmin && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} room={data.room} isOwner={isOwner || me?.role === 'ADMIN'} onSaved={load} />}
    </div>
  );
}

function GameCard({ g }: { g: GameItem }) {
  const st = STATUS[g.status] ?? STATUS.WAITING!;
  const count = g.mode === 'TOURNAMENT' && g.status === 'WAITING' ? g.registered : g.seated;
  return (
    <li>
      <Link href={`/games/${g.id}`} className="group block rounded-xl bg-gradient-to-br from-felt-600/30 to-night-950/50 p-4 ring-1 ring-white/6 transition hover:ring-gold-400/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold group-hover:text-gold-300">{g.name}</h3>
            <p className="text-xs text-muted">{g.mode === 'CASH' ? 'Cash game' : 'Tournoi'} · Blinds {fmt(g.smallBlind)}/{fmt(g.bigBlind)}</p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{count}/{g.maxSeats} joueurs{g.mode === 'TOURNAMENT' && g.status === 'WAITING' ? ' inscrits' : ''}</span>
          <span>Tapis {fmt(g.startingStack)}{g.buyIn ? ` · Inscr. ${fmt(g.buyIn)}` : ''}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${(count / g.maxSeats) * 100}%` }} />
        </div>
      </Link>
    </li>
  );
}

interface Friend { id: string; username: string; avatarUrl: string | null; online: boolean }

function InviteModal({ open, onClose, room, members }: { open: boolean; onClose: () => void; room: RoomResp['room']; members: Member[] }) {
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const link = typeof window !== 'undefined' ? `${window.location.origin}/join/${room.inviteCode}` : '';
  const text = `Rejoins ma table de poker « ${room.name} » sur Cercle Privé : ${link}${room.hasPassword ? ' (mot de passe requis)' : ''}`;

  useEffect(() => {
    if (open) void api<{ friends: Friend[] }>('/friends').then((r) => setFriends(r.friends));
  }, [open]);

  const copy = async (value: string, what: string) => {
    await navigator.clipboard.writeText(value);
    toast(`${what} copié`, 'success');
  };
  const memberIds = new Set(members.filter((m) => !m.banned).map((m) => m.userId));
  const invitable = friends.filter((f) => !memberIds.has(f.id));

  return (
    <Modal open={open} onClose={onClose} title="Inviter des amis">
      <div className="space-y-5">
        <div className="rounded-xl bg-night-950/60 p-4 text-center ring-1 ring-gold-400/20">
          <div className="text-[11px] uppercase tracking-[0.2em] text-faint">Code d&apos;invitation</div>
          <button onClick={() => copy(room.inviteCode, 'Code')} className="mt-1 font-mono text-3xl font-bold tracking-[0.25em] text-gold-300" title="Copier">
            {room.inviteCode}
          </button>
        </div>
        <div className="flex gap-2">
          <Input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Lien d'invitation" />
          <Button onClick={() => copy(link, 'Lien')}>Copier</Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><Button variant="success" className="w-full">WhatsApp</Button></a>
          <Button className="w-full bg-[#5865F2] text-white hover:brightness-110" onClick={() => copy(text, 'Message pour Discord')}>Discord</Button>
          <Button className="w-full" onClick={() => (navigator.share ? navigator.share({ title: room.name, text, url: link }).catch(() => undefined) : copy(text, 'Message'))}>Partager…</Button>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Inviter directement</div>
          {invitable.length === 0 ? (
            <p className="text-sm text-faint">Tous vos amis sont déjà membres (ou ajoutez des amis depuis la page Amis).</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto scroll-thin">
              {invitable.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <Avatar name={f.username} url={f.avatarUrl} size={30} />
                  <span className="flex-1 text-sm">{f.username}</span>
                  <OnlineDot online={f.online} />
                  <Button size="sm" variant={sent.has(f.id) ? 'subtle' : 'gold'} disabled={sent.has(f.id)} onClick={async () => {
                    try {
                      await api(`/rooms/${room.id}/invite`, { body: { userId: f.id } });
                      setSent((s) => new Set(s).add(f.id));
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}>{sent.has(f.id) ? 'Envoyée' : 'Inviter'}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SettingsModal({ open, onClose, room, isOwner, onSaved }: { open: boolean; onClose: () => void; room: RoomResp['room']; isOwner: boolean; onSaved: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(room.name);
  const [maxPlayers, setMaxPlayers] = useState(room.maxPlayers);
  const [rules, setRules] = useState(room.rules);
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);

  async function save() {
    try {
      await api(`/rooms/${room.id}`, { method: 'PATCH', body: { name, maxPlayers, rules, ...(removePassword ? { password: null } : password ? { password } : {}) } });
      toast('Salon mis à jour', 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function regenerate() {
    await api(`/rooms/${room.id}/regenerate-code`, { body: {} });
    toast("Nouveau code d'invitation généré", 'success');
    onSaved();
  }
  async function remove() {
    if (!confirm('Supprimer définitivement ce salon ? Les jetons des joueurs assis leur seront rendus.')) return;
    try {
      await api(`/rooms/${room.id}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Paramètres du salon">
      <div className="space-y-4">
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <Input label="Membres maximum" type="number" min={2} max={50} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
        <Input label={room.hasPassword ? 'Nouveau mot de passe' : 'Mot de passe (facultatif)'} type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={removePassword} />
        {room.hasPassword && (
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={removePassword} onChange={(e) => setRemovePassword(e.target.checked)} /> Supprimer le mot de passe</label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Règles du salon</span>
          <textarea value={rules} onChange={(e) => setRules(e.target.value)} maxLength={2000} rows={4} className="w-full rounded-xl border border-white/10 bg-night-950/60 p-3 text-sm outline-none focus:border-gold-400/60" placeholder="Ex. : pas de slowroll, on joue jusqu'à minuit…" />
        </label>
        <div className="flex gap-2">
          <Button variant="gold" className="flex-1" onClick={save}>Enregistrer</Button>
          <Button onClick={regenerate}>Nouveau code</Button>
        </div>
        {isOwner && <button onClick={remove} className="w-full pt-2 text-center text-sm text-danger hover:underline">Supprimer le salon</button>}
      </div>
    </Modal>
  );
}
