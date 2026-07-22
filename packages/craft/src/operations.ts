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

/**
 * An omen: a consumable that changes how *one* currency behaves.
 *
 * Modelled as a separate thing the player attaches to a currency, not as a
 * pre-baked "Exalted + Omen" combination, so the interface can let them pair any
 * currency with any omen and the simulator answers whether that pairing does
 * anything — a Dextral Exaltation omen on an Annulment is a real mistake a
 * player can make, and the honest response is to say it has no effect here.
 *
 * `appliesTo` names the currency the omen modifies, taken from the omen's own
 * text ("your next Exalted Orb…"). `modify` rewrites that currency's operations.
 *
 * Only omens whose effect maps onto the simulator's primitives — a side filter
 * or a repeat — are here. "Same type as an existing modifier" (Homogenising),
 * "increase the chance of the corresponding type" (Catalysing) and "remove the
 * lowest level modifier" (Whittling) are real but not computable from a one-line
 * description, so they are left out rather than faked. They still reach the
 * player through the craft prompt's omen list.
 */
export interface Omen {
  readonly name: string;
  /** The omen's effect clause, verbatim from the game (pinned by a test). */
  readonly description: string;
  /** The exact currency name this omen affects. */
  readonly appliesTo: string;
  readonly modify: (steps: readonly Operation[]) => Operation[];
}

/** Adds a side restriction to every operation of one kind. */
const restrict =
  (kind: 'add' | 'remove', side: 'prefix' | 'suffix') =>
  (steps: readonly Operation[]): Operation[] =>
    steps.map((step) =>
      step.kind === kind ? { ...step, filter: { ...step.filter, side } } : step,
    );

/** Repeats every operation of one kind, so the currency does it twice. */
const twice =
  (kind: 'add' | 'remove') =>
  (steps: readonly Operation[]): Operation[] =>
    steps.flatMap((step) => (step.kind === kind ? [step, step] : [step]));

export const OMENS: readonly Omen[] = [
  {
    name: 'Omen of Sinistral Exaltation',
    description: 'your next Exalted Orb will add only prefix modifiers',
    appliesTo: 'Exalted Orb',
    modify: restrict('add', 'prefix'),
  },
  {
    name: 'Omen of Dextral Exaltation',
    description: 'your next Exalted Orb will add only suffix modifiers',
    appliesTo: 'Exalted Orb',
    modify: restrict('add', 'suffix'),
  },
  {
    name: 'Omen of Greater Exaltation',
    description: 'your next Exalted Orb will add two random modifiers',
    appliesTo: 'Exalted Orb',
    modify: twice('add'),
  },
  {
    name: 'Omen of Sinistral Annulment',
    description: 'your next Orb of Annulment will remove only prefix modifiers',
    appliesTo: 'Orb of Annulment',
    modify: restrict('remove', 'prefix'),
  },
  {
    name: 'Omen of Dextral Annulment',
    description: 'your next Orb of Annulment will remove only suffix modifiers',
    appliesTo: 'Orb of Annulment',
    modify: restrict('remove', 'suffix'),
  },
  {
    name: 'Omen of Greater Annulment',
    description: 'your next Orb of Annulment will remove two modifiers',
    appliesTo: 'Orb of Annulment',
    modify: twice('remove'),
  },
  {
    name: 'Omen of Sinistral Erasure',
    description: 'your next Chaos Orb will remove only prefix modifiers',
    appliesTo: 'Chaos Orb',
    modify: restrict('remove', 'prefix'),
  },
  {
    name: 'Omen of Dextral Erasure',
    description: 'your next Chaos Orb will remove only suffix modifiers',
    appliesTo: 'Chaos Orb',
    modify: restrict('remove', 'suffix'),
  },
  {
    name: 'Omen of Sinistral Coronation',
    description: 'your next Regal Orb will add only prefix modifiers',
    appliesTo: 'Regal Orb',
    modify: restrict('add', 'prefix'),
  },
  {
    name: 'Omen of Dextral Coronation',
    description: 'your next Regal Orb will add only suffix modifiers',
    appliesTo: 'Regal Orb',
    modify: restrict('add', 'suffix'),
  },
];

export const omenByName = new Map(OMENS.map((o) => [o.name, o]));

/** One step of a plan: a currency, optionally paired with an omen. */
export interface CraftStep {
  readonly currency: string;
  readonly omen?: string | null | undefined;
}

/**
 * Resolves a step to the operations it runs, or the reason it cannot.
 *
 * The omen compatibility check lives here: pairing an omen with a currency it
 * does not name is not a crash and not a silent no-op — it is reported, so the
 * interface can tell the player the combination does nothing.
 */
export function resolveStep(
  step: CraftStep,
):
  | { readonly ok: true; readonly currency: CurrencyDefinition; readonly steps: readonly Operation[] }
  | { readonly ok: false; readonly reason: string } {
  const currency = currencyByName.get(step.currency);
  if (!currency) return { ok: false, reason: 'currency not modelled' };

  if (!step.omen) return { ok: true, currency, steps: currency.steps };

  const omen = omenByName.get(step.omen);
  if (!omen) return { ok: false, reason: 'omen not modelled' };
  if (omen.appliesTo !== step.currency) {
    return { ok: false, reason: `${step.omen} has no effect on ${step.currency}` };
  }
  return { ok: true, currency, steps: omen.modify(currency.steps) };
}
