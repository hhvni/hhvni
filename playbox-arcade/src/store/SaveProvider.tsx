import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEY } from '../config/app';
import type { CategoryId } from '../theme/colors';
import type { CosmeticSlot } from './cosmetics';
import {
  applyGameResult,
  buyCosmetic,
  claimChallenge,
  createSave,
  ensureDaily,
  equipCosmetic,
  migrateSave,
} from './progression';
import type { GameMode, GameResult, Profile, RewardSummary, SaveData, Settings } from './types';

interface SaveContextValue {
  hydrated: boolean;
  settings: Settings;
  profile: Profile;
  updateSettings: (patch: Partial<Settings>) => void;
  setName: (name: string) => void;
  setPreferredMode: (mode: GameMode) => void;
  recordGame: (result: GameResult, category: CategoryId) => RewardSummary;
  claim: (challengeId: string) => void;
  buy: (id: string) => boolean;
  equip: (slot: CosmeticSlot, id: string) => void;
  resetAll: () => Promise<void>;
}

const SaveContext = createContext<SaveContextValue | null>(null);

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SaveData>(() => createSave());
  const [hydrated, setHydrated] = useState(false);
  // Copie synchrone : recordGame doit renvoyer le résumé immédiatement.
  const dataRef = useRef(data);

  const commit = useCallback((next: SaveData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const loaded = raw ? migrateSave(JSON.parse(raw)) : createSave();
        commit({ ...loaded, profile: ensureDaily(loaded.profile) });
      })
      .catch(() => {
        // Sauvegarde illisible : on repart d'un profil neuf plutôt que de bloquer l'app.
      })
      .finally(() => !cancelled && setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, [commit]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [data, hydrated]);

  const updateProfile = useCallback(
    (fn: (p: Profile) => Profile) => {
      const cur = dataRef.current;
      commit({ ...cur, profile: fn(cur.profile) });
    },
    [commit],
  );

  const value = useMemo<SaveContextValue>(
    () => ({
      hydrated,
      settings: data.settings,
      profile: data.profile,
      updateSettings: (patch) => {
        const cur = dataRef.current;
        commit({ ...cur, settings: { ...cur.settings, ...patch } });
      },
      setName: (name) => updateProfile((p) => ({ ...p, name: name.trim().slice(0, 18) || p.name })),
      setPreferredMode: (mode) => updateProfile((p) => ({ ...p, preferredMode: mode })),
      recordGame: (result, category) => {
        const { profile, summary } = applyGameResult(dataRef.current.profile, result, category);
        commit({ ...dataRef.current, profile });
        return summary;
      },
      claim: (id) => updateProfile((p) => claimChallenge(ensureDaily(p), id)),
      buy: (id) => {
        const before = dataRef.current.profile;
        const after = buyCosmetic(before, id);
        if (after === before) return false;
        commit({ ...dataRef.current, profile: after });
        return true;
      },
      equip: (slot, id) => updateProfile((p) => equipCosmetic(p, slot, id)),
      resetAll: async () => {
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        commit(createSave());
      },
    }),
    [data, hydrated, commit, updateProfile],
  );

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave() {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error('useSave doit être utilisé dans <SaveProvider>');
  return ctx;
}
