'use client';
/**
 * Cartes à jouer dessinées en SVG :
 *  - index de coin (haut gauche + bas droit) pour une lecture rapide à la table ;
 *  - cartes numérotées : grand symbole central (petites tailles) ou disposition
 *    traditionnelle des symboles (grande taille) ;
 *  - figures (V, D, R) : médaillon doré avec couronne ;
 *  - As : symbole orné entouré d'un cercle doré ;
 *  - dos noir et or assorti au tapis.
 * Jeu 4 couleurs (pique noir, cœur rouge, carreau bleu, trèfle vert) ou classique.
 */
import { motion } from 'framer-motion';
import { useDisplayPrefs } from '@/lib/displayPrefs';
import { rankLabel } from '@/lib/format';
import { cx } from '../ui';

const SIZES = {
  xs: { w: 26, h: 36 },
  sm: { w: 36, h: 50 },
  md: { w: 50, h: 70 },
  lg: { w: 64, h: 90 },
} as const;
export type CardSize = keyof typeof SIZES;

const SUIT_PATHS: Record<string, string> = {
  s: 'M50 4 C 36 28, 4 44, 4 64 C 4 80, 19 90, 34 88 C 41 87, 46 83, 48 78 C 47 88, 43 95, 35 100 L 65 100 C 57 95, 53 88, 52 78 C 54 83, 59 87, 66 88 C 81 90, 96 80, 96 64 C 96 44, 64 28, 50 4 Z',
  h: 'M50 94 C 22 72, 4 54, 4 32 C 4 15, 16 5, 30 5 C 40 5, 47 11, 50 20 C 53 11, 60 5, 70 5 C 84 5, 96 15, 96 32 C 96 54, 78 72, 50 94 Z',
  d: 'M50 2 Q 68 28 92 50 Q 68 72 50 98 Q 32 72 8 50 Q 32 28 50 2 Z',
  c: 'M50 6 A 21 21 0 0 1 66 41 A 21 21 0 1 1 57 74 Q 59 90 70 100 L 30 100 Q 41 90 43 74 A 21 21 0 1 1 34 41 A 21 21 0 0 1 50 6 Z',
};
const SUIT_NAMES: Record<string, string> = { s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' };
const RANK_NAMES: Record<string, string> = { A: 'As', K: 'Roi', Q: 'Dame', J: 'Valet', T: 'Dix' };

function suitColor(suit: string, fourColor: boolean): string {
  if (suit === 'h') return '#d42a3c';
  if (suit === 'd') return fourColor ? '#1d6fe0' : '#d42a3c';
  if (suit === 'c') return fourColor ? '#0f7a43' : '#141821';
  return '#141821';
}

/** Symbole de couleur dessiné dans un carré (x, y, taille), éventuellement retourné. */
function Suit({ suit, x, y, size, color, flip }: { suit: string; x: number; y: number; size: number; color: string; flip?: boolean }) {
  const s = size / 100;
  const t = flip ? `translate(${x + size}, ${y + size}) scale(${-s}, ${-s})` : `translate(${x}, ${y}) scale(${s})`;
  return <path d={SUIT_PATHS[suit]} transform={t} fill={color} />;
}

/** Positions traditionnelles des symboles (en % de la zone centrale). */
const PIPS: Record<string, [number, number][]> = {
  '2': [[50, 0], [50, 100]],
  '3': [[50, 0], [50, 50], [50, 100]],
  '4': [[0, 0], [100, 0], [0, 100], [100, 100]],
  '5': [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
  '6': [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
  '7': [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
  '8': [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
  '9': [[0, 0], [100, 0], [0, 33], [100, 33], [50, 50], [0, 67], [100, 67], [0, 100], [100, 100]],
  T: [[0, 0], [100, 0], [50, 17], [0, 33], [100, 33], [0, 67], [100, 67], [50, 83], [0, 100], [100, 100]],
};

function Crown({ rank, color }: { rank: string; color: string }) {
  // Couronne (Roi), diadème (Dame), toque à plume (Valet)
  if (rank === 'K') return <path d="M34 52 L38 38 L44 46 L50 34 L56 46 L62 38 L66 52 Z" fill="url(#cardGold)" stroke={color} strokeWidth="0.8" />;
  if (rank === 'Q') return <path d="M36 52 Q 50 36 64 52 Z M50 40 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0" fill="url(#cardGold)" stroke={color} strokeWidth="0.8" />;
  return <path d="M36 52 Q 40 42 50 42 Q 60 42 64 52 Z M58 42 Q 66 32 70 34 Q 64 38 60 44 Z" fill="url(#cardGold)" stroke={color} strokeWidth="0.8" />;
}

function CardFace({ card, size, fourColor }: { card: string; size: CardSize; fourColor: boolean }) {
  const rank = card[0]!;
  const suit = card[1]!;
  const color = suitColor(suit, fourColor);
  const label = rankLabel(rank);
  const tiny = size === 'xs';
  const face = rank === 'K' || rank === 'Q' || rank === 'J';
  const idxFont = tiny ? 46 : label.length > 1 ? 27 : 30;

  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cardPaper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eceff4" />
        </linearGradient>
        <linearGradient id="cardGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dea0" />
          <stop offset="0.5" stopColor="#d9ad4f" />
          <stop offset="1" stopColor="#a87c26" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="140" rx="9" fill="url(#cardPaper)" />
      {!tiny && <rect x="4" y="4" width="92" height="132" rx="6" fill="none" stroke={color} strokeOpacity="0.14" strokeWidth="1.2" />}

      {tiny ? (
        <>
          <text x="50" y="62" textAnchor="middle" fontSize={idxFont} fontWeight="800" fill={color} fontFamily="var(--font-inter), system-ui, sans-serif">{label}</text>
          <Suit suit={suit} x={30} y={74} size={40} color={color} />
        </>
      ) : (
        <>
          {/* Index haut gauche */}
          <text x="17" y="31" textAnchor="middle" fontSize={idxFont} fontWeight="800" fill={color} fontFamily="var(--font-inter), system-ui, sans-serif" letterSpacing="-1">{label}</text>
          <Suit suit={suit} x={7} y={36} size={20} color={color} />
          {/* Index bas droit (retourné) */}
          {size !== 'sm' && (
            <g transform="rotate(180 50 70)">
              <text x="17" y="31" textAnchor="middle" fontSize={idxFont} fontWeight="800" fill={color} fontFamily="var(--font-inter), system-ui, sans-serif" letterSpacing="-1">{label}</text>
              <Suit suit={suit} x={7} y={36} size={20} color={color} />
            </g>
          )}

          {/* Centre */}
          {face ? (
            <g>
              <rect x="29" y="26" width="42" height="88" rx="5" fill={color} fillOpacity="0.07" stroke="url(#cardGold)" strokeWidth="2" />
              <rect x="32" y="29" width="36" height="82" rx="3" fill="none" stroke="url(#cardGold)" strokeOpacity="0.55" strokeWidth="0.7" />
              <g transform="translate(50 46) scale(0.7) translate(-50 -46)"><Crown rank={rank} color={color} /></g>
              <text x="50" y="84" textAnchor="middle" fontSize="30" fontWeight="700" fill={color} fontFamily="var(--font-display), Georgia, serif">{rank}</text>
              <Suit suit={suit} x={43} y={90} size={14} color={color} />
            </g>
          ) : rank === 'A' ? (
            <g>
              <circle cx="50" cy="70" r="21" fill="none" stroke="url(#cardGold)" strokeWidth="1.8" />
              <circle cx="50" cy="70" r="17.5" fill="none" stroke="url(#cardGold)" strokeWidth="0.7" strokeDasharray="2 2.2" />
              <Suit suit={suit} x={37} y={57} size={26} color={color} />
            </g>
          ) : size === 'lg' ? (
            PIPS[rank]?.map(([px, py], i) => (
              <Suit key={i} suit={suit} x={37 + (px / 100) * 26 - 7} y={27 + (py / 100) * 86 - 7} size={14} color={color} flip={py > 50} />
            ))
          ) : (
            <Suit suit={suit} x={32} y={50} size={40} color={color} />
          )}
        </>
      )}
    </svg>
  );
}

/** Dos de carte noir et or. */
function CardBack() {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="backGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dea0" />
          <stop offset="0.5" stopColor="#d9ad4f" />
          <stop offset="1" stopColor="#9c7424" />
        </linearGradient>
        <pattern id="backLattice" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 5 H10 M5 0 V10" stroke="#d9ad4f" strokeOpacity="0.16" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="140" rx="9" fill="#0d0d10" />
      <rect x="0" y="0" width="100" height="140" rx="9" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="5" />
      <rect x="8" y="8" width="84" height="124" rx="5" fill="url(#backLattice)" stroke="url(#backGold)" strokeWidth="1.6" />
      <rect x="12" y="12" width="76" height="116" rx="4" fill="none" stroke="url(#backGold)" strokeOpacity="0.5" strokeWidth="0.6" />
      <path d="M50 44 L72 70 L50 96 L28 70 Z" fill="#0d0d10" stroke="url(#backGold)" strokeWidth="1.4" />
      <g transform="translate(39 58) scale(0.22)">
        <path d={SUIT_PATHS.s} fill="url(#backGold)" />
      </g>
    </svg>
  );
}

/** Carte à jouer (face ou dos), avec retournement animé. */
export function PlayingCard({
  card, size = 'md', faceDown, highlight, dim, className, flip,
}: {
  card?: string | null;
  size?: CardSize;
  faceDown?: boolean;
  highlight?: boolean;
  dim?: boolean;
  className?: string;
  flip?: boolean;
}) {
  const { fourColor } = useDisplayPrefs();
  const s = SIZES[size];
  const hidden = faceDown || !card;
  const label = card ? `${RANK_NAMES[card[0]!] ?? rankLabel(card[0]!)} de ${SUIT_NAMES[card[1]!]}` : 'Carte cachée';
  return (
    <motion.div
      className={cx('relative shrink-0 [perspective:600px]', className)}
      style={{ width: s.w, height: s.h }}
      initial={flip ? { rotateY: 180 } : false}
      animate={{ rotateY: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      role="img"
      aria-label={label}
    >
      <div
        className={cx(
          'h-full w-full overflow-hidden rounded-[7px] shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition',
          !hidden && 'ring-1 ring-black/10',
          highlight && 'shadow-[0_0_0_2px_rgba(236,201,119,0.9),0_0_18px_rgba(236,201,119,0.6)]',
          dim && 'brightness-[0.55]',
        )}
      >
        {hidden ? <CardBack /> : <CardFace card={card!} size={size} fourColor={fourColor} />}
      </div>
    </motion.div>
  );
}

/** Rangée de cartes compacte (historique, replay). */
export function MiniCards({ cards, size = 'xs' }: { cards: (string | null)[]; size?: CardSize }) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {cards.map((c, i) => (
        <PlayingCard key={i} card={c} size={size} faceDown={!c} />
      ))}
    </span>
  );
}
