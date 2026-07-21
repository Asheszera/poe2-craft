import type { ModDataset, ModEntry, ModPoolDataset } from './schemas.js';

/**
 * What a base can still roll, and how good it can get here.
 *
 * The pool alone says "this base accepts cold resistance". Joined with the
 * item's level it says "cold resistance, best tier reachable here is 2 of 8" —
 * which is the difference between advice and trivia. A modifier whose good
 * tiers are gated above the item's level is not an opportunity, and a plan that
 * chases one is wasted currency.
 */

export interface PoolOption {
  /** Ladder family, e.g. `IncreasedLife`. */
  readonly type: string;
  /** Canonical template, shared with the item's own modifiers. */
  readonly key: string;
  /** Readable example of the modifier's text. */
  readonly text: string;
  /** Best tier this item level can reach — 1 is the top. */
  readonly bestTier: number;
  readonly tierTotal: number;
  /** Item level needed for that tier. */
  readonly requiredLevel: number;
  /** Item level needed for tier 1, or null when tier 1 is unreachable here. */
  readonly topTierLevel: number | null;
  /** What the modifier is about: `life`, `attack`, `caster`, `elemental`, … */
  readonly tags: string[];
  /**
   * Set when a modifier already on the item occupies this option's group, so
   * it can no longer roll. Names the blocking group — reported rather than
   * filtered away, because "you cannot have both" is itself the advice.
   */
  readonly blockedBy: string | null;
  /** How many of this ladder's tiers the item level allows. */
  readonly eligibleTiers: number;
  /**
   * Share of this affix side's rollable pool, 0–1. See `#collapse` for what
   * this is and, more importantly, what it is not.
   */
  readonly chance: number;
}

export interface PoolOptions {
  readonly prefix: PoolOption[];
  readonly suffix: PoolOption[];
}

const EMPTY: PoolOptions = { prefix: [], suffix: [] };

export class ModPoolIndex {
  readonly #dataset: ModPoolDataset;
  readonly #modsById = new Map<string, ModEntry>();
  /** Canonical template → the groups any modifier with that text belongs to. */
  readonly #groupsByKey = new Map<string, Set<string>>();

  constructor(dataset: ModPoolDataset, mods: ModDataset) {
    this.#dataset = dataset;
    for (const entry of mods.entries) {
      this.#modsById.set(entry.id, entry);

      let groups = this.#groupsByKey.get(entry.key);
      if (!groups) this.#groupsByKey.set(entry.key, (groups = new Set()));
      for (const group of entry.groups) groups.add(group);
    }
  }

  /**
   * The exclusion groups a set of modifier texts occupies.
   *
   * Keyed by template rather than by resolved tier, because which tier rolled
   * does not change what it blocks — and the template is what survives when the
   * tier cannot be inferred at all.
   */
  occupiedGroups(keys: readonly string[]): Set<string> {
    const occupied = new Set<string>();
    for (const key of keys) {
      for (const group of this.#groupsByKey.get(key) ?? []) occupied.add(group);
    }
    return occupied;
  }

  get baseCount(): number {
    return Object.keys(this.#dataset.bases).length;
  }

  /** True when the base is in the dataset at all. */
  knows(baseName: string): boolean {
    return this.#dataset.bases[baseName] !== undefined;
  }

  /**
   * Modifiers the base can roll, collapsed to one entry per ladder with the
   * best tier the item level allows.
   *
   * @param itemLevel Null is treated as "no ceiling", which over-reports rather
   *   than under-reports: an unknown level should not hide options.
   * @param presentKeys Canonical templates already on the item. Options whose
   *   exclusion group one of them occupies come back marked `blockedBy`.
   */
  options(baseName: string, itemLevel: number | null, presentKeys: readonly string[] = []): PoolOptions {
    const base = this.#dataset.bases[baseName];
    if (!base) return EMPTY;

    const pool = this.#dataset.groups[base.group];
    if (!pool) return EMPTY;

    const occupied = this.occupiedGroups(presentKeys);

    return {
      prefix: this.#collapse(pool.prefix, itemLevel, occupied),
      suffix: this.#collapse(pool.suffix, itemLevel, occupied),
    };
  }

  /**
   * One option per ladder: the best tier reachable, where the top sits, and how
   * large a share of the pool it occupies.
   *
   * **What `chance` is.** The datamined table gives every modifier a spawn
   * weight of exactly 0 or 1 — eligibility, not rarity (see ADR-005). Under the
   * only model that data supports, each *eligible tier entry* is one equally
   * likely outcome, so a ladder's share is its reachable tier count over the
   * side's total. That is not a flat distribution: on Pauascale Gloves at item
   * level 80, `+# to Dexterity` has 8 reachable tiers against 1 for
   * `increased Energy Shield Recharge Rate`, so it is eight times as likely.
   *
   * **What it is not.** It is not GGG's weighting. If the game weights modifiers
   * beyond eligibility — and players report that it does — no published source
   * carries those numbers, so this understates rare modifiers and overstates
   * common ones. It is stated as a share of the pool, never as a guarantee, and
   * everything that renders it says where it comes from.
   */
  #collapse(
    pool: Record<string, number>,
    itemLevel: number | null,
    occupied: ReadonlySet<string>,
  ): PoolOption[] {
    const byLadder = new Map<string, PoolOption & { topTierLevel: number | null }>();

    for (const [modId, requiredLevel] of Object.entries(pool)) {
      const entry = this.#modsById.get(modId);
      if (!entry) continue;

      const ladder = `${entry.type}|${entry.key}`;
      const current = byLadder.get(ladder);

      // Where tier 1 sits is worth knowing even when it is out of reach: it
      // tells the player whether a better base or a higher level would help.
      const topTierLevel =
        entry.tier === 1 ? requiredLevel : (current?.topTierLevel ?? null);

      const reachable = itemLevel === null || requiredLevel <= itemLevel;
      if (!reachable) {
        if (current) byLadder.set(ladder, { ...current, topTierLevel });
        continue;
      }

      const eligibleTiers = (current?.eligibleTiers ?? 0) + 1;

      if (!current || entry.tier < current.bestTier) {
        byLadder.set(ladder, {
          type: entry.type,
          key: entry.key,
          text: entry.name.length > 0 ? `${entry.key} (${entry.name})` : entry.key,
          bestTier: entry.tier,
          tierTotal: entry.tierTotal,
          requiredLevel,
          topTierLevel,
          tags: entry.tags,
          blockedBy: entry.groups.find((group) => occupied.has(group)) ?? null,
          eligibleTiers,
          chance: 0, // filled below, once the pool total is known
        });
      } else {
        byLadder.set(ladder, { ...current, topTierLevel, eligibleTiers });
      }
    }

    const options = [...byLadder.values()].filter((option) => option.bestTier > 0);

    // Blocked modifiers are out of the running, so they are out of the
    // denominator too: the shares must describe what can actually roll next,
    // not what could have rolled on an empty item.
    const rollable = options.filter((option) => option.blockedBy === null);
    const total = rollable.reduce((sum, option) => sum + option.eligibleTiers, 0);

    // Blocked options sink to the bottom: still visible, never mistaken for
    // something the item can actually roll next.
    return options
      .map((option) => ({
        ...option,
        chance: total === 0 || option.blockedBy !== null ? 0 : option.eligibleTiers / total,
      }))
      .sort(
        (a, b) =>
          Number(a.blockedBy !== null) - Number(b.blockedBy !== null) ||
          a.bestTier - b.bestTier ||
          a.key.localeCompare(b.key),
      );
  }
}
