'use client';
/**
 * Décor du tapis « noir et or » : ligne de mise dorée, séparations entre les
 * places, numéros de siège, porte-gobelets chromés, bac du croupier et grand
 * pique scintillant. Dessin vectoriel calculé à la taille réelle de la table.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

interface Rect { x: number; y: number; w: number; h: number }

function stadiumPath({ x, y, w, h }: Rect): string {
  if (w >= h) {
    const r = h / 2;
    return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  }
  const r = w / 2;
  return `M${x},${y + r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x},${y + h - r} Z`;
}

function inside(px: number, py: number, { x, y, w, h }: Rect): boolean {
  if (w >= h) {
    const r = h / 2;
    const cx = Math.max(x + r, Math.min(x + w - r, px));
    return (px - cx) ** 2 + (py - (y + r)) ** 2 <= r * r;
  }
  const r = w / 2;
  const cy = Math.max(y + r, Math.min(y + h - r, py));
  return (px - (x + r)) ** 2 + (py - cy) ** 2 <= r * r;
}

/** Point où un rayon partant de (cx, cy) dans la direction (dx, dy) sort du stade. */
function hit(cx: number, cy: number, dx: number, dy: number, rect: Rect): [number, number] {
  let lo = 0;
  let hi = 4000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inside(cx + dx * mid, cy + dy * mid, rect)) lo = mid;
    else hi = mid;
  }
  return [cx + dx * lo, cy + dy * lo];
}

const SPADE = 'M50 4 C 36 28, 4 44, 4 64 C 4 80, 19 90, 34 88 C 41 87, 46 83, 48 78 C 47 88, 43 95, 35 100 L 65 100 C 57 95, 53 88, 52 78 C 54 83, 59 87, 66 88 C 81 90, 96 80, 96 64 C 96 44, 64 28, 50 4 Z';

/** Petits éclats dorés (positions fixes, pseudo-aléatoires). */
const SPARKS = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const u = a - Math.floor(a);
  const v = b - Math.floor(b);
  return { x: (u - 0.5) * 2.4, y: 0.15 + v * v * 1.05, r: 0.6 + ((u * 7) % 1) * 1.6, d: (v * 4) % 4 };
});

