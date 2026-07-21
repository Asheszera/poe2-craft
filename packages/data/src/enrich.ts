import type { ItemMod, ParsedItem } from '@poe2/models';
import { isAffixMod } from '@poe2/models';
import type { ModIndex } from './modIndex.js';
import type { StatIndex } from './statIndex.js';

export interface EnrichmentContext {
  /** Official stat list: resolves identity (which modifier is this?). */
  readonly stats: StatIndex;
  /** Datamined modifier table: resolves quality (which tier? prefix or suffix?). */
  readonly mods: ModIndex;
}

/**
 * Enrichment pass: resolves parsed modifiers against the knowledge base.
 *
 * Kept out of `@poe2/parser` on purpose (ADR-002). The parser stays pure and
 * data-free; this is where a modifier acquires its canonical GGG id, its
 * prefix/suffix classification and its tier.
 *
 * Idempotent and non-destructive: whatever cannot be resolved keeps the value
 * the parser derived, so an incomplete dataset degrades the output instead of
 * breaking it.
 */
export function enrichMod(
  mod: ItemMod,
  context: EnrichmentContext,
  itemLevel: number | null,
): ItemMod {
  let enriched = mod;

  const stat = context.stats.find(mod.template, mod.category);
  if (stat) {
    enriched = { ...enriched, statId: stat.entry.id, matched: true };
  }

  // Only slot-consuming modifiers have a tier or a prefix/suffix identity.
  // Runes, implicits and enchantments are intrinsic (ADR-002 addendum).
  if (!isAffixMod(mod)) return enriched;

  // The client already said so (Advanced Item Description). Inference must not
  // second-guess the game: all that is missing is how many tiers exist above.
  if (mod.tier?.confidence === 'exact') {
    if (mod.tier.total !== null) return enriched;
    const total = context.mods.ladderSize(mod.template, mod.affixType);
    return total === null ? enriched : { ...enriched, tier: { ...mod.tier, total } };
  }

  const resolution = context.mods.resolve(mod.template, mod.values, itemLevel);
  if (!resolution) return enriched;

  return {
    ...enriched,
    // A stated affix type outranks an inferred one, for the same reason.
    affixType: mod.affixType === 'unknown' ? resolution.affixType : mod.affixType,
    tier: resolution.tier,
  };
}

export function enrichItem(item: ParsedItem, context: EnrichmentContext): ParsedItem {
  return {
    ...item,
    mods: item.mods.map((mod) => enrichMod(mod, context, item.itemLevel)),
  };
}

/**
 * Lines the knowledge base does not recognise.
 *
 * This is the strongest parser-quality signal available: GGG's stat list is
 * exhaustive, so a line that matches nothing is almost certainly not a modifier
 * at all — it is a property or description the block classifier mis-routed.
 */
export const unmatchedMods = (item: ParsedItem): ItemMod[] =>
  item.mods.filter((mod) => !mod.matched);
