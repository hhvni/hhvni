import type { PartialDict } from './index';

/**
 * Dictionnaire anglais — préparé mais incomplet. Toute clé absente retombe sur le français.
 * Passer `available: true` dans LOCALES quand la traduction est terminée.
 */
export const en: PartialDict = {
  common: {
    play: 'Play',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
};
