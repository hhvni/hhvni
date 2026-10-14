export type CosmeticSlot = 'dart' | 'ball' | 'arrow';

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  price: number;
  colors: { primary: string; secondary: string; tertiary: string };
}

export const COSMETICS: Cosmetic[] = [
  { id: 'dart-classic', slot: 'dart', price: 0, colors: { primary: '#7B2FF7', secondary: '#FF6B4A', tertiary: '#F6F1E7' } },
  { id: 'dart-neon', slot: 'dart', price: 120, colors: { primary: '#2EE6A8', secondary: '#3FB8FF', tertiary: '#0A0E27' } },
  { id: 'dart-gold', slot: 'dart', price: 300, colors: { primary: '#FFD23F', secondary: '#FF9A3F', tertiary: '#5B1E7A' } },
  { id: 'dart-sakura', slot: 'dart', price: 200, colors: { primary: '#FF5FA2', secondary: '#FFA3C8', tertiary: '#F6F1E7' } },
  { id: 'ball-classic', slot: 'ball', price: 0, colors: { primary: '#F6F1E7', secondary: '#11163A', tertiary: '#C9C4BA' } },
  { id: 'ball-neon', slot: 'ball', price: 150, colors: { primary: '#2EE6A8', secondary: '#0A0E27', tertiary: '#1BAE80' } },
  { id: 'ball-gold', slot: 'ball', price: 350, colors: { primary: '#FFD23F', secondary: '#7A4B00', tertiary: '#E0A800' } },
  { id: 'ball-fire', slot: 'ball', price: 220, colors: { primary: '#FF6B4A', secondary: '#FFD23F', tertiary: '#D2401F' } },
  { id: 'arrow-classic', slot: 'arrow', price: 0, colors: { primary: '#C98B4B', secondary: '#FF6B4A', tertiary: '#F6F1E7' } },
  { id: 'arrow-sky', slot: 'arrow', price: 140, colors: { primary: '#DDE6FF', secondary: '#3FB8FF', tertiary: '#3D5AFE' } },
  { id: 'arrow-royal', slot: 'arrow', price: 260, colors: { primary: '#2A1A5E', secondary: '#FFD23F', tertiary: '#A974FF' } },
];

export const DEFAULT_EQUIPPED = { dart: 'dart-classic', ball: 'ball-classic', arrow: 'arrow-classic' } as const;

export function getCosmetic(id: string): Cosmetic {
  return COSMETICS.find((c) => c.id === id) ?? COSMETICS[0];
}
