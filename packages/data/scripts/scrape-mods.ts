/**
 * Regenerates `data/mods.json` from the community RePoE PoE2 export.
 *
 * Run manually, once per league or major patch:
 *
 *     pnpm --filter @poe2/data scrape:mods
 *
 * Source choice (ADR-005): this is a datamined export of the game's own `Mods`
 * table, published as JSON. It carries generation type, per-tier value ranges,
 * required level and affix names — everything poe2db shows, but structured, so
 * no HTML scraping is involved and a site redesign cannot break it.
 *
 * Of ~16.7k rows only item prefixes and suffixes are kept (~2.6k): those are the
 * only modifiers that occupy an affix slot and therefore the only ones with a
 * tier to infer.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalTemplate, normalizeStat } from '@poe2/shared';
import { z } from 'zod';
import type { ModDataset, ModEntry } from '../src/schemas.js';

const SOURCE = 'https://repoe-fork.github.io/poe2/mods.min.json';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/mods.json');

const RawModSchema = z.object({
  domain: z.string(),
  generation_type: z.string(),
  name: z.string(),
  required_level: z.number(),
  type: z.string(),
  text: z.string().optional(),
  stats: z.array(z.object({ id: z.string(), min: z.number(), max: z.number() })),
});

/**
 * Reduces a datamined modifier text to the parser's canonical template.
 *
 * Two transformations the clipboard side never needs:
 *  - `[Strength|Strength]` wiki-link markup collapses to its display half;
 *  - `(10-19)` value windows collapse to a single placeholder, since the
 *    clipboard prints one concrete number there.
 */
export function templateFromModText(text: string): string {
  const withoutLinks = text
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2')
    .replace(/\[([^\]]+)\]/g, '$1');

  // Covers `(10-19)`, `(-25--10)` and en-dash variants.
  const withoutWindows = withoutLinks.replace(/\(-?[\d.]+(?:\s*[-–—]{1,2}\s*-?[\d.]+)?\)/g, '#');

  return canonicalTemplate(normalizeStat(withoutWindows).template);
}

async function main(): Promise<void> {
  process.stdout.write(`fetching ${SOURCE}\n`);

  const response = await fetch(SOURCE, {
    headers: { 'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)' },
  });
  if (!response.ok) {
    throw new Error(`${SOURCE} responded ${response.status} ${response.statusText}`);
  }

  const raw = z.record(z.string(), z.unknown()).parse(await response.json());

  /** Ladders keyed by `type|key`: every entry in one is a tier of one modifier. */
  const ladders = new Map<string, Omit<ModEntry, 'tier' | 'tierTotal'>[]>();
  let considered = 0;

  for (const [id, value] of Object.entries(raw)) {
    const mod = RawModSchema.safeParse(value);
    if (!mod.success) continue;

    const { domain, generation_type, text, stats } = mod.data;
    // Only item affixes occupy a slot; everything else (jewels, maps, tinctures,
    // implicit-only domains) has no affix tier to speak of.
    if (domain !== 'item') continue;
    if (generation_type !== 'prefix' && generation_type !== 'suffix') continue;
    if (!text || text.length === 0) continue;

    considered += 1;
    const key = templateFromModText(text);
    if (key.length === 0) continue;

    const entry = {
      id,
      name: mod.data.name,
      type: mod.data.type,
      generationType: generation_type,
      requiredLevel: mod.data.required_level,
      key,
      ranges: stats.map((s) => ({ min: s.min, max: s.max })),
    } satisfies Omit<ModEntry, 'tier' | 'tierTotal'>;

    const ladderKey = `${entry.type}|${key}|${generation_type}`;
    const ladder = ladders.get(ladderKey);
    if (ladder) ladder.push(entry);
    else ladders.set(ladderKey, [entry]);
  }

  // T1 is the top of the ladder, so tiers are numbered from the highest
  // required level down — the same way the community and every trade tool do it.
  const entries: ModEntry[] = [];
  for (const ladder of ladders.values()) {
    ladder.sort((a, b) => b.requiredLevel - a.requiredLevel || a.id.localeCompare(b.id));
    const tierTotal = ladder.length;
    ladder.forEach((entry, i) => entries.push({ ...entry, tier: i + 1, tierTotal }));
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const dataset: ModDataset = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    entries,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `considered ${considered} item affixes → wrote ${entries.length} tier entries\n` +
      `  ${ladders.size} distinct ladders\n  ${OUTPUT}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
