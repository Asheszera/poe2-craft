import type { AffixType, ModTier } from '@poe2/models';
import { canonicalTemplate } from '@poe2/shared';
import type { ModDataset, ModEntry } from './schemas.js';

export interface ModResolution {
  /** Prefix or suffix. Resolvable even when the tier is not. */
  readonly affixType: AffixType;
  /** Null when no tier's value window contains the rolled value. */
  readonly tier: ModTier | null;
  /** The entries that remained in contention. */
  readonly candidates: readonly ModEntry[];
}

/** Every rolled value must sit inside its corresponding window. */
function valuesFit(values: readonly number[], entry: ModEntry): boolean {
  if (values.length === 0) return entry.ranges.length === 0;
  if (values.length > entry.ranges.length) return false;

  return values.every((value, i) => {
    const range = entry.ranges[i];
    return range !== undefined && value >= range.min && value <= range.max;
  });
}

/**
 * Tier and affix-type resolution over the datamined modifier table.
 *
 * The inference is deliberately conservative (ADR-002): when several tiers'
 * value windows overlap the rolled value, the result is reported as `ambiguous`
 * with the best candidate rather than silently picking one and calling it fact.
 */
export class ModIndex {
  readonly #byKey = new Map<string, ModEntry[]>();
  readonly meta: Omit<ModDataset, 'entries'>;

  constructor(dataset: ModDataset) {
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
   * @param itemLevel Caps which tiers could have rolled. When unknown, every
   *   tier stays in contention and the answer is correspondingly less certain.
   */
  resolve(template: string, values: readonly number[], itemLevel: number | null): ModResolution | null {
    const candidates = this.#byKey.get(canonicalTemplate(template));
    if (!candidates || candidates.length === 0) return null;

    // An item cannot carry a tier above its own level. If the filter empties the
    // set the data disagrees with the item, so fall back rather than lie.
    const eligible =
      itemLevel === null
        ? candidates
        : (() => {
            const withinLevel = candidates.filter((c) => c.requiredLevel <= itemLevel);
            return withinLevel.length > 0 ? withinLevel : candidates;
          })();

    const fitting = eligible.filter((entry) => valuesFit(values, entry));

    if (fitting.length === 0) {
      // Known modifier, unplaceable roll — corrupted values, a patch that moved
      // the windows, or a mod the export does not cover for this base. Only
      // here does prefix/suffix have to be inferred from the candidates at
      // large, and then only if they agree.
      return { affixType: ModIndex.#agreedAffixType(eligible), tier: null, candidates: eligible };
    }

    // Best (numerically lowest) tier first, so the ambiguous case reports the
    // most favourable interpretation while flagging itself as uncertain.
    const [best, ...rest] = [...fitting].sort((a, b) => a.tier - b.tier);
    if (!best) return { affixType: 'unknown', tier: null, candidates: eligible };

    const ambiguous = rest.some((entry) => entry.tier !== best.tier);

    return {
      // Taken from the entry actually selected, not from a vote across every
      // modifier sharing this text. A single unique-item outlier in the ladder
      // (they exist, e.g. `HandWrapsUniqueMutatedVaal…`) must not be able to
      // erase the classification of an ordinary roll.
      affixType: best.generationType,
      tier: {
        value: best.tier,
        total: best.tierTotal,
        name: best.name.length > 0 ? best.name : null,
        confidence: ambiguous ? 'ambiguous' : 'inferred',
      },
      candidates: fitting,
    };
  }

  /** Prefix/suffix is only asserted when every candidate agrees. */
  static #agreedAffixType(entries: readonly ModEntry[]): AffixType {
    const [first] = entries;
    if (!first) return 'unknown';
    return entries.every((e) => e.generationType === first.generationType)
      ? first.generationType
      : 'unknown';
  }
}
