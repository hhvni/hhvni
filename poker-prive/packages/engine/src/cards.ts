/**
 * Cartes et jeu de 52 cartes.
 *
 * Une carte est représentée par une chaîne de 2 caractères : rang + couleur.
 *   Rangs   : 2 3 4 5 6 7 8 9 T J Q K A
 *   Couleurs: c (trèfle) d (carreau) h (cœur) s (pique)
 * Exemple : "As" = As de pique, "Td" = Dix de carreau.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

/** Valeur numérique d'un rang : 2..14 (As = 14). */
export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0] as Rank) + 2;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    (RANKS as readonly string[]).includes(value[0]!) &&
    (SUITS as readonly string[]).includes(value[1]!)
  );
}

export function parseCards(text: string): Card[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => {
    if (!isCard(p)) throw new Error(`Carte invalide: ${p}`);
    return p;
  });
}

/** Retourne un jeu neuf ordonné de 52 cartes. */
export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}` as Card);
  return deck;
}

/**
 * Source d'aléa : renvoie un entier uniforme dans [0, maxExclusive).
 * Le serveur injecte `crypto.randomInt` (CSPRNG). Le moteur ne dépend d'aucune
 * source non sécurisée : la valeur par défaut utilise Web Crypto avec rejet
 * pour éviter tout biais modulo.
 */
export type RandomInt = (maxExclusive: number) => number;

export const secureRandomInt: RandomInt = (maxExclusive: number): number => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new Error('maxExclusive invalide');
  }
  const c = (globalThis as { crypto?: { getRandomValues<T extends ArrayBufferView>(a: T): T } }).crypto;
  if (!c) throw new Error('Aucune source aléatoire cryptographique disponible');
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive; // rejet du biais
  const buf = new Uint32Array(1);
  for (;;) {
    c.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % maxExclusive;
  }
};

/** Mélange Fisher-Yates (Durstenfeld) en place, avec une source d'aléa sécurisée. */
export function shuffle<T>(items: T[], rand: RandomInt = secureRandomInt): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

export class Deck {
  private cards: Card[];

  constructor(rand: RandomInt = secureRandomInt, preset?: Card[]) {
    if (preset) {
      if (new Set(preset).size !== preset.length) throw new Error('Jeu prédéfini avec doublons');
      this.cards = [...preset];
    } else {
      this.cards = shuffle(freshDeck(), rand);
    }
  }

  draw(): Card {
    const c = this.cards.shift();
    if (!c) throw new Error('Plus de cartes dans le jeu');
    return c;
  }

  /** Brûle une carte (règle officielle avant flop, turn et river). */
  burn(): Card {
    return this.draw();
  }

  get remaining(): number {
    return this.cards.length;
  }
}
