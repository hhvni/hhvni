import { Platform, TextStyle } from 'react-native';

export * from './colors';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

const heavy = Platform.select({ ios: 'System', android: 'sans-serif-black', default: undefined });
const condensed = Platform.select({ ios: 'System', android: 'sans-serif-condensed', default: undefined });

export const fonts = { heavy, condensed };

export const type = {
  display: { fontSize: 34, fontWeight: '900', letterSpacing: 1, fontFamily: heavy } as TextStyle,
  title: { fontSize: 24, fontWeight: '900', letterSpacing: 0.5, fontFamily: heavy } as TextStyle,
  heading: { fontSize: 18, fontWeight: '800' } as TextStyle,
  body: { fontSize: 15, fontWeight: '500' } as TextStyle,
  small: { fontSize: 13, fontWeight: '600' } as TextStyle,
  tiny: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 } as TextStyle,
  score: { fontSize: 40, fontWeight: '900', fontFamily: heavy, fontVariant: ['tabular-nums'] } as TextStyle,
};

/** Police des textes dessinés en SVG (le web retombe sinon sur une police à empattements). */
export const svgFont = Platform.select({ web: "'Arial Black', 'Helvetica Neue', Arial, sans-serif", android: 'sans-serif-black', default: undefined });
