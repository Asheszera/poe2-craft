import type { ModPoolIndex } from '@poe2/data';
import type { ParsedItem } from '@poe2/models';
import { fromSpec, type GoalSpec } from './goals.js';
import { CURRENCIES } from './operations.js';
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

/** Names of the currencies the simulator can model, for the interface to list. */
export const modelledCurrencies = (): readonly string[] => CURRENCIES.map((c) => c.name);
