'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { Logo } from '@/components/AppShell';
import { Button, Empty, Input, PageLoader } from '@/components/ui';

interface Preview { id: string; name: string; owner: string; members: number; maxPlayers: number; hasPassword: boolean; isMember: boolean }

export default function JoinPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Join />
    </Suspense>
  );
}

function Join() {
  const me = useRequireAuth();
  const { code } = useParams<{ code: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [room, setRoom] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const gameId = params.get('game');
  const target = (roomId: string) => (gameId ? `/games/${gameId}` : `/rooms/${roomId}`);

  useEffect(() => {
    if (!me) return;
    api<{ room: Preview }>(`/rooms/invite/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.room.isMember) router.replace(target(r.room.id));
        else setRoom(r.room);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, code]);

  async function join(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const password = e ? String(new FormData(e.currentTarget).get('password') ?? '') : undefined;
      const r = await api<{ roomId: string }>('/rooms/join', { body: { code, password: password || undefined } });
      router.replace(target(r.roomId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!me) return <PageLoader />;
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        {error && !room ? (
          <Empty icon="✉️">{error}</Empty>
        ) : !room ? (
          <PageLoader />
        ) : (
          <form onSubmit={join} className="panel space-y-5 p-6 text-center">
            <p className="text-sm text-muted">{room.owner} vous invite à rejoindre</p>
            <h1 className="font-display text-3xl font-bold">{room.name}</h1>
            <p className="text-sm text-faint">{room.members}/{room.maxPlayers} membres</p>
            {room.hasPassword && <Input name="password" type="password" label="Mot de passe du salon" required autoFocus className="text-center" />}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>Rejoindre le salon</Button>
          </form>
        )}
      </div>
    </div>
  );
}
