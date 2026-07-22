import type { ModPoolIndex } from '@poe2/data';
import { candidateId, candidates, distribution, targets, type Candidate } from './pool.js';
import type { CraftStep, CurrencyDefinition, Operation } from './operations.js';
import { resolveStep } from './operations.js';
import {
  allMods,
  cleared,
  openSlots,
  withMod,
  withoutGroup,
  withRarity,
  type CraftState,
} from './state.js';

/** A goal the plan is trying to reach, evaluated against a state. */
export interface Goal {
  readonly label: string;
  readonly satisfied: (state: CraftState) => boolean;
}

/** One reachable outcome and how likely it is. */
interface Branch {
  readonly state: CraftState;
  readonly probability: number;
}

/**
 * Why a currency cannot be applied. Returned rather than thrown: "this step is
 * impossible" is the most useful thing a planner can learn, and the caller
 * needs it as data.
 */
export type Refusal =
  | 'wrong rarity'
  | 'no modifiers to remove'
  | 'no open affix slot'
  | 'item is corrupted'
  | 'nothing left in the pool'
  | 'currency not modelled'
  | 'omen not modelled'
  // The `${omen} has no effect on ${currency}` message from resolveStep also
  // flows through this field; the union documents the fixed reasons.
  | (string & {});

export interface StepResult {
  /** How the step reads: the currency, plus the omen when one is attached. */
  readonly currency: string;
  readonly refusal: Refusal | null;
  /** Chance the goal holds after this step, given it held nowhere before. */
  readonly goalChance: number;
  /** False when the base publishes no spawn weights, so this is an estimate. */
  readonly weighted: boolean;
  /** Distinct outcomes still being tracked; 0 once a refusal ends the run. */
  readonly branches: number;
}

export interface SimulationResult {
  readonly steps: readonly StepResult[];
  /** Chance the goal holds after the whole sequence. */
  readonly goalChance: number;
  readonly refusedAt: number | null;
  readonly weighted: boolean;
}

/**
 * Caps the branching factor.
 *
 * A full outcome tree is combinatorial and pointless: what matters is whether
 * the goal was hit, so outcomes are grouped by their effect on the goal and the
 * remainder is carried as one aggregate branch. This bound exists for the case
 * where a goal is unusually broad.
 */
const MAX_BRANCHES = 64;

export function checkRequirements(
  currency: CurrencyDefinition,
  state: CraftState,
): Refusal | null {
  if (state.corrupted && currency.requires.allowsCorrupted !== true) return 'item is corrupted';
  if (currency.requires.rarity && !currency.requires.rarity.includes(state.rarity)) {
    return 'wrong rarity';
  }
  if ((currency.requires.minMods ?? 0) > allMods(state).length) return 'no modifiers to remove';
  if (
    currency.requires.needsOpenSlot === true &&
    openSlots(state, 'prefix') === 0 &&
    openSlots(state, 'suffix') === 0
  ) {
    return 'no open affix slot';
  }
  return null;
}

/**
 * Every state one operation can produce, with probabilities.
 *
 * `add` branches over the pool; `remove` branches uniformly over what the
 * filter admits — the game picks the modifier to remove at random, so each
 * present modifier is equally likely regardless of its spawn weight, which is a
 * distinction worth keeping: spawn weight governs what appears, never what
 * disappears.
 */
function applyOperation(
  pool: ModPoolIndex,
  state: CraftState,
  operation: Operation,
): { branches: Branch[]; weighted: boolean } {
  switch (operation.kind) {
    case 'setRarity':
      return { branches: [{ state: withRarity(state, operation.rarity), probability: 1 }], weighted: true };

    case 'clear':
      return { branches: [{ state: cleared(state), probability: 1 }], weighted: true };

    case 'reroll':
      // Values change, the modifier set does not. Nothing this simulator tracks
      // is affected, so the state passes through unchanged rather than
      // pretending to model roll magnitudes it does not have.
      return { branches: [{ state, probability: 1 }], weighted: true };

    case 'remove': {
      const removable = targets(state, operation.filter ?? {});
      if (removable.length === 0) return { branches: [], weighted: true };
      const p = 1 / removable.length;
      return {
        branches: removable.map((mod) => ({ state: withoutGroup(state, mod.group), probability: p })),
        weighted: true,
      };
    }

    case 'removeWeakest': {
      // Whittling removes the lowest-level modifier. Tier is the proxy the state
      // carries: a higher tier *number* is the lower-level, weaker roll, so the
      // one with the greatest tier goes. Deterministic — a single outcome.
      const removable = targets(state, operation.filter ?? {});
      if (removable.length === 0) return { branches: [], weighted: true };
      const weakest = removable.reduce((lowest, mod) =>
        (mod.tier ?? 0) > (lowest.tier ?? 0) ? mod : lowest,
      );
      return { branches: [{ state: withoutGroup(state, weakest.group), probability: 1 }], weighted: true };
    }

    case 'add':
    case 'addHomogenising': {
      let filter = operation.filter ?? {};
      if (operation.kind === 'addHomogenising') {
        // "Of the same type as an existing modifier": restrict the pool to the
        // tags the item already carries. With no tagged modifiers there is
        // nothing to match, so it falls back to an ordinary add.
        const existingTags = [...new Set(allMods(state).flatMap((mod) => mod.tags))];
        if (existingTags.length > 0) filter = { ...filter, tags: existingTags };
      }

      const available = candidates(pool, state, filter);
      const dist = distribution(available);
      if (dist.total === 0) return { branches: [], weighted: dist.weighted };

      return {
        branches: available.map((candidate) => ({
          state: withMod(state, toStateMod(candidate)),
          probability: dist.chance.get(candidateId(candidate)) ?? 0,
        })),
        weighted: dist.weighted,
      };
    }
  }
}

