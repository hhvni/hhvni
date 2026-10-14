import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { CategoryId } from '../theme/colors';
import { palette } from '../theme';

/** Illustrations vectorielles des univers (cartes de l'accueil). */
export function CategoryArt({ id, size = 140 }: { id: CategoryId; size?: number }) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 140 140">
        {id === 'precision' && <PrecisionArt />}
        {id === 'football' && <FootballArt />}
        {id === 'couple' && <CoupleArt />}
      </Svg>
    </View>
  );
}

function PrecisionArt() {
  const rings = ['#F6F1E7', palette.night2, palette.coral, '#F6F1E7', palette.yellow];
  return (
    <G>
      <Circle cx={74} cy={74} r={58} fill="#000" opacity={0.18} />
      {rings.map((c, i) => (
        <Circle key={i} cx={70} cy={70} r={54 - i * 11} fill={c} />
      ))}
      <Circle cx={70} cy={70} r={4} fill={palette.coral} />
      <G transform="translate(72 66) rotate(-40)">
        <Line x1={0} y1={0} x2={0} y2={12} stroke="#D7DBEF" strokeWidth={2.5} />
        <Rect x={-4} y={11} width={8} height={22} rx={3} fill={palette.violet} />
        <Rect x={-1.6} y={33} width={3.2} height={16} fill={palette.offWhite} />
        <Polygon points="0,40 -13,58 -10,66 0,57" fill={palette.coral} />
        <Polygon points="0,40 13,58 10,66 0,57" fill="#FF9A7E" />
      </G>
      <Circle cx={22} cy={26} r={4} fill={palette.yellow} />
      <Circle cx={118} cy={110} r={3} fill={palette.offWhite} opacity={0.8} />
      <Path d="M114 20 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill={palette.offWhite} opacity={0.9} />
    </G>
  );
}

function FootballArt() {
  return (
    <G>
      <Path d="M14 96 V34 H126 V96" stroke={palette.offWhite} strokeWidth={5} fill="none" strokeLinejoin="round" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Line key={i} x1={14 + i * 18.6} y1={34} x2={14 + i * 18.6} y2={96} stroke={palette.offWhite} strokeWidth={1} opacity={0.35} />
      ))}
      {[0, 1, 2].map((i) => (
        <Line key={`h${i}`} x1={14} y1={52 + i * 18} x2={126} y2={52 + i * 18} stroke={palette.offWhite} strokeWidth={1} opacity={0.35} />
      ))}
      <Ellipse cx={70} cy={126} rx={40} ry={6} fill="#000" opacity={0.25} />
      <G transform="translate(78 92)">
        <Circle r={26} fill={palette.offWhite} />
        <Polygon points="0,-9 8.6,-2.8 5.3,7.3 -5.3,7.3 -8.6,-2.8" fill={palette.night2} />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          return <Circle key={i} cx={Math.cos(a) * 21} cy={Math.sin(a) * 21} r={5} fill={palette.night2} />;
        })}
      </G>
      <Path d="M30 112 q 10 -6 20 -2" stroke={palette.yellow} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d="M24 100 q 12 -8 24 -4" stroke={palette.yellow} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.6} />
    </G>
  );
}

function CoupleArt() {
  const heart = 'M0 14 C -18 2, -16 -14, -4 -12 C 0 -11, 0 -8, 0 -6 C 0 -8, 0 -11, 4 -12 C 16 -14, 18 2, 0 14 Z';
  return (
    <G>
      <G transform="translate(52 76) rotate(-12)">
        <Rect x={-30} y={-42} width={60} height={84} rx={10} fill={palette.violetLight} />
        <Rect x={-24} y={-36} width={48} height={72} rx={7} fill="none" stroke={palette.offWhite} strokeWidth={2} opacity={0.6} />
      </G>
      <G transform="translate(86 70) rotate(10)">
        <Rect x={-30} y={-42} width={60} height={84} rx={10} fill={palette.offWhite} />
        <G transform="scale(1.6)">
          <Path d={heart} fill={palette.pink} />
        </G>
      </G>
      <G transform="translate(28 30) scale(0.9)">
        <Path d={heart} fill={palette.rose} />
      </G>
      <G transform="translate(118 112) scale(0.7)">
        <Path d={heart} fill={palette.yellow} />
      </G>
    </G>
  );
}
