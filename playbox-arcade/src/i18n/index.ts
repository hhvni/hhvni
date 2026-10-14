import { createContext, useCallback, useContext } from 'react';
import { fr } from './fr';
import { en } from './en';

export type Locale = 'fr' | 'en';

type Dict = typeof fr;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : string };
export type PartialDict = DeepPartial<Dict>;

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T]: T[K] extends string ? K & string : Join<K, Paths<T[K]>> }[keyof T];
export type TKey = Paths<Dict>;
export type TParams = Record<string, string | number>;

/** Langues proposées. `available: false` = dictionnaire incomplet, affiché « bientôt ». */
export const LOCALES: { id: Locale; label: string; available: boolean }[] = [
  { id: 'fr', label: 'Français', available: true },
  { id: 'en', label: 'English', available: false },
];

const dictionaries: Record<Locale, PartialDict> = { fr, en };

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(locale: Locale, key: TKey, params?: TParams): string {
  const raw = lookup(dictionaries[locale], key) ?? lookup(fr, key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export const LocaleContext = createContext<Locale>('fr');

export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: TKey, params?: TParams) => translate(locale, key, params), [locale]);
}

export function useLocale() {
  return useContext(LocaleContext);
}
