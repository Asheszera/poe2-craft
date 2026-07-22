import type { ModPoolIndex } from '@poe2/data';
import type { ParsedItem } from '@poe2/models';
import { fromSpec, type GoalSpec } from './goals.js';
import { CURRENCIES, OMEN_CURRENCIES } from './operations.js';
import { simulate, type SimulationResult } from './simulate.js';
import { stateFromItem } from './state.js';

/**
 * The one call the application makes: parsed item + currency sequence + goal,
 * to a simulation result.
 *
 * Everything the state machine needs about a modifier — its exclusion group and
 * its tags — is resolved from the pool index here, so the rest of the package
 * never depends on `@poe2/data` directly and stays a pure simulator.
 */
export function runSimulation(
  pool: ModPoolIndex,
  item: ParsedItem,
  sequence: readonly string[],
  goal: GoalSpec,
): SimulationResult {
  const state = stateFromItem(item, {
    groupOf: (key) => pool.groupFor(key),
    tagsOf: (key) => pool.tagsFor(key),
  });
  return simulate(pool, state, sequence, fromSpec(goal));
}

/** A currency the simulator can model, with the game's description of it. */
export interface ModelledCurrency {
  readonly name: string;
  readonly description: string;
  /** True for omen-modified combinations, so the interface can group them. */
  readonly isOmenCraft: boolean;
}

/** Everything the simulator can model, for the interface to offer. */
export const modelledCurrencies = (): readonly ModelledCurrency[] => [
  ...CURRENCIES.map((c) => ({ name: c.name, description: c.description, isOmenCraft: false })),
  ...OMEN_CURRENCIES.map((c) => ({ name: c.name, description: c.description, isOmenCraft: true })),
];
