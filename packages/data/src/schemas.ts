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
  tier: z.number().int().positive(),
  tierTotal: z.number().int().positive(),
});
export type ModEntry = z.infer<typeof ModEntrySchema>;

export const ModDatasetSchema = DatasetMetaSchema.extend({
  entries: z.array(ModEntrySchema),
});
export type ModDataset = z.infer<typeof ModDatasetSchema>;
