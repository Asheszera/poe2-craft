/**
 * Text primitives shared by the parser and the knowledge-base tooling.
 *
 * The scraper in `@poe2/data` and the runtime parser MUST use the exact same
 * normalization functions, otherwise templates scraped from poe2db will not
 * match templates produced from the clipboard. That shared-normalization
 * guarantee is the whole reason these live in `@poe2/shared` and not in
 * `@poe2/parser`.
 */

/**
 * Matches a signed decimal number, treating `-` as a sign only when it does not
 * directly follow a digit. This keeps hyphenated ranges (`168-252`) as two
 * positive numbers while still parsing genuine negatives (`-25% to Fire Resistance`).
 */
const NUMBER_RE = /(?<!\d)[+-]?\d+(?:\.\d+)?/g;

/** Extracts every numeric literal from a line, in order of appearance. */
export function extractNumbers(text: string): number[] {
  return Array.from(text.matchAll(NUMBER_RE), (m) => Number(m[0]));
}

export interface NormalizedStat {
  /** The line with every numeric literal replaced by `#`. */
  readonly template: string;
  /** Numeric literals in order of appearance. */
  readonly values: number[];
}

/**
 * Turns `"+169% increased Physical Damage"` into
 * `{ template: "+#% increased Physical Damage", values: [169] }`.
 *
 * Whitespace is collapsed so that trailing spaces from the game client (which
 * does emit them, e.g. on `Sockets: S S `) never leak into a lookup key.
 */
export function normalizeStat(text: string): NormalizedStat {
  const values = extractNumbers(text);
  const template = text.replace(NUMBER_RE, '#').replace(/\s+/g, ' ').trim();
  return { template, values };
}

/**
 * Reduces a template to the form used as a lookup key.
 *
 * Necessary because the two sides of the match spell signs differently: the
 * clipboard prints `+38 to maximum Life`, whose sign this module absorbs into
 * the number (`# to maximum Life`), while GGG's own stat list is inconsistent
 * and ships both `# to maximum Mana` and `+#% total to Cold Resistance`.
 * Canonicalising both sides through this function is what makes the lookup an
 * exact string match instead of a fuzzy one.
 */
export function canonicalTemplate(template: string): string {
  return template
    .replace(/\+(?=#)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Surrogate stat identifier derived purely from the template.
 *
 * This is a *fallback*: once a line is matched against the mod database the
 * canonical GGG stat id is used instead. It exists so that an unknown mod is
 * still queryable/aggregatable instead of collapsing to raw text.
 */
export function slugifyTemplate(template: string): string {
  return template
    .toLowerCase()
    .replace(/#%/g, 'pct')
    .replace(/#/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Normalizes clipboard line endings and strips the UTF-8 BOM. */
export function toLines(raw: string): string[] {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
}
