import { z } from 'zod';

/**
 * `@poe2/prices/trade` — a price check against the official PoE2 trade site.
 *
 * A different thing from the rest of this package: `PriceTable` values what a
 * *currency* is worth, from numbers the player supplied; this module searches
 * the live *item* market. The one rule they share still holds — nothing here
 * invents a price. Every listing is one GGG returned for a query the player can
 * see and edit, and "no results" is reported as itself, never as a zero.
 *
 * Only the read endpoints are used (`search`, `fetch`), which need no login —
 * verified against the live API, whose rate limit is per IP and published in
 * the response headers (see `client.ts`). This is the same surface the browser
 * trade site drives, so an app that honours those limits is a companion, not a
 * scraper.
 */

/** The realm every PoE2 trade request is scoped to. */
export const TRADE_REALM = 'poe2';

/** Base of the official trade API and the human-facing site. */
export const TRADE_API = 'https://www.pathofexile.com/api/trade2';
export const TRADE_SITE = 'https://www.pathofexile.com/trade2/search';

/**
 * How the trade site names each rarity band.
 *
 * `nonunique` is its own option, not the absence of one: pricing a rare against
 * every non-unique of the same base is a common, useful search the game exposes
 * directly.
 */
export const TradeRaritySchema = z.enum([
  'any',
  'normal',
  'magic',
  'rare',
  'unique',
  'nonunique',
]);
export type TradeRarity = z.infer<typeof TradeRaritySchema>;

/**
 * One of the item's modifiers, as a search filter the player can steer.
 *
 * `id` is the trade stat id the parser already resolved onto the item mod
 * (`explicit.stat_…`); this module never re-derives it. `min`/`max` are null by
 * default — the search matches the *presence* of the modifier, and the rolled
 * value is offered separately as a hint so tightening the search is one click,
 * not a number the app picked on the player's behalf.
 */
export const TradeStatFilterSchema = z.object({
  /** Trade stat id, e.g. `explicit.stat_3299347043`. */
  id: z.string().min(1),
  /** The item's own modifier line, shown as the label. */
  text: z.string(),
  /** The value the item actually rolled, for the "set to my roll" affordance. */
  rolled: z.number().nullable(),
  enabled: z.boolean(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});
export type TradeStatFilter = z.infer<typeof TradeStatFilterSchema>;

/**
 * A whole search, in the app's own vocabulary.
 *
 * Serializable and round-trips over IPC: the renderer edits one of these and
 * sends it back, and `buildQueryBody` is the only thing that knows the trade
 * API's JSON shape. Keeping the wire format app-shaped means the panel never
 * has to understand GGG's `type_filters`/`misc_filters` nesting.
 */
export const TradeQuerySpecSchema = z.object({
  league: z.string().min(1),
  /**
   * A unique's name, which is how the market finds it. Null for rares and
   * magics, whose names are random noise the trade site does not index.
   */
  name: z.string().nullable(),
  /** Exact base to match, or null to search the modifiers across any base. */
  baseType: z.string().nullable(),
  rarity: TradeRaritySchema,
  minItemLevel: z.number().int().nullable(),
  onlineOnly: z.boolean(),
  filters: z.array(TradeStatFilterSchema),
});
export type TradeQuerySpec = z.infer<typeof TradeQuerySpecSchema>;

/** A price as the market states it: an amount in a named currency, unconverted. */
export const TradePriceSchema = z.object({
  amount: z.number(),
  /** GGG's short currency code, e.g. `exalted`, `divine`, `chaos`, `transmute`. */
  currency: z.string(),
});
export type TradePrice = z.infer<typeof TradePriceSchema>;

/** One listing, reduced to what a price check needs to show. */
export const TradeListingSchema = z.object({
  name: z.string(),
  price: TradePriceSchema.nullable(),
  account: z.string(),
  /** When the seller last listed it, ISO 8601 — so staleness is visible. */
  indexed: z.string().nullable(),
  whisper: z.string().nullable(),
});
export type TradeListing = z.infer<typeof TradeListingSchema>;

/**
 * The result of a search.
 *
 * `total` is GGG's count for the whole query; `listings` is only the first page
 * that was fetched. `low` is the cheapest listing — trustworthy because the API
 * sorts by its own cross-currency valuation, so the app never has to invent an
 * exchange rate to say "from N exalted".
 */
export const TradeResultSchema = z.object({
  total: z.number().int(),
  listings: z.array(TradeListingSchema),
  low: TradePriceSchema.nullable(),
  /** The official trade-site URL for this exact search, to open in a browser. */
  browseUrl: z.string(),
});
export type TradeResult = z.infer<typeof TradeResultSchema>;
