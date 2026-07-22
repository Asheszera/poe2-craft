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
 * Seller availability and sale method, as one control — the trade site's own
 * `status` options, verbatim from its filter metadata:
 *
 *  - `available`  — Instant Buyout and In Person (online sellers, either way)
 *  - `securable`  — Instant Buyout only (a fixed price you can act on)
 *  - `onlineleague` — In Person, online in this league
 *  - `online`     — In Person, online
 *  - `any`        — everything, including offline
 *
 * This is the "online/instant" question a boolean could not express: an
 * instant-buyout listing has a real price, an in-person one is a whisper to
 * negotiate, and a price check wants to know which.
 */
export const TradeStatusSchema = z.enum([
  'available',
  'securable',
  'onlineleague',
  'online',
  'any',
]);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

/**
 * How recently a listing was indexed, to keep stale ones out — the trade
 * site's `indexed` option ids. Null means any age.
 */
export const TradeIndexedSchema = z.enum([
  '1hour',
  '3hours',
  '12hours',
  '1day',
  '3days',
  '1week',
  '2weeks',
  '1month',
  '2months',
]);
export type TradeIndexed = z.infer<typeof TradeIndexedSchema>;

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
 * A numeric property of the item itself — armour, evasion, energy shield — as a
 * search filter. These live in the trade site's `equipment_filters`, keyed by
 * its own short ids (`ar`, `ev`, `es`), and are seeded from the item's rolled
 * value so "find one at least this tanky" is one toggle.
 */
export const TradeRangeFilterSchema = z.object({
  /** The trade site's equipment filter id: `ar`, `ev`, `es`, … */
  id: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});
export type TradeRangeFilter = z.infer<typeof TradeRangeFilterSchema>;

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
  status: TradeStatusSchema,
  minItemLevel: z.number().int().nullable(),
  /**
   * Match the item's corruption/mirror state. Tri-state: true = only these,
   * false = only not these, null = either. Seeded from the item itself, because
   * a corrupted or mirrored item trades in a different market from a clean one.
   */
  corrupted: z.boolean().nullable(),
  mirrored: z.boolean().nullable(),
  /** One listing per seller account, so a single flooded seller cannot skew it. */
  collapse: z.boolean(),
  /** Drop listings older than this; null keeps every age. */
  indexed: TradeIndexedSchema.nullable(),
  /** Cap the buyout in Exalted-Orb-equivalent, to trim outliers; null = no cap. */
  maxBuyout: z.number().nullable(),
  /** The item's own defensive values (armour/evasion/ES) as search filters. */
  equipment: z.array(TradeRangeFilterSchema),
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
