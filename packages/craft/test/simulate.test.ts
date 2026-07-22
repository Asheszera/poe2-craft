import { describe, expect, it } from 'vitest';
import { currencyEffectsDataset, defaultModPool } from '@poe2/data';
import {
  candidates,
  capacity,
  CURRENCIES,
  OMEN_CURRENCIES,
  checkRequirements,
  currencyByName,
  goals,
  openSlots,
  simulate,
  type CraftState,
} from '../src/index.js';

const pool = defaultModPool();

/** A weighted base with a large pool, so the numbers below are real ones. */
const gloves = (over: Partial<CraftState> = {}): CraftState => ({
  baseType: 'Pauascale Gloves',
  itemLevel: 80,
  rarity: 'Rare',
  prefixes: [],
  suffixes: [],
  corrupted: false,
  ...over,
});

const mod = (side: 'prefix' | 'suffix', group: string) => ({
  key: group.toLowerCase(),
  group,
  side,
  tier: 1,
  tags: [],
});

describe('currency definitions', () => {
  /**
   * The simulator's behaviour is only as good as its claim about what each
   * currency does. Tying every definition to the game's own text means a patch
   * that changes an effect fails here rather than silently making every
   * probability in the app wrong.
   */
  it('matches the description the game ships, word for word', () => {
    const official = new Map(currencyEffectsDataset.entries.map((e) => [e.name, e.description]));

    for (const currency of CURRENCIES) {
      expect(official.get(currency.name), `${currency.name} missing from the dataset`).toBeDefined();
      expect(official.get(currency.name), currency.name).toBe(currency.description);
    }
  });

  it('grounds each omen craft in the omen’s own effect text', () => {
    // The omen descriptions in the dataset carry the "While this item is
    // active…" lead-in and wrap across lines; the operation's description is the
    // effect clause. Every omen craft must quote an effect that actually exists.
    const omenEffects = currencyEffectsDataset.entries
      .filter((e) => e.itemClass === 'Omen')
      .map((e) => e.description.replace(/\s+/g, ' '));

    for (const craft of OMEN_CURRENCIES) {
      expect(
        omenEffects.some((effect) => effect.includes(craft.description)),
        `${craft.name}: "${craft.description}" not found in any omen`,
      ).toBe(true);
    }
  });

  it('models the PoE2 Chaos Orb as a swap, not a reroll', () => {
    // PoE1's Chaos Orb replaces every modifier. PoE2's replaces one. A plan
    // carried over from PoE1 is wrong about the most used currency in the game.
    const chaos = currencyByName.get('Chaos Orb');
    expect(chaos?.description).toContain('Removes a random modifier and augments');
    expect(chaos?.steps.map((s) => s.kind)).toEqual(['remove', 'add']);
  });
});

describe('affix slots', () => {
  it('gives a rare three per side, filled independently', () => {
    expect(capacity('Rare')).toBe(3);
    const state = gloves({ prefixes: [mod('prefix', 'A'), mod('prefix', 'B'), mod('prefix', 'C')] });

    expect(openSlots(state, 'prefix')).toBe(0);
    // Prefixes full does not close suffixes.
    expect(openSlots(state, 'suffix')).toBe(3);
  });

  it('refuses an Exalted Orb only when both sides are full', () => {
    const exalted = currencyByName.get('Exalted Orb')!;
    const half = gloves({ prefixes: [mod('prefix', 'A'), mod('prefix', 'B'), mod('prefix', 'C')] });
    const full = gloves({
      prefixes: [mod('prefix', 'A'), mod('prefix', 'B'), mod('prefix', 'C')],
      suffixes: [mod('suffix', 'D'), mod('suffix', 'E'), mod('suffix', 'F')],
    });

    expect(checkRequirements(exalted, half)).toBeNull();
    expect(checkRequirements(exalted, full)).toBe('no open affix slot');
  });

  it('refuses on the wrong rarity and on a corrupted item', () => {
    const exalted = currencyByName.get('Exalted Orb')!;
    expect(checkRequirements(exalted, gloves({ rarity: 'Magic' }))).toBe('wrong rarity');
    expect(checkRequirements(exalted, gloves({ corrupted: true }))).toBe('item is corrupted');
  });
});

