import type { CurrencyDataset, CurrencyEffectDataset, CurrencyEntry } from './schemas.js';

/**
 * The crafting toolset, described for a prompt.
 *
 * A model plans a craft with whatever currencies it remembers, and its memory
 * stops at its training cutoff — it will not reach for a Perfect Regal Orb or an
 * Omen of Catalysing Exaltation it has never heard of, and it may confidently
 * reach for something that no longer exists. Handing it the live list from the
 * trade API turns "what do I remember?" into "what is available?".
 *
 * Full names are given for the categories a plan actually names step by step.
 * The large families (essences, omens, runes) are summarised with examples and
 * a count: 372 names would crowd out the item itself, and the model only needs
 * to know the family exists, how it is named, and that it must not invent a
 * member it cannot recall.
 */

const FULLY_LISTED = new Set(['Currency', 'Abyssal Bones']);

/** Families where a handful of examples conveys the naming pattern. */
const SUMMARISED: readonly { category: string; note: string }[] = [
  {
    category: 'Essences',
    note: 'add or guarantee a specific modifier — the deterministic alternative to gambling',
  },
  { category: 'Ritual', note: 'includes Omens, which change how another currency behaves' },
  { category: 'Runes', note: 'socketed into an item for a fixed modifier' },
  { category: 'Vaal', note: 'corruption outcomes' },
];

const namesIn = (entries: readonly CurrencyEntry[], category: string): string[] =>
  entries
    .filter((entry) => entry.category === category && entry.name.trim().length > 0)
    .map((entry) => entry.name);

export function craftingToolsetPrompt(dataset: CurrencyDataset): string {
  const sections: string[] = [];

  for (const category of FULLY_LISTED) {
    const names = namesIn(dataset.entries, category);
    if (names.length > 0) sections.push(`- **${category}**: ${names.join(', ')}`);
  }

  for (const { category, note } of SUMMARISED) {
    const names = namesIn(dataset.entries, category);
    if (names.length === 0) continue;
    const examples = names.slice(0, 6).join(', ');
    sections.push(`- **${category}** (${names.length}, ${note}) — for example: ${examples}`);
  }

  return sections.join('\n');
}

/** True when the name exists in the live game data. Used to check a plan. */
export const isKnownCurrency = (dataset: CurrencyDataset, name: string): boolean =>
  dataset.entries.some((entry) => entry.name.toLowerCase() === name.trim().toLowerCase());

/**
 * The core orbs with the game's own description of what each does.
 *
 * This exists because the community model of PoE2 crafting is often PoE1's, and
 * a model trained on that will describe a Chaos Orb as a full reroll — in PoE2
 * it removes one modifier and adds one. Giving the model the game's own text
 * for the currencies a plan actually names step by step stops it planning
 * around remembered mechanics.
 *
 * Only the deterministic orbs are listed. Vaal ("modifies unpredictably"),
 * omens and essences do more than one line can state, and are left to the
 * summarised families above rather than pinned to a description that flattens
 * them.
 */
const CORE_ORBS = [
  'Orb of Transmutation',
  'Orb of Augmentation',
  'Regal Orb',
  'Orb of Alchemy',
  'Exalted Orb',
  'Chaos Orb',
  'Orb of Annulment',
  'Divine Orb',
  'Fracturing Orb',
] as const;

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * A currency is relevant to crafting an equipment item when its effect touches a
 * modifier, rarity, quality, socket or corruption — and is *not* about maps,
 * the atlas, tablets, waystones, strongboxes, beasts or league consumables,
 * which do real things to other systems but nothing to the item on the bench.
 */
const CRAFTING_EFFECT =
  /\b(modifier|rarity|quality|socket|corrupt|reforge|implicit|fracture|desecrat|augment|influence|enchant|unique|sanctif|guaranteed|split)/i;
const NOT_GEAR =
  /\b(map|atlas|tablet|waystone|strongbox|beast|breach|voidstone|sextant|cartographer|logbook|tower|precursor|scarab|kirac|expedition|incubat)/i;

/**
 * Large families of near-identical currencies, collapsed to one line each.
 *
 * The catalogue holds dozens of Catalysts, Fossils and influence orbs that
 * differ only by which tag they touch. Listing every one would bloat the prompt
 * for no gain — the model needs to know the family exists and how it is named,
 * not to read the same sentence twenty times. Each family is summarised with its
 * member count so the model still knows the breadth.
 */
