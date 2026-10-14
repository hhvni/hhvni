export const palette = {
  night: '#0A0E27',
  night2: '#11163A',
  surface: '#161D4A',
  surface2: '#1F2862',
  border: '#2C3678',
  violet: '#7B2FF7',
  violetLight: '#A974FF',
  electric: '#3D5AFE',
  coral: '#FF6B4A',
  coralLight: '#FF9A7E',
  mint: '#2EE6A8',
  green: '#16C47F',
  sky: '#3FB8FF',
  yellow: '#FFD23F',
  offWhite: '#F6F1E7',
  pink: '#FF5FA2',
  rose: '#FFA3C8',
  plum: '#5B1E7A',
  red: '#FF4D6D',
  text: '#F6F1E7',
  textMuted: '#A3A9D6',
  textDim: '#6C74A8',
  black: '#05071A',
} as const;

export type CategoryId = 'precision' | 'football' | 'couple';

export interface CategoryTheme {
  primary: string;
  secondary: string;
  accent: string;
  gradient: [string, string];
  soft: string;
}

export const categoryThemes: Record<CategoryId, CategoryTheme> = {
  precision: {
    primary: palette.violet,
    secondary: palette.coral,
    accent: palette.electric,
    gradient: ['#6A1FE8', '#FF6B4A'],
    soft: '#2A1A5E',
  },
  football: {
    primary: palette.green,
    secondary: palette.sky,
    accent: palette.yellow,
    gradient: ['#0FA968', '#2A7FE0'],
    soft: '#0F3A3A',
  },
  couple: {
    primary: palette.pink,
    secondary: palette.violetLight,
    accent: palette.rose,
    gradient: ['#E2468E', '#7B2FF7'],
    soft: '#3A1640',
  },
};
