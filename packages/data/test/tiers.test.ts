import { describe, expect, it } from 'vitest';
import type { ItemMod } from '@poe2/models';
import { parseItem } from '@poe2/parser';
import { defaultKnowledgeBase, enrichItem, ModDatasetSchema, modsDataset } from '../src/index.js';

const kb = defaultKnowledgeBase();

function analyse(raw: string) {
  const result = parseItem(raw);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return enrichItem(result.value, kb);
}

const GLOVES = `Item Class: Gloves
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
+15% to Chaos Resistance (rune)
`;

describe('mods dataset', () => {
  it('conforms to its schema', () => {
    expect(ModDatasetSchema.safeParse(modsDataset).success).toBe(true);
  });

  /**
   * A ladder is `type` + text + generation type, not `type` alone: unique-item
   * modifiers share a `type` with ordinary ones while forming their own
   * single-rung ladder.
   */
  const lifePrefixLadder = modsDataset.entries.filter(
    (e) => e.type === 'IncreasedLife' && e.key === '# to maximum life' && e.generationType === 'prefix',
  );

  it('numbers tiers from the top of each ladder', () => {
    expect(lifePrefixLadder.length).toBeGreaterThan(5);

    const top = lifePrefixLadder.find((e) => e.tier === 1);
    const highestLevel = Math.max(...lifePrefixLadder.map((e) => e.requiredLevel));
    // T1 must be the hardest tier to roll, not the first one datamined.
    expect(top?.requiredLevel).toBe(highestLevel);
  });

  it('agrees on the ladder size across its rungs', () => {
    expect(new Set(lifePrefixLadder.map((e) => e.tierTotal)).size).toBe(1);
    expect(lifePrefixLadder[0]?.tierTotal).toBe(lifePrefixLadder.length);
  });

  it('keeps a unique-item outlier out of the ordinary ladder', () => {
    // Regression guard: this entry shares `type` with the life prefixes but is
    // a suffix on a unique. It used to erase the prefix/suffix classification
    // of every ordinary life roll.
    const outlier = modsDataset.entries.find((e) => e.id.startsWith('HandWrapsUniqueMutatedVaal'));
    expect(outlier?.generationType).toBe('suffix');
    expect(outlier?.tierTotal).toBe(1);
  });
});

describe('tier inference', () => {
  const item = analyse(GLOVES);
  const modByText = (fragment: string): ItemMod => item.mods.find((m) => m.text.includes(fragment))!;

  it('places a rolled value on its tier', () => {
    const life = modByText('maximum Life');
    // +38 falls in the 30-39 window.
    expect(life.tier).not.toBeNull();
    expect(life.tier?.confidence).not.toBe('exact');
    expect(life.tier?.name).toBeTruthy();
    expect(life.tier?.total).toBeGreaterThan(1);
  });

  it('classifies life as a prefix and resistance as a suffix', () => {
    expect(modByText('maximum Life').affixType).toBe('prefix');
    expect(modByText('Fire Resistance').affixType).toBe('suffix');
  });

  it('never assigns a tier or affix type to intrinsic modifiers', () => {
    // Runes and implicits do not occupy a slot, so neither concept applies.
    const rune = modByText('Chaos Resistance');
    expect(rune.category).toBe('rune');
    expect(rune.affixType).toBe('unknown');
    expect(rune.tier).toBeNull();

    const implicit = modByText('to Strength');
    expect(implicit.category).toBe('implicit');
    expect(implicit.tier).toBeNull();
  });

  it('is idempotent', () => {
    expect(enrichItem(item, kb)).toEqual(item);
  });
});

describe('item level constrains the inference', () => {
  const lowLevel = analyse(`Item Class: Gloves
Rarity: Rare
Starter Grips
Vaal Gauntlets
--------
Item Level: 5
--------
+15 to maximum Life
`);

  it('cannot place a roll on a tier the item is too low to hold', () => {
    const life = lowLevel.mods.find((m) => m.text.includes('maximum Life'));
    // ilvl 5 only reaches the bottom rungs, so this must be the worst tier.
    expect(life?.tier?.value).toBe(life?.tier?.total);
  });
});

describe('performance budget', () => {
  it('parses and enriches well inside the 50ms layer-0 budget', () => {
    for (let i = 0; i < 20; i++) analyse(GLOVES);

    const start = performance.now();
    for (let i = 0; i < 100; i++) analyse(GLOVES);
    const perRun = (performance.now() - start) / 100;

    expect(perRun).toBeLessThan(10);
  });
});
