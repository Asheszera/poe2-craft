/**
 * Regenerates `data/currency-effects.json` — what each currency actually does.
 *
 *     pnpm --filter @poe2/data scrape:effects
 *
 * The trade API names currencies but never says what they do, so until now the
 * app knew 780 names and zero semantics. The game states the effect itself, in
 * the item's own description text, and that is what this reads.
 *
 * Why it matters beyond convenience: the community model of PoE2 crafting is
 * frequently PoE1's, and the two differ. A Chaos Orb in PoE1 rerolls every
 * modifier; in PoE2 the game's own text reads "Removes a random modifier and
 * augments a Rare item with a new random modifier" — one out, one in. A
 * simulator built on the remembered behaviour would be wrong on the single most
 * used currency in the game.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { CurrencyEffectDataset } from '../src/schemas.js';

const SOURCE = 'https://repoe-fork.github.io/poe2/base_items.min.json';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/currency-effects.json');

const BaseItemsSchema = z.record(
  z.string(),
  z.object({
    name: z.string().optional(),
    item_class: z.string().optional(),
    drop_level: z.number().optional(),
    properties: z
      .object({ description: z.string().optional(), directions: z.string().optional() })
      .optional(),
  }),
);

/** `[ItemRarity|Rare]` renders as `Rare`; `[Corrupted]` as `Corrupted`. */
export function plainText(description: string): string {
  return description
    .replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2')
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/\r/g, '')
    .trim();
}

async function main(): Promise<void> {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE, {
    headers: { 'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)' },
  });
  if (!response.ok) throw new Error(`${SOURCE} responded ${response.status}`);

  const items = BaseItemsSchema.parse(await response.json());
  const entries: CurrencyEffectDataset['entries'] = [];

  for (const item of Object.values(items)) {
    const description = item.properties?.description;
    if (!item.name || !description) continue;
    // Currency, omens, essences and runes all describe themselves this way;
    // gear does not, so the presence of a description is the filter.
    if (item.item_class === undefined) continue;

    entries.push({
      name: item.name,
      itemClass: item.item_class,
      description: plainText(description),
      dropLevel: item.drop_level ?? 0,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const dataset: CurrencyEffectDataset = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    entries,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset)}\n`, 'utf8');

  const classes = new Set(entries.map((e) => e.itemClass));
  process.stdout.write(
    `wrote ${entries.length} described items across ${classes.size} classes\n  ${OUTPUT}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
