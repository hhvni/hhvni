'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import { compact } from '@/lib/format';
import { Avatar, cx, PageLoader, useToast } from './ui';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx('flex items-center gap-2.5', className)} aria-label="Cercle Privé — accueil">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 via-gold-500 to-gold-600 shadow-[0_6px_18px_-4px_rgba(236,201,119,0.55)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#0a101c" aria-hidden>
          <path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 6.6 3.05L10 20h4l-.6-3.95A4 4 0 0 0 20 13c0-4.5-5-7-8-11z" />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-wide">
        Cercle <span className="gold-text">Privé</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: '/dashboard', label: 'Accueil', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/friends', label: 'Amis', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0' },
  { href: '/leaderboard', label: 'Classement', icon: 'M8 21V11M16 21V7M12 21V3M4 21h16' },
  { href: '/profile', label: 'Profil', icon: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-8 10a8 8 0 0 1 16 0' },
];

/** Gabarit des pages authentifiées : en-tête desktop + barre d'onglets mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, me, router, pathname]);
  if (!me) return <PageLoader />;
  const nav = me.role === 'ADMIN' ? [...NAV, { href: '/admin', label: 'Admin', icon: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z' }] : NAV;
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-night-900/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cx('rounded-lg px-3 py-2 text-sm font-medium transition', pathname.startsWith(n.href) ? 'bg-white/8 text-ink' : 'text-muted hover:text-ink')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="flex items-center gap-2 rounded-full bg-night-950/60 py-1 pl-3 pr-1 ring-1 ring-gold-400/25" title="Solde de jetons virtuels">
              <ChipIcon />
              <span className="text-sm font-semibold tabular text-gold-300">{compact(me.chips)}</span>
              <Avatar name={me.username} url={me.avatarUrl} size={28} />
            </Link>
            <button onClick={() => void logout()} className="hidden rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink sm:block" title="Se déconnecter" aria-label="Se déconnecter">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-white/8 bg-night-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', pathname.startsWith(n.href) ? 'text-gold-300' : 'text-muted')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ChipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#d9ad4f" />
      <circle cx="12" cy="12" r="7.5" fill="#0d1524" stroke="#f6dea0" strokeWidth="1.2" strokeDasharray="2.4 2" />
      <circle cx="12" cy="12" r="4" fill="#ecc977" />
    </svg>
  );
}

/**
 * Pont de notifications temps réel : invitations, demandes d'amis,
 * bannissement. Monté une fois dans le layout.
 */
export function NotificationsBridge() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!me) return;
    const s = getSocket();
    const onInvite = (p: { roomName: string; from: string; code: string; gameId: string | null }) => {
      toast(`${p.from} vous invite dans « ${p.roomName} »`, 'info', {
        label: 'Rejoindre',
        onClick: () => router.push(p.gameId ? `/join/${p.code}?game=${p.gameId}` : `/join/${p.code}`),
      });
    };
    const onFriends = (p: { request?: string }) => {
      if (p.request) toast(`${p.request} vous a envoyé une demande d'ami`, 'info', { label: 'Voir', onClick: () => router.push('/friends') });
      setTick((t) => t + 1);
    };
    const onBanned = () => void refresh();
    const onRemoved = (p: { banned: boolean }) => toast(p.banned ? 'Vous avez été banni d’un salon' : 'Vous avez été retiré d’un salon', 'error');
    s.on('invite', onInvite);
    s.on('friends:update', onFriends);
    s.on('account:banned', onBanned);
    s.on('room:removed', onRemoved);
    return () => {
      s.off('invite', onInvite);
      s.off('friends:update', onFriends);
      s.off('account:banned', onBanned);
      s.off('room:removed', onRemoved);
    };
  }, [me, toast, router, refresh]);
  return null;
}
