import { describe, expect, it } from 'vitest';
import { defaultKnowledgeBase, defaultModPool, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import type { ParsedItem } from '@poe2/models';
import { modelledCurrencies, runSimulation } from '../src/index.js';
import type { GoalSpec } from '../src/index.js';

/**
 * The serializable entry point the IPC handler calls.
 *
 * Exercised against a real parsed-and-enriched item rather than a hand-built
 * state, because this is the path where a template mismatch between the parser
 * and the pool would surface — the thing a synthetic state cannot catch.
 */
const item = (raw: string): ParsedItem => {
  const parsed = parseItem(raw);
  if (!parsed.ok) throw new Error('fixture did not parse');
  return enrichItem(parsed.value, defaultKnowledgeBase());
};

const pool = defaultModPool();

const RARE_GLOVES = `Item Class: Gloves
Rarity: Rare
Corpse Grip
Pauascale Gloves
--------
Item Level: 80
--------
+65 to maximum Life
`;

describe('runSimulation (the IPC entry point)', () => {
  it('reaches a modifier the base can roll, with a real probability', () => {
    const goal: GoalSpec = { kind: 'mod', key: '# to dexterity' };
    const result = runSimulation(pool, item(RARE_GLOVES), ['Exalted Orb'], goal);

    expect(result.goalChance).toBeGreaterThan(0);
    expect(result.goalChance).toBeLessThan(1);
    expect(result.weighted).toBe(true);
  });

  it('carries the item’s existing modifiers into the state', () => {
    // The glove already has life; a life goal is satisfied before any currency.
    const goal: GoalSpec = { kind: 'mod', key: '# to maximum life' };
    const result = runSimulation(pool, item(RARE_GLOVES), ['Exalted Orb'], goal);

    expect(result.goalChance).toBe(1);
  });

  it('rebuilds an "all" goal from its spec', () => {
    const goal: GoalSpec = {
      kind: 'all',
      of: [
        { kind: 'mod', key: '# to dexterity' },
        { kind: 'mod', key: '#% to fire resistance' },
      ],
    };
    const one = runSimulation(pool, item(RARE_GLOVES), ['Exalted Orb'], goal);
    // One added modifier cannot satisfy a two-modifier goal.
    expect(one.goalChance).toBe(0);

    const many = runSimulation(
      pool,
      item(RARE_GLOVES),
      ['Exalted Orb', 'Exalted Orb', 'Exalted Orb'],
      goal,
    );
    expect(many.goalChance).toBeGreaterThan(0);
  });

  it('lists only currencies it can model, with omen crafts flagged', () => {
    const names = modelledCurrencies().map((c) => c.name);
    expect(names).toContain('Chaos Orb');
    expect(names).toContain('Exalted Orb');
    // Vaal Orb is unmodelled and must not be offered as if it were understood.
    expect(names).not.toContain('Vaal Orb');

    // Omen crafts are present and marked so the interface can group them.
    const omen = modelledCurrencies().find((c) => c.name.includes('Omen'));
    expect(omen?.isOmenCraft).toBe(true);
    expect(modelledCurrencies().find((c) => c.name === 'Chaos Orb')?.isOmenCraft).toBe(false);
  });
});
