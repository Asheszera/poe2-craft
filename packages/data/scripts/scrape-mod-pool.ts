/**
 * Regenerates `data/mod-pool.json` — what each base can actually roll.
 *
 *     pnpm --filter @poe2/data scrape:pool
 *
 * This is the dataset every real crafting plan starts from. Knowing an item has
 * an open suffix is not advice; knowing that suffix can roll cold resistance up
 * to tier 2 at this item level, and cannot roll spell damage at all, is.
 *
 * Two sources are joined:
 *  - `base_items` maps a base's display name ("Pauascale Gloves") to the
 *    metadata path the game uses internally;
 *  - `mods_by_base` maps groups of those paths to the modifiers they accept,
 *    each with the item level it needs.
 *
 * The join matters: gloves are not one pool. An energy-shield base and an
 * armour base share an item class and accept different modifiers, so advising
 * from the item class alone would suggest modifiers the item cannot roll.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import modsDataset from '../data/mods.json' with { type: 'json' };
import type { ModPoolDataset, ModPoolGroup } from '../src/schemas.js';

const BASE_ITEMS = 'https://repoe-fork.github.io/poe2/base_items.min.json';
const MODS_BY_BASE = 'https://repoe-fork.github.io/poe2/mods_by_base.min.json';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/mod-pool.json');

const BaseItemsSchema = z.record(
  z.string(),
  z.object({
    name: z.string().optional(),
    item_class: z.string().optional(),
    domain: z.string().optional(),
    release_state: z.string().optional(),
  }),
);

/** `{ prefix: { ModGroup: { ModId: requiredItemLevel } } }` */
const ModsByBaseSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      bases: z.array(z.string()),
      mods: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
    }),
  ),
);

async function fetchJson(url: string): Promise<unknown> {
  process.stdout.write(`fetching ${url}\n`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)' },
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

async function main(): Promise<void> {
  const baseItems = BaseItemsSchema.parse(await fetchJson(BASE_ITEMS));
  const modsByBase = ModsByBaseSchema.parse(await fetchJson(MODS_BY_BASE));

  // Only modifiers already in the tier dataset are useful: the rest cannot be
  // described in terms of tiers, which is the whole point of the pool.
  const known = new Set(modsDataset.entries.map((entry) => entry.id));

  const nameByPath = new Map<string, { name: string; itemClass: string }>();
  for (const [path, item] of Object.entries(baseItems)) {
    if (item.domain !== 'item' || !item.name || !item.item_class) continue;
    if (item.release_state === 'unique_only') continue;
    nameByPath.set(path, { name: item.name, itemClass: item.item_class });
  }

  const groups: ModPoolGroup[] = [];
  const bases: Record<string, { itemClass: string; group: number }> = {};
  let dropped = 0;

  for (const itemClass of Object.keys(modsByBase)) {
    for (const group of Object.values(modsByBase[itemClass] ?? {})) {
      const collect = (affix: 'prefix' | 'suffix'): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const ladder of Object.values(group.mods[affix] ?? {})) {
          for (const [modId, itemLevel] of Object.entries(ladder)) {
            if (known.has(modId)) out[modId] = itemLevel;
            else dropped += 1;
          }
        }
        return out;
      };

      const pool: ModPoolGroup = { prefix: collect('prefix'), suffix: collect('suffix') };
      if (Object.keys(pool.prefix).length === 0 && Object.keys(pool.suffix).length === 0) continue;

      const index = groups.push(pool) - 1;
      for (const path of group.bases) {
        const base = nameByPath.get(path);
        // Later groups win: the export lists narrower groups after broader ones.
        if (base) bases[base.name] = { itemClass: base.itemClass, group: index };
      }
    }
  }

  const dataset: ModPoolDataset = {
    source: `${BASE_ITEMS} + ${MODS_BY_BASE}`,
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    groups,
    bases,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset)}\n`, 'utf8');

  process.stdout.write(
    `wrote ${Object.keys(bases).length} bases across ${groups.length} pools\n` +
      `  (${dropped} modifier references had no tier entry and were skipped)\n  ${OUTPUT}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
