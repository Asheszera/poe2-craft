import { z } from 'zod';

/**
 * The canonical item model.
 *
 * Design notes
 * ------------
 * 1. Every field is *present* and `null` when absent rather than optional.
 *    Optional properties force call sites into `?.` chains and interact badly
 *    with `exactOptionalPropertyTypes`; a uniform `T | null` keeps consumers
 *    (AI prompt builder, rules engine, SQLite mapper) mechanical.
 *
 * 2. `tier` is deliberately NOT a plain number. The game clipboard does not
 *    expose affix tiers; they are inferred by matching (template, value,
 *    itemLevel, base) against the mod database. Modelling that inference as a
 *    nullable object carrying a confidence level prevents the UI from
 *    presenting a guess as a fact.
 */

export const RaritySchema = z.enum(['Normal', 'Magic', 'Rare', 'Unique', 'Currency', 'Gem', 'Quest']);
export type Rarity = z.infer<typeof RaritySchema>;

/**
 * Where a modifier came from. This mirrors the parenthesised suffix the game
 * appends to the line (`(implicit)`, `(crafted)`, `(rune)`, …). `explicit` is
 * the implied default when no suffix is present.
 */
export const ModCategorySchema = z.enum([
  'implicit',
  'explicit',
  'crafted',
  'enchant',
  'fractured',
  'rune',
  'desecrated',
  'sanctum',
  'scourge',
]);
export type ModCategory = z.infer<typeof ModCategorySchema>;

export const AffixTypeSchema = z.enum(['prefix', 'suffix', 'unknown']);
export type AffixType = z.infer<typeof AffixTypeSchema>;

export const TierConfidenceSchema = z.enum([
  /** The client itself stated the tier (Advanced Item Description enabled). */
  'exact',
  /** Uniquely resolved against the mod database. */
  'inferred',
  /** Several tiers overlap for this value; `value` holds the best candidate. */
  'ambiguous',
]);

export const ModTierSchema = z.object({
  value: z.number().int().positive(),
  total: z.number().int().positive().nullable(),
  name: z.string().nullable(),
  confidence: TierConfidenceSchema,
});
export type ModTier = z.infer<typeof ModTierSchema>;

export const ItemModSchema = z.object({
  /** Canonical GGG stat id when matched, otherwise a slug of the template. */
  statId: z.string().min(1),
  category: ModCategorySchema,
  affixType: AffixTypeSchema,
  /** Raw line as printed by the game, tags stripped. */
  text: z.string(),
  /** Numeric literals replaced by `#` — the mod-database lookup key. */
  template: z.string(),
  values: z.array(z.number()),
  tier: ModTierSchema.nullable(),
  /** False when the mod database had no entry; `statId` is then a slug. */
  matched: z.boolean(),
});
export type ItemMod = z.infer<typeof ItemModSchema>;

export const DamageRangeSchema = z.object({ min: z.number(), max: z.number() });
export type DamageRange = z.infer<typeof DamageRangeSchema>;

/**
 * `element` is nullable because the client prints `Elemental Damage: 12-24`
 * and conveys the element through colour only. It is resolved later by
 * cross-referencing the explicit `Adds # to # Fire Damage` mods; when that is
 * ambiguous it stays null rather than being guessed.
 */
export const ElementalDamageSchema = DamageRangeSchema.extend({
  element: z.enum(['fire', 'cold', 'lightning']).nullable(),
});

export const RequirementsSchema = z.object({
  level: z.number().int().nullable(),
  strength: z.number().int().nullable(),
  dexterity: z.number().int().nullable(),
  intelligence: z.number().int().nullable(),
});

/** Defensive / offensive numbers printed in the item's property block. */
export const ItemPropertiesSchema = z.object({
  quality: z.number().int().nullable(),
  armour: z.number().int().nullable(),
  evasion: z.number().int().nullable(),
  energyShield: z.number().int().nullable(),
  block: z.number().nullable(),
  spirit: z.number().int().nullable(),
  physicalDamage: DamageRangeSchema.nullable(),
  elementalDamage: z.array(ElementalDamageSchema),
  chaosDamage: DamageRangeSchema.nullable(),
  criticalChance: z.number().nullable(),
  attacksPerSecond: z.number().nullable(),
  weaponRange: z.number().nullable(),
  /** Waystones / maps. */
  waystoneTier: z.number().int().nullable(),
  stackSize: z.object({ current: z.number().int(), max: z.number().int() }).nullable(),
});
export type ItemProperties = z.infer<typeof ItemPropertiesSchema>;