const FAMILIES: readonly { readonly label: string; readonly test: RegExp; readonly summary: string }[] = [
  { label: 'Catalysts', test: /Catalyst$/, summary: 'add tag-specific quality to a ring, amulet or jewel (one per damage/defence type)' },
  { label: 'Fossils', test: /Fossil$/, summary: 'bias the modifier pool toward or away from a tag, socketed in a resonator' },
  { label: 'Desecration Bones', test: /(Collarbone|Jawbone|Rib|Cranium|Vertebrae|Gaze)$/, summary: 'desecrate a rare item, adding an Abyssal (otherworldly) modifier from the Kurgal/Amanamu/Ulaman pools' },
  { label: 'Eldritch Embers and Ichors', test: /Eldritch (Ember|Ichor)$/, summary: 'add a Searing Exarch or Eater of Worlds implicit to armour' },
  { label: 'Influence Exalted Orbs', test: /^(Crusader's|Hunter's|Redeemer's|Warlord's) Exalted Orb$/, summary: 'add an influence and a new influenced modifier to a rare item' },
  { label: 'Orbs of Sacrifice', test: /Orb of Sacrifice$/, summary: 'upgrade a Corruption Enchantment and remove a random modifier' },
  { label: 'Fluxes', test: /Flux$/, summary: 'transform all resistances of two elements into a third' },
  { label: "Jeweller's Orbs", test: /Jeweller's Orb$/, summary: "set a Skill Gem's support socket count" },
  { label: 'Regrading Lenses', test: /Regrading Lens$/, summary: 'reroll the quality type of a skill or support gem' },
];

export function currencyEffectsPrompt(dataset: CurrencyEffectDataset): string {
  const byName = new Map(dataset.entries.map((entry) => [entry.name, flat(entry.description)]));
  const sections: string[] = [];

  // The everyday orbs, in the order a plan reaches for them.
  const core = CORE_ORBS.filter((name) => byName.has(name)).map(
    (name) => `- **${name}**: ${byName.get(name)}`,
  );
  if (core.length > 0) sections.push(`Core orbs:\n${core.join('\n')}`);

  // Everything else that acts on an equipment item. Family members are counted
  // and summarised; the rest are listed individually, deduplicated by effect.
  const familyCounts = new Map<number, number>();
  const seenEffect = new Set<string>();
  const others: string[] = [];

  for (const entry of dataset.entries) {
    if (entry.itemClass !== 'StackableCurrency') continue;
    if (CORE_ORBS.includes(entry.name as (typeof CORE_ORBS)[number])) continue;
    if (/^\[|DNT/.test(entry.name)) continue; // internal / do-not-translate rows
    if (/^Essence of/.test(entry.name)) continue; // grouped separately below

    const familyIndex = FAMILIES.findIndex((family) => family.test.test(entry.name));
    if (familyIndex >= 0) {
      familyCounts.set(familyIndex, (familyCounts.get(familyIndex) ?? 0) + 1);
      continue;
    }

    const description = byName.get(entry.name) ?? '';
    if (!CRAFTING_EFFECT.test(description) || NOT_GEAR.test(description)) continue;
    if (seenEffect.has(description)) continue;
    seenEffect.add(description);
    others.push(`- **${entry.name}**: ${description}`);
  }

  if (others.length > 0) {
    sections.push(`Other item currencies (one per distinct effect):\n${others.join('\n')}`);
  }

  const families = [...familyCounts.entries()].flatMap(([index, count]) => {
    const family = FAMILIES[index];
    return family ? [`- **${family.label}** (${count}): ${family.summary}`] : [];
  });

  // Soul Cores are their own item class: socketables that grant a fixed
  // modifier when placed in an Augment Socket, the way runes do. Counted as a
  // family because there are scores of them, most sharing an effect shape.
  const soulCores = dataset.entries.filter(
    (entry) => entry.itemClass === 'SoulCore' && !/^\[|DNT/.test(entry.name),
  );
  if (soulCores.length > 0) {
    families.push(
      `- **Soul Cores** (${soulCores.length}): socket into an item's Augment Socket to grant a fixed modifier`,
    );
  }

  if (families.length > 0) sections.push(`Currency families:\n${families.join('\n')}`);

  // Essences: the game's data describes them all identically ("a guaranteed
  // modifier") without naming which modifier each guarantees, so they are listed
  // as a family with that honest caveat rather than with invented specifics.
  const essences = dataset.entries
    .filter((entry) => /^Essence of/.test(entry.name))
    .map((entry) => entry.name.replace(/^Essence of /, ''));
  if (essences.length > 0) {
    sections.push(
      `Essences (${essences.length}): each guarantees a specific modifier when it upgrades a ` +
        `Magic item to Rare, or (the corrupted/perfect variants) swaps one on a Rare. The game ` +
        `data does not expose which modifier each name guarantees, so name the essence family and ` +
        `say the player should confirm the exact modifier in game: ${essences.join(', ')}`,
    );
  }

  return sections.join('\n\n');
}

/**
 * Omens that modify how a crafting currency behaves, with the game's own text.
 *
 * This is where advanced crafting lives: an Omen of Sinistral Exaltation makes
 * the next Exalted Orb add only a prefix, which is how a veteran forces a result
 * onto one side or shrinks the pool a later step draws from. The model cannot
 * reason about these unless it is told they exist and exactly what they do — and
 * it must not invent them, because their names and effects are PoE2-specific and
 * change between leagues.
 *
 * Filtered to gear crafting: omens that modify Waystones, logbooks, shrines,
 * strongboxes or gambling are real but irrelevant to improving an item, and
 * listing them would bury the ones that matter.
 */
const GEAR_CURRENCY_TERMS =
  /\b(Exalted|Annulment|Chaos Orb|Regal|Alchemy|Essence|Divine Orb|Desecrat|Orb of Chance)\b/;
const NON_GEAR_TERMS = /\b(Waystone|Logbook|Shrine|Strongbox|Gamble|Vendor|Flask|Experience)\b/;

export function craftingOmensPrompt(dataset: CurrencyEffectDataset): string {
  // The game wraps descriptions with embedded newlines; collapse them so the
  // text can be filtered and printed as one line.
  const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

  const omens = dataset.entries
    .filter((entry) => entry.itemClass === 'Omen')
    .map((entry) => ({ name: entry.name, description: flat(entry.description) }))
    .filter(
      (entry) =>
        GEAR_CURRENCY_TERMS.test(entry.description) && !NON_GEAR_TERMS.test(entry.description),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return omens
    .map((omen) => {
      // The lead-in is identical on every omen and carries no information; the
      // effect ("your next Exalted Orb will…") is what the model needs.
      const effect = omen.description.replace(
        /^While this item is active in your inventory\s*/,
        '',
      );
      return `- **${omen.name}**: ${effect}`;
    })
    .join('\n');
}
