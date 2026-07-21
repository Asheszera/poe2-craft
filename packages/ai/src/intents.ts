/**
 * Craft intents — what the player wants from *this* item.
 *
 * Distinct from the build `goal` in settings, which describes the character
 * ("clear T15 maps safely"). The intent is per-item and changes the plan
 * completely: the same base is a three-step budget finish or a twenty-step
 * mirror project depending on which one is set.
 *
 * Dependency-free so the renderer can show the picker without pulling a vendor
 * SDK into its bundle.
 */
export interface CraftIntent {
  readonly id: string;
  /** Short label for the picker. */
  readonly label: string;
  /** The sentence handed to the model. Written as the player would say it. */
  readonly text: string;
}

export const CRAFT_INTENTS: readonly CraftIntent[] = [
  {
    id: 'budget-dps',
    label: 'Max DPS, cheap',
    text: 'I want the highest DPS I can get out of this weapon for as little currency as possible. Stop early if the next step costs more than the gain is worth.',
  },
  {
    id: 'budget-defence',
    label: 'Max defences, cheap',
    text: 'I want the best defensive value (life, resistances, armour/evasion/energy shield) I can get cheaply. Stop early if the next step costs more than the gain is worth.',
  },
  {
    id: 'mirror',
    label: 'Best possible, cost no object',
    text: 'This is a mirror-tier project. Build the best possible version of this item regardless of cost. Use deterministic and expensive methods wherever they raise the ceiling, and do not stop at "good enough".',
  },
  {
    id: 'sell',
    label: 'Make it sellable',
    text: 'I want to sell this. Aim for the modifier combination other players actually search for, and stop as soon as more currency spent would not raise the sale price.',
  },
  {
    id: 'keep-or-vendor',
    label: 'Worth keeping at all?',
    text: 'Tell me first whether this item is worth any currency at all. If it is not, say so and stop — I would rather vendor it than sink orbs into a dead base.',
  },
  {
    id: 'finish-started',
    label: 'Finish what I started',
    text: 'I have already invested in this item. Tell me the cheapest way to finish it into something usable, and be honest if the best move is to cut my losses.',
  },
];

export const intentById = (id: string): CraftIntent | undefined =>
  CRAFT_INTENTS.find((intent) => intent.id === id);
