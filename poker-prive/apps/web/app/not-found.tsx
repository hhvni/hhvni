import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-6xl font-bold text-gold-300">404</p>
      <p className="text-muted">Cette page n&apos;existe pas (ou plus).</p>
      <Link href="/dashboard" className="rounded-xl bg-gold-400 px-4 py-2 text-sm font-semibold text-night-950">Retour à l&apos;accueil</Link>
    </div>
  );
}
