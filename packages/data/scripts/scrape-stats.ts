/**
 * Regenerates `data/stats.json` from GGG's official trade API.
 *
 * Run manually, once per league or major patch:
 *
 *     pnpm --filter @poe2/data scrape:stats
 *
 * This is deliberately a build-time script and never runs inside the app: the
 * shipped product reads the committed JSON, so no user of this application ever
 * sends a request to pathofexile.com on startup.
 *
 * The endpoint is the same public one the official trade site uses. It is
 * fetched exactly once per run.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalTemplate } from '@poe2/shared';
import { z } from 'zod';
import { StatTypeSchema, type StatDataset, type StatEntry } from '../src/schemas.js';

const SOURCE = 'https://www.pathofexile.com/api/trade2/data/stats';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/stats.json');

/** GGG identifies clients by User-Agent; an anonymous one gets rejected. */
const USER_AGENT =
  'poe2-ai-assistant/0.1 (build-time knowledge base generator; contact: local use)';

/** Only the shape this script depends on — extra fields are ignored. */
const ApiResponseSchema = z.object({
  result: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      entries: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          type: z.string().optional(),
        }),
      ),
    }),
  ),
});

async function main(): Promise<void> {
  process.stdout.write(`fetching ${SOURCE}\n`);

  const response = await fetch(SOURCE, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${SOURCE} responded ${response.status} ${response.statusText}`);
  }

  const payload = ApiResponseSchema.parse(await response.json());

  const entries: StatEntry[] = [];
  const skipped = new Map<string, number>();

  for (const category of payload.result) {
    for (const entry of category.entries) {
      // Classification comes from the category, not `entry.type`: GGG reports
      // rune modifiers as `augment` there. `pseudo` is a trade-site
      // aggregation and never appears on an item, so it drops out here.
      const type = StatTypeSchema.safeParse(category.id);
      if (!type.success) {
        skipped.set(category.id, (skipped.get(category.id) ?? 0) + 1);
        continue;
      }

      entries.push({
        id: entry.id,
        text: entry.text,
        type: type.data,
        key: canonicalTemplate(entry.text),
      });
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const dataset: StatDataset = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    gameVersion: process.env['POE2_PATCH'] ?? 'unspecified',
    entries,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  const byType = new Map<string, number>();
  for (const e of entries) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);

  process.stdout.write(`wrote ${entries.length} entries to ${OUTPUT}\n`);
  for (const [type, count] of [...byType].sort()) {
    process.stdout.write(`  ${type.padEnd(12)} ${count}\n`);
  }
  for (const [category, count] of [...skipped].sort()) {
    process.stdout.write(`  (skipped ${category}: ${count})\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
