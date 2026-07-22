import type { Goal } from './simulate.js';
import { allMods, type CraftState } from './state.js';

/**
 * Goals are predicates over a state, not strings to match.
 *
 * The simulator asks "does this item satisfy the goal" after every step, so a
 * goal has to be answerable about a hypothetical item that does not exist yet.
 */

/** The item carries a modifier whose text matches, at `minTier` or better. */
export const hasMod = (key: string, minTier?: number): Goal => ({
  label: minTier === undefined ? key : `${key} at T${minTier} or better`,
  satisfied: (state) =>
    allMods(state).some(
      (mod) =>
        mod.key === key && (minTier === undefined || (mod.tier !== null && mod.tier <= minTier)),
    ),
});

/** The item carries at least `count` modifiers tagged `tag`. */
export const hasTag = (tag: string, count = 1): Goal => ({
  label: count === 1 ? `a ${tag} modifier` : `${count} ${tag} modifiers`,
  satisfied: (state) => allMods(state).filter((mod) => mod.tags.includes(tag)).length >= count,
});

/** Every one of `goals` holds. */
export const all = (goals: readonly Goal[]): Goal => ({
  label: goals.map((goal) => goal.label).join(' and '),
  satisfied: (state: CraftState) => goals.every((goal) => goal.satisfied(state)),
});

/** Any one of `goals` holds. */
export const any = (goals: readonly Goal[]): Goal => ({
  label: goals.map((goal) => goal.label).join(' or '),
  satisfied: (state: CraftState) => goals.some((goal) => goal.satisfied(state)),
});

/**
 * A goal in a form that survives IPC.
 *
 * The simulator wants a predicate, but a predicate cannot cross a process
 * boundary. The renderer sends this description and the main process rebuilds
 * the predicate from it with `fromSpec`, so the untrusted side never ships code.
 */
export type GoalSpec =
  | { readonly kind: 'mod'; readonly key: string; readonly minTier?: number | undefined }
  | { readonly kind: 'tag'; readonly tag: string; readonly count?: number | undefined }
  | { readonly kind: 'all'; readonly of: readonly GoalSpec[] }
  | { readonly kind: 'any'; readonly of: readonly GoalSpec[] };

export function fromSpec(spec: GoalSpec): Goal {
  switch (spec.kind) {
    case 'mod':
      return hasMod(spec.key, spec.minTier);
    case 'tag':
      return hasTag(spec.tag, spec.count);
    case 'all':
      return all(spec.of.map(fromSpec));
    case 'any':
      return any(spec.of.map(fromSpec));
  }
}
