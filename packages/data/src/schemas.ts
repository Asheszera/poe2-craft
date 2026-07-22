import { AffixTypeSchema } from '@poe2/models';
import { z } from 'zod';

/**
 * Schemas for the bundled knowledge base.
 *
 * Every dataset carries provenance (`source`, `fetchedAt`, `gameVersion`) so a
 * stale file is a visible fact rather than a mystery. Datasets are regenerated
 * per league or major patch by the scripts in `scripts/`, never at runtime.
 */

/**
 * Modifier provenance, taken from the trade API's *category* id.
 *
 * The per-entry `type` field is not used: GGG labels rune entries `augment`
 * there, so the category id is both more stable and closer to the vocabulary
 * used in `ModCategory`. `pseudo` is excluded — those are trade-site
 * aggregations that never appear on an item.
 */
export const StatTypeSchema = z.enum([
  'explicit',
  'implicit',
  'fractured',
  'crafted',
  'enchant',
  'rune',
  'sanctum',
  'skill',
  'desecrated',
]);
export type StatType = z.infer<typeof StatTypeSchema>;

export const StatEntrySchema = z.object({
  /** GGG's canonical id, e.g. `explicit.stat_1050105434`. */
  id: z.string().min(1),
  /** Display text with `#` placeholders, as published. */
  text: z.string().min(1),
  type: StatTypeSchema,
  /** `text` reduced by `canonicalTemplate` — the lookup key. */
  key: z.string().min(1),
});
export type StatEntry = z.infer<typeof StatEntrySchema>;

/** Metadata shared by every dataset file. */
export const DatasetMetaSchema = z.object({
  source: z.string().url(),
  fetchedAt: z.string(),
  /** Free-form label for the league/patch the data belongs to. */
  gameVersion: z.string(),
});

export const StatDatasetSchema = DatasetMetaSchema.extend({
  entries: z.array(StatEntrySchema),
});
export type StatDataset = z.infer<typeof StatDatasetSchema>;

/** A modifier's value window for one of its numeric placeholders. */
export const ValueRangeSchema = z.object({ min: z.number(), max: z.number() });

/**
 * One rung of an affix ladder — a single tier of a single modifier.
 *
 * `type` is the ladder it belongs to (`IncreasedLife`), and `tier` is its
 * position counted from the top, matching how the community numbers them: T1 is
 * the highest, hardest-to-roll tier.
 */
export const ModEntrySchema = z.object({
  /** Datamined id, e.g. `IncreasedLife3`. Stable across patches. */
  id: z.string().min(1),
  /** In-game affix name, e.g. `Sanguine`. */
  name: z.string(),
  /** Ladder family; every entry sharing it is a tier of the same modifier. */
  type: z.string().min(1),
  generationType: AffixTypeSchema.exclude(['unknown']),
  /** Minimum item level that can roll this tier. */
  requiredLevel: z.number().int().nonnegative(),
  /** Canonical template — the lookup key, shared with `StatEntry.key`. */
  key: z.string().min(1),
  /** Value window per numeric placeholder, in order of appearance. */
  ranges: z.array(ValueRangeSchema),
  /**
   * Mutual-exclusion families: an item carries at most one modifier per group.
   *
   * Distinct from `type`. `FireResistance` and `FireResistanceAndMax` are two
   * ladders in one group, so an item with plain fire resistance cannot roll the
   * hybrid — which is exactly the kind of thing craft advice must not miss.
   */
  groups: z.array(z.string()),
  /** What the modifier is about: `life`, `attack`, `caster`, `elemental`, … */
  tags: z.array(z.string()),
  tier: z.number().int().positive(),
  tierTotal: z.number().int().positive(),
});
export type ModEntry = z.infer<typeof ModEntrySchema>;

export const ModDatasetSchema = DatasetMetaSchema.extend({
  entries: z.array(ModEntrySchema),
});
export type ModDataset = z.infer<typeof ModDatasetSchema>;

/**
 * A currency, rune or consumable, as the live game names it.
 *
 * The crafting advisor plans with these names, so they come from the API rather
 * than from anyone's memory: essences, omens and league consumables change too
 * often for a hardcoded list to stay honest.
 */
export const CurrencyEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The trade site's grouping — `Currency`, `Runes`, `Vaal`, `Breach`, … */
  category: z.string().min(1),
});
export type CurrencyEntry = z.infer<typeof CurrencyEntrySchema>;

export const CurrencyDatasetSchema = DatasetMetaSchema.extend({
  entries: z.array(CurrencyEntrySchema),
});
export type CurrencyDataset = z.infer<typeof CurrencyDatasetSchema>;

/**
 * One pool of modifiers, shared by every base that rolls the same things.
 *
 * `{ modId: requiredItemLevel }` — the level gate is what turns "this can roll"
 * into "this can roll *here*", and it is the difference between advising a T1
 * that the item can never reach and advising the best tier actually available.
 */
export const ModPoolGroupSchema = z.object({
  prefix: z.record(z.string(), z.number()),
  suffix: z.record(z.string(), z.number()),
});
export type ModPoolGroup = z.infer<typeof ModPoolGroupSchema>;

/**
 * What a currency does, in the game's own words.
 *
 * The trade API names currencies and says nothing about their effect, so the
 * description shipped with the item is the only first-party statement of what
 * it does. Kept verbatim: the crafting simulator's operation table is checked
 * against this text, so a patch that changes an effect fails a test instead of
 * quietly making the simulation wrong.
 */
export const CurrencyEffectSchema = z.object({
  name: z.string().min(1),
  itemClass: z.string(),
  /** Wiki markup stripped; otherwise exactly what the game displays. */
  description: z.string().min(1),
  dropLevel: z.number().int().nonnegative(),
});
export type CurrencyEffect = z.infer<typeof CurrencyEffectSchema>;

export const CurrencyEffectDatasetSchema = DatasetMetaSchema.extend({
  entries: z.array(CurrencyEffectSchema),
});
export type CurrencyEffectDataset = z.infer<typeof CurrencyEffectDatasetSchema>;

/**
 * How likely each modifier is to roll, per item context.
 *
 * Weights are per tag in the game data; poe2db resolves them per item-class
 * page, so a "context" is one such page — `Amulets`, or `Gloves_str_dex`, since
 * a strength glove and a dexterity glove roll different pools. Keys are
 * `template|level|prefix\|suffix|group`, which is what identifies one tier of
 * one ladder across both datasets.
 *
 * A modifier absent from a context has no published weight there; that is not
 * the same as weight zero, and `ModPoolIndex` reports it as unknown rather than
 * treating it as impossible.
 */
export const ModWeightDatasetSchema = DatasetMetaSchema.extend({
  source: z.string(), // not a bare URL: names the page family and the payload
  contexts: z.record(z.string(), z.record(z.string(), z.number().positive())),
  /** Base display name → the context whose weights apply to it. */
  bases: z.record(z.string(), z.string()),
});
export type ModWeightDataset = z.infer<typeof ModWeightDatasetSchema>;

export const ModPoolDatasetSchema = DatasetMetaSchema.extend({
  /** Pools, referenced by index — thousands of bases share a few hundred. */
  groups: z.array(ModPoolGroupSchema),
  bases: z.record(z.string(), z.object({ itemClass: z.string(), group: z.number().int() })),
});
export type ModPoolDataset = z.infer<typeof ModPoolDatasetSchema>;