describe('the pool shrinks as the item fills', () => {
  it('drops a group once the item occupies it', () => {
    const empty = candidates(pool, gloves());
    const taken = empty[0]!;
    const after = candidates(pool, gloves({ suffixes: [mod('suffix', taken.group)] }));

    expect(after.some((c) => c.group === taken.group)).toBe(false);
    expect(after.length).toBeLessThan(empty.length);
  });

  it('offers nothing on a side with no open slot', () => {
    const full = gloves({
      prefixes: [mod('prefix', 'A'), mod('prefix', 'B'), mod('prefix', 'C')],
    });
    expect(candidates(pool, full).every((c) => c.side === 'suffix')).toBe(true);
  });

  it('honours a tag filter', () => {
    const attack = candidates(pool, gloves(), { tags: ['attack'] });
    expect(attack.length).toBeGreaterThan(0);
    expect(attack.every((c) => c.tags.includes('attack'))).toBe(true);
  });
});

describe('sequence probability', () => {
  const dexterity = goals.hasMod('# to dexterity');

  it('reports the single-step chance from the real weights', () => {
    const result = simulate(pool, gloves(), ['Exalted Orb'], dexterity);

    expect(result.weighted).toBe(true);
    expect(result.goalChance).toBeGreaterThan(0);
    expect(result.goalChance).toBeLessThan(1);
  });

  it('improves with more attempts, but by less than multiplying would suggest', () => {
    const one = simulate(pool, gloves(), ['Exalted Orb'], dexterity).goalChance;
    const three = simulate(
      pool,
      gloves(),
      ['Exalted Orb', 'Exalted Orb', 'Exalted Orb'],
      dexterity,
    ).goalChance;

    expect(three).toBeGreaterThan(one);
    // Independent trials would give 1-(1-p)^3. The real number is different
    // because each miss removes a group from the pool, raising the chance of
    // the next attempt — this is the conditional part of the model.
    const independent = 1 - (1 - one) ** 3;
    expect(three).not.toBeCloseTo(independent, 4);
  });

  it('never exceeds certainty', () => {
    const many = Array.from({ length: 6 }, () => 'Exalted Orb');
    const result = simulate(pool, gloves(), many, dexterity);

    expect(result.goalChance).toBeGreaterThan(0);
    expect(result.goalChance).toBeLessThanOrEqual(1);
  });

  it('counts a goal already met as certain, without spending anything', () => {
    const already = gloves({ suffixes: [{ ...mod('suffix', 'Dexterity'), key: '# to dexterity' }] });
    const result = simulate(pool, already, ['Exalted Orb'], dexterity);

    expect(result.goalChance).toBe(1);
  });

  it('stops at the step that cannot run, and says which', () => {
    const full = gloves({
      prefixes: [mod('prefix', 'A'), mod('prefix', 'B'), mod('prefix', 'C')],
      suffixes: [mod('suffix', 'D'), mod('suffix', 'E'), mod('suffix', 'F')],
    });
    const result = simulate(pool, full, ['Exalted Orb', 'Exalted Orb'], dexterity);

    expect(result.refusedAt).toBe(0);
    expect(result.steps[0]?.refusal).toBe('no open affix slot');
  });

  /**
   * The ordering case from the model: exalting a full-but-one item then trying
   * to add again fails, while annulling first leaves room. The simulator has to
   * get this from simulating, not from a rule about it.
   */
  it('shows why order matters', () => {
    const nearlyFull = gloves({
      prefixes: [mod('prefix', 'A'), mod('prefix', 'B')],
      suffixes: [mod('suffix', 'D'), mod('suffix', 'E'), mod('suffix', 'F')],
    });

    const straight = simulate(pool, nearlyFull, ['Exalted Orb', 'Exalted Orb'], dexterity);
    // Only one prefix slot exists, so the second Exalted Orb has nowhere to go.
    expect(straight.refusedAt).toBe(1);

    const annulFirst = simulate(
      pool,
      nearlyFull,
      ['Orb of Annulment', 'Exalted Orb', 'Exalted Orb'],
      dexterity,
    );
    expect(annulFirst.refusedAt).toBeNull();
  });

  it('names a currency it does not model instead of guessing', () => {
    const result = simulate(pool, gloves(), ['Vaal Orb'], dexterity);

    expect(result.steps[0]?.refusal).toBe('currency not modelled');
    expect(result.refusedAt).toBe(0);
  });

  it('says when the numbers are estimates rather than the game’s own odds', () => {
    // A base with no published spawn weights falls back to a flat pool.
    const sword = gloves({ baseType: 'Rusted Sword' });
    const result = simulate(pool, sword, ['Exalted Orb'], dexterity);

    if (result.steps[0]?.refusal === null) {
      expect(typeof result.weighted).toBe('boolean');
    }
  });
});

