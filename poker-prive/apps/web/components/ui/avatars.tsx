/**
 * Galerie d'avatars « noir & or » dessinés en SVG (aucune image à charger).
 * Un avatar choisi est stocké sous la forme « preset:<id> ».
 */
import { useId, type ReactNode } from 'react';

export const PRESET_PREFIX = 'preset:';

type Theme = 'noir' | 'or' | 'rouge';
interface Preset { id: string; label: string; theme: Theme; draw: (fill: string) => ReactNode }

const serif = 'Georgia, "Times New Roman", serif';
const glyph = (ch: string, size = 30, dy = 0) => (fill: string) => (
  <text x="32" y={33 + dy} textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize={size} fontWeight="700" fill={fill}>{ch}</text>
);

export const AVATAR_PRESETS: Preset[] = [
  { id: 'spade', label: 'Pique', theme: 'noir', draw: glyph('♠', 34) },
  { id: 'heart', label: 'Cœur', theme: 'rouge', draw: glyph('♥', 34) },
  { id: 'diamond', label: 'Carreau', theme: 'noir', draw: glyph('♦', 34) },
  { id: 'club', label: 'Trèfle', theme: 'or', draw: glyph('♣', 34) },
  {
    id: 'ace', label: 'As', theme: 'noir',
    draw: (f) => (<>
      <text x="32" y="30" textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize="30" fontWeight="700" fill={f}>A</text>
      <text x="32" y="47" textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize="13" fill={f}>♠</text>
    </>),
  },
  { id: 'king', label: 'Roi', theme: 'or', draw: glyph('K', 30) },
  {
    id: 'crown', label: 'Couronne', theme: 'noir',
    draw: (f) => (<>
      <path d="M16 42 L14 23 L24 31 L32 18 L40 31 L50 23 L48 42 Z" fill={f} />
      <rect x="16" y="44" width="32" height="4" rx="1.5" fill={f} />
      <circle cx="14" cy="22" r="2.4" fill={f} /><circle cx="32" cy="17" r="2.4" fill={f} /><circle cx="50" cy="22" r="2.4" fill={f} />
    </>),
  },
  {
    id: 'chip', label: 'Jeton', theme: 'rouge',
    draw: (f) => (<>
      <circle cx="32" cy="32" r="17" fill="none" stroke={f} strokeWidth="5" strokeDasharray="6 4.7" />
      <circle cx="32" cy="32" r="10.5" fill="none" stroke={f} strokeWidth="1.6" />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize="10" fontWeight="700" fill={f}>$</text>
    </>),
  },
  {
    id: 'dice', label: 'Dé', theme: 'noir',
    draw: (f) => (<>
      <rect x="18" y="18" width="28" height="28" rx="6" fill="none" stroke={f} strokeWidth="2.5" transform="rotate(-10 32 32)" />
      {[[25, 25], [39, 25], [32, 32], [25, 39], [39, 39]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={f} transform="rotate(-10 32 32)" />)}
    </>),
  },
  {
    id: 'gem', label: 'Diamant', theme: 'noir',
    draw: (f) => (<>
      <path d="M20 26 L26 18 H38 L44 26 L32 46 Z" fill="none" stroke={f} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M20 26 H44 M26 18 L30 26 L32 46 L34 26 L38 18" fill="none" stroke={f} strokeWidth="1.4" strokeLinejoin="round" />
    </>),
  },
  {
    id: 'star', label: 'Étoile', theme: 'or',
    draw: (f) => <path d="M32 15 L36.9 26.3 L49 27.3 L39.8 35.2 L42.6 47 L32 40.6 L21.4 47 L24.2 35.2 L15 27.3 L27.1 26.3 Z" fill={f} />,
  },
  { id: 'bolt', label: 'Éclair', theme: 'noir', draw: (f) => <path d="M35 14 L21 35 H31 L28 50 L43 28 H33 Z" fill={f} /> },
  {
    id: 'moon', label: 'Lune', theme: 'noir',
    draw: (f) => (<>
      <path d="M38 16 A17 17 0 1 0 47 41 A13 13 0 1 1 38 16 Z" fill={f} />
      <circle cx="44" cy="22" r="1.3" fill={f} /><circle cx="49" cy="30" r="0.9" fill={f} />
    </>),
  },
  {
    id: 'tophat', label: 'Haut-de-forme', theme: 'or',
    draw: (f) => (<>
      <rect x="22" y="16" width="20" height="22" rx="2" fill={f} />
      <rect x="14" y="38" width="36" height="5" rx="2.5" fill={f} />
      <rect x="22" y="31" width="20" height="3" fill="rgba(0,0,0,0.35)" />
    </>),
  },
  {
    id: 'mask', label: 'Masque', theme: 'noir',
    draw: (f) => <path fillRule="evenodd" d="M12 27 C16 22 26 22 32 26 C38 22 48 22 52 27 C52 36 45 41 39 39 C36 38 34 35 32 35 C30 35 28 38 25 39 C19 41 12 36 12 27 Z M19 29 C21 26 26 26 27 30 C24 33 21 33 19 29 Z M45 29 C43 26 38 26 37 30 C40 33 43 33 45 29 Z" fill={f} />,
  },
  {
    id: 'flame', label: 'Flamme', theme: 'rouge',
    draw: (f) => <path d="M32 13 C35 21 44 25 44 36 C44 44 38 50 32 50 C26 50 20 44 20 37 C20 30 25 27 26 21 C29 25 29 29 31 31 C33 26 31 19 32 13 Z" fill={f} />,
  },
  {
    id: 'cards', label: 'Main', theme: 'noir',
    draw: (f) => (<>
      <rect x="18" y="19" width="17" height="25" rx="2.5" fill="none" stroke={f} strokeWidth="2" transform="rotate(-14 26 32)" />
      <rect x="29" y="19" width="17" height="25" rx="2.5" fill={f} transform="rotate(12 38 32)" />
      <text x="38" y="32" textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize="12" fontWeight="700" fill="#0a101c" transform="rotate(12 38 32)">A</text>
    </>),
  },
  { id: 'seven', label: 'Sept', theme: 'rouge', draw: glyph('7', 32) },
  {
    id: 'shark', label: 'Requin', theme: 'noir',
    draw: (f) => <path d="M10 40 C18 38 22 34 26 26 C27 22 29 18 31 16 C31 22 33 27 36 30 C42 31 48 34 54 40 C47 41 40 42 32 42 C24 42 17 41 10 40 Z M28 42 L24 48 L33 42 Z" fill={f} />,
  },
  { id: 'eight', label: 'Huit', theme: 'or', draw: glyph('8', 32) },
];

