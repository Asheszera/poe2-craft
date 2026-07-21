import type { Result } from '@poe2/shared';
import { z } from 'zod';

/**
 * Currency prices, and how the advisor is allowed to use them.
 *
 * Nothing in this package ships a price. Values are either supplied by the user
 * or fetched from a source they chose — an invented exchange rate would be
 * indistinguishable from a real one at the point of use, and would silently
 * turn every cost/benefit judgement into fiction.
 *
 * `null` is therefore a first-class answer everywhere: "this costs an unknown
 * amount" is information, and the advisor says so instead of guessing.
 */

/**
 * The unit every price is expressed in.
 *
 * Exalted Orbs rather than Divine: crafting decisions happen at the scale of
 * single orbs, and a table of fractions like 0.0014 is unreadable next to a
 * step that says "use one Exalted".
 */
export const REFERENCE_CURRENCY = 'Exalted Orb';

export const PriceEntrySchema = z.object({
  /** Currency name exactly as the game spells it. */
  currency: z.string().min(1),
  /** Value in `REFERENCE_CURRENCY`. */
  value: z.number().positive(),
});
export type PriceEntry = z.infer<typeof PriceEntrySchema>;

export const PriceTableSchema = z.object({
  league: z.string(),
  /** Where these came from — shown to the user, never inferred. */
  source: z.string(),
  /** When the values were captured, so staleness is visible. */
  updatedAt: z.string(),
  entries: z.array(PriceEntrySchema),
});
export type PriceTable = z.infer<typeof PriceTableSchema>;

export const EMPTY_TABLE = (league: string): PriceTable => ({
  league,
  source: 'none',
  updatedAt: new Date(0).toISOString(),
  entries: [],
});

/**
 * The port every price backend implements.
 *
 * Deliberately one method. A source that cannot answer returns an error rather
 * than a partial table with invented gaps, and the caller decides whether to
 * proceed without prices — which it always can, because the deterministic
 * analysis never depended on them.
 */
export interface PriceSource {
  readonly id: string;
  /** Human-readable, shown next to prices so their provenance is never lost. */
  readonly label: string;
  fetch(league: string): Promise<Result<PriceTable>>;
}

/** Looks up one currency. Null means "not priced", never zero. */
export function priceOf(table: PriceTable, currency: string): number | null {
  const wanted = currency.trim().toLowerCase();
  return table.entries.find((entry) => entry.currency.toLowerCase() === wanted)?.value ?? null;
}

/**
 * Cost of a step, as the advisor should state it.
 *
 * Returns null rather than a formatted zero when the currency is unpriced, so
 * a caller cannot accidentally render "0 Exalted" for "we have no idea".
 */
export function formatCost(table: PriceTable, currency: string, quantity = 1): string | null {
  const unit = priceOf(table, currency);
  if (unit === null) return null;

  const total = unit * quantity;
  if (total < 1) return `${total.toFixed(2)} ${REFERENCE_CURRENCY}`;
  return `${Math.round(total)} ${REFERENCE_CURRENCY}${Math.round(total) === 1 ? '' : 's'}`;
}
