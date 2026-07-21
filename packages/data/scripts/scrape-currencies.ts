/**
 * Regenerates `data/currencies.json` from GGG's official trade API.
 *
 *     pnpm --filter @poe2/data scrape:currencies
 *
 * Why this exists: the crafting advisor has to name real currencies. Essences,
 * omens, runes and league-specific consumables change every few months, and a
 * model's training data lags behind them — asked to plan a craft, it will
 * confidently reach for whatever existed when it was trained. Feeding it the
 * live list turns that guess into a constraint.
 *
 * Build-time only. The shipped app reads the committed JSON.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { CurrencyDataset, CurrencyEntry } from '../src/schemas.js';

const SOURCE = 'https://www.pathofexile.com/api/trade2/data/static';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/currencies.json');

const ApiResponseSchema = z.object({
  result: z.array(
    z.object({
      id: z.string(),
      // At least one group ships with a null label; the id is the fallback.
      label: z.string().nullish(),
      entries: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  ),
});

async function main(): Promise<void> {
  process.stdout.write(`fetching ${SOURCE}\n`);

  const response = await fetch(SOURCE, {
    headers: {
      'User-Agent': 'poe2-ai-assistant/0.1 (knowledge base generator)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`${SOURCE} responded ${response.status} ${response.statusText}`);
  }

  const payload = ApiResponseSchema.parse(await response.json());
  const entries: CurrencyEntry[] = [];

  for (const group of payload.result) {
    for (const entry of group.entries) {
      entries.push({
        id: entry.id,
        name: entry.text,
        category: group.label ?? group.id,
      });
    }
  }

  entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const dataset: CurrencyDataset = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    entries,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  const byCategory = new Map<string, number>();
  for (const entry of entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
  }

  process.stdout.write(`wrote ${entries.length} entries to ${OUTPUT}\n`);
  for (const [category, count] of [...byCategory].sort()) {
    process.stdout.write(`  ${category.padEnd(16)} ${count}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
