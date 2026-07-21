import { formatCost, priceOf, REFERENCE_CURRENCY, type PriceTable } from './types.js';

/**
 * Turning prices into crafting judgement.
 *
 * The question a plan has to answer at every step is not "what does this cost?"
 * but "is this step worth its cost?" — which needs the price of the currency
 * *and* an honest statement of what is unpriced, because a step whose cost is
 * unknown must not be silently treated as free.
 */

/** Total cost of a sequence of currency uses, or null if anything is unpriced. */
export function costOfPlan(
  table: PriceTable,
  steps: readonly { currency: string; quantity?: number }[],
): { total: number; unpriced: string[] } {
  let total = 0;
  const unpriced: string[] = [];

  for (const step of steps) {
    const unit = priceOf(table, step.currency);
    if (unit === null) unpriced.push(step.currency);
    else total += unit * (step.quantity ?? 1);
  }

  return { total, unpriced };
}

/**
 * The price section of the crafting prompt.
 *
 * Deliberately states what is *not* priced as prominently as what is. A model
 * given a partial table will otherwise reason as though the missing entries
 * were cheap, and recommend the expensive route by accident.
 */
export function pricePrompt(table: PriceTable): string {
  if (table.entries.length === 0) {
    return [
      'No currency prices are configured, so you do not know what anything costs.',
      '',
      '- Do not state or imply a price, a total, or a profit. You have no data for it.',
      '- Still rank steps by *relative* expense where the game makes that obvious',
      '  (a Mirror of Kalandra is not a casual step; an Orb of Transmutation is),',
      '  and say plainly that exact costs are unavailable.',
    ].join('\n');
  }

  const rows = [...table.entries]
    .sort((a, b) => b.value - a.value)
    .map((entry) => `  - ${entry.currency}: ${formatCost(table, entry.currency) ?? 'unknown'}`);

  return [
    `Prices below are in ${REFERENCE_CURRENCY}s, from "${table.source}" for ${table.league},`,
    `captured ${table.updatedAt}.`,
    '',
    ...rows,
    '',
    'Use these to decide, not merely to report:',
    '',
    '- **Weigh each step against what it gains.** Say when a step costs more than',
    '  the improvement is worth, and stop the plan there rather than continuing',
    '  to a theoretically better item the player should not pay for.',
    '- **Give the cheap route first** and name the expensive deterministic one as',
    '  the alternative, with both costs, so the choice is the player’s.',
    '- **Anything not in the list above is unpriced.** Say "cost unknown" for it.',
    '  Do not assume an unlisted currency is cheap, and never invent a number.',
    '- Prices move. Treat them as the player’s snapshot, not as fact, and avoid',
    '  building an argument that only holds at exactly these rates.',
  ].join('\n');
}
