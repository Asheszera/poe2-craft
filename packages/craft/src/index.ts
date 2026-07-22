/**
 * `@poe2/craft` — crafting as a state machine.
 *
 * A currency does not change one modifier; it changes the item, and the next
 * currency sees what the last one left. So a plan is a sequence of states, and
 * the probability of reaching a goal is conditional on everything before it —
 * multiplying independent per-step chances gets it wrong, because hitting a
 * modifier closes its exclusion group and shrinks the pool for every step after.
 *
 * Everything here is driven by the knowledge base: the pool comes from the
 * game's own mod tables, the probabilities from its published spawn weights,
 * and each currency's behaviour from the description the game ships with it
 * (see `operations.ts`). Currencies whose effect that text does not determine
 * are absent rather than approximated.
 */
export * from './state.js';
export * from './pool.js';
export * from './operations.js';
export * from './simulate.js';
export * from './run.js';
export type { GoalSpec } from './goals.js';
export * as goals from './goals.js';
