import type { Filter } from './pool.js';
import type { Rarity } from './state.js';

/**
 * The primitive things a currency does to an item.
 *
 * Deliberately small. Every currency in the game is one of these or a short
 * sequence of them, and a sequence is how composite effects are expressed —
 * "removes a random modifier and augments a Rare item with a new one" is a
 * `remove` followed by an `add`, and the `add` sees the state the `remove` left.
 * Modelling that as a single opaque "chaos" step is how ordering bugs hide.
 */
export type Operation =
  /** Adds one random modifier from the pool, honouring the filter. */
  | { readonly kind: 'add'; readonly filter?: Filter }
  /** Removes one modifier at random from those the filter admits. */
  | { readonly kind: 'remove'; readonly filter?: Filter }
  /** Strips every modifier. */
  | { readonly kind: 'clear' }
  /** Changes rarity, which changes affix capacity. */
  | { readonly kind: 'setRarity'; readonly rarity: Rarity }
  /** Rerolls numeric values; the modifier set is untouched. */
  | { readonly kind: 'reroll' };

/** What a currency requires of the item before it will apply at all. */
export interface Requirement {
  readonly rarity?: readonly Rarity[] | undefined;
  /** Minimum modifiers that must be present. */
  readonly minMods?: number | undefined;
  /** Whether the currency needs a free slot somewhere. */
  readonly needsOpenSlot?: boolean | undefined;
  /** Almost everything refuses a corrupted item. */
  readonly allowsCorrupted?: boolean | undefined;
}

export interface CurrencyDefinition {
  readonly name: string;
  /**
   * The game's own description, verbatim.
   *
   * Not decoration: `currencies.test.ts` checks every one of these against the
   * scraped dataset, so a patch that changes an effect breaks the build instead
   * of leaving the simulator quietly modelling last league's behaviour.
   */
  readonly description: string;
  readonly requires: Requirement;
  /** Applied in order; each step sees the result of the one before it. */
  readonly steps: readonly Operation[];
}

const rare = ['Rare'] as const;

/**
 * The currencies whose effect is fully determined by their description.
 *
 * Only these. An Omen, a Vaal Orb ("Modifies an item unpredictably") or an
 * Essence does something this table cannot express, and guessing would put
 * invented mechanics behind a confident-looking probability. They are absent,
 * and the simulator reports them as unmodelled rather than approximating.
 */
export const CURRENCIES: readonly CurrencyDefinition[] = [
  {
    name: 'Orb of Transmutation',
    description: 'Upgrades a Normal item to a Magic item with 1 modifier',
    requires: { rarity: ['Normal'] },
    steps: [{ kind: 'setRarity', rarity: 'Magic' }, { kind: 'add' }],
  },
  {
    name: 'Orb of Augmentation',
    description: 'Augments a Magic item with a new random modifier',
    requires: { rarity: ['Magic'], needsOpenSlot: true },
    steps: [{ kind: 'add' }],
  },
  {
    name: 'Regal Orb',
    description: 'Upgrades a Magic item to a Rare item, adding 1 modifier',
    requires: { rarity: ['Magic'] },
    steps: [{ kind: 'setRarity', rarity: 'Rare' }, { kind: 'add' }],
  },
  {
    name: 'Orb of Alchemy',
    description: 'Upgrades a Normal or Magic item to a Rare item with 4 random modifiers',
    requires: { rarity: ['Normal', 'Magic'] },
    steps: [
      { kind: 'clear' },
      { kind: 'setRarity', rarity: 'Rare' },
      { kind: 'add' },
      { kind: 'add' },
      { kind: 'add' },
      { kind: 'add' },
    ],
  },
  {
    name: 'Exalted Orb',
    description: 'Augments a Rare item with a new random modifier',
    requires: { rarity: rare, needsOpenSlot: true },
    steps: [{ kind: 'add' }],
  },
  {
    /**
     * Not a reroll. PoE1's Chaos Orb replaces every modifier; PoE2's replaces
     * exactly one, and plans carried over from PoE1 are wrong about the most
     * used currency in the game.
     */
    name: 'Chaos Orb',
    description:
      'Removes a random modifier and augments a Rare item with a new random modifier',
    requires: { rarity: rare, minMods: 1 },
    steps: [{ kind: 'remove' }, { kind: 'add' }],
  },
  {
    name: 'Orb of Annulment',
    description: 'Removes a random modifier from an item',
    requires: { minMods: 1 },
    steps: [{ kind: 'remove' }],
  },
  {
    name: 'Divine Orb',
    description: 'Randomises the numeric values of modifiers on an item',
    requires: { minMods: 1 },
    steps: [{ kind: 'reroll' }],
  },
];

export const currencyByName = new Map(CURRENCIES.map((c) => [c.name, c]));
