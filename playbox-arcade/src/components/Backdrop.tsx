import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { palette } from '../theme';
import { useSvgId } from './Gradient';

/** Fond d'écran : dégradé nuit + halos colorés + grille de points arcade. */
export const Backdrop = memo(function Backdrop({ tint = palette.violet, tint2 = palette.coral }: { tint?: string; tint2?: string }) {
  const id = useSvgId('bd');
  const dots: React.ReactNode[] = [];
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 12; x++) {
      if ((x + y) % 2 === 0) dots.push(<Circle key={`${x}-${y}`} cx={x * 36 + 18} cy={y * 36 + 18} r={1.1} fill="#FFFFFF" opacity={0.05} />);
    }
  }
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 430 1000">
      <Defs>
        <LinearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.night2} />
          <Stop offset="1" stopColor={palette.night} />
        </LinearGradient>
        <RadialGradient id={`${id}a`} cx="0.1" cy="0.05" r="0.6">
          <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} cx="1" cy="0.75" r="0.6">
          <Stop offset="0" stopColor={tint2} stopOpacity={0.25} />
          <Stop offset="1" stopColor={tint2} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="430" height="1000" fill={`url(#${id}bg)`} />
      <Rect width="430" height="1000" fill={`url(#${id}a)`} />
      <Rect width="430" height="1000" fill={`url(#${id}b)`} />
      {dots}
    </Svg>
  );
});
