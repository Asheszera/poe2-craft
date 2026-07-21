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
}

export interface PoolOptions {
  readonly prefix: PoolOption[];
  readonly suffix: PoolOption[];
}

const EMPTY: PoolOptions = { prefix: [], suffix: [] };

export class ModPoolIndex {
  readonly #dataset: ModPoolDataset;
  readonly #modsById = new Map<string, ModEntry>();

  constructor(dataset: ModPoolDataset, mods: ModDataset) {
    this.#dataset = dataset;
    for (const entry of mods.entries) this.#modsById.set(entry.id, entry);
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
   */
  options(baseName: string, itemLevel: number | null): PoolOptions {
    const base = this.#dataset.bases[baseName];
    if (!base) return EMPTY;

    const pool = this.#dataset.groups[base.group];
    if (!pool) return EMPTY;

    return {
      prefix: this.#collapse(pool.prefix, itemLevel),
      suffix: this.#collapse(pool.suffix, itemLevel),
    };
  }

  /** One option per ladder: the best tier reachable, plus where the top sits. */
  #collapse(pool: Record<string, number>, itemLevel: number | null): PoolOption[] {
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

      if (!current || entry.tier < current.bestTier) {
        byLadder.set(ladder, {
          type: entry.type,
          key: entry.key,
          text: entry.name.length > 0 ? `${entry.key} (${entry.name})` : entry.key,
          bestTier: entry.tier,
          tierTotal: entry.tierTotal,
          requiredLevel,
          topTierLevel,
        });
      } else {
        byLadder.set(ladder, { ...current, topTierLevel });
      }
    }

    return [...byLadder.values()]
      .filter((option) => option.bestTier > 0)
      .sort((a, b) => a.bestTier - b.bestTier || a.key.localeCompare(b.key));
  }
}
