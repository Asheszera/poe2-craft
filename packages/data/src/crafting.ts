import type { CurrencyDataset, CurrencyEntry } from './schemas.js';

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
