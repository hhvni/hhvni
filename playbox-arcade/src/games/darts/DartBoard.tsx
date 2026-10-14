import React, { memo } from 'react';
import { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { palette, svgFont } from '../../theme';
import { RINGS_MM, SECTORS } from './logic';

function arc(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 0 1 ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
}

/** Cible de fléchettes vectorielle, dimensions réglementaires. */
export const DartBoard = memo(function DartBoard({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  const k = radius / RINGS_MM.doubleOut;
  const ring = (mm: number) => mm * k;
  const segs: React.ReactNode[] = [];
  SECTORS.forEach((n, i) => {
    const a1 = ((-90 - 9 + i * 18) * Math.PI) / 180;
    const a2 = a1 + (18 * Math.PI) / 180;
    const dark = i % 2 === 0;
    const single = dark ? '#1A1E3D' : '#EDE4D0';
    const multi = dark ? palette.coral : palette.green;
    segs.push(
      <G key={n}>
        <Path d={arc(cx, cy, ring(RINGS_MM.outerBull), ring(RINGS_MM.tripleIn), a1, a2)} fill={single} />
        <Path d={arc(cx, cy, ring(RINGS_MM.tripleIn), ring(RINGS_MM.tripleOut), a1, a2)} fill={multi} />
        <Path d={arc(cx, cy, ring(RINGS_MM.tripleOut), ring(RINGS_MM.doubleIn), a1, a2)} fill={single} />
        <Path d={arc(cx, cy, ring(RINGS_MM.doubleIn), ring(RINGS_MM.doubleOut), a1, a2)} fill={multi} />
      </G>,
    );
  });
  const numbers = SECTORS.map((n, i) => {
    const a = ((-90 + i * 18) * Math.PI) / 180;
    const r = radius * 1.12;
    return (
      <SvgText
        key={n}
        x={cx + r * Math.cos(a)}
        y={cy + r * Math.sin(a) + 5}
        fontSize={radius * 0.095}
        fontWeight="900" fontFamily={svgFont}
        fill={palette.offWhite}
        textAnchor="middle"
      >
        {n}
      </SvgText>
    );
  });
  return (
    <G>
      <Circle cx={cx} cy={cy + 6} r={radius * 1.26} fill="#000" opacity={0.35} />
      <Circle cx={cx} cy={cy} r={radius * 1.24} fill="#141836" stroke="#3A4290" strokeWidth={3} />
      <Circle cx={cx} cy={cy} r={radius * 1.03} fill="#0B0E22" />
      {segs}
      <Circle cx={cx} cy={cy} r={ring(RINGS_MM.outerBull)} fill={palette.green} stroke="#C9CCE0" strokeWidth={0.6} />
      <Circle cx={cx} cy={cy} r={ring(RINGS_MM.bull)} fill={palette.coral} stroke="#C9CCE0" strokeWidth={0.6} />
      {[RINGS_MM.tripleIn, RINGS_MM.tripleOut, RINGS_MM.doubleIn, RINGS_MM.doubleOut].map((mm) => (
        <Circle key={mm} cx={cx} cy={cy} r={ring(mm)} fill="none" stroke="#C9CCE0" strokeWidth={0.6} opacity={0.8} />
      ))}
      {numbers}
    </G>
  );
});
