import type { ParsedItem } from '@poe2/models';
import { affixMods } from '@poe2/models';
import { canonicalTemplate } from '@poe2/shared';

/**
 * A modifier as the simulator sees it.
 *
 * Identity is the exclusion `group`, not the text: two modifiers in the same
 * group can never coexist, and that constraint is what most craft plans break
 * against. `key` is kept for display and for matching back to the pool.
 */
export interface StateMod {
  readonly key: string;
  readonly group: string;
  readonly side: 'prefix' | 'suffix';
  readonly tier: number | null;
  readonly tags: readonly string[];
}

export type Rarity = 'Normal' | 'Magic' | 'Rare' | 'Unique';

/**
 * An item mid-craft.
 *
 * Immutable: every operation returns a new state. Crafting is a sequence where
 * each step sees the result of the last, and sharing a mutable item between
 * branches of a probability tree is how that silently stops being true.
 */
export interface CraftState {
  readonly baseType: string;
  readonly itemLevel: number | null;
  readonly rarity: Rarity;
  readonly prefixes: readonly StateMod[];
  readonly suffixes: readonly StateMod[];
  /** Corrupted items refuse almost every currency; tracked so that is checked. */
  readonly corrupted: boolean;
}

/**
 * Affix capacity per side, by rarity.
 *
 * Prefixes and suffixes fill independently — an item with three prefixes and
 * one suffix still takes a suffix — which is why capacity is per side and never
 * a single total.
 */
export function capacity(rarity: Rarity): number {
  switch (rarity) {
    case 'Normal':
      return 0;
    case 'Magic':
      return 1;
    case 'Rare':
      return 3;
    case 'Unique':
      // Uniques have fixed modifiers and no open affix budget to plan against.
      return 0;
  }
}

export const openSlots = (state: CraftState, side: 'prefix' | 'suffix'): number =>
  Math.max(0, capacity(state.rarity) - modsOn(state, side).length);

export const modsOn = (state: CraftState, side: 'prefix' | 'suffix'): readonly StateMod[] =>
  side === 'prefix' ? state.prefixes : state.suffixes;

export const allMods = (state: CraftState): readonly StateMod[] => [
  ...state.prefixes,
  ...state.suffixes,
];

/** Groups the item already occupies, and therefore cannot roll again. */
export const occupiedGroups = (state: CraftState): Set<string> =>
  new Set(allMods(state).map((mod) => mod.group));

/** Returns a copy with `mod` added to its side. Does not check capacity. */
export function withMod(state: CraftState, mod: StateMod): CraftState {
  return mod.side === 'prefix'
    ? { ...state, prefixes: [...state.prefixes, mod] }
    : { ...state, suffixes: [...state.suffixes, mod] };
}

/** Returns a copy without the modifier occupying `group`. */
export function withoutGroup(state: CraftState, group: string): CraftState {
  return {
    ...state,
    prefixes: state.prefixes.filter((mod) => mod.group !== group),
    suffixes: state.suffixes.filter((mod) => mod.group !== group),
  };
}

export const withRarity = (state: CraftState, rarity: Rarity): CraftState => ({ ...state, rarity });

export const cleared = (state: CraftState): CraftState => ({
  ...state,
  prefixes: [],
  suffixes: [],
});

const RARITIES = new Set<Rarity>(['Normal', 'Magic', 'Rare', 'Unique']);

/** What the knowledge base tells the state machine about a modifier template. */
export interface ModLookup {
  /** Its exclusion group, or null when the base does not list it. */
  groupOf: (key: string) => string | null;
  /** Its tags, so a goal or a filter about the item's own mods can see them. */
  tagsOf: (key: string) => readonly string[];
}

/**
 * Builds a state from a parsed item.
 *
 * A modifier whose group cannot be resolved keeps its own template as a
 * stand-in group, so it still blocks *itself* from rolling again and is never
 * silently treated as occupying nothing.
 */
export function stateFromItem(item: ParsedItem, lookup: ModLookup): CraftState {
  const prefixes: StateMod[] = [];
  const suffixes: StateMod[] = [];

  for (const mod of affixMods(item)) {
    if (mod.affixType !== 'prefix' && mod.affixType !== 'suffix') continue;
    const key = canonicalTemplate(mod.template);
    const entry: StateMod = {
      key,
      group: lookup.groupOf(key) ?? key,
      side: mod.affixType,
      tier: mod.tier?.value ?? null,
      tags: lookup.tagsOf(key),
    };
    (mod.affixType === 'prefix' ? prefixes : suffixes).push(entry);
  }

  return {
    baseType: item.baseType,
    itemLevel: item.itemLevel,
    rarity: RARITIES.has(item.rarity as Rarity) ? (item.rarity as Rarity) : 'Rare',
    prefixes,
    suffixes,
    corrupted: item.flags.corrupted,
  };
}
