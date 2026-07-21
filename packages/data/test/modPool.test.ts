import { describe, expect, it } from 'vitest';
import { defaultModPool, ModPoolDatasetSchema, modPoolDataset } from '../src/index.js';

const pool = defaultModPool();

describe('mod pool dataset', () => {
  it('conforms to its schema', () => {
    expect(ModPoolDatasetSchema.safeParse(modPoolDataset).success).toBe(true);
  });

  it('covers a realistic number of bases', () => {
    expect(pool.baseCount).toBeGreaterThan(1000);
  });
});

describe('what a base can still roll', () => {
  it('knows a base the player actually captured', () => {
    expect(pool.knows('Pauascale Gloves')).toBe(true);
  });

  it('reports nothing for an unknown base rather than guessing', () => {
    expect(pool.knows('Definitely Not A Real Base')).toBe(false);
    expect(pool.options('Definitely Not A Real Base', 80)).toEqual({ prefix: [], suffix: [] });
  });

  it('offers both prefixes and suffixes for a normal gear base', () => {
    const options = pool.options('Pauascale Gloves', 69);
    expect(options.prefix.length).toBeGreaterThan(3);
    expect(options.suffix.length).toBeGreaterThan(3);
  });

  it('caps the reachable tier by item level', () => {
    const low = pool.options('Pauascale Gloves', 1);
    const high = pool.options('Pauascale Gloves', 100);

    const bestOf = (list: { bestTier: number }[]): number =>
      Math.min(...list.map((option) => option.bestTier));

    // A level 1 item cannot reach the tiers a level 100 item can. Advising a
    // tier that is gated above the item is advising wasted currency.
    expect(bestOf(low.suffix)).toBeGreaterThan(bestOf(high.suffix));
  });

  it('reports one entry per ladder, not one per tier', () => {
    const options = pool.options('Pauascale Gloves', 100);
    const keys = options.suffix.map((option) => `${option.type}|${option.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says where tier 1 sits even when it is out of reach', () => {
    const options = pool.options('Pauascale Gloves', 40);
    const gated = options.suffix.filter((option) => option.bestTier > 1);

    expect(gated.length).toBeGreaterThan(0);
    // Knowing the gate is what tells a player a higher base is the real answer.
    expect(gated.some((option) => option.topTierLevel !== null)).toBe(true);
  });

  it('treats an unknown item level as no ceiling rather than hiding options', () => {
    const capped = pool.options('Pauascale Gloves', 30);
    const uncapped = pool.options('Pauascale Gloves', null);
    expect(uncapped.suffix.length).toBeGreaterThanOrEqual(capped.suffix.length);
  });
});