export const ItemFlagsSchema = z.object({
  corrupted: z.boolean(),
  mirrored: z.boolean(),
  unidentified: z.boolean(),
  fractured: z.boolean(),
  desecrated: z.boolean(),
  /** Item is a currency/consumable rather than equippable gear. */
  isCurrency: z.boolean(),
});

export const ParsedItemSchema = z.object({
  /** `Item Class: Two Hand Maces` — PoE2 always emits this as line 1. */
  itemClass: z.string().nullable(),
  rarity: RaritySchema,
  /** Rare/Unique display name. Null for Normal and Magic items. */
  name: z.string().nullable(),
  baseType: z.string(),
  itemLevel: z.number().int().nullable(),
  properties: ItemPropertiesSchema,
  requirements: RequirementsSchema,
  /** PoE2 rune sockets, e.g. `S S` → 2. */
  sockets: z.number().int(),
  mods: z.array(ItemModSchema),
  flags: ItemFlagsSchema,
  /** Trade note the client appends, e.g. `~price 3 divine`. */
  note: z.string().nullable(),
  /** Italic lore block printed on uniques. Never fed to the rules engine. */
  flavourText: z.string().nullable(),
  /** Lines the parser could not attribute. Surfaced in dev, logged in prod. */
  unparsedLines: z.array(z.string()),
  /** Original clipboard text, kept for history/debugging and re-parsing. */
  raw: z.string(),
});
export type ParsedItem = z.infer<typeof ParsedItemSchema>;

/** Convenience selectors — keep filtering logic out of the UI. */
export const modsOf = (item: ParsedItem, category: ModCategory): ItemMod[] =>
  item.mods.filter((m) => m.category === category);

export const prefixes = (item: ParsedItem): ItemMod[] =>
  item.mods.filter((m) => m.affixType === 'prefix');

export const suffixes = (item: ParsedItem): ItemMod[] =>
  item.mods.filter((m) => m.affixType === 'suffix');

/**
 * Categories that occupy one of the item's prefix/suffix slots.
 *
 * This distinction drives everything above the parser: only these count toward
 * the affix budget, only these are what an Exalted Orb can add, and only these
 * have a tier to infer. Implicits, runes and enchantments are *intrinsic* — they
 * ride along without consuming a slot.
 */
export const AFFIX_CATEGORIES: readonly ModCategory[] = [
  'explicit',
  'crafted',
  'fractured',
  'desecrated',
];

export const isAffixMod = (mod: ItemMod): boolean => AFFIX_CATEGORIES.includes(mod.category);

/** Modifiers that consume an affix slot. */
export const affixMods = (item: ParsedItem): ItemMod[] => item.mods.filter(isAffixMod);

/** Implicits, runes, enchantments — present but not part of the affix budget. */
export const intrinsicMods = (item: ParsedItem): ItemMod[] =>
  item.mods.filter((mod) => !isAffixMod(mod));

/**
 * How many affix slots the rarity allows in total.
 *
 * `null` means the concept does not apply: uniques carry a fixed modifier list,
 * and normal items have none. Currency/gems are not equippable at all.
 */
export function affixBudget(rarity: Rarity): number | null {
  switch (rarity) {
    case 'Magic':
      return 2; // one prefix + one suffix
    case 'Rare':
      return 6; // three prefixes + three suffixes
    default:
      return null;
  }
}

/**
 * True when an item carries more affixes than the game can produce.
 *
 * The only way this happens is a parsing fault — a property or description line
 * misread as a modifier. Surfacing it turns a silent data error into something
 * the UI can show and a test can assert.
 */
export function exceedsAffixBudget(item: ParsedItem): boolean {
  const budget = affixBudget(item.rarity);
  return budget !== null && affixMods(item).length > budget;
}
