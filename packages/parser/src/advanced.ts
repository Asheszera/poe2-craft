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
 * Any line wholly wrapped in braces is an Advanced Item Description annotation,
 * never a statistic.
 *
 * The game heads far more than prefixes and suffixes this way: implicits, runes,
 * enchantments, Soul Cores, and corruption additions all get a `{ … }` line —
 * and several of them omit the word "Modifier" entirely, e.g.
 * `{ Corruption Enhancement — Evasion }`. Recognising only the "… Modifier …"
 * form let those slip through as if they were statistics, so the line beneath a
 * corruption header was fused onto the modifier above it and the pair matched
 * nothing. Matching the braces themselves is what fixes that: a brace line is a
 * boundary no matter what it says inside.
 */
const BRACE_RE = /^\{(?<inside>.+)\}$/;

/** Source keywords that can appear inside a header, mapped to a category. */
const SOURCE_CATEGORY: Readonly<Record<string, ModCategory>> = {
  implicit: 'implicit',
  crafted: 'crafted',
  fractured: 'fractured',
  rune: 'rune',
  enchant: 'enchant',
  enchanted: 'enchant',
  desecrated: 'desecrated',
  sanctum: 'sanctum',
  scourge: 'scourge',
  // Vaal corruption adds a modifier under a "Corruption …" header. It occupies
  // no affix slot, so it must never be read as a prefix or a suffix.
  corruption: 'corrupted',
  corrupted: 'corrupted',
  // Soul Cores are socketed like runes and grant a fixed modifier.
  soul: 'soulcore',
  soulcore: 'soulcore',
};

export const isModifierHeader = (line: string): boolean => BRACE_RE.test(line.trim());

/**
 * Parses a header line, or returns null when the line is not brace-wrapped.
 *
 * The descriptor (before the dash) and the tags (after it) are read separately.
 * Affix type comes only from an explicit "Prefix"/"Suffix"; category comes from
 * a source keyword. A brace header with neither — an unfamiliar source in a
 * future league — defaults to intrinsic, never to an affix, because inventing a
 * prefix out of an unknown header is the exact failure this rewrite removes.
 */
export function parseModifierHeader(line: string): ModifierHeader | null {
  const match = BRACE_RE.exec(line.trim());
  const inside = match?.groups?.['inside'];
  if (inside === undefined) return null;

  // Split the descriptor from the trailing tag list on the em/en dash (or a
  // spaced hyphen) the client uses. A bare hyphen without surrounding spaces is
  // left alone so hyphenated words survive.
  const dash = inside.search(/\s[—–-]\s/);
  const descriptor = (dash >= 0 ? inside.slice(0, dash) : inside).trim();
  const tagText = dash >= 0 ? inside.slice(dash + 1) : '';

  const name = /"([^"]*)"/.exec(descriptor)?.[1];
  const tierText = /\(Tier:\s*(\d+)\)/.exec(descriptor)?.[1];

  const words = descriptor
    .toLowerCase()
    .replace(/"[^"]*"/g, ' ')
    .replace(/\(tier:\s*\d+\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let affixType: AffixType = 'unknown';
  let category: ModCategory | null = null;

  for (const word of words) {
    if (word === 'prefix' || word === 'suffix') affixType = word;
    else category ??= SOURCE_CATEGORY[word] ?? null;
  }

  const tags = tagText
    .replace(/[—–-]/g, ' ')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return {
    // An explicit affix if the client said prefix/suffix and named no other
    // source; otherwise the source it named; otherwise intrinsic by default.
    category: category ?? (affixType === 'unknown' ? 'implicit' : 'explicit'),
    affixType,
    name: name === undefined || name.length === 0 ? null : name,
    tier: tierText === undefined ? null : Number(tierText),
    tags,
  };
}
