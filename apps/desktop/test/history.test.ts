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

  it('reopens an existing database without re-running the migration', () => {
    // Migrations must be idempotent; a second open must not wipe or duplicate.
    const second = new SqliteHistoryRepository(':memory:');
    expect(second.list(10)).toEqual([]);
    second.close();
  });
});
