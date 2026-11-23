'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type Me } from '@/lib/auth';
import { Logo } from './AppShell';
import { Button, Input } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        if (f.get('password') !== f.get('confirm')) throw new ApiError(400, 'Les mots de passe ne correspondent pas');
        await api<{ user: Me }>('/auth/register', { body: { email: f.get('email'), username: f.get('username'), password: f.get('password') } });
      } else {
        await api<{ user: Me }>('/auth/login', { body: { login: f.get('login'), password: f.get('password') } });
      }
      await refresh();
      router.replace(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">{mode === 'login' ? 'Bon retour à la table' : 'Rejoindre le cercle'}</h1>
            <p className="mt-1 text-sm text-muted">{mode === 'login' ? 'Connectez-vous pour retrouver vos amis.' : 'Créez votre compte en quelques secondes.'}</p>
          </div>
          {mode === 'register' ? (
            <>
              <Input name="email" type="email" label="E-mail" autoComplete="email" required />
              <Input name="username" label="Pseudonyme" autoComplete="username" required minLength={3} maxLength={20} hint="3 à 20 caractères : lettres, chiffres, _ . -" />
              <Input name="password" type="password" label="Mot de passe" autoComplete="new-password" required minLength={8} hint="8 caractères minimum" />
              <Input name="confirm" type="password" label="Confirmer" autoComplete="new-password" required minLength={8} />
            </>
          ) : (
            <>
              <Input name="login" label="E-mail ou pseudonyme" autoComplete="username" required />
              <Input name="password" type="password" label="Mot de passe" autoComplete="current-password" required />
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#ffb3ba] ring-1 ring-danger/30">{error}</p>}
          <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </Button>
          <p className="text-center text-sm text-muted">
            {mode === 'login' ? (
              <>Pas encore de compte ? <Link className="text-gold-300 hover:underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Inscrivez-vous</Link></>
            ) : (
              <>Déjà inscrit ? <Link className="text-gold-300 hover:underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Connectez-vous</Link></>
            )}
          </p>
        </form>
        <p className="mt-6 text-center text-xs text-faint">Jetons virtuels uniquement, sans aucune valeur monétaire.</p>
      </div>
    </div>
  );
}
