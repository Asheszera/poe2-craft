import type { ItemMod, ModCategory } from '@poe2/models';
import { normalizeStat, slugifyTemplate, stripRollRanges } from '@poe2/shared';
import type { ModifierHeader } from './advanced.js';

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
 * Builds a structured modifier from one or more lines.
 *
 * @param lines The statistic text. More than one when a single modifier grants
 *   several statistics — the client prints them under one header.
 * @param header Present only with Advanced Item Description enabled. When it is
 *   there, everything it states (affix type, tier, name, tags) is authoritative
 *   and nothing is inferred.
 *
 * Without a header the result is deliberately "unenriched": `affixType` is
 * `unknown` and `tier` is `null`, both resolved later by `@poe2/data`. That
 * keeps this function pure, synchronous and inside the 20 ms budget.
 */
export function parseModLine(
  lines: string | string[],
  defaultCategory: ModCategory = 'explicit',
  header?: ModifierHeader | null,
): ItemMod {
  const joined = (Array.isArray(lines) ? lines : [lines]).join('\n');
  const { text: tagless, category } = stripTag(joined);

  // The client's `(min-max)` annotations must come out before the statistic is
  // normalised, or the window's digits are read as part of the statistic.
  const { text, ranges } = stripRollRanges(tagless);
  const { template, values } = normalizeStat(text);

  return {
    statId: slugifyTemplate(template),
    category: header?.category ?? category ?? defaultCategory,
    affixType: header?.affixType ?? 'unknown',
    affixName: header?.name ?? null,
    tags: header?.tags ?? [],
    valueRanges: ranges,
    text,
    template,
    values,
    // Stated by the client, so it is fact rather than inference. `total` still
    // needs the modifier table — the client says "Tier: 3", never "of 8".
    tier:
      header?.tier == null
        ? null
        : { value: header.tier, total: null, name: header.name, confidence: 'exact' },
    matched: false,
  };
}
