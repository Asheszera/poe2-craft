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

  it('carries the modifier tags an intent can be matched against', () => {
    const options = pool.options('Pauascale Gloves', 80);
    const attackSpeed = options.suffix.find((o) => o.key.includes('attack speed'));

    // "More DPS" is not a modifier; `attack`, `speed`, `caster` are how a craft
    // intent reaches the pool at all.
    expect(attackSpeed?.tags).toContain('attack');
  });
});

/**
 * An item carries at most one modifier per exclusion group, and the group is
 * not the template. Missing this is not a cosmetic flaw: it makes the advisor
 * recommend currency on an outcome the item can never produce.
 */
describe('modifiers the item can no longer roll', () => {
  const FLASK_LIFE = '#% increased flask life recovery rate';
  const FLASK_MANA = '#% increased flask mana recovery rate';

  const belt = (present: string[]) =>
    pool.options('Rawhide Belt', 80, present).prefix.filter((o) => o.key.includes('flask'));

  it('leaves everything open on an item with nothing on it', () => {
    expect(belt([]).every((o) => o.blockedBy === null)).toBe(true);
  });

  it('blocks the modifier that is already there', () => {
    const life = belt([FLASK_LIFE]).find((o) => o.key === FLASK_LIFE);
    expect(life?.blockedBy).toBe('BeltFlaskRecoveryRate');
  });

  it('blocks a different modifier sharing the same group', () => {
    // The whole point: flask *mana* recovery has its own template and its own
    // ladder, so matching on text alone would offer it — but the group is
    // taken, and the item cannot roll it.
    const mana = belt([FLASK_LIFE]).find((o) => o.key === FLASK_MANA);
    expect(mana?.blockedBy).toBe('BeltFlaskRecoveryRate');
  });

  it('reports blocked options instead of dropping them', () => {
    // "You cannot have both" is advice; a silently shorter list is not.
    expect(belt([FLASK_LIFE])).toHaveLength(belt([]).length);
  });

  it('sorts blocked options last', () => {
    const options = pool.options('Rawhide Belt', 80, [FLASK_LIFE]).prefix;
    const firstBlocked = options.findIndex((o) => o.blockedBy !== null);
    const lastOpen = options.map((o) => o.blockedBy).lastIndexOf(null);

    expect(firstBlocked).toBeGreaterThan(lastOpen);
  });

  it('ignores modifier texts the dataset does not know', () => {
    expect(pool.occupiedGroups(['not a modifier at all']).size).toBe(0);
  });
});