export function FeltDecor({
  n, rotation, insetX, insetY, feltInset, seatRx, seatRy, occupied,
}: {
  n: number;
  /** Sièges occupés (par numéro de siège) : leur numéro n'est pas affiché. */
  occupied?: boolean[];
  rotation: number;
  /** Retraits du rail en fraction du conteneur */
  insetX: number;
  insetY: number;
  /** Épaisseur du rail en pixels */
  feltInset: number;
  /** Rayons de l'ellipse des sièges (en % du conteneur) */
  seatRx: number;
  seatRy: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const { w: W, h: H } = size;
    if (W < 50 || H < 50) return null;
    const felt: Rect = { x: W * insetX + feltInset, y: H * insetY + feltInset, w: W * (1 - 2 * insetX) - 2 * feltInset, h: H * (1 - 2 * insetY) - 2 * feltInset };
    const k = Math.min(felt.w, felt.h) * 0.2;
    const inner: Rect = { x: felt.x + k, y: felt.y + k, w: felt.w - 2 * k, h: felt.h - 2 * k };
    const cx = W / 2;
    const cy = H / 2;
    const dir = (a: number) => {
      const dx = (seatRx / 100) * W * Math.cos(a);
      const dy = (seatRy / 100) * H * Math.sin(a);
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l] as const;
    };
    const lines: [number, number, number, number][] = [];
    const cups: [number, number][] = [];
    const labels: { x: number; y: number; t: string }[] = [];
    for (let i = 0; i < n; i++) {
      const [bx, by] = dir(Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / n);
      const [ix, iy] = hit(cx, cy, bx, by, inner);
      const [ox, oy] = hit(cx, cy, bx, by, felt);
      lines.push([ix, iy, ox, oy]);
      cups.push([ox - bx * 16, oy - by * 16]);
      const [sx, sy] = dir(Math.PI / 2 + (2 * Math.PI * i) / n);
      const [jx, jy] = hit(cx, cy, sx, sy, inner);
      const [px, py] = hit(cx, cy, sx, sy, felt);
      labels.push({ x: jx + (px - jx) * 0.32, y: jy + (py - jy) * 0.32, t: String(((i + rotation) % n) + 1) });
    }
    const spadeSize = Math.min(inner.w, inner.h) * 0.62;
    return { felt, inner, lines, cups, labels, cx, cy, spadeSize, W, H };
  }, [size, n, rotation, insetX, insetY, feltInset, seatRx, seatRy]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden>
      {g && (
        <svg width={g.W} height={g.H} className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6dea0" />
              <stop offset="0.5" stopColor="#d9ad4f" />
              <stop offset="1" stopColor="#9c7424" />
            </linearGradient>
            <radialGradient id="chrome" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#b9bec7" />
              <stop offset="1" stopColor="#4b5059" />
            </radialGradient>
            <radialGradient id="sparkGlow">
              <stop offset="0" stopColor="#ffe8a8" stopOpacity="1" />
              <stop offset="0.4" stopColor="#ff9a2e" stopOpacity="0.8" />
              <stop offset="1" stopColor="#ff7a00" stopOpacity="0" />
            </radialGradient>
            <clipPath id="feltClip"><path d={stadiumPath(g.felt)} /></clipPath>
          </defs>

          <g clipPath="url(#feltClip)">
            {/* Grand pique doré scintillant */}
            <g transform={`translate(${g.cx - g.spadeSize / 2}, ${g.cy - g.spadeSize * 0.62}) scale(${g.spadeSize / 100})`} opacity="0.75">
              <path d={SPADE} fill="rgba(217,173,79,0.06)" stroke="url(#gold)" strokeWidth={100 / g.spadeSize * 1.6} />
              {SPARKS.map((s, i) => (
                <circle key={i} cx={50 + s.x * 40} cy={60 + s.y * 40} r={s.r} fill="url(#sparkGlow)" className="animate-[twinkle_3s_ease-in-out_infinite]" style={{ animationDelay: `${s.d}s` }} />
              ))}
            </g>

            {/* Ligne de mise et séparations des places */}
            <path d={stadiumPath(g.inner)} fill="none" stroke="url(#gold)" strokeWidth="2" opacity="0.9" />
            {g.lines.map(([a, b, c, d], i) => (
              <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="url(#gold)" strokeWidth="2" opacity="0.85" />
            ))}

            {/* Numéros des places */}
            {g.labels.map((l, i) => occupied?.[(i + rotation) % n] ? null : (
              <text key={i} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.55)" fontSize={Math.max(14, Math.min(26, g.felt.h * 0.06))} fontFamily="var(--font-display), Georgia, serif" fontWeight="700">
                {l.t}
              </text>
            ))}

            {/* Bac du croupier */}
            <g transform={`translate(${g.cx}, ${g.inner.y + Math.min(26, g.inner.h * 0.09)})`} opacity="0.85">
              <rect x={-Math.min(70, g.inner.w * 0.14)} y={-9} width={Math.min(140, g.inner.w * 0.28)} height={18} rx={3} fill="#050506" stroke="url(#gold)" strokeWidth="1" />
              {Array.from({ length: 7 }, (_, i) => {
                const w = Math.min(140, g.inner.w * 0.28);
                return <line key={i} x1={-w / 2 + (w / 8) * (i + 1)} y1={-6} x2={-w / 2 + (w / 8) * (i + 1)} y2={6} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />;
              })}
            </g>
          </g>

          {/* Porte-gobelets chromés */}
          {g.cups.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={Math.max(6, Math.min(10, g.felt.h * 0.022))} fill="url(#chrome)" />
              <circle cx={x} cy={y} r={Math.max(4, Math.min(7, g.felt.h * 0.015))} fill="#2a2d33" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
