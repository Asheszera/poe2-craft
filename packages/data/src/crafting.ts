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

export function currencyEffectsPrompt(dataset: CurrencyEffectDataset): string {
  const byName = new Map(dataset.entries.map((entry) => [entry.name, entry.description]));
  const lines: string[] = [];

  for (const name of CORE_ORBS) {
    const description = byName.get(name);
    // One-line descriptions only: the multi-line ones (Hinekora's Lock) explain
    // a mechanic, not an effect, and belong in prose rather than a reference row.
    if (description && !description.includes('\n')) lines.push(`- **${name}**: ${description}`);
  }

  return lines.join('\n');
}
