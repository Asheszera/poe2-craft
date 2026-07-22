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

/**
 * Currencies as modified by an omen, for the omens whose effect maps cleanly
 * onto the primitives this simulator already has.
 *
 * These are the advanced combinations a veteran reaches for: forcing an Exalted
 * Orb onto one side, restricting which side an Annul can hit, adding two
 * modifiers at once. Each is grounded in the game's own omen text (pinned by a
 * test), and each is *only* here because its effect is a side filter or a
 * repeat count — things the state machine can compute exactly.
 *
 * Deliberately absent: omens whose effect this simulator cannot compute without
 * data it does not have. "Same type as an existing modifier" (Homogenising),
 * "increase the chance of the corresponding type" (Catalysing) and "remove the
 * lowest level modifier" (Whittling) are real and powerful, but modelling them
 * from a one-line description would be inventing the mechanic. They reach the
 * player through the prompt's omen list, not through a fabricated probability.
 */
export const OMEN_CURRENCIES: readonly CurrencyDefinition[] = [
  {
    name: 'Exalted Orb + Omen of Sinistral Exaltation',
    description: 'your next Exalted Orb will add only prefix modifiers',
    requires: { rarity: rare, needsOpenSlot: true },
    steps: [{ kind: 'add', filter: { side: 'prefix' } }],
  },
  {
    name: 'Exalted Orb + Omen of Dextral Exaltation',
    description: 'your next Exalted Orb will add only suffix modifiers',
    requires: { rarity: rare, needsOpenSlot: true },
    steps: [{ kind: 'add', filter: { side: 'suffix' } }],
  },
  {
    name: 'Exalted Orb + Omen of Greater Exaltation',
    description: 'your next Exalted Orb will add two random modifiers',
    requires: { rarity: rare, needsOpenSlot: true },
    steps: [{ kind: 'add' }, { kind: 'add' }],
  },
  {
    name: 'Orb of Annulment + Omen of Sinistral Annulment',
    description: 'your next Orb of Annulment will remove only prefix modifiers',
    requires: { minMods: 1 },
    steps: [{ kind: 'remove', filter: { side: 'prefix' } }],
  },
  {
    name: 'Orb of Annulment + Omen of Dextral Annulment',
    description: 'your next Orb of Annulment will remove only suffix modifiers',
    requires: { minMods: 1 },
    steps: [{ kind: 'remove', filter: { side: 'suffix' } }],
  },
  {
    name: 'Orb of Annulment + Omen of Greater Annulment',
    description: 'your next Orb of Annulment will remove two modifiers',
    requires: { minMods: 1 },
    steps: [{ kind: 'remove' }, { kind: 'remove' }],
  },
  {
    name: 'Chaos Orb + Omen of Sinistral Erasure',
    description: 'your next Chaos Orb will remove only prefix modifiers',
    requires: { rarity: rare, minMods: 1 },
    steps: [{ kind: 'remove', filter: { side: 'prefix' } }, { kind: 'add' }],
  },
  {
    name: 'Chaos Orb + Omen of Dextral Erasure',
    description: 'your next Chaos Orb will remove only suffix modifiers',
    requires: { rarity: rare, minMods: 1 },
    steps: [{ kind: 'remove', filter: { side: 'suffix' } }, { kind: 'add' }],
  },
  {
    name: 'Regal Orb + Omen of Sinistral Coronation',
    description: 'your next Regal Orb will add only prefix modifiers',
    requires: { rarity: ['Magic'] },
    steps: [{ kind: 'setRarity', rarity: 'Rare' }, { kind: 'add', filter: { side: 'prefix' } }],
  },
  {
    name: 'Regal Orb + Omen of Dextral Coronation',
    description: 'your next Regal Orb will add only suffix modifiers',
    requires: { rarity: ['Magic'] },
    steps: [{ kind: 'setRarity', rarity: 'Rare' }, { kind: 'add', filter: { side: 'suffix' } }],
  },
];

export const currencyByName = new Map(
  [...CURRENCIES, ...OMEN_CURRENCIES].map((c) => [c.name, c]),
);
