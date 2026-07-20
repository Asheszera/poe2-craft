import type { ModCategory } from '@poe2/models';
import { canonicalTemplate } from '@poe2/shared';
import type { StatDataset, StatEntry, StatType } from './schemas.js';

/**
 * Maps the clipboard's modifier provenance onto GGG's stat categories.
 *
 * `scourge` has no counterpart in the PoE2 stat list; it is kept in
 * `ModCategory` for forward compatibility and simply never type-matches.
 */
const CATEGORY_TO_STAT_TYPE: Readonly<Partial<Record<ModCategory, StatType>>> = {
  explicit: 'explicit',
  implicit: 'implicit',
  crafted: 'crafted',
  fractured: 'fractured',
  enchant: 'enchant',
  rune: 'rune',
  sanctum: 'sanctum',
  desecrated: 'desecrated',
};

export interface StatMatch {
  readonly entry: StatEntry;
  /** True when the entry's type agrees with the line's clipboard tag. */
  readonly typeAgrees: boolean;
}

/**
 * Lookup structure over the stat dataset.
 *
 * Built once and reused: the dataset holds ~8k entries, so a per-item linear
 * scan would blow the 50 ms layer-0 budget on its own. Lookup is a single Map
 * hit on the canonical template.
 */
export class StatIndex {
  readonly #byKey = new Map<string, StatEntry[]>();
  readonly meta: Omit<StatDataset, 'entries'>;

  constructor(dataset: StatDataset) {
    const { entries, ...meta } = dataset;
    this.meta = meta;

    for (const entry of entries) {
      const bucket = this.#byKey.get(entry.key);
      if (bucket) bucket.push(entry);
      else this.#byKey.set(entry.key, [entry]);
    }
  }

  get size(): number {
    return this.#byKey.size;
  }

  /**
   * Resolves a modifier template.
   *
   * Entries whose type agrees with the clipboard tag come first: the same text
   * frequently exists under several provenances (an explicit roll and its
   * crafted counterpart read identically), and the tag printed by the game is
   * the authority on which one this line actually is.
   */
  find(template: string, category: ModCategory): StatMatch | null {
    const candidates = this.#byKey.get(canonicalTemplate(template));
    if (!candidates || candidates.length === 0) return null;

    const wanted = CATEGORY_TO_STAT_TYPE[category];
    const agreeing = candidates.find((entry) => entry.type === wanted);
    if (agreeing) return { entry: agreeing, typeAgrees: true };

    // Known text under a different provenance. Still a real modifier — the id
    // is canonical — but the disagreement is reported rather than hidden.
    const [first] = candidates;
    return first ? { entry: first, typeAgrees: false } : null;
  }
}
