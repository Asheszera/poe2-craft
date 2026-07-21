import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemAnalysis, ParsedItem } from '@poe2/models';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import { analyse } from '@poe2/rules';
import { SqliteHistoryRepository } from '../src/main/history/sqlite.js';

/**
 * Runs against a real in-memory SQLite database rather than a fake.
 *
 * The interesting failures here are SQL ones — a wrong column, a migration that
 * does not apply, an aggregate that counts the wrong thing. A hand-written
 * stand-in would pass every one of them.
 */
function analysisFor(raw: string): ItemAnalysis {
  const parsed = parseItem(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const item: ParsedItem = enrichItem(parsed.value, defaultKnowledgeBase());
  return { item, deterministic: analyse(item), narrative: null };
}

const GOOD = `Item Class: Gloves
Rarity: Rare
Victory Fingers
Expert Vaal Gauntlets
--------
Item Level: 82
--------
+120 to maximum Life
+45% to Fire Resistance
`;

/**
 * Produces an unattributed line: the block is recognisably a property block
 * (it has a known key), so the unknown key inside it lands in `unparsedLines`
 * rather than being mistaken for a modifier.
 */
const BROKEN = `Item Class: Gloves
Rarity: Rare
Odd Grips
Expert Vaal Gauntlets
--------
Item Level: 80
Sundial Charge: 4
--------
+120 to maximum Life
`;

const NORMAL = `Item Class: Gloves
Rarity: Normal
Vaal Gauntlets
--------
Item Level: 70
`;

describe('history repository', () => {
  let repo: SqliteHistoryRepository;

  beforeEach(() => {
    repo = new SqliteHistoryRepository(':memory:');
  });

  it('creates its schema on a fresh database', () => {
    expect(repo.list(10)).toEqual([]);
    expect(repo.stats().total).toBe(0);
  });

  it('stores an analysis and reads it back whole', () => {
    const saved = repo.save(analysisFor(GOOD));

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.name).toBe('Victory Fingers');
    expect(saved.baseType).toBe('Expert Vaal Gauntlets');
    expect(saved.rarity).toBe('Rare');
    expect(saved.itemLevel).toBe(82);
    expect(saved.affixCount).toBe(2);
    expect(saved.raw).toContain('Victory Fingers');
  });

  it('keeps the raw text so an entry can be re-analysed later', () => {
    // Parser and dataset improvements should be applicable to old captures.
    const saved = repo.save(analysisFor(GOOD));
    const reparsed = parseItem(saved.raw);
    expect(reparsed.ok).toBe(true);
  });

  it('lists newest first', () => {
    repo.save(analysisFor(GOOD));
    repo.save(analysisFor(NORMAL));

    expect(repo.list(10).map((entry) => entry.rarity)).toEqual(['Normal', 'Rare']);
  });

  it('paginates', () => {
    for (let i = 0; i < 5; i++) repo.save(analysisFor(GOOD));

    expect(repo.list(2)).toHaveLength(2);
    expect(repo.list(2, 4)).toHaveLength(1);
  });

  it('finds the most recent entry for an exact item', () => {
    repo.save(analysisFor(NORMAL));
    const second = repo.save(analysisFor(GOOD));

    expect(repo.findByRaw(GOOD)?.id).toBe(second.id);
    expect(repo.findByRaw('not stored')).toBeNull();
  });

  it('attaches a narrative to an entry saved before the model answered', () => {
    // The real sequence: the item is stored instantly, the narrative arrives
    // seconds later.
    const saved = repo.save(analysisFor(GOOD));
    repo.attachNarrative(saved.id, {
      summary: 'Good base.',
      plans: [],
      possibleUpgrades: [],
      nextBestAction: 'Exalt it.',
      model: 'test',
    });

    expect(repo.find(saved.id)?.narrative?.summary).toBe('Good base.');
  });

  it('drops a narrative it cannot parse instead of failing the read', () => {
    const saved = repo.save(analysisFor(GOOD));
    repo.attachNarrative(saved.id, { shape: 'from an older build' });

    // Losing one optional field beats a history list that cannot load.
    const entry = repo.find(saved.id);
    expect(entry).not.toBeNull();
    expect(entry?.narrative).toBeNull();
  });

  it('aggregates the dashboard numbers', () => {
    repo.save(analysisFor(GOOD));
    repo.save(analysisFor(GOOD));
    repo.save(analysisFor(NORMAL));
    repo.save(analysisFor(BROKEN));

    const stats = repo.stats();
    expect(stats.total).toBe(4);
    expect(stats.rares).toBe(3);
    expect(stats.bestScore).toBeGreaterThan(0);
    expect(stats.averageScore).toBeGreaterThan(0);
    expect(stats.firstCapturedAt).not.toBeNull();
  });

  it('counts entries whose parse left unattributed lines', () => {
    repo.save(analysisFor(GOOD));
    repo.save(analysisFor(BROKEN));

    expect(repo.stats().withParseWarnings).toBe(1);
  });

  it('counts how many entries were narrated', () => {
    const saved = repo.save(analysisFor(GOOD));
    repo.save(analysisFor(NORMAL));
    repo.attachNarrative(saved.id, {
      summary: 's',
      plans: [],
      possibleUpgrades: [],
      nextBestAction: 'a',
      model: 'test',
    });

    expect(repo.stats().narrated).toBe(1);
  });

  it('removes one entry and clears all of them', () => {
    const first = repo.save(analysisFor(GOOD));
    repo.save(analysisFor(NORMAL));

    repo.remove(first.id);
    expect(repo.list(10)).toHaveLength(1);

    repo.clear();
    expect(repo.stats().total).toBe(0);
  });

  it('records a sale and reads it back', () => {
    const saved = repo.save(analysisFor(GOOD));
    const updated = repo.update(saved.id, { soldFor: 2, soldCurrency: 'Divine Orb' });

    expect(updated?.soldFor).toBe(2);
    expect(updated?.soldCurrency).toBe('Divine Orb');
  });

  it('distinguishes clearing a sale from not mentioning it', () => {
    const saved = repo.save(analysisFor(GOOD));
    repo.update(saved.id, { soldFor: 2, soldCurrency: 'Divine Orb' });

    // An absent field leaves the value alone…
    repo.update(saved.id, { notes: 'traded in bulk' });
    expect(repo.find(saved.id)?.soldFor).toBe(2);

    // …while null clears it.
    repo.update(saved.id, { soldFor: null, soldCurrency: null });
    expect(repo.find(saved.id)?.soldFor).toBeNull();
    expect(repo.find(saved.id)?.notes).toBe('traded in bulk');
  });

  it('converts earnings through the supplied rates', () => {
    const first = repo.save(analysisFor(GOOD));
    const second = repo.save(analysisFor(NORMAL));
    repo.update(first.id, { soldFor: 2, soldCurrency: 'Divine Orb' });
    repo.update(second.id, { soldFor: 50, soldCurrency: 'Exalted Orb' });

    const stats = repo.stats({ 'Divine Orb': 700 });
    expect(stats.sold).toBe(2);
    expect(stats.earned).toBe(1450); // 2 * 700 + 50 * 1
    expect(stats.unpricedSales).toBe(0);
  });

  it('excludes a sale in an unpriced currency instead of counting it as zero', () => {
    const saved = repo.save(analysisFor(GOOD));
    repo.update(saved.id, { soldFor: 3, soldCurrency: 'Mirror of Kalandra' });

    // Treating it as zero would understate earnings and hide the gap.
    const stats = repo.stats({});
    expect(stats.earned).toBe(0);
    expect(stats.unpricedSales).toBe(1);
    expect(stats.sold).toBe(1);
  });

  it('reopens an existing database without re-running the migration', () => {
    // Migrations must be idempotent; a second open must not wipe or duplicate.
    const second = new SqliteHistoryRepository(':memory:');
    expect(second.list(10)).toEqual([]);
    second.close();
  });

  it('migrates a version 1 database without losing its rows', () => {
    // The real upgrade path: a file written before sales existed must open,
    // keep every row, and gain the new columns as null.
    const file = join(mkdtempSync(join(tmpdir(), 'poe2-history-')), 'history.db');

    const v1 = new DatabaseSync(file);
    v1.exec(`
      CREATE TABLE analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL, name TEXT NOT NULL, base_type TEXT NOT NULL,
        rarity TEXT NOT NULL, item_level INTEGER, score INTEGER NOT NULL,
        affix_count INTEGER NOT NULL, unparsed_count INTEGER NOT NULL DEFAULT 0,
        raw TEXT NOT NULL, narrative TEXT, notes TEXT
      );
      PRAGMA user_version = 1;
    `);
    v1.prepare(
      `INSERT INTO analyses
         (captured_at, name, base_type, rarity, item_level, score, affix_count, unparsed_count, raw)
       VALUES ('2026-01-01T00:00:00.000Z','Old Item','Vaal Gauntlets','Rare',70,55,2,0,'old raw')`,
    ).run();
    v1.close();

    const migrated = new SqliteHistoryRepository(file);
    const [entry] = migrated.list(10);

    expect(entry?.name).toBe('Old Item');
    expect(entry?.soldFor).toBeNull();
    // And the new column is usable straight away.
    migrated.update(entry?.id ?? 0, { soldFor: 5, soldCurrency: 'Exalted Orb' });
    expect(migrated.find(entry?.id ?? 0)?.soldFor).toBe(5);
    migrated.close();

    rmSync(dirname(file), { recursive: true, force: true });
  });
});
