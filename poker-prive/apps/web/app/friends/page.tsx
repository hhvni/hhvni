'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { timeAgo } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { Avatar, Button, Empty, Input, OnlineDot, PageLoader, Panel, useToast } from '@/components/ui';

interface F { friendshipId: string; id: string; username: string; avatarUrl: string | null; online: boolean; lastSeenAt: string }
interface Resp { friends: F[]; incoming: F[]; outgoing: F[] }

export default function FriendsPage() {
  return (
    <AppShell>
      <Friends />
    </AppShell>
  );
}

function Friends() {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [results, setResults] = useState<{ id: string; username: string; avatarUrl: string | null; online: boolean }[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => setData(await api<Resp>('/friends')), []);
  useEffect(() => {
    void load();
    const s = getSocket();
    const onPresence = (p: { userId: string; online: boolean }) => setData((d) => d && { ...d, friends: d.friends.map((f) => (f.id === p.userId ? { ...f, online: p.online } : f)) });
    s.on('friends:update', load);
    s.on('presence:update', onPresence);
    return () => {
      s.off('friends:update', load);
      s.off('presence:update', onPresence);
    };
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => void api<{ users: typeof results }>(`/users/search?q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.users)).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function request(username: string, e?: FormEvent) {
    e?.preventDefault();
    try {
      const r = await api<{ status: string }>('/friends/request', { body: { username } });
      toast(r.status === 'ACCEPTED' ? 'Vous êtes maintenant amis !' : 'Demande envoyée', 'success');
      setQ('');
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }
  const act = async (path: string, method = 'POST') => {
    await api(path, { method, body: method === 'POST' ? {} : undefined });
    void load();
  };

  if (!data) return <PageLoader />;
  const friendIds = new Set([...data.friends, ...data.outgoing, ...data.incoming].map((f) => f.id));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Amis</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title={`Mes amis · ${data.friends.filter((f) => f.online).length} en ligne`}>
          {data.friends.length === 0 ? (
            <Empty icon="👥">Recherchez vos amis par pseudonyme pour les ajouter.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.friends.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <span className="relative"><Avatar name={f.username} url={f.avatarUrl} size={38} /><span className="absolute -bottom-0.5 -right-0.5"><OnlineDot online={f.online} /></span></span>
                  <Link href={`/players/${f.id}`} className="flex-1">
                    <span className="block font-medium hover:text-gold-300">{f.username}</span>
                    <span className="text-xs text-faint">{f.online ? 'En ligne' : `Vu ${timeAgo(f.lastSeenAt)}`}</span>
                  </Link>
                  <Button size="sm" variant="subtle" onClick={() => confirm(`Retirer ${f.username} de vos amis ?`) && act(`/friends/${f.friendshipId}`, 'DELETE')}>Retirer</Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Ajouter un ami">
            <form onSubmit={(e) => request(q.trim(), e)} className="space-y-3">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudonyme" aria-label="Rechercher un joueur" />
              {results.length > 0 && (
                <ul className="space-y-1">
                  {results.map((u) => (
                    <li key={u.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                      <Avatar name={u.username} url={u.avatarUrl} size={28} />
                      <span className="flex-1 text-sm">{u.username}</span>
                      {!friendIds.has(u.id) && <Button size="sm" variant="gold" type="button" onClick={() => request(u.username)}>Ajouter</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </Panel>
          {data.incoming.length > 0 && (
            <Panel title="Demandes reçues">
              <ul className="space-y-2">
                {data.incoming.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <Avatar name={f.username} url={f.avatarUrl} size={30} />
                    <span className="flex-1 text-sm">{f.username}</span>
                    <Button size="sm" variant="gold" onClick={() => act(`/friends/${f.friendshipId}/accept`)}>Accepter</Button>
                    <Button size="sm" variant="subtle" onClick={() => act(`/friends/${f.friendshipId}`, 'DELETE')}>Refuser</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {data.outgoing.length > 0 && (
            <Panel title="Demandes envoyées">
              <ul className="space-y-2">
                {data.outgoing.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={f.username} url={f.avatarUrl} size={26} /><span className="flex-1">{f.username}</span>
                    <Button size="sm" variant="subtle" onClick={() => act(`/friends/${f.friendshipId}`, 'DELETE')}>Annuler</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
