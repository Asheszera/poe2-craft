/**
 * Regenerates `data/mod-weights.json` — how likely each modifier is to roll.
 *
 *     pnpm --filter @poe2/data scrape:weights
 *
 * Source choice (ADR-005 addendum): poe2db, not the RePoE export. RePoE's PoE2
 * `spawn_weights` are 0 or 1 on every row, which is wrong — the same modifier
 * (`of the Brute`, +5-8 Strength) carries weight 1 there and 1000 here, with an
 * identical tag list. This is the only source found that publishes PoE2's real
 * graded weights.
 *
 * The data is the payload behind poe2db's crafting calculator, embedded in each
 * item-class page as one JSON object per modifier:
 *
 *     {"Name":"of the Brute","Level":"1","ModGenerationTypeID":"2",
 *      "ModFamilyList":["Strength"],"DropChance":"1000",
 *      "str":"<span …>+(5—8)</span> to <a …>Strength</a>",
 *      "spawn_no":["ring","amulet","belt","str_armour",…]}
 *
 * `DropChance` is already resolved for that page's item class, which is exactly
 * the number wanted: weights are per tag in the game data, and the page has
 * done the tag resolution. So one fetch per class — and, for armour, per
 * attribute variant, since a `str` glove and an `int` glove roll different
 * pools at different weights.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { canonicalTemplate, normalizeStat } from '@poe2/shared';
import modsDataset from '../data/mods.json' with { type: 'json' };
import type { ModWeightDataset } from '../src/schemas.js';

const BASE_ITEMS = 'https://repoe-fork.github.io/poe2/base_items.min.json';
const PAGE = (slug: string): string => `https://poe2db.tw/us/${slug}`;
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/mod-weights.json');

/**
 * Item class as the game names it → poe2db's page slug.
 *
 * Written out rather than derived: poe2db pluralises by hand (`Staves`, `Foci`,
 * `Body_Armours`) and a guessed slug fails silently as an empty page, which is
 * the failure mode this file exists to avoid.
 */
const SLUGS: Readonly<Record<string, string>> = {
  'Body Armour': 'Body_Armours',
  Helmet: 'Helmets',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Shield: 'Shields',
  Focus: 'Foci',
  Buckler: 'Bucklers',
  Amulet: 'Amulets',
  Ring: 'Rings',
  Belt: 'Belts',
  Talisman: 'Talismans',
  Quiver: 'Quivers',
  Bow: 'Bows',
  Crossbow: 'Crossbows',
  Wand: 'Wands',
  Staff: 'Staves',
  // The game's class is `Warstaff`; poe2db files them under the name the
  // players use. A guessed `Warstaves` returns 404 and would have cost this
  // class its weights silently.
  Warstaff: 'Quarterstaves',
  Sceptre: 'Sceptres',
  Dagger: 'Daggers',
  Claw: 'Claws',
  Spear: 'Spears',
  Flail: 'Flails',
  'One Hand Sword': 'One_Hand_Swords',
  'Two Hand Sword': 'Two_Hand_Swords',
  'One Hand Axe': 'One_Hand_Axes',
  'Two Hand Axe': 'Two_Hand_Axes',
  'One Hand Mace': 'One_Hand_Maces',
  'Two Hand Mace': 'Two_Hand_Maces',
  TrapTool: 'Traps',
  FishingRod: 'Fishing_Rods',
};

/** Attribute variants, longest first so `str_dex_int` wins over `str_dex`. */
const ATTRIBUTES = ['str_dex_int', 'str_dex', 'str_int', 'dex_int', 'str', 'dex', 'int'] as const;

