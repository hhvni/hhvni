import React, { memo } from 'react';
import { Circle, G, Line, Rect } from 'react-native-svg';
import { palette } from '../../theme';

const RING_COLORS = ['#F6F1E7', '#F6F1E7', '#1A1E3D', '#1A1E3D', palette.sky, palette.sky, palette.coral, palette.coral, palette.yellow, palette.yellow];

/** Blason de tir à l'arc sur chevalet. */
export const ArcheryTarget = memo(function ArcheryTarget({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  const legH = radius * 1.4;
  return (
    <G>
      <Line x1={cx - radius * 0.7} y1={cy + radius * 0.6} x2={cx - radius * 0.95} y2={cy + radius + legH} stroke="#6B4A2B" strokeWidth={radius * 0.08} />
      <Line x1={cx + radius * 0.7} y1={cy + radius * 0.6} x2={cx + radius * 0.95} y2={cy + radius + legH} stroke="#6B4A2B" strokeWidth={radius * 0.08} />
      <Rect x={cx - radius * 1.12} y={cy - radius * 1.12} width={radius * 2.24} height={radius * 2.24} rx={radius * 0.12} fill="#D9C7A0" />
      <Rect x={cx - radius * 1.12} y={cy - radius * 1.12} width={radius * 2.24} height={radius * 2.24} rx={radius * 0.12} fill="none" stroke="#B49B6E" strokeWidth={2} />
      {RING_COLORS.map((c, i) => (
        <Circle
          key={i}
          cx={cx}
          cy={cy}
          r={radius * (1 - i / 10)}
          fill={c}
          stroke={i < 2 ? '#9AA0C0' : i < 4 ? '#F6F1E7' : '#1A1E3D'}
          strokeWidth={0.6}
          strokeOpacity={0.6}
        />
      ))}
      <Circle cx={cx} cy={cy} r={radius * 0.05} fill="none" stroke="#1A1E3D" strokeWidth={0.6} />
      <Line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} stroke="#1A1E3D" strokeWidth={0.6} />
    </G>
  );
});
