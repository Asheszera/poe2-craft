import type { ModDataset, ModEntry, ModPoolDataset, ModWeightDataset } from './schemas.js';

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
   * The game's published spawn weight, summed over the tiers this item level
   * allows. Null when no weight is published for this modifier on this base —
   * which is not the same as zero, and must not be rendered as a small number.
   */
  readonly weight: number | null;
  /**
   * Share of this affix side's rollable pool, 0–1. Null when the weight is
   * unknown: a share invented for one option would silently shrink every other.
   */
  readonly chance: number | null;
}

/**
 * Where an affix side's shares came from.
 *
 * `weights` — GGG's published spawn weights (poe2db). `tiers` — the fallback
 * for bases with no published weights, where each eligible tier counts as one
 * equally likely outcome. The two are not comparable and the interface says
 * which is in play.
 */
export type ChanceBasis = 'weights' | 'tiers';

export interface PoolOptions {
  readonly prefix: PoolOption[];
  readonly suffix: PoolOption[];
  readonly chanceBasis: ChanceBasis;
}

const EMPTY: PoolOptions = { prefix: [], suffix: [], chanceBasis: 'tiers' };

export class ModPoolIndex {
  readonly #dataset: ModPoolDataset;
  readonly #modsById = new Map<string, ModEntry>();
  /** Canonical template → the groups any modifier with that text belongs to. */
  readonly #groupsByKey = new Map<string, Set<string>>();
  /** Canonical template → the tags of the first ladder carrying it. */
  readonly #tagsByKey = new Map<string, readonly string[]>();

  readonly #weights: ModWeightDataset | null;

  constructor(dataset: ModPoolDataset, mods: ModDataset, weights: ModWeightDataset | null = null) {
    this.#dataset = dataset;
    this.#weights = weights;
    for (const entry of mods.entries) {
      this.#modsById.set(entry.id, entry);

      let groups = this.#groupsByKey.get(entry.key);
      if (!groups) this.#groupsByKey.set(entry.key, (groups = new Set()));
      for (const group of entry.groups) groups.add(group);

      if (!this.#tagsByKey.has(entry.key)) this.#tagsByKey.set(entry.key, entry.tags);
    }
  }

  /**
   * The published spawn weight for one tier on one base, or null.
   *
   * Weights are per tag in the game data; the source resolves them per item
   * class (and per attribute variant, since a strength glove and a dexterity
   * glove roll different pools), so the lookup is by base rather than by tag.
   */
  #weightOf(entry: ModEntry, baseName: string): number | null {
    const context = this.#weights?.bases[baseName];
    const table = context === undefined ? undefined : this.#weights?.contexts[context];
    if (!table) return null;

    for (const group of entry.groups) {
      const weight = table[`${entry.key}|${entry.requiredLevel}|${entry.generationType}|${group}`];
      if (weight !== undefined) return weight;
    }
    return null;
  }

  /** True when this base has published weights to work from at all. */
  hasWeights(baseName: string): boolean {
    const context = this.#weights?.bases[baseName];
    return context !== undefined && this.#weights?.contexts[context] !== undefined;
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

  /**
   * The exclusion group a modifier template belongs to, or null when unknown.
   *
   * A template can in principle map to more than one group; the first is
   * returned, which is enough for identity — two modifiers sharing any group
   * cannot coexist, so any one of them serves to detect the collision.
   */
  groupFor(key: string): string | null {
    for (const group of this.#groupsByKey.get(key) ?? []) return group;
    return null;
  }

  /** Tags carried by a modifier template, from the first ladder that has it. */
  tagsFor(key: string): readonly string[] {
    return this.#tagsByKey.get(key) ?? [];
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
    const basis: ChanceBasis = this.hasWeights(baseName) ? 'weights' : 'tiers';

    return {
      prefix: this.#collapse(pool.prefix, itemLevel, occupied, baseName, basis),
      suffix: this.#collapse(pool.suffix, itemLevel, occupied, baseName, basis),
      chanceBasis: basis,
    };
  }

  /**
   * One option per ladder: the best tier reachable, where the top sits, and how
   * likely it is to roll.
   *
   * **How `chance` is computed.** Where the game's spawn weights are published
   * (ADR-005 addendum), a ladder's weight is the sum over the tiers this item
   * level allows, and its chance is that over the side's total. This is the
   * real distribution — `+# to Strength` at weight 1000 against a modifier at
   * 100 is genuinely ten times as likely.
   *
   * **Where they are not published**, each eligible tier counts as one equally
   * likely outcome instead. That fallback is not the game's own odds, which is
   * why `chanceBasis` travels with the result and every renderer states it.
   *
   * A modifier with no published weight on a weighted base gets `chance: null`,
   * never a guess: inventing one share silently shrinks every other.
   */
  #collapse(
    pool: Record<string, number>,
    itemLevel: number | null,
    occupied: ReadonlySet<string>,
    baseName: string,
    basis: ChanceBasis,
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
      // Weights are per tier, so a ladder's weight is the sum over the tiers
      // this item level can actually roll. A tier gated above the item does not
      // contribute, which is why the sum happens here and not up front.
      const tierWeight = this.#weightOf(entry, baseName);
      const weight =
        tierWeight === null ? current?.weight ?? null : (current?.weight ?? 0) + tierWeight;

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
          weight,
          chance: null, // filled below, once the side's total is known
        });
      } else {
        byLadder.set(ladder, { ...current, topTierLevel, eligibleTiers, weight });
      }
    }

    const options = [...byLadder.values()].filter((option) => option.bestTier > 0);

    // Blocked modifiers are out of the running, so they are out of the
    // denominator too: the shares must describe what can actually roll next,
    // not what could have rolled on an empty item.
    const rollable = options.filter((option) => option.blockedBy === null);
    const share = (option: PoolOption): number | null =>
      basis === 'weights' ? option.weight : option.eligibleTiers;
    const total = rollable.reduce((sum, option) => sum + (share(option) ?? 0), 0);

    // Blocked options sink to the bottom: still visible, never mistaken for
    // something the item can actually roll next.
    return options
      .map((option) => {
        const value = share(option);
        return {
          ...option,
          chance:
            option.blockedBy !== null ? null : total === 0 || value === null ? null : value / total,
        };
      })
      .sort(
        (a, b) =>
          Number(a.blockedBy !== null) - Number(b.blockedBy !== null) ||
          a.bestTier - b.bestTier ||
          a.key.localeCompare(b.key),
      );
  }
}
