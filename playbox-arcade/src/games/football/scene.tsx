import React, { memo } from 'react';
import { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { palette } from '../../theme';
import type { GoalGeo } from './logic';

/** Pelouse rayée en perspective, surface de réparation et tribune stylisée. */
export const Pitch = memo(function Pitch({ h, g, w = 400, spot = true }: { h: number; g: GoalGeo; w?: number; spot?: boolean }) {
  const stripes = 9;
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < stripes; i++) {
    const y0 = g.bottom + ((h - g.bottom) * Math.pow(i / stripes, 1.4));
    const y1 = g.bottom + ((h - g.bottom) * Math.pow((i + 1) / stripes, 1.4));
    rows.push(<Rect key={i} x={0} y={y0} width={w} height={y1 - y0 + 1} fill={i % 2 ? '#139E5E' : '#0E8A50'} />);
  }
  const boxTop = g.bottom;
  const boxBottom = g.bottom + (h - g.bottom) * 0.42;
  return (
    <G>
      <Defs>
        <LinearGradient id="fbSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B1E4A" />
          <Stop offset="1" stopColor="#163A7A" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={g.bottom} fill="url(#fbSky)" />
      {/* tribune */}
      <Rect x={0} y={g.top - 70} width={w} height={70} fill="#0A1636" />
      {Array.from({ length: 60 }, (_, i) => (
        <Circle
          key={i}
          cx={(i * 37) % w}
          cy={g.top - 60 + ((i * 13) % 55)}
          r={2.6}
          fill={[palette.sky, palette.yellow, palette.offWhite, palette.mint][i % 4]}
          opacity={0.35}
        />
      ))}
      {/* projecteurs */}
      {[40, w - 40].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={g.top - 100} r={44} fill={palette.offWhite} opacity={0.06} />
          <Rect x={x - 18} y={g.top - 108} width={36} height={14} rx={4} fill="#DDE6FF" />
          <Rect x={x - 2} y={g.top - 94} width={4} height={24} fill="#5A6496" />
        </G>
      ))}
      <Rect x={0} y={g.top - 14} width={w} height={g.bottom - g.top + 14} fill="#0E3B2C" />
      {rows}
      <Path
        d={`M ${g.left - 40} ${boxTop} L ${g.right + 40} ${boxTop} L ${w + 60} ${boxBottom} L ${-60} ${boxBottom} Z`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={2.5}
      />
      <Path
        d={`M ${g.left + 20} ${boxTop} L ${g.right - 20} ${boxTop} L ${g.right + 10} ${boxTop + (boxBottom - boxTop) * 0.35} L ${g.left - 10} ${boxTop + (boxBottom - boxTop) * 0.35} Z`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.45}
        strokeWidth={2}
      />
      {spot && <Ellipse cx={w / 2} cy={h * 0.79} rx={5} ry={2.5} fill="#FFFFFF" opacity={0.7} />}
    </G>
  );
}, (a, b) => a.h === b.h && a.w === b.w && a.spot === b.spot);

