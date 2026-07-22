/**
 * `@poe2/prices` — currency valuation behind one port.
 *
 * Two rules hold everywhere in this package:
 *
 *  1. **No price is ever invented.** Values come from the user or from a source
 *     they chose. A made-up exchange rate is indistinguishable from a real one
 *     once it reaches the advice, and would quietly turn every cost judgement
 *     into fiction.
 *  2. **Missing is a valid answer.** `null` propagates all the way to the
 *     interface, which says "cost unknown" rather than rendering a confident
 *     zero. Nothing downstream requires prices to work: the deterministic
 *     analysis and the crafting plan stand without them.
 */
export {
  EMPTY_TABLE,
  formatCost,
  priceOf,
  PriceEntrySchema,
  PriceTableSchema,
  REFERENCE_CURRENCY,
  type PriceEntry,
  type PriceSource,
  type PriceTable,
} from './types.js';
export { HttpPriceSource, ManualPriceSource } from './sources.js';
export { pricePrompt, costOfPlan } from './advice.js';

/**
 * The item price check — a live search of the official PoE2 trade site, kept in
 * this package because it is the other half of "what is this worth". Distinct
 * from the currency table above: this values items, from the market, at the
 * cost of a rate-limited network call the caller opts into.
 */
export {
  TRADE_API,
  TRADE_REALM,
  TRADE_SITE,
  TradeQuerySpecSchema,
  TradeStatFilterSchema,
  TradeListingSchema,
  TradePriceSchema,
  TradeResultSchema,
  TradeRaritySchema,
  TradeStatusSchema,
  TradeIndexedSchema,
  TradeRangeFilterSchema,
  type TradeQuerySpec,
  type TradeStatFilter,
  type TradeRangeFilter,
  type TradeListing,
  type TradePrice,
  type TradeResult,
  type TradeRarity,
  type TradeStatus,
  type TradeIndexed,
} from './trade/types.js';
export { defaultSpecFor, buildQueryBody, browseUrl } from './trade/query.js';
export { TradeClient, type TradeClientOptions } from './trade/client.js';
