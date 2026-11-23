/**
 * Validation stricte des paramètres de partie (aucune valeur du client n'est
 * utilisée sans passer par ce schéma).
 */
import { z } from 'zod';
import { generateBlindStructure, type GameConfig } from '@poker/engine';

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const GameConfigInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    mode: z.enum(['CASH', 'TOURNAMENT']),
    maxSeats: int(2, 10).default(9),
    startingStack: int(100, 10_000_000).default(10000),
    smallBlind: int(1, 1_000_000).default(50),
    bigBlind: int(2, 2_000_000).default(100),
    ante: int(0, 1_000_000).default(0),
    actionSeconds: int(5, 120).default(25),
    timeBankSeconds: int(0, 300).default(30),
    minBuyIn: int(0, 10_000_000).optional(),
    maxBuyIn: int(0, 10_000_000).optional(),
    reloadMode: z.enum(['none', 'busted', 'below']).default('busted'),
    buyIn: int(0, 10_000_000).default(0),
    levelMinutes: int(1, 120).default(10),
    anteFromLevel: int(0, 50).default(0),
    breakEvery: int(0, 20).default(0),
    breakMinutes: int(1, 30).default(5),
    rebuyAllowed: z.boolean().default(false),
    rebuyUntilLevel: int(0, 50).default(4),
    addonAllowed: z.boolean().default(false),
    addonStack: int(0, 10_000_000).optional(),
    uiLevel: z.enum(['simple', 'standard', 'expert']).default('standard'),
  })
  .refine((c) => c.smallBlind <= c.bigBlind, { message: 'La petite blind doit être ≤ à la grosse blind', path: ['smallBlind'] })
  .refine((c) => c.bigBlind * 10 <= c.startingStack, { message: 'Le tapis de départ doit valoir au moins 10 grosses blinds', path: ['startingStack'] })
  .refine((c) => c.ante <= c.bigBlind, { message: "L'ante ne peut dépasser la grosse blind", path: ['ante'] });

export type GameConfigInputT = z.infer<typeof GameConfigInput>;

export function buildGameConfig(input: GameConfigInputT): GameConfig {
  const minBuyIn = input.mode === 'CASH' ? (input.minBuyIn ?? Math.max(input.bigBlind * 20, Math.floor(input.startingStack / 2))) : input.startingStack;
  const maxBuyIn = input.mode === 'CASH' ? (input.maxBuyIn ?? input.startingStack * 2) : input.startingStack;
  if (minBuyIn > maxBuyIn) throw new Error('La cave minimum doit être ≤ cave maximum');
  const blindLevels =
    input.mode === 'TOURNAMENT'
      ? generateBlindStructure({
          startSmallBlind: input.smallBlind,
          startBigBlind: input.bigBlind,
          levelMinutes: input.levelMinutes,
          levels: 30,
          anteFromLevel: input.ante > 0 ? 1 : input.anteFromLevel > 0 ? input.anteFromLevel : null,
          breakEvery: input.breakEvery,
          breakMinutes: input.breakMinutes,
        }).map((l, i) => (i === 0 && input.ante > 0 ? { ...l, ante: input.ante } : l))
      : [];
  return {
    name: input.name,
    mode: input.mode,
    maxSeats: input.maxSeats,
    startingStack: input.startingStack,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    ante: input.ante,
    actionSeconds: input.actionSeconds,
    timeBankSeconds: input.timeBankSeconds,
    minBuyIn,
    maxBuyIn,
    reloadMode: input.reloadMode,
    buyIn: input.mode === 'TOURNAMENT' ? input.buyIn : 0,
    levelMinutes: input.levelMinutes,
    blindLevels,
    rebuyAllowed: input.mode === 'TOURNAMENT' && input.rebuyAllowed,
    rebuyUntilLevel: input.rebuyUntilLevel,
    addonAllowed: input.mode === 'TOURNAMENT' && input.addonAllowed,
    addonStack: input.addonStack ?? input.startingStack,
    uiLevel: input.uiLevel,
  };
}

/** Configurations prêtes à l'emploi proposées à la création d'une partie. */
export const PRESETS: Record<string, Partial<GameConfigInputT> & { label: string; description: string }> = {
  conviviale: { label: 'Partie conviviale', description: '10 000 jetons, blinds 50/100, sans ante', mode: 'CASH', startingStack: 10000, smallBlind: 50, bigBlind: 100, ante: 0 },
  dynamique: { label: 'Partie dynamique', description: '5 000 jetons, blinds 100/200, ante 25', mode: 'CASH', startingStack: 5000, smallBlind: 100, bigBlind: 200, ante: 25 },
  longue: { label: 'Partie longue (tournoi)', description: '20 000 jetons, 50/100, blinds +15 min', mode: 'TOURNAMENT', startingStack: 20000, smallBlind: 50, bigBlind: 100, ante: 0, levelMinutes: 15, breakEvery: 4, breakMinutes: 5 },
  sitngo: { label: 'Sit & Go turbo', description: '5 000 jetons, 25/50, blinds +5 min', mode: 'TOURNAMENT', startingStack: 5000, smallBlind: 25, bigBlind: 50, ante: 0, levelMinutes: 5, anteFromLevel: 4 },
};
