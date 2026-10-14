import { translate } from '../i18n';
import { fr } from '../i18n/fr';
import { GAMES } from '../games/registry';
import { ACHIEVEMENTS } from '../store/achievements';
import { CHALLENGE_POOL } from '../store/daily';
import { COSMETICS } from '../store/cosmetics';

jest.mock('../audio/sounds', () => ({ sounds: { play: jest.fn(), haptic: jest.fn(), startMusic: jest.fn() }, feedback: jest.fn() }));

describe('i18n', () => {
  it('interpole les paramètres', () => {
    expect(translate('fr', 'common.level', { n: 4 })).toBe('Niv. 4');
  });

  it('retombe sur le français quand une clé manque en anglais', () => {
    expect(translate('en', 'common.play')).toBe('Play');
    expect(translate('en', 'settings.title')).toBe(fr.settings.title);
  });

  it('possède un texte pour chaque jeu, succès, défi et objet', () => {
    for (const g of GAMES) {
      expect(translate('fr', g.title)).not.toBe(g.title);
      expect(translate('fr', g.description)).not.toBe(g.description);
      if (g.status === 'available') {
        expect(g.component).toBeDefined();
        expect(translate('fr', g.howTo).length).toBeGreaterThan(10);
      }
    }
    const t = (k: string) => translate('fr', k as never);
    for (const a of ACHIEVEMENTS) expect(t(`achievements.${a.id}.name`)).not.toBe(`achievements.${a.id}.name`);
    for (const c of CHALLENGE_POOL) expect(t(`challenges.${c.id}`)).not.toBe(`challenges.${c.id}`);
    for (const c of COSMETICS) expect(t(`cosmetics.${c.id}`)).not.toBe(`cosmetics.${c.id}`);
  });
});