const THEMES: Record<Theme, { bg: [string, string]; fill: string; ring: string }> = {
  noir: { bg: ['#1a1f2b', '#05070c'], fill: 'gold', ring: '#c9a55a' },
  or: { bg: ['#f6dea0', '#b88a2e'], fill: '#0a0d14', ring: '#fff3cf' },
  rouge: { bg: ['#4a0f17', '#14040a'], fill: 'gold', ring: '#c9a55a' },
};

export function presetOf(url: string | null | undefined): Preset | null {
  if (!url?.startsWith(PRESET_PREFIX)) return null;
  return AVATAR_PRESETS.find((p) => p.id === url.slice(PRESET_PREFIX.length)) ?? null;
}

/** Fond et anneau partagés (avatar choisi ou initiales). */
function Frame({ theme, children }: { theme: Theme; children: (fill: string) => ReactNode }) {
  const t = THEMES[theme];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fill = t.fill === 'gold' ? `url(#${uid}g)` : t.fill;
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`${uid}b`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor={t.bg[0]} />
          <stop offset="1" stopColor={t.bg[1]} />
        </radialGradient>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.45" stopColor="#ecc977" />
          <stop offset="1" stopColor="#a8792a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${uid}b)`} />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke={t.ring} strokeOpacity="0.55" strokeWidth="1.2" />
      {children(fill)}
    </svg>
  );
}

export function PresetAvatar({ preset }: { preset: Preset }) {
  return <Frame theme={preset.theme}>{(fill) => preset.draw(fill)}</Frame>;
}

/** Avatar par défaut : initiales dorées sur fond noir. */
export function InitialsAvatar({ name }: { name: string }) {
  const initials = [...name.replace(/^Robot /, '')].slice(0, 2).join('').toUpperCase();
  return (
    <Frame theme="noir">
      {(fill) => <text x="32" y="33.5" textAnchor="middle" dominantBaseline="central" fontFamily={serif} fontSize={initials.length > 1 ? 23 : 28} fontWeight="700" fill={fill} letterSpacing="0.5">{initials}</text>}
    </Frame>
  );
}