/** Cages : filet, poteaux et barre. `bulge` (0..1) déforme le filet après un but. */
export function Goal({ g, bulge = 0, bulgeU = 0.5, bulgeV = 0.5 }: { g: GoalGeo; bulge?: number; bulgeU?: number; bulgeV?: number }) {
  const depth = 26;
  const net: React.ReactNode[] = [];
  const bx = g.left + bulgeU * g.width;
  const by = g.bottom - bulgeV * g.height;
  const push = (x: number, y: number) => {
    if (!bulge) return { x, y };
    const d = Math.hypot(x - bx, y - by);
    const f = Math.max(0, 1 - d / 70) * bulge * 12;
    return { x: x + ((x - bx) / (d || 1)) * f * 0.3, y: y - f };
  };
  for (let i = 0; i <= 14; i++) {
    const x = g.left + (g.width * i) / 14;
    const a = push(x, g.top);
    const b = push(x, g.bottom);
    net.push(<Line key={`v${i}`} x1={a.x} y1={a.y - depth * 0.3} x2={b.x} y2={b.y} stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1} />);
  }
  for (let j = 0; j <= 6; j++) {
    const y = g.top + (g.height * j) / 6;
    const a = push(g.left, y);
    const b = push(g.right, y);
    net.push(<Line key={`h${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1} />);
  }
  const post = 6;
  return (
    <G>
      <Rect x={g.left} y={g.top - depth * 0.3} width={g.width} height={g.height + depth * 0.3} fill="#0A2A20" opacity={0.65} />
      {net}
      <Rect x={g.left - post / 2} y={g.top - post / 2} width={post} height={g.height + post / 2} fill={palette.offWhite} />
      <Rect x={g.right - post / 2} y={g.top - post / 2} width={post} height={g.height + post / 2} fill={palette.offWhite} />
      <Rect x={g.left - post / 2} y={g.top - post / 2} width={g.width + post} height={post} fill={palette.offWhite} />
      <Rect x={g.left - post / 2} y={g.bottom - 1} width={g.width + post} height={2} fill="#FFFFFF" opacity={0.6} />
    </G>
  );
}

/** Gardien stylisé. (x, y) = position des pieds ; `tilt` en degrés pour le plongeon ; `reachUp` lève les bras. */
export function Keeper({ x, y, scale = 1, tilt = 0, reachUp = 0, color = palette.coral }: { x: number; y: number; scale?: number; tilt?: number; reachUp?: number; color?: string }) {
  const armY = -58 + reachUp * -18;
  return (
    <G transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
      <Ellipse cx={0} cy={2} rx={22} ry={5} fill="#000" opacity={0.25} />
      <Rect x={-11} y={-30} width={9} height={30} rx={4} fill="#1A1E3D" />
      <Rect x={2} y={-30} width={9} height={30} rx={4} fill="#1A1E3D" />
      <Rect x={-15} y={-64} width={30} height={38} rx={10} fill={color} />
      <Rect x={-15} y={-50} width={30} height={5} fill={palette.yellow} opacity={0.9} />
      <Line x1={-13} y1={-58} x2={-34} y2={armY} stroke={color} strokeWidth={8} strokeLinecap="round" />
      <Line x1={13} y1={-58} x2={34} y2={armY} stroke={color} strokeWidth={8} strokeLinecap="round" />
      <Circle cx={-36} cy={armY - 2} r={7} fill={palette.yellow} />
      <Circle cx={36} cy={armY - 2} r={7} fill={palette.yellow} />
      <Circle cx={0} cy={-74} r={11} fill="#F2C49B" />
      <Path d="M -11 -77 Q 0 -92 11 -77 Z" fill="#2A1A0A" />
    </G>
  );
}

/** Défenseur du mur. `jump` (0..1) le fait sauter. */
export function Defender({ x, y, scale = 1, jump = 0 }: { x: number; y: number; scale?: number; jump?: number }) {
  return (
    <G transform={`translate(${x} ${y - jump * 18 * scale}) scale(${scale})`}>
      <Ellipse cx={0} cy={2 + jump * 18} rx={16} ry={4} fill="#000" opacity={0.25} />
      <Rect x={-10} y={-30} width={8} height={30} rx={4} fill="#F6F1E7" />
      <Rect x={2} y={-30} width={8} height={30} rx={4} fill="#F6F1E7" />
      <Rect x={-14} y={-64} width={28} height={38} rx={9} fill={palette.violet} />
      <Rect x={-14} y={-60} width={28} height={4} fill={palette.offWhite} opacity={0.6} />
      <Circle cx={0} cy={-74} r={10} fill="#C98B5E" />
      <Rect x={-16} y={-46} width={32} height={10} rx={5} fill={palette.violetLight} />
    </G>
  );
}

/** Cible circulaire posée dans le but (défi précision). */
export function GoalTarget({ x, y, r, points, life }: { x: number; y: number; r: number; points: number; life: number }) {
  const color = points >= 150 ? palette.yellow : points >= 100 ? palette.coral : palette.sky;
  return (
    <G opacity={Math.min(1, life * 3)}>
      <Circle cx={x} cy={y} r={r} fill={color} opacity={0.25} />
      <Circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={3} />
      <Circle cx={x} cy={y} r={r * 0.55} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={x} cy={y} r={r * 0.18} fill={color} />
      <Circle
        cx={x}
        cy={y}
        r={r + 5}
        fill="none"
        stroke={palette.offWhite}
        strokeOpacity={0.7}
        strokeWidth={2}
        strokeDasharray={`${2 * Math.PI * (r + 5) * Math.max(0, life)} ${2 * Math.PI * (r + 5)}`}
        transform={`rotate(-90 ${x} ${y})`}
      />
    </G>
  );
}
