import type { ModPoolIndex, PoolOption } from '@poe2/data';
import type { CraftState, StateMod } from './state.js';
import { occupiedGroups, openSlots } from './state.js';

/** One thing that could roll, with the weight it rolls at. */
export interface Candidate {
  readonly key: string;
  readonly group: string;
  readonly side: 'prefix' | 'suffix';
  readonly tier: number;
  readonly tags: readonly string[];
  /** Published spawn weight, or null when this base publishes none. */
  readonly weight: number | null;
}

/** Narrows what a currency is allowed to touch. */
export interface Filter {
  /** Restrict to one affix side. Absent means either. */
  readonly side?: 'prefix' | 'suffix' | undefined;
  /** Modifier must carry at least one of these tags. Absent means any. */
  readonly tags?: readonly string[] | undefined;
}

/**
 * What could roll next, and with what weight.
 *
 * Recomputed from the state on every call rather than cached, because that is
 * the whole point: adding a modifier closes its group, and the pool for the
 * *next* step is smaller than the pool for this one. A plan built on a pool
 * computed once is wrong from its second step onwards.
 *
 * Four filters, in the order they eliminate:
 *  1. the side has an open slot at all;
 *  2. the item level admits the tier (the pool index applies this);
 *  3. the exclusion group is free;
 *  4. the currency's own restriction — side, tags.
 */
export function candidates(
  pool: ModPoolIndex,
  state: CraftState,
  filter: Filter = {},
): Candidate[] {
  const occupied = occupiedGroups(state);
  const options = pool.options(state.baseType, state.itemLevel);
  const out: Candidate[] = [];

  for (const side of ['prefix', 'suffix'] as const) {
    if (filter.side !== undefined && filter.side !== side) continue;
    if (openSlots(state, side) === 0) continue;

    for (const option of side === 'prefix' ? options.prefix : options.suffix) {
      const group = groupOf(option);
      if (group === null || occupied.has(group)) continue;
      if (filter.tags && !filter.tags.some((tag) => option.tags.includes(tag))) continue;

      out.push({
        key: option.key,
        group,
        side,
        tier: option.bestTier,
        tags: option.tags,
        weight: option.weight,
      });
    }
  }

  return out;
}

/**
 * The exclusion group a pool option belongs to.
 *
 * `blockedBy` names it when the group is taken; otherwise the option's ladder
 * stands in. The pool index does not expose the group directly for a free
 * option, and using the ladder is safe here because two ladders sharing a group
 * are already filtered out by the occupied check upstream.
 */
function groupOf(option: PoolOption): string | null {
  return option.blockedBy ?? option.type;
}

/** Modifiers currently on the item that a filter is allowed to touch. */
export function targets(state: CraftState, filter: Filter = {}): StateMod[] {
  const sides =
    filter.side === undefined
      ? [...state.prefixes, ...state.suffixes]
      : filter.side === 'prefix'
        ? [...state.prefixes]
        : [...state.suffixes];

  if (!filter.tags) return sides;
  return sides.filter((mod) => filter.tags?.some((tag) => mod.tags.includes(tag)));
}

/**
 * Probability that a single roll from `pool` lands on each candidate.
 *
 * Weight over total weight, exactly as the game generates modifiers. Where a
 * base publishes no weights (ADR-005), every candidate is treated as equally
 * likely and `weighted` is false — the caller must say so rather than present
 * the two cases identically.
 */
export interface Distribution {
  readonly weighted: boolean;
  readonly total: number;
  /** Candidate key+side → probability. Sums to 1 when the pool is non-empty. */
  readonly chance: ReadonlyMap<string, number>;
  readonly candidates: readonly Candidate[];
}

export const candidateId = (candidate: Pick<Candidate, 'key' | 'side'>): string =>
  `${candidate.side}|${candidate.key}`;

export function distribution(candidates: readonly Candidate[]): Distribution {
  const weighted = candidates.length > 0 && candidates.every((c) => c.weight !== null);
  const weightOf = (c: Candidate): number => (weighted ? (c.weight ?? 0) : 1);
  const total = candidates.reduce((sum, c) => sum + weightOf(c), 0);

  const chance = new Map<string, number>();
  if (total > 0) {
    for (const candidate of candidates) {
      chance.set(candidateId(candidate), weightOf(candidate) / total);
    }
  }

  return { weighted, total, chance, candidates };
}
