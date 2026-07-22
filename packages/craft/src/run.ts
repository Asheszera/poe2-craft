import type { ModPoolIndex } from '@poe2/data';
import type { ParsedItem } from '@poe2/models';
import { fromSpec, type GoalSpec } from './goals.js';
import { CURRENCIES, OMENS, type CraftStep } from './operations.js';
import { simulate, type SimulationResult } from './simulate.js';
import { stateFromItem } from './state.js';

/**
 * The one call the application makes: parsed item + step sequence + goal, to a
 * simulation result.
 *
 * Everything the state machine needs about a modifier — its exclusion group and
 * its tags — is resolved from the pool index here, so the rest of the package
 * never depends on `@poe2/data` directly and stays a pure simulator.
 */
export function runSimulation(
  pool: ModPoolIndex,
  item: ParsedItem,
  sequence: readonly CraftStep[],
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
}

/** An omen the player can attach to a currency. */
export interface ModelledOmen {
  readonly name: string;
  readonly description: string;
  /** The exact currency this omen modifies, so the interface can pair them. */
  readonly appliesTo: string;
}

/** The base currencies the simulator can model. */
export const modelledCurrencies = (): readonly ModelledCurrency[] =>
  CURRENCIES.map((c) => ({ name: c.name, description: c.description }));

/** The omens the simulator can compute, each tied to the currency it modifies. */
export const modelledOmens = (): readonly ModelledOmen[] =>
  OMENS.map((o) => ({ name: o.name, description: o.description, appliesTo: o.appliesTo }));
