import type { ItemFacts } from './facts.js';

/**
 * A single named contribution to the item's score.
 *
 * Score and explanation come from the same objects on purpose: if the number
 * were computed in one place and the "strengths" list written in another, the
 * two would eventually contradict each other on screen, and the user would
 * rightly stop trusting both.
 */
export interface Signal {
  readonly id: string;
  /** Sentence shown to the user when this signal is notable. */
  readonly label: string;
  /** 0..1, where 1 is as good as this dimension gets. */
  readonly value: number;
  /** Relative importance within the composite. */
  readonly weight: number;
}

/**
 * Weights are deliberate but not sacred — they are a starting heuristic to be
 * tuned against real items, not a derivation from first principles. They live
 * here, in one visible table, precisely so tuning them is a one-line change
 * rather than an archaeology exercise.
 */
const WEIGHTS = {
  tierQuality: 3,
  topTiers: 1.5,
  slotUsage: 1.5,
  rarity: 1,
  craftable: 0.5,
} as const;

/** Above this a signal reads as a strength, below the lower bound a weakness. */
const STRENGTH_AT = 0.7;
const WEAKNESS_AT = 0.35;

const RARITY_VALUE: Record<string, number> = {
  Unique: 1,
  Rare: 1,
  Magic: 0.5,
  Normal: 0.25,
};

export function deriveSignals(facts: ItemFacts): Signal[] {
  const signals: Signal[] = [];

  // Unresolved tiers must not be scored as bad rolls — an unknown is neutral.
  const tierQuality = facts.tierQuality ?? 0.5;
  signals.push({
    id: 'tier-quality',
    label:
      facts.resolvedTierCount === 0
        ? 'No affix tier could be resolved'
        : `Average affix tier quality across ${facts.resolvedTierCount} rolls`,
    value: tierQuality,
    weight: WEIGHTS.tierQuality,
  });

  const topTierTarget = 3;
  signals.push({
    id: 'top-tiers',
    label:
      facts.highTierCount > 0
        ? `${facts.highTierCount} affix${facts.highTierCount > 1 ? 'es' : ''} in the top third of its ladder`
        : 'No affix reaches the top third of its ladder',
    value: Math.min(1, facts.highTierCount / topTierTarget),
    weight: WEIGHTS.topTiers,
  });

  const used = facts.budget === null ? 0 : facts.budget - facts.openAffixes;
  signals.push({
    id: 'slot-usage',
    label:
      facts.budget === null
        ? 'Rarity has no affix slots'
        : `${used} of ${facts.budget} affix slots used`,
    value: facts.budget === null ? 0.5 : used / facts.budget,
    weight: WEIGHTS.slotUsage,
  });

  signals.push({
    id: 'rarity',
    label: `${facts.item.rarity} item`,
    value: RARITY_VALUE[facts.item.rarity] ?? 0.5,
    weight: WEIGHTS.rarity,
  });

  signals.push({
    id: 'craftable',
    label: facts.isCorrupted
      ? 'Corrupted — no further crafting is possible'
      : facts.isMirrored
        ? 'Mirrored — cannot be modified'
        : 'Still open to crafting',
    value: facts.isCraftable ? 1 : 0.3,
    weight: WEIGHTS.craftable,
  });

  return signals;
}

export interface ScoreBreakdown {
  /** 0..100. */
  readonly score: number;
  readonly signals: readonly Signal[];
  readonly strengths: string[];
  readonly weaknesses: string[];
}

/** Weighted mean of the signals, rendered on a 0..100 scale. */
export function score(facts: ItemFacts): ScoreBreakdown {
  const signals = deriveSignals(facts);
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const weighted = signals.reduce((sum, s) => sum + s.value * s.weight, 0);

  return {
    score: Math.round(Math.min(100, Math.max(0, (weighted / totalWeight) * 100))),
    signals,
    strengths: signals.filter((s) => s.value >= STRENGTH_AT).map((s) => s.label),
    weaknesses: signals.filter((s) => s.value <= WEAKNESS_AT).map((s) => s.label),
  };
}
