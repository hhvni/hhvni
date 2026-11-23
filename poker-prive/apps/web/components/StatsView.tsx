'use client';
import { duration, fmt, signed } from '@/lib/format';
import { Panel, Stat } from './ui';

export interface UserStats {
  gamesPlayed: number;
  handsPlayed: number;
  handsWon: number;
  winRate: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  cumulative: number;
  bestResult: number;
  handsNet: number;
  playSeconds: number | null;
  advanced: { hands: number; vpip: number; pfr: number; threeBet: number; af: number | null; wtsd: number; wsd: number };
}

const ADVANCED: { key: keyof UserStats['advanced']; label: string; help: string; fmt?: (v: number | null) => string }[] = [
  { key: 'vpip', label: 'VPIP', help: "% de mains où le joueur a volontairement mis des jetons préflop" },
  { key: 'pfr', label: 'PFR', help: '% de mains relancées préflop' },
  { key: 'threeBet', label: '3-bet', help: '% de sur-relances préflop quand l’occasion se présente' },
  { key: 'af', label: 'AF', help: 'Facteur d’agressivité après le flop : (mises + relances) / suivis', fmt: (v) => (v === null ? '∞' : v.toLocaleString('fr-FR')) },
  { key: 'wtsd', label: 'WTSD', help: '% d’abattages parmi les mains où le flop a été vu' },
  { key: 'wsd', label: 'W$SD', help: '% d’abattages gagnés' },
];

export function StatsView({ stats }: { stats: UserStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Parties jouées" value={fmt(stats.gamesPlayed)} />
        <Stat label="Mains jouées" value={fmt(stats.handsPlayed)} sub={`${fmt(stats.handsWon)} gagnées`} />
        <Stat label="% de victoires" value={`${stats.winRate.toLocaleString('fr-FR')} %`} sub="mains gagnées / jouées" />
        <Stat label="Tournois gagnés" value={`${stats.tournamentsWon}/${stats.tournamentsPlayed}`} tone="gold" />
        <Stat label="Gains virtuels cumulés" value={signed(stats.cumulative)} tone={stats.cumulative >= 0 ? 'green' : 'red'} />
        <Stat label="Meilleur résultat" value={signed(stats.bestResult)} tone={stats.bestResult >= 0 ? 'green' : 'red'} sub="sur une partie" />
        <Stat label="Bilan des mains" value={signed(stats.handsNet)} tone={stats.handsNet >= 0 ? 'green' : 'red'} />
        {stats.playSeconds !== null && <Stat label="Temps de jeu" value={duration(stats.playSeconds)} />}
      </div>
      <Panel title="Statistiques avancées">
        {stats.advanced.hands === 0 ? (
          <p className="text-sm text-muted">Pas encore de main enregistrée : les statistiques apparaîtront après vos premières parties.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {ADVANCED.map((a) => {
              const v = stats.advanced[a.key];
              return (
                <div key={a.key} className="rounded-xl bg-night-950/40 p-3 ring-1 ring-white/6" title={a.help}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">{a.label}</div>
                  <div className="mt-1 text-xl font-semibold tabular">{a.fmt ? a.fmt(v) : `${(v ?? 0).toLocaleString('fr-FR')} %`}</div>
                  <div className="mt-1 text-[10px] leading-snug text-faint">{a.help}</div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-faint">Calculées sur {fmt(stats.advanced.hands)} mains réellement jouées et enregistrées.</p>
      </Panel>
    </div>
  );
}
