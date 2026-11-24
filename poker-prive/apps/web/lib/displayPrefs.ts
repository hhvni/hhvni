'use client';
/**
 * Préférences d'affichage partagées par toute l'application (mémorisées dans
 * le navigateur) : jeu 4 couleurs et affichage des montants en grosses blindes.
 */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { compact, fmt } from './format';

export interface DisplayPrefs {
  fourColor: boolean;
  bbMode: boolean;
  /** Raccourcis clavier à la table (ordinateur). */
  keyboard: boolean;
  /** Affiche « votre main » (paire, tirages…) à côté de ses cartes. */
  handHint: boolean;
}

const KEY = 'pp-display-prefs';
const DEFAULTS: DisplayPrefs = { fourColor: true, bbMode: false, keyboard: true, handHint: true };
let current: DisplayPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): DisplayPrefs {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DisplayPrefs>) };
    } catch {
      /* stockage indisponible */
    }
  }
  return current;
}

export function setDisplayPrefs(p: Partial<DisplayPrefs>): void {
  current = { ...load(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useDisplayPrefs(): DisplayPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    () => DEFAULTS,
  );
}

/** Grosse blinde courante de la table (null hors table). */
export const BigBlindContext = createContext<number | null>(null);

/** Formate un nombre de grosses blindes : 0,5 BB · 1 BB · 24,5 BB · 100 BB. */
export function formatBB(chips: number, bb: number): string {
  const v = chips / bb;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 })} BB`;
}

/**
 * Formateur de montants qui respecte le choix jetons / grosses blindes.
 * `full` : montant complet (sinon forme compacte « 12,5 k »).
 */
export function useMoney(): (chips: number, full?: boolean) => string {
  const { bbMode } = useDisplayPrefs();
  const bb = useContext(BigBlindContext);
  return useCallback(
    (chips: number, full?: boolean) => (bbMode && bb ? formatBB(chips, bb) : full ? fmt(chips) : compact(chips)),
    [bbMode, bb],
  );
}
