import { describe, expect, it } from 'vitest';
import { parseItem } from '@poe2/parser';
import {
  defaultKnowledgeBase,
  enrichItem,
  statsDataset,
  StatDatasetSchema,
  unmatchedMods,
} from '../src/index.js';

const kb = defaultKnowledgeBase();
const index = kb.stats;

function parsed(raw: string) {
  const result = parseItem(raw);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return enrichItem(result.value, kb);
}

describe('stats dataset', () => {
  it('conforms to its schema', () => {
    // Runs here rather than at application startup, where validating 8k
    // entries on every launch would be pure waste.
    expect(StatDatasetSchema.safeParse(statsDataset).success).toBe(true);
  });

  it('records where it came from', () => {
    expect(statsDataset.source).toContain('pathofexile.com');
    expect(statsDataset.entries.length).toBeGreaterThan(5000);
  });

  it('builds an index without key collisions swallowing entries', () => {
    expect(index.size).toBeGreaterThan(3000);
  });
});

describe('enrichItem', () => {
  const item = parsed(`Item Class: Gloves
Rarity: Rare
Victory Fingers
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+15 to Strength (implicit)
--------
+38 to maximum Life
+25% to Fire Resistance
12% increased Attack Speed
`);

  it('replaces slug ids with GGG canonical ids', () => {
    const life = item.mods.find((m) => m.text.includes('maximum Life'));
    expect(life?.matched).toBe(true);
    expect(life?.statId).toMatch(/^explicit\.stat_\d+$/);
  });

  it('resolves an implicit against the implicit stat list', () => {
    const strength = item.mods.find((m) => m.category === 'implicit');
    expect(strength?.matched).toBe(true);
    expect(strength?.statId).toMatch(/^implicit\./);
  });

  it('matches every modifier of a well-formed item', () => {
    expect(unmatchedMods(item)).toEqual([]);
  });

  it('is idempotent', () => {
    expect(enrichItem(item, kb)).toEqual(item);
  });
});

describe('unmatched modifiers as a parser-quality signal', () => {
  it('flags a line that is not a modifier at all', () => {
    const item = parsed(`Item Class: Gloves
Rarity: Rare
Broken Grip
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+38 to maximum Life
Totally Not A Real Modifier Line
`);

    const unmatched = unmatchedMods(item);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.text).toBe('Totally Not A Real Modifier Line');
    // The slug is preserved so the line stays queryable.
    expect(unmatched[0]?.statId).toBe('totally_not_a_real_modifier_line');
  });
});

describe('performance budget', () => {
  it('enriches an item far inside the 50ms layer-0 budget', () => {
    const item = parsed(`Item Class: Gloves
Rarity: Rare
Victory Fingers
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+38 to maximum Life
+25% to Fire Resistance
12% increased Attack Speed
+15 to Dexterity
+120 to Accuracy Rating
15% increased Rarity of Items found
`);

    const start = performance.now();
    for (let i = 0; i < 100; i++) enrichItem(item, kb);
    const perRun = (performance.now() - start) / 100;

    expect(perRun).toBeLessThan(5);
  });
});
