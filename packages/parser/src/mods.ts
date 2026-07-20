import type { ItemMod, ModCategory } from '@poe2/models';
import { normalizeStat, slugifyTemplate } from '@poe2/shared';

/**
 * Suffix tags the client appends to a modifier line. `augmented` is excluded on
 * purpose: it decorates *property* values, never modifier lines.
 */
const TAG_TO_CATEGORY: Readonly<Record<string, ModCategory>> = {
  implicit: 'implicit',
  crafted: 'crafted',
  enchant: 'enchant',
  enchanted: 'enchant',
  fractured: 'fractured',
  rune: 'rune',
  'rune mod': 'rune',
  desecrated: 'desecrated',
  sanctum: 'sanctum',
  scourge: 'scourge',
};

const TAG_RE = /\s*\(([a-z ]+)\)\s*$/i;

export interface StrippedLine {
  readonly text: string;
  readonly category: ModCategory | null;
}

/**
 * Removes the trailing `(implicit)`-style tag from a line.
 *
 * Returns `category: null` when there is no tag — the caller decides the
 * default, because an untagged line means "explicit" inside a modifier block
 * but means something else entirely inside a header block.
 */
export function stripTag(line: string): StrippedLine {
  const match = TAG_RE.exec(line);
  if (!match?.[1]) return { text: line.trim(), category: null };

  const category = TAG_TO_CATEGORY[match[1].toLowerCase()];
  if (!category) return { text: line.trim(), category: null };

  return { text: line.slice(0, match.index).trim(), category };
}

/**
 * Builds a structured modifier from a single line.
 *
 * The result is intentionally "unenriched": `affixType` is `unknown` and `tier`
 * is `null`. Resolving those requires the mod database and happens in a
 * separate pass (`@poe2/data`), which keeps this function pure, synchronous and
 * comfortably inside the 20ms parsing budget.
 */
export function parseModLine(line: string, defaultCategory: ModCategory = 'explicit'): ItemMod {
  const { text, category } = stripTag(line);
  const { template, values } = normalizeStat(text);

  return {
    statId: slugifyTemplate(template),
    category: category ?? defaultCategory,
    affixType: 'unknown',
    text,
    template,
    values,
    tier: null,
    matched: false,
  };
}
