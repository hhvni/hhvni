'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { closeSocket } from './socket';

export interface Me {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
  chips: number;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setMe: (m: Me | null) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: Me | null }>('/auth/me');
      setMe(r.user);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    closeSocket();
    setMe(null);
    router.push('/');
  }, [router]);

  return <Ctx.Provider value={{ me, loading, refresh, logout, setMe }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider manquant');
  return c;
}

/** Redirige vers /login si non connecté ; renvoie l'utilisateur. */
export function useRequireAuth(): Me | null {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !me) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/dashboard';
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, me, router]);
  return me;
}
