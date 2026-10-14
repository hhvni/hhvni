import React from 'react';
import { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { Cosmetic } from '../../store/cosmetics';
import { palette } from '../../theme';

/** Fléchette dessinée pointe vers le haut ; (x, y) = pointe. */
export function DartSprite({ x, y, scale = 1, skin, rotate = 0, opacity = 1 }: { x: number; y: number; scale?: number; skin: Cosmetic; rotate?: number; opacity?: number }) {
  const { primary, secondary, tertiary } = skin.colors;
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={opacity}>
      <Line x1={0} y1={0} x2={0} y2={10} stroke="#D7DBEF" strokeWidth={1.6} strokeLinecap="round" />
      <Rect x={-2.6} y={9} width={5.2} height={15} rx={2} fill={primary} />
      <Rect x={-2.6} y={12} width={5.2} height={2} fill={tertiary} opacity={0.7} />
      <Rect x={-2.6} y={17} width={5.2} height={2} fill={tertiary} opacity={0.7} />
      <Rect x={-1.2} y={24} width={2.4} height={13} fill={tertiary} />
      <Polygon points="0,30 -9,44 -7,50 0,44" fill={secondary} />
      <Polygon points="0,30 9,44 7,50 0,44" fill={secondary} opacity={0.85} />
      <Line x1={0} y1={30} x2={0} y2={46} stroke={primary} strokeWidth={1.4} />
    </G>
  );
}

/** Ballon de football ; (x, y) = centre. */
export function BallSprite({ x, y, r, skin, spin = 0 }: { x: number; y: number; r: number; skin: Cosmetic; spin?: number }) {
  const { primary, secondary, tertiary } = skin.colors;
  const pent = (cx: number, cy: number, s: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${cx + Math.cos(a) * s},${cy + Math.sin(a) * s}`;
    }).join(' ');
  return (
    <G transform={`translate(${x} ${y}) rotate(${spin})`}>
      <Circle r={r} fill={primary} stroke={tertiary} strokeWidth={r * 0.06} />
      <Polygon points={pent(0, 0, r * 0.36)} fill={secondary} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const cx = Math.cos(a) * r * 0.86;
        const cy = Math.sin(a) * r * 0.86;
        return (
          <G key={i}>
            <Line x1={Math.cos(a) * r * 0.36} y1={Math.sin(a) * r * 0.36} x2={cx * 0.8} y2={cy * 0.8} stroke={secondary} strokeWidth={r * 0.07} />
            <Polygon points={pent(cx, cy, r * 0.2)} fill={secondary} />
          </G>
        );
      })}
      <Ellipse cx={-r * 0.35} cy={-r * 0.4} rx={r * 0.3} ry={r * 0.18} fill="#FFFFFF" opacity={0.25} />
    </G>
  );
}

/** Flèche vue de derrière (empennage) plantée dans la cible. */
export function ArrowNock({ x, y, size = 1, skin }: { x: number; y: number; size?: number; skin: Cosmetic }) {
  const { primary, secondary, tertiary } = skin.colors;
  return (
    <G transform={`translate(${x} ${y}) scale(${size})`}>
      <Circle r={5.5} fill="#000" opacity={0.3} cy={1.5} />
      <Path d="M0 0 L-9 -5 L-7 -1 Z" fill={secondary} />
      <Path d="M0 0 L9 -5 L7 -1 Z" fill={secondary} />
      <Path d="M0 0 L0 10 L-3 8 Z" fill={tertiary} />
      <Path d="M0 0 L0 10 L3 8 Z" fill={tertiary} opacity={0.8} />
      <Circle r={3} fill={primary} stroke="#000" strokeOpacity={0.3} strokeWidth={0.8} />
    </G>
  );
}

/** Flèche de profil en vol, pointe vers le haut. */
export function ArrowSprite({ x, y, scale = 1, skin }: { x: number; y: number; scale?: number; skin: Cosmetic }) {
  const { primary, secondary, tertiary } = skin.colors;
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Polygon points="0,-6 -3,2 3,2" fill="#D7DBEF" />
      <Rect x={-1.3} y={1} width={2.6} height={64} fill={primary} />
      <Polygon points="-1.3,50 -8,62 -8,70 -1.3,62" fill={secondary} />
      <Polygon points="1.3,50 8,62 8,70 1.3,62" fill={secondary} opacity={0.85} />
      <Rect x={-2} y={64} width={4} height={4} fill={tertiary} />
    </G>
  );
}

export function Reticle({ x, y, color = palette.yellow, size = 16 }: { x: number; y: number; color?: string; size?: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={size} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={4} />
      <Circle cx={x} cy={y} r={size} fill="none" stroke={color} strokeWidth={2.2} />
      <Line x1={x - size - 6} y1={y} x2={x - size * 0.4} y2={y} stroke={color} strokeWidth={2.2} />
      <Line x1={x + size * 0.4} y1={y} x2={x + size + 6} y2={y} stroke={color} strokeWidth={2.2} />
      <Line x1={x} y1={y - size - 6} x2={x} y2={y - size * 0.4} stroke={color} strokeWidth={2.2} />
      <Line x1={x} y1={y + size * 0.4} x2={x} y2={y + size + 6} stroke={color} strokeWidth={2.2} />
      <Circle cx={x} cy={y} r={1.8} fill={color} />
    </G>
  );
}
