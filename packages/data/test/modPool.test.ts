import { describe, expect, it } from 'vitest';
import {
  craftingOmensPrompt,
  currencyEffectsDataset,
  CurrencyEffectDatasetSchema,
  currencyEffectsPrompt,
  defaultModPool,
  ModPoolDatasetSchema,
  modPoolDataset,
  ModWeightDatasetSchema,
  modWeightsDataset,
} from '../src/index.js';

describe('currency effects dataset', () => {
  it('conforms to its schema', () => {
    expect(CurrencyEffectDatasetSchema.safeParse(currencyEffectsDataset).success).toBe(true);
  });

  it('carries the game’s own words for the core orbs', () => {
    const byName = new Map(currencyEffectsDataset.entries.map((e) => [e.name, e.description]));
    // The PoE2 Chaos Orb, straight from the item, is one-out-one-in.
    expect(byName.get('Chaos Orb')).toBe(
      'Removes a random modifier and augments a Rare item with a new random modifier',
    );
    expect(byName.get('Exalted Orb')).toBe('Augments a Rare item with a new random modifier');
  });

  it('renders the full gear-crafting toolset, not just the core orbs', () => {
    const prompt = currencyEffectsPrompt(currencyEffectsDataset);
    expect(prompt).toContain('**Chaos Orb**');
    expect(prompt).toContain('**Exalted Orb**');
    // The deeper toolset reaches the model too, with the game's own effect text.
    expect(prompt).toContain('**Orb of Annulment**');
    expect(prompt).toMatch(/Essences \(\d+\)/);
    // The mechanics that were missing: Abyss/Desecration and Soul Cores.
    expect(prompt).toMatch(/Desecration Bones\*\* \(\d+\)/);
    expect(prompt).toContain('Abyssal');
    expect(prompt).toMatch(/Soul Cores\*\* \(\d+\)/);
    // Map, atlas and league currencies do not belong in item-crafting advice.
    expect(prompt).not.toMatch(/waystone|Voidstone|Cartographer/i);
  });

  it('extracts the gear-crafting omens, effect text intact', () => {
    const prompt = craftingOmensPrompt(currencyEffectsDataset);

    // The side-restricting omens are the ones advanced crafting turns on.
    expect(prompt).toContain('**Omen of Sinistral Exaltation**');
    expect(prompt).toContain('add only prefix modifiers');
    expect(prompt).toContain('**Omen of Dextral Annulment**');
    // The duplicated lead-in bug would show as "your your"; guard against it.
    expect(prompt).not.toContain('your your');
    // Map and logbook omens are not gear crafting and must not be here.
    expect(prompt).not.toContain('Logbook');
    expect(prompt).not.toContain('Waystone');
  });
});

const pool = defaultModPool();

/**
 * The weights come from a scraped page, so the dataset is checked here rather
 * than trusted. A silently empty or flattened scrape would otherwise surface as
 * plausible-looking percentages, which is the failure this whole feature exists
 * to avoid.
 */
describe('modifier weight dataset', () => {
  it('conforms to its schema', () => {
    expect(ModWeightDatasetSchema.safeParse(modWeightsDataset).success).toBe(true);
  });

  it('covers the common bases', () => {
    expect(Object.keys(modWeightsDataset.bases).length).toBeGreaterThan(1000);
    expect(Object.keys(modWeightsDataset.contexts).length).toBeGreaterThan(20);
  });

  it('carries graded weights, not eligibility flags', () => {
    // The bug this replaced: an extraction that saw only 0s and 1s and
    // concluded PoE2 had no weights. If that ever happens again, this fails.
    const all = Object.values(modWeightsDataset.contexts).flatMap((c) => Object.values(c));
    const graded = all.filter((w) => w > 1);

    expect(graded.length).toBeGreaterThan(all.length / 2);
    expect(Math.max(...all)).toBeGreaterThanOrEqual(1000);
  });
});

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
    expect(pool.options('Definitely Not A Real Base', 80)).toEqual({
      prefix: [],
      suffix: [],
      chanceBasis: 'tiers',
    });
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

/**
 * Modifiers are not equally likely, and the real weights say by how much.
 * Chaos resistance carries 250 per tier against fire resistance's 1000 — a
 * fourfold difference no amount of counting tiers would have found.
 */
describe('how likely each modifier is', () => {
  const options = pool.options('Pauascale Gloves', 80);
  const suffixes = options.suffix;
  const find = (key: string) => suffixes.find((o) => o.key === key);

  it('uses the published weights where they exist', () => {
    expect(options.chanceBasis).toBe('weights');
    expect(find('# to dexterity')?.weight).toBeGreaterThan(1);
  });

  it('gives the shares of one affix side a total of 1', () => {
    const total = suffixes.reduce((sum, o) => sum + (o.chance ?? 0), 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('sums a ladder’s weight over the tiers the item level allows', () => {
    const dexterity = find('# to dexterity');
    // 8 reachable tiers at 1000 each — the ladder's weight, not one tier's.
    expect(dexterity?.eligibleTiers).toBe(8);
    expect(dexterity?.weight).toBe(8000);
  });

  it('ranks a common modifier above a rare one by the game’s own numbers', () => {
    const fire = find('#% to fire resistance');
    const chaos = find('#% to chaos resistance');

    // Not a tier-count artefact: fire has 7 reachable tiers and chaos 5, yet
    // fire is far more than 7/5 as likely, because its tiers weigh more.
    expect(fire?.weight).toBeGreaterThan((chaos?.weight ?? 0) * 4);
    expect(fire?.chance ?? 0).toBeGreaterThan(chaos?.chance ?? 0);
  });

  it('drops a ladder’s weight as the item level falls', () => {
    const low = pool.options('Pauascale Gloves', 20).suffix.find((o) => o.key === '# to dexterity');

    expect(low?.eligibleTiers).toBeLessThan(8);
    expect(low?.weight ?? 0).toBeLessThan(8000);
  });

  it('gives blocked modifiers no share, and leaves them out of the total', () => {
    const prefixes = pool.options('Rawhide Belt', 80, [
      '#% increased flask life recovery rate',
    ]).prefix;

    expect(prefixes.filter((o) => o.blockedBy !== null).every((o) => o.chance === null)).toBe(true);
    // The remaining shares still add up: what cannot roll is out of the
    // denominator, so the numbers describe what can actually happen next.
    expect(prefixes.reduce((sum, o) => sum + (o.chance ?? 0), 0)).toBeCloseTo(1, 6);
  });

  it('reports an unknown chance rather than inventing one', () => {
    // A base with no published weights falls back to tier density, and says so.
    const unweighted = pool.options('Rusted Sword', 80);
    if (unweighted.suffix.length === 0) return; // base not in the dataset

    expect(unweighted.chanceBasis).toBe('tiers');
    expect(unweighted.suffix.every((o) => o.weight === null)).toBe(true);
  });
});
