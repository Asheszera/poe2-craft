import type { ItemMod, ParsedItem } from '@poe2/models';
import { affixBudget, affixMods, intrinsicMods } from '@poe2/models';

/**
 * Derived view of an item, computed once and read by every rule.
 *
 * Rules must never query `ParsedItem` directly. Without this layer each rule
 * re-implements "how many prefixes are open" slightly differently, and they
 * drift apart the moment one of them is fixed. Everything a rule needs to
 * decide is named here, so a rule body stays a single readable condition.
 */
export interface ItemFacts {
  readonly item: ParsedItem;

  // ---- slots -------------------------------------------------------------
  readonly prefixes: number;
  readonly suffixes: number;
  /** Affixes whose prefix/suffix identity could not be resolved. */
  readonly unclassifiedAffixes: number;
  readonly openPrefixes: number;
  readonly openSuffixes: number;
  readonly openAffixes: number;
  /** Total slots for the rarity; null when the concept does not apply. */
  readonly budget: number | null;
  readonly isFull: boolean;

  // ---- quality -----------------------------------------------------------
  /**
   * Mean tier quality across affixes with a resolved tier, 0..1 where 1 is T1.
   * Null when no affix could be placed on a ladder.
   */
  readonly tierQuality: number | null;
  /** Affixes sitting in the top third of their ladder. */
  readonly highTierCount: number;
  /** Affixes sitting in the bottom third of their ladder. */
  readonly lowTierCount: number;
  readonly resolvedTierCount: number;

  // ---- state -------------------------------------------------------------
  /** Corruption freezes an item: no currency can alter it any more. */
  readonly isCorrupted: boolean;
  readonly isMirrored: boolean;
  /** True when currency can still meaningfully act on the item. */
  readonly isCraftable: boolean;
  readonly hasIntrinsics: boolean;
  /** Lines the knowledge base did not recognise — a parse-quality signal. */
  readonly unknownMods: number;

  // ---- offence / defence -------------------------------------------------
  readonly isWeapon: boolean;
  /** Damage per second, or null for non-weapons and missing attack speed. */
  readonly dps: number | null;
  readonly physicalDps: number | null;
  readonly elementalDps: number | null;
  /** Sum of armour, evasion and energy shield. */
  readonly totalDefences: number;
}

/** Ladder position normalised so that 1 is the best tier. */
function tierQualityOf(mod: ItemMod): number | null {
  if (!mod.tier || mod.tier.total === null || mod.tier.total < 1) return null;
  if (mod.tier.total === 1) return 1;
  return (mod.tier.total - mod.tier.value) / (mod.tier.total - 1);
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const sumRange = (range: { min: number; max: number } | null): number =>
  range === null ? 0 : (range.min + range.max) / 2;

/**
 * `Item Class` values that carry weapon damage. Matched loosely because GGG
 * pluralises and renames these between patches.
 */
const WEAPON_CLASS_RE =
  /\b(sword|axe|mace|bow|claw|dagger|wand|staff|stave|sceptre|spear|flail|quarterstaff|crossbow)/i;

/**
 * Computes the fact base for an item. Pure, allocation-light, ~microseconds.
 *
 * @param item Must already have been enriched by `@poe2/data`; unenriched
 *   modifiers carry no tier, which degrades quality facts to null rather than
 *   producing wrong ones.
 */
export function deriveFacts(item: ParsedItem): ItemFacts {
  const affixes = affixMods(item);
  const budget = affixBudget(item.rarity);

  const prefixes = affixes.filter((m) => m.affixType === 'prefix').length;
  const suffixes = affixes.filter((m) => m.affixType === 'suffix').length;
  const unclassifiedAffixes = affixes.length - prefixes - suffixes;

  // Prefixes and suffixes each get half the budget, and they are independent:
  // an item with three prefixes and no suffixes is "half full" in a way that a
  // single total would hide.
  const halfBudget = budget === null ? null : Math.floor(budget / 2);
  const openPrefixes = halfBudget === null ? 0 : Math.max(0, halfBudget - prefixes);
  const openSuffixes = halfBudget === null ? 0 : Math.max(0, halfBudget - suffixes);

  const qualities = affixes
    .map(tierQualityOf)
    .filter((quality): quality is number => quality !== null);

  const isCorrupted = item.flags.corrupted;
  const isMirrored = item.flags.mirrored;

  const props = item.properties;
  const isWeapon = WEAPON_CLASS_RE.test(item.itemClass ?? '');
  const aps = props.attacksPerSecond;

  const physicalAvg = sumRange(props.physicalDamage);
  const elementalAvg =
    props.elementalDamage.reduce((total, r) => total + (r.min + r.max) / 2, 0) +
    sumRange(props.chaosDamage);

  return {
    item,

    prefixes,
    suffixes,
    unclassifiedAffixes,
    openPrefixes,
    openSuffixes,
    openAffixes: openPrefixes + openSuffixes,
    budget,
    isFull: budget !== null && affixes.length >= budget,

    tierQuality: average(qualities),
    highTierCount: qualities.filter((q) => q >= 2 / 3).length,
    lowTierCount: qualities.filter((q) => q <= 1 / 3).length,
    resolvedTierCount: qualities.length,

    isCorrupted,
    isMirrored,
    isCraftable: !isCorrupted && !isMirrored && !item.flags.isCurrency,
    hasIntrinsics: intrinsicMods(item).length > 0,
    unknownMods: item.mods.filter((m) => !m.matched).length,

    isWeapon,
    dps: isWeapon && aps !== null ? (physicalAvg + elementalAvg) * aps : null,
    physicalDps: isWeapon && aps !== null ? physicalAvg * aps : null,
    elementalDps: isWeapon && aps !== null ? elementalAvg * aps : null,
    totalDefences: (props.armour ?? 0) + (props.evasion ?? 0) + (props.energyShield ?? 0),
  };
}