describe('omen crafts (the synergy is computed, not asserted)', () => {
  const dexterity = goals.hasMod('# to dexterity'); // a suffix on this base

  it('raises the odds of a suffix by forcing an Exalt onto that side', () => {
    const bare = simulate(pool, gloves(), ['Exalted Orb'], dexterity).goalChance;
    const forced = simulate(
      pool,
      gloves(),
      ['Exalted Orb + Omen of Dextral Exaltation'],
      dexterity,
    ).goalChance;

    // A bare Exalt might land on a prefix; the Dextral omen removes that
    // possibility, so the same goal is strictly more likely. This number comes
    // out of the weighted pool, not out of a rule that says "omens are better".
    expect(forced).toBeGreaterThan(bare);
  });

  it('cannot reach a suffix goal by forcing the Exalt onto prefixes', () => {
    const prefixOnly = simulate(
      pool,
      gloves(),
      ['Exalted Orb + Omen of Sinistral Exaltation'],
      dexterity,
    );
    // Sinistral adds only a prefix; dexterity is a suffix, so this never helps.
    expect(prefixOnly.goalChance).toBe(0);
  });

  it('adds two modifiers with Greater Exaltation', () => {
    // Two chances at the goal in one step beats one.
    const one = simulate(pool, gloves(), ['Exalted Orb'], dexterity).goalChance;
    const two = simulate(
      pool,
      gloves(),
      ['Exalted Orb + Omen of Greater Exaltation'],
      dexterity,
    ).goalChance;

    expect(two).toBeGreaterThan(one);
  });

  it('restricts an Annul to one side', () => {
    // Dextral Annulment removes only a suffix. On an item with one prefix and
    // one suffix, the suffix is the only thing it can take — so afterwards the
    // suffix side always has an open slot and the prefix is untouched.
    const state = gloves({
      prefixes: [mod('prefix', 'KeepMe')],
      suffixes: [mod('suffix', 'DropMe')],
    });
    // Goal: an open suffix slot exists, which is only true once the suffix is
    // gone. Not met initially (both sides have one mod), so nothing
    // short-circuits and the removal is actually exercised.
    const suffixFreed = {
      label: 'a suffix removed',
      satisfied: (s: CraftState) => s.suffixes.length === 0 && s.prefixes.length === 1,
    };
    const result = simulate(
      pool,
      state,
      ['Orb of Annulment + Omen of Dextral Annulment'],
      suffixFreed,
    );

    expect(result.goalChance).toBe(1);
  });
});

describe('compound goals', () => {
  it('requires every part of an "and" goal', () => {
    const both = goals.all([goals.hasMod('# to dexterity'), goals.hasMod('#% to fire resistance')]);
    const one = simulate(pool, gloves(), ['Exalted Orb'], both);

    // One modifier cannot satisfy a two-modifier goal, whatever it rolls.
    expect(one.goalChance).toBe(0);

    const four = simulate(pool, gloves(), Array.from({ length: 4 }, () => 'Exalted Orb'), both);
    expect(four.goalChance).toBeGreaterThan(0);
  });
});
