'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/AppShell';
import { Button } from '@/components/ui';
import { PlayingCard } from '@/components/poker/PlayingCard';

const FEATURES = [
  { t: 'Salons privés', d: "Un code ou un lien d'invitation à partager sur WhatsApp ou Discord, et vos amis vous rejoignent en un clic." },
  { t: 'Moteur certifié par les tests', d: "Texas Hold'em No-Limit complet : side pots, relances minimales, all-in incomplets, partages et kickers." },
  { t: 'Webcams à la table', d: 'Voyez et entendez vos amis autour du tapis, en pair à pair, caméra et micro toujours facultatifs.' },
  { t: 'Cash game & tournois', d: 'Blinds fixes ou progressives, rebuys, add-ons, pauses et classement final automatique.' },
  { t: 'Statistiques réelles', d: 'VPIP, PFR, 3-bet, AF, WTSD, W$SD calculés à partir de vos mains, et replay main par main.' },
  { t: 'Équitable et sécurisé', d: 'Mélange Fisher-Yates cryptographique côté serveur. Vos cartes ne sont envoyées qu’à vous.' },
];

export default function Home() {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && me) router.replace('/dashboard');
  }, [loading, me, router]);

  return (
    <div className="min-h-dvh overflow-hidden">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5">
        <Logo />
        <div className="flex gap-2">
          <Link href="/login"><Button variant="subtle">Se connecter</Button></Link>
          <Link href="/register"><Button variant="gold">Créer un compte</Button></Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-gold-300 ring-1 ring-gold-400/25">
            Texas Hold&apos;em No-Limit · Jetons virtuels · Entre amis
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="font-display text-4xl font-bold leading-[1.1] sm:text-6xl">
            Votre table de poker <span className="gold-text">privée</span>, ouverte à vos amis.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 max-w-xl text-lg text-muted">
            Créez un salon, partagez le lien, et retrouvez l&apos;ambiance d&apos;une vraie soirée poker : cartes, jetons, chat et webcams, en temps réel.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
            <Link href="/register"><Button variant="gold" size="lg">Commencer gratuitement</Button></Link>
            <Link href="/login"><Button size="lg">J&apos;ai déjà un compte</Button></Link>
          </motion.div>
          <p className="mt-6 text-xs text-faint">Aucun argent réel : aucun dépôt, aucun retrait. Les jetons n&apos;ont aucune valeur monétaire.</p>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', damping: 20 }} className="relative mx-auto aspect-[1.55] w-full max-w-lg">
          <div className="rail absolute inset-0 rounded-[999px] p-3">
            <div className="felt relative h-full w-full overflow-hidden rounded-[999px]">
              <div className="felt-texture absolute inset-0" />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                {(['Ah', 'Kh', 'Qh', 'Jh', 'Th'] as const).map((c, i) => (
                  <motion.div key={c} initial={{ y: -40, opacity: 0, rotateY: 180 }} animate={{ y: 0, opacity: 1, rotateY: 0 }} transition={{ delay: 0.4 + i * 0.12, type: 'spring', damping: 16 }}>
                    <PlayingCard card={c} size="lg" />
                  </motion.div>
                ))}
              </div>
              <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-gold-300">Quinte flush royale</div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="panel p-5">
              <h3 className="font-semibold text-ink">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
