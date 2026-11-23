'use client';
import { motion } from 'framer-motion';
import { rankLabel, SUITS } from '@/lib/format';
import { cx } from '../ui';

const SIZES = {
  xs: { w: 26, h: 36, rank: 12, suit: 11, center: 0 },
  sm: { w: 36, h: 50, rank: 15, suit: 13, center: 18 },
  md: { w: 50, h: 70, rank: 19, suit: 16, center: 26 },
  lg: { w: 62, h: 87, rank: 23, suit: 19, center: 34 },
} as const;

export type CardSize = keyof typeof SIZES;

/** Carte à jouer vectorielle (face ou dos), avec retournement animé. */
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
  const s = SIZES[size];
  const hidden = faceDown || !card;
  const suit = card ? SUITS[card[1]!] : null;
  return (
    <motion.div
      className={cx('relative shrink-0 [perspective:600px]', className)}
      style={{ width: s.w, height: s.h }}
      initial={flip ? { rotateY: 180 } : false}
      animate={{ rotateY: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {hidden ? (
        <div className="card-back h-full w-full rounded-[7px] shadow-[0_4px_10px_rgba(0,0,0,0.45)]" aria-label="Carte cachée" />
      ) : (
        <div
          className={cx(
            'relative flex h-full w-full flex-col rounded-[7px] bg-gradient-to-b from-white to-[#eef1f6] shadow-[0_4px_12px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition',
            highlight && 'ring-2 ring-gold-400 shadow-[0_0_0_2px_rgba(236,201,119,0.6),0_0_18px_rgba(236,201,119,0.55)]',
            dim && 'brightness-[0.55]',
          )}
          aria-label={`${rankLabel(card![0]!)} de ${suit!.name}`}
          style={{ color: suit!.color }}
        >
          <div className="absolute left-[9%] top-[5%] flex flex-col items-center leading-none">
            <span className="font-bold tracking-tighter" style={{ fontSize: s.rank }}>{rankLabel(card![0]!)}</span>
            <span style={{ fontSize: s.suit, marginTop: 1 }}>{suit!.symbol}</span>
          </div>
          {s.center > 0 && (
            <span className="absolute bottom-[6%] right-[9%] leading-none opacity-95" style={{ fontSize: s.center }}>
              {suit!.symbol}
            </span>
          )}
        </div>
      )}
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
