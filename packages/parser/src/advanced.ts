import type { AffixType, ModCategory } from '@poe2/models';

/**
 * Advanced Item Description support.
 *
 * With that option enabled the client annotates every modifier with a header
 * line of its own:
 *
 *     { Prefix Modifier "Opalescent" (Tier: 3) — Mana }
 *     +80(80-89) to maximum Mana
 *
 * This is the single most valuable thing the game will tell us. Prefix/suffix,
 * tier, affix name and tags all come from the client itself, so none of them
 * have to be inferred — a `tier` sourced here carries `confidence: 'exact'`
 * (ADR-002), and the whole ambiguity problem disappears for these items.
 *
 * Items copied without the option keep working: no header lines simply means
 * the inference path from the mod database is used instead.
 */

export interface ModifierHeader {
  readonly category: ModCategory;
  readonly affixType: AffixType;
  readonly name: string | null;
  /** Tier as stated by the client. Authoritative. */
  readonly tier: number | null;
  readonly tags: string[];
}

/**
 * `{ Crafted Prefix Modifier "Name" (Tier: 3) — Tag, Tag }`
 *
 * Every part except the braces and the word "Modifier" is optional: implicits
 * have no affix type, runes have no tier, and plenty of modifiers have no name.
 */
const HEADER_RE =
  /^\{\s*(?<qualifiers>[A-Za-z ]*?)\s*Modifier\s*(?:"(?<name>[^"]*)")?\s*(?:\(Tier:\s*(?<tier>\d+)\))?\s*(?:[—–-]\s*(?<tags>[^}]*?))?\s*\}$/;

/** Words that can appear before "Modifier", mapped to what they mean. */
const QUALIFIER_CATEGORY: Readonly<Record<string, ModCategory>> = {
  implicit: 'implicit',
  crafted: 'crafted',
  fractured: 'fractured',
  rune: 'rune',
  enchant: 'enchant',
  enchanted: 'enchant',
  desecrated: 'desecrated',
  sanctum: 'sanctum',
  scourge: 'scourge',
};

export const isModifierHeader = (line: string): boolean => HEADER_RE.test(line.trim());

/**
 * Parses a modifier header line, or returns null when the line is not one.
 *
 * Qualifiers are read independently: `{ Crafted Prefix Modifier … }` carries
 * both a category (crafted) and an affix type (prefix), and either may be
 * absent.
 */
export function parseModifierHeader(line: string): ModifierHeader | null {
  const match = HEADER_RE.exec(line.trim());
  if (!match?.groups) return null;

  const qualifiers = (match.groups['qualifiers'] ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  let category: ModCategory = 'explicit';
  let affixType: AffixType = 'unknown';

  for (const word of qualifiers) {
    if (word === 'prefix' || word === 'suffix') {
      affixType = word;
      continue;
    }
    const mapped = QUALIFIER_CATEGORY[word];
    if (mapped) category = mapped;
  }

  const tierText = match.groups['tier'];
  const name = match.groups['name'];
  const tags = (match.groups['tags'] ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return {
    category,
    affixType,
    name: name === undefined || name.length === 0 ? null : name,
    tier: tierText === undefined ? null : Number(tierText),
    tags,
  };
}