const BaseItemsSchema = z.record(
  z.string(),
  z.object({
    name: z.string().optional(),
    item_class: z.string().optional(),
    domain: z.string().optional(),
    release_state: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
);

/** poe2db's per-modifier record. Only the fields this join needs. */
const RecordSchema = z.object({
  Name: z.string().optional(),
  Level: z.union([z.string(), z.number()]),
  ModGenerationTypeID: z.union([z.string(), z.number()]).optional(),
  ModFamilyList: z.array(z.string()).default([]),
  DropChance: z.union([z.string(), z.number()]),
  str: z.string(),
});

/** poe2db writes 1 = prefix, 2 = suffix. */
const GENERATION_TYPE: Readonly<Record<string, 'prefix' | 'suffix'>> = { '1': 'prefix', '2': 'suffix' };

/**
 * The attribute variant a base belongs to, from its tags.
 *
 * `str_dex_armour` → `str_dex`. Null for anything with no attribute split,
 * which is every class whose page has no variants.
 */
function attributeOf(tags: readonly string[]): string | null {
  for (const attribute of ATTRIBUTES) {
    if (tags.includes(`${attribute}_armour`)) return attribute;
  }
  return null;
}

/** Strips poe2db's markup, leaving the modifier text the parser would see. */
function textOf(html: string): string {
  return html
    .replace(/<span class="ndash">—<\/span>/g, '-')
    // A hybrid modifier is two lines in one block, separated by `<br>`. Dropping
    // the tag without putting anything back glues them into
    // `…spell damage# to maximum mana`, which matches nothing — 326 of the 380
    // keys that failed to join were exactly this.
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduces poe2db's rendered text to the canonical template.
 *
 * The same reduction `scrape-mods.ts` applies to the datamined text, so the two
 * datasets meet on one key. Value windows — `+(5-8) to Strength` — collapse to
 * the `#` the clipboard prints.
 */
function templateOf(html: string): string {
  const withoutWindows = textOf(html).replace(/\(-?[\d.]+(?:\s*[-–—]{1,2}\s*-?[\d.]+)?\)/g, '#');
  return canonicalTemplate(normalizeStat(withoutWindows).template);
}

/** What a weight is filed under: enough to identify one tier of one ladder. */
export const joinKey = (
  template: string,
  level: number,
  generationType: string,
  group: string,
): string => `${template}|${level}|${generationType}|${group}`;

/**
 * Every `{…}` in the page holding a `DropChance`, found by scanning braces
 * outward from each hit.
 *
 * A regex cannot do this — the objects nest — and the mistake that made this
 * file necessary was exactly a regex that silently matched a subset. Here a
 * record either parses as JSON or is counted as skipped, and the count is
 * printed.
 */
function extractRecords(html: string): { parsed: unknown[]; skipped: number } {
  const parsed: unknown[] = [];
  let skipped = 0;
  let at = 0;

  while ((at = html.indexOf('"DropChance"', at + 1)) > 0) {
    let depth = 0;
    let start = -1;
    for (let i = at; i >= 0 && at - i < 8000; i--) {
      if (html[i] === '}') depth += 1;
      else if (html[i] === '{') {
        if (depth === 0) {
          start = i;
          break;
        }
        depth -= 1;
      }
    }
    if (start < 0) {
      skipped += 1;
      continue;
    }

    depth = 0;
    let end = -1;
    for (let i = start; i < html.length && i - start < 16_000; i++) {
      if (html[i] === '{') depth += 1;
      else if (html[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) {
      skipped += 1;
      continue;
    }

    try {
      parsed.push(JSON.parse(html.slice(start, end)));
    } catch {
      skipped += 1;
    }
  }

  return { parsed, skipped };
}

async function fetchPage(slug: string): Promise<string | null> {
  const response = await fetch(PAGE(slug), {
    headers: { 'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)' },
  });
  if (!response.ok) return null;
  return response.text();
}

/** Weights for one page, keyed for the join against `mods.json`. */
function weightsFrom(html: string): { weights: Record<string, number>; skipped: number; graded: number } {
  const { parsed, skipped } = extractRecords(html);
  const weights: Record<string, number> = {};
  let graded = 0;

  for (const raw of parsed) {
    const record = RecordSchema.safeParse(raw);
    if (!record.success) continue;

    const { Level, ModGenerationTypeID, ModFamilyList, DropChance, str } = record.data;
    const weight = Number(DropChance);
    const level = Number(Level);
    const generationType = GENERATION_TYPE[String(ModGenerationTypeID)];
    const group = ModFamilyList[0];

    // A zero-weight modifier cannot roll here; the pool already knows that from
    // the level gate, and storing zeros would triple the file for no answer.
    if (!generationType || group === undefined || !Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(level)) continue;

    const template = templateOf(str);
    if (template.length === 0) continue;

    if (weight > 1) graded += 1;
    weights[joinKey(template, level, generationType, group)] = weight;
  }

  return { weights, skipped, graded };
}

async function main(): Promise<void> {
  process.stdout.write(`fetching ${BASE_ITEMS}\n`);
  const baseResponse = await fetch(BASE_ITEMS, {
    headers: { 'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)' },
  });
  if (!baseResponse.ok) throw new Error(`${BASE_ITEMS} responded ${baseResponse.status}`);
  const baseItems = BaseItemsSchema.parse(await baseResponse.json());

  /**
   * Candidate pages per base, most specific first.
   *
   * Armour splits by attribute (`Gloves_str_dex`), but several classes that
   * *have* attribute tags are published on one undivided page (`Foci`,
   * `Bucklers`). Rather than encode which is which, both are tried and the one
   * carrying graded weights wins — so a slug that quietly stops existing shows
   * up as a gap in the report instead of as silently missing weights.
   */
  const candidates = new Map<string, string[]>();

  for (const item of Object.values(baseItems)) {
    if (item.domain !== 'item' || !item.name || !item.item_class) continue;
    if (item.release_state === 'unique_only') continue;

    const slug = SLUGS[item.item_class];
    if (!slug) continue;

    const attribute = attributeOf(item.tags);
    candidates.set(item.name, attribute === null ? [slug] : [`${slug}_${attribute}`, slug]);
  }

  const contexts: Record<string, Record<string, number>> = {};
  const bases: Record<string, string> = {};
  /** slug → whether it yielded graded weights. Each page is fetched once. */
  const tried = new Map<string, boolean>();
  const rejected: string[] = [];
  let totalSkipped = 0;

  // Sequential on purpose: this is someone else's web site, run once a league.
  const usable = async (slug: string): Promise<boolean> => {
    const seen = tried.get(slug);
    if (seen !== undefined) return seen;

    const html = await fetchPage(slug);
    if (html === null) {
      tried.set(slug, false);
      rejected.push(`${slug} (HTTP error)`);
      return false;
    }

    const { weights, skipped, graded } = weightsFrom(html);
    totalSkipped += skipped;

    if (graded === 0) {
      tried.set(slug, false);
      rejected.push(`${slug} (${Object.keys(weights).length} records, none graded)`);
      return false;
    }

    contexts[slug] = weights;
    tried.set(slug, true);
    process.stdout.write(`  ${slug}: ${Object.keys(weights).length} weights, ${graded} graded\n`);
    return true;
  };

  const unweighted = new Set<string>();
  for (const [base, slugs] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    let matched = false;
    for (const slug of slugs) {
      if (await usable(slug)) {
        bases[base] = slug;
        matched = true;
        break;
      }
    }
    if (!matched) unweighted.add(slugs[slugs.length - 1] ?? base);
  }

  const dataset: ModWeightDataset = {
    source: 'https://poe2db.tw/us/ (crafting calculator payload)',
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    contexts,
    bases,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset)}\n`, 'utf8');

  // Coverage against the modifier table, because a join key that matches
  // nothing is the one failure this whole file could have and still look fine.
  const known = new Set<string>();
  for (const entry of modsDataset.entries) {
    for (const group of entry.groups) {
      known.add(joinKey(entry.key, entry.requiredLevel, entry.generationType, group));
    }
  }
  const allKeys = new Set(Object.values(contexts).flatMap((c) => Object.keys(c)));
  const matched = [...allKeys].filter((k) => known.has(k)).length;

  process.stdout.write(
    `\nwrote ${Object.keys(contexts).length} contexts covering ${Object.keys(bases).length} bases\n` +
      `  ${allKeys.size} distinct weighted modifiers, ${matched} of them join to mods.json ` +
      `(${((100 * matched) / Math.max(1, allKeys.size)).toFixed(1)}%)\n` +
      (totalSkipped > 0 ? `  ${totalSkipped} records could not be parsed\n` : '') +
      // Named, not swallowed: these classes get no weights at all, and the
      // application has to say so rather than quietly show a flat pool.
      (unweighted.size > 0
        ? `  NO WEIGHTS PUBLISHED for: ${[...unweighted].sort().join(', ')}\n`
        : '') +
      (rejected.length > 0 ? `  pages tried and rejected: ${rejected.length}\n` : '') +
      `  ${OUTPUT}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
