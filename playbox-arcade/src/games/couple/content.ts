import type { Locale } from '../../i18n';
import * as fr from './content.fr';

export type CoupleContent = typeof fr;

/** Contenu des jeux de couple selon la langue (repli sur le français). */
const BY_LOCALE: Partial<Record<Locale, CoupleContent>> = { fr };

export function coupleContent(locale: Locale): CoupleContent {
  return BY_LOCALE[locale] ?? fr;
}

/** Mélange de Fisher-Yates (copie). */
export function shuffle<T>(items: readonly T[], rnd: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
