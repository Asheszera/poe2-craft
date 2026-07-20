import type { CraftAction } from '@poe2/models';
import type { ItemFacts } from './facts.js';

/**
 * A crafting rule.
 *
 * Rules are plain typed objects rather than a JSON DSL. A declarative rule file
 * looks flexible until it needs conditions, arithmetic and null handling — at
 * which point it has become a small programming language with a hand-written
 * interpreter, no type checking and no debugger. Keeping rules in TypeScript
 * gives all of that for free and still isolates them: `when` and `then` may
 * only read `ItemFacts`, so a rule can never reach around the fact layer.
 */
export interface Rule {
  readonly id: string;
  /** Higher wins when several rules fire; also orders the advice list. */
  readonly priority: number;
  readonly when: (facts: ItemFacts) => boolean;
  readonly then: (facts: ItemFacts) => CraftAction;
}

/** Thresholds shared by several rules, named so they read as intent. */
const GOOD = 0.55;
const EXCELLENT = 0.75;
const POOR = 0.4;

const action = (
  partial: Omit<CraftAction, 'successChance' | 'estimatedCost' | 'estimatedProfit'> &
    Partial<Pick<CraftAction, 'successChance'>>,
): CraftAction => ({
  successChance: null,
  // Cost and profit stay null until the price adapters land. Inventing numbers
  // here would be worse than useless: the user cannot tell a guess from a quote.
  estimatedCost: null,
  estimatedProfit: null,
  ...partial,
});

/**
 * The rule catalogue.
 *
 * Ordered by intent, not by priority — priority is a field so that adding a
 * rule never requires renumbering its neighbours.
 */
export const RULES: readonly Rule[] = [
  {
    id: 'frozen-item',
    priority: 100,
    when: (f) => f.isCorrupted || f.isMirrored,
    then: (f) =>
      action({
        action: 'stop',
        label: 'Nothing further can be done',
        reasoning: f.isCorrupted
          ? 'Corrupted items cannot be modified by any currency. Keep it, use it or sell it as is.'
          : 'Mirrored items are permanently locked and cannot be modified.',
        risk: 'none',
      }),
  },

  {
    id: 'normal-base-upgrade',
    priority: 60,
    when: (f) => f.item.rarity === 'Normal' && f.isCraftable,
    then: () =>
      action({
        action: 'orb-of-transmutation',
        label: 'Upgrade to Magic',
        reasoning:
          'A Normal item carries no affixes at all. Transmutation is the cheapest way to find out whether the base is worth developing.',
        risk: 'low',
      }),
  },

  {
    id: 'magic-fill-slot',
    priority: 65,
    when: (f) => f.item.rarity === 'Magic' && f.isCraftable && f.openAffixes > 0,
    then: () =>
      action({
        action: 'orb-of-augmentation',
        label: 'Add the missing affix',
        reasoning:
          'A Magic item has an empty affix slot. Augmentation fills it without risking the roll already there.',
        risk: 'low',
      }),
  },

  {
    id: 'magic-promote',
    priority: 70,
    when: (f) =>
      f.item.rarity === 'Magic' &&
      f.isCraftable &&
      f.openAffixes === 0 &&
      (f.tierQuality ?? 0) >= GOOD,
    then: (f) =>
      action({
        action: 'regal-orb',
        label: 'Promote to Rare',
        reasoning: `Both Magic affixes are decent (tier quality ${(f.tierQuality ?? 0).toFixed(2)}). A Regal Orb keeps them and adds a third, opening the item up to further crafting.`,
        risk: 'low',
      }),
  },

  {
    id: 'rare-add-affix',
    priority: 80,
    when: (f) =>
      f.item.rarity === 'Rare' &&
      f.isCraftable &&
      f.openAffixes > 0 &&
      (f.tierQuality ?? 0) >= GOOD,
    then: (f) =>
      action({
        action: 'exalted-orb',
        label: 'Add an affix with an Exalted Orb',
        reasoning: `${f.openAffixes} slot${f.openAffixes > 1 ? 's are' : ' is'} still open (${f.openPrefixes} prefix, ${f.openSuffixes} suffix) and the existing rolls are worth keeping. An Exalted Orb only adds — it cannot damage what is already there.`,
        risk: 'low',
      }),
  },

  {
    id: 'rare-perfect-values',
    priority: 75,
    when: (f) =>
      f.item.rarity === 'Rare' && f.isCraftable && f.isFull && (f.tierQuality ?? 0) >= EXCELLENT,
    then: () =>
      action({
        action: 'divine-orb',
        label: 'Perfect the numeric rolls',
        reasoning:
          'Every slot is filled with high tiers, so the affixes themselves cannot be improved. A Divine Orb rerolls the numbers within those tiers — the only remaining upgrade.',
        risk: 'low',
      }),
  },

  {
    id: 'rare-remove-weak-affix',
    priority: 55,
    when: (f) =>
      f.item.rarity === 'Rare' &&
      f.isCraftable &&
      f.isFull &&
      f.lowTierCount >= 1 &&
      f.highTierCount >= 2,
    then: (f) => {
      const affixCount = f.prefixes + f.suffixes + f.unclassifiedAffixes;
      return action({
        action: 'orb-of-annulment',
        label: 'Gamble on removing the weak affix',
        // Annulment removes a *random* affix, so the odds are simply the share
        // of the item's affixes that are worth losing. This is computable and
        // therefore stated; everything else stays null.
        successChance: affixCount > 0 ? f.lowTierCount / affixCount : null,
        reasoning: `${f.highTierCount} strong affixes are held back by ${f.lowTierCount} weak one${f.lowTierCount > 1 ? 's' : ''}. Annulment removes a random affix, so it is as likely to destroy the good rolls as the bad ones.`,
        risk: 'destructive',
      });
    },
  },

  {
    id: 'rare-not-worth-developing',
    priority: 50,
    when: (f) =>
      f.item.rarity === 'Rare' &&
      f.isFull &&
      f.resolvedTierCount > 0 &&
      (f.tierQuality ?? 1) <= POOR,
    then: () =>
      action({
        action: 'sell',
        label: 'Not worth further investment',
        reasoning:
          'All slots are used and the tiers are low, so any currency spent here fights against the rolls already locked in. Vendor it and start from a better base.',
        risk: 'none',
      }),
  },

  {
    id: 'unique-perfect-values',
    priority: 45,
    when: (f) => f.item.rarity === 'Unique' && f.isCraftable && f.resolvedTierCount > 0,
    then: () =>
      action({
        action: 'divine-orb',
        label: 'Reroll the numeric values',
        reasoning:
          'Unique items carry a fixed modifier list, so only the numbers can change. A Divine Orb is the only meaningful improvement.',
        risk: 'low',
      }),
  },
];
