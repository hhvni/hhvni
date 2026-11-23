'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { StatsView, type UserStats } from '@/components/StatsView';
import { Avatar, Button, Empty, OnlineDot, PageLoader, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';

interface Resp { user: { id: string; username: string; avatarUrl: string | null; createdAt: string; online: boolean }; stats: UserStats }

export default function PlayerPage() {
  return (
    <AppShell>
      <Player />
    </AppShell>
  );
}

function Player() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Resp>(`/users/${id}`).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <Avatar name={data.user.username} url={data.user.avatarUrl} size={80} />
        <div className="flex-1">
          <h1 className="flex items-center gap-3 font-display text-3xl font-bold">{data.user.username}<OnlineDot online={data.user.online} /></h1>
          <p className="text-sm text-muted">Membre depuis {new Date(data.user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
        </div>
        {me && me.id !== data.user.id && (
          <Button variant="gold" onClick={async () => {
            try {
              await api('/friends/request', { body: { username: data.user.username } });
              toast("Demande d'ami envoyée", 'success');
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}>Ajouter en ami</Button>
        )}
      </div>
      <StatsView stats={data.stats} />
    </div>
  );
}