const toStateMod = (candidate: Candidate) => ({
  key: candidate.key,
  group: candidate.group,
  side: candidate.side,
  tier: candidate.tier,
  tags: candidate.tags,
});

/**
 * Collapses branches that the goal cannot tell apart.
 *
 * Two outcomes matter separately only if the goal treats them differently or
 * they leave the pool in a different shape for later steps. Merging on
 * "goal satisfied + which groups are occupied" keeps the tree exact for the
 * goal while stopping it from exploding.
 */
function merge(branches: readonly Branch[], goal: Goal): Branch[] {
  const byKey = new Map<string, Branch>();

  for (const branch of branches) {
    if (branch.probability <= 0) continue;
    const signature = `${goal.satisfied(branch.state) ? '1' : '0'}|${branch.state.rarity}|${allMods(
      branch.state,
    )
      .map((mod) => `${mod.side}:${mod.group}`)
      .sort()
      .join(',')}`;

    const existing = byKey.get(signature);
    byKey.set(
      signature,
      existing
        ? { state: existing.state, probability: existing.probability + branch.probability }
        : branch,
    );
  }

  const merged = [...byKey.values()].sort((a, b) => b.probability - a.probability);
  if (merged.length <= MAX_BRANCHES) return merged;

  // Keep the likeliest, and carry the tail as one branch so the total stays 1.
  const kept = merged.slice(0, MAX_BRANCHES);
  const tail = merged.slice(MAX_BRANCHES).reduce((sum, b) => sum + b.probability, 0);
  const last = kept[kept.length - 1];
  if (last) kept[kept.length - 1] = { state: last.state, probability: last.probability + tail };
  return kept;
}

/**
 * Runs a sequence of currencies and reports the chance of reaching the goal.
 *
 * The whole point of doing this as a state machine: each step is evaluated
 * against the distribution of states the previous step left behind, so the
 * probabilities are conditional rather than independent. Multiplying per-step
 * chances would ignore that hitting a modifier closes its group and shrinks the
 * pool for everything after it.
 *
 * The goal is checked after every step and satisfied branches stop being
 * advanced — once the item is what you wanted, you stop crafting.
 */
export function simulate(
  pool: ModPoolIndex,
  initial: CraftState,
  sequence: readonly CraftStep[],
  goal: Goal,
): SimulationResult {
  let live: Branch[] = [{ state: initial, probability: 1 }];
  let reached = goal.satisfied(initial) ? 1 : 0;
  if (reached === 1) live = [];

  const steps: StepResult[] = [];
  let refusedAt: number | null = null;
  let everyStepWeighted = true;

  for (const [index, step] of sequence.entries()) {
    // How the step reads in the result, e.g. "Exalted Orb + Omen of Dextral
    // Exaltation".
    const label = step.omen ? `${step.currency} + ${step.omen}` : step.currency;

    // Resolve the currency and any attached omen to the operations they run.
    // An incompatible omen is reported here rather than silently ignored.
    const resolved = resolveStep(step);
    if (!resolved.ok) {
      steps.push({
        currency: label,
        refusal: resolved.reason,
        goalChance: reached,
        weighted: true,
        branches: 0,
      });
      refusedAt ??= index;
      break;
    }
    const { currency, steps: operations } = resolved;

    // A step is refused only if it is impossible everywhere it could still run.
    const runnable = live.filter((branch) => checkRequirements(currency, branch.state) === null);
    if (runnable.length === 0) {
      const refusal = live[0] ? checkRequirements(currency, live[0].state) : 'nothing left in the pool';
      steps.push({
        currency: label,
        refusal: refusal ?? 'nothing left in the pool',
        goalChance: reached,
        weighted: true,
        branches: 0,
      });
      refusedAt ??= index;
      break;
    }

    // Probability mass on branches where this currency cannot run stays put:
    // those items simply do not change.
    const stuck = live.filter((branch) => checkRequirements(currency, branch.state) !== null);
    const next: Branch[] = [...stuck];
    let stepWeighted = true;

    for (const branch of runnable) {
      let inner: Branch[] = [{ state: branch.state, probability: branch.probability }];

      for (const operation of operations) {
        const expanded: Branch[] = [];
        for (const current of inner) {
          const { branches, weighted } = applyOperation(pool, current.state, operation);
          stepWeighted &&= weighted;

          if (branches.length === 0) {
            // The operation could not run — an empty pool, nothing to remove.
            // The item survives unchanged rather than vanishing from the tree.
            expanded.push(current);
            continue;
          }
          for (const produced of branches) {
            expanded.push({
              state: produced.state,
              probability: current.probability * produced.probability,
            });
          }
        }
        inner = expanded;
      }
      next.push(...inner);
    }

    // Satisfied branches leave the tree and their mass is banked.
    const banked = next.filter((b) => goal.satisfied(b.state)).reduce((s, b) => s + b.probability, 0);
    reached += banked;
    live = merge(
      next.filter((b) => !goal.satisfied(b.state)),
      goal,
    );

    everyStepWeighted &&= stepWeighted;
    steps.push({
      currency: label,
      refusal: null,
      goalChance: reached,
      weighted: stepWeighted,
      branches: live.length,
    });
  }

  return { steps, goalChance: reached, refusedAt, weighted: everyStepWeighted };
}
