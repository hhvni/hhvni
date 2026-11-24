'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { Button, cx, Input, Select, Toggle, useToast } from './ui';

interface Preset {
  label: string;
  description: string;
  mode: 'CASH' | 'TOURNAMENT';
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  levelMinutes?: number;
  breakEvery?: number;
  breakMinutes?: number;
  anteFromLevel?: number;
}

const DEFAULTS = {
  name: '', mode: 'CASH' as 'CASH' | 'TOURNAMENT', maxSeats: 9, startingStack: 10000, smallBlind: 50, bigBlind: 100, ante: 0,
  actionSeconds: 25, timeBankSeconds: 30, reloadMode: 'busted', buyIn: 0, levelMinutes: 10, anteFromLevel: 0,
  breakEvery: 0, breakMinutes: 5, rebuyAllowed: false, rebuyUntilLevel: 4, addonAllowed: false, uiLevel: 'standard',
  minBuyIn: '' as number | '', maxBuyIn: '' as number | '',
  allowStraddle: true, runItTwice: true,
};

/** Création d'une table : préréglages en un clic + paramètres avancés. */
export function CreateGameForm({ roomId, onCreated }: { roomId: string; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [v, setV] = useState(DEFAULTS);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);

  useEffect(() => {
    void api<{ presets: Record<string, Preset> }>(`/rooms/${roomId}/presets`).then((r) => setPresets(r.presets));
  }, [roomId]);

  const set = <K extends keyof typeof DEFAULTS>(k: K, val: (typeof DEFAULTS)[K]) => setV((x) => ({ ...x, [k]: val }));
  const num = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? '' : Number(e.target.value)) as never);

  function applyPreset(key: string) {
    const p = presets[key]!;
    setPreset(key);
    setV((x) => ({ ...x, ...p, name: x.name || p.label, levelMinutes: p.levelMinutes ?? x.levelMinutes, breakEvery: p.breakEvery ?? 0, anteFromLevel: p.anteFromLevel ?? 0 }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = { ...v, name: v.name || (v.mode === 'CASH' ? 'Table cash' : 'Tournoi'), minBuyIn: v.minBuyIn === '' ? undefined : v.minBuyIn, maxBuyIn: v.maxBuyIn === '' ? undefined : v.maxBuyIn };
      const r = await api<{ game: { id: string } }>(`/rooms/${roomId}/games`, { body });
      onCreated(r.game.id);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const bbStack = v.bigBlind ? Math.round(v.startingStack / v.bigBlind) : 0;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Préréglages</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(presets).map(([k, p]) => (
            <button
              type="button"
              key={k}
              onClick={() => applyPreset(k)}
              className={cx('rounded-xl p-3 text-left ring-1 transition', preset === k ? 'bg-gold-400/10 ring-gold-400/60' : 'bg-night-950/40 ring-white/8 hover:ring-white/20')}
            >
              <div className="text-sm font-semibold">{p.label}</div>
              <div className="text-xs text-muted">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nom de la partie" value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={40} placeholder="Table du vendredi" />
        <Select label="Mode" value={v.mode} onChange={(e) => set('mode', e.target.value as 'CASH' | 'TOURNAMENT')}>
          <option value="CASH">Cash game</option>
          <option value="TOURNAMENT">Tournoi (Sit &amp; Go)</option>
        </Select>
        <Input label="Joueurs max" type="number" min={2} max={10} value={v.maxSeats} onChange={num('maxSeats')} />
        <Input label="Tapis de départ" type="number" min={100} step={100} value={v.startingStack} onChange={num('startingStack')} hint={`${bbStack} grosses blinds`} />
        <Input label="Petite blind" type="number" min={1} value={v.smallBlind} onChange={num('smallBlind')} />
        <Input label="Grosse blind" type="number" min={2} value={v.bigBlind} onChange={num('bigBlind')} />
        <Input label="Ante (facultative)" type="number" min={0} value={v.ante} onChange={num('ante')} />
        {v.mode === 'TOURNAMENT' ? (
          <Input label="Durée des niveaux (min)" type="number" min={1} max={120} value={v.levelMinutes} onChange={num('levelMinutes')} hint="Augmentation automatique des blinds" />
        ) : (
          <Select label="Recharge des jetons" value={v.reloadMode} onChange={(e) => set('reloadMode', e.target.value)}>
            <option value="busted">Quand le joueur n&apos;a plus de jetons</option>
            <option value="below">Dès que le tapis est sous le départ</option>
            <option value="none">Interdite</option>
          </Select>
        )}
      </div>

      <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-sm font-medium text-gold-300 hover:underline">
        {advanced ? '− Masquer' : '+ Afficher'} les paramètres avancés
      </button>

      {advanced && (
        <div className="space-y-3 rounded-xl bg-night-950/40 p-4 ring-1 ring-white/6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Délai par action (s)" type="number" min={5} max={120} value={v.actionSeconds} onChange={num('actionSeconds')} />
            <Input label="Time bank (s)" type="number" min={0} max={300} value={v.timeBankSeconds} onChange={num('timeBankSeconds')} />
            <Select label="Niveau d'interface" value={v.uiLevel} onChange={(e) => set('uiLevel', e.target.value)}>
              <option value="simple">Débutant (aides affichées)</option>
              <option value="standard">Standard</option>
              <option value="expert">Expert (épuré)</option>
            </Select>
            {v.mode === 'CASH' ? (
              <>
                <Input label="Cave minimum" type="number" min={0} value={v.minBuyIn} onChange={num('minBuyIn')} placeholder={fmt(Math.max(v.bigBlind * 20, Math.floor(v.startingStack / 2)))} />
                <Input label="Cave maximum" type="number" min={0} value={v.maxBuyIn} onChange={num('maxBuyIn')} placeholder={fmt(v.startingStack * 2)} />
              </>
            ) : (
              <>
                <Input label="Inscription (jetons du solde)" type="number" min={0} value={v.buyIn} onChange={num('buyIn')} hint="0 = gratuit ; sinon répartition aux premières places" />
                <Input label="Ante à partir du niveau" type="number" min={0} max={50} value={v.anteFromLevel} onChange={num('anteFromLevel')} hint="0 = jamais" />
                <Input label="Pause tous les N niveaux" type="number" min={0} max={20} value={v.breakEvery} onChange={num('breakEvery')} hint="0 = aucune pause" />
                <Input label="Durée de la pause (min)" type="number" min={1} max={30} value={v.breakMinutes} onChange={num('breakMinutes')} />
              </>
            )}
          </div>
          {v.mode === 'CASH' && (
            <div className="space-y-1 border-t border-white/6 pt-3">
              <Toggle label="Straddle général autorisé" hint="Un joueur peut déclencher une main où tout le monde pose 2 BB, flop direct (une fois toutes les 15 mains)" checked={v.allowStraddle} onChange={(x) => set('allowStraddle', x)} />
              <Toggle label="Run it twice autorisé" hint="Sur un tapis, les joueurs peuvent accepter de jouer le board deux fois" checked={v.runItTwice} onChange={(x) => set('runItTwice', x)} />
            </div>
          )}
          {v.mode === 'TOURNAMENT' && (
            <div className="space-y-1 border-t border-white/6 pt-3">
              <Toggle label="Rebuy autorisé" hint="Après élimination, pendant les premiers niveaux" checked={v.rebuyAllowed} onChange={(x) => set('rebuyAllowed', x)} />
              {v.rebuyAllowed && <Input label="Rebuy jusqu'au niveau" type="number" min={1} max={50} value={v.rebuyUntilLevel} onChange={num('rebuyUntilLevel')} />}
              <Toggle label="Add-on autorisé" hint="Une fois, pendant la pause ou au dernier niveau de rebuy" checked={v.addonAllowed} onChange={(x) => set('addonAllowed', x)} />
            </div>
          )}
        </div>
      )}

      <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
        Créer la table
      </Button>
    </form>
  );
}
