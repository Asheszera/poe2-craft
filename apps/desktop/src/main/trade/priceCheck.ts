import type { ParsedItem } from '@poe2/models';
import {
  defaultSpecFor,
  TradeClient,
  type TradeQuerySpec,
  type TradeResult,
} from '@poe2/prices';
import type { Result } from '@poe2/shared';

/**
 * The price check's one connection to the trade site.
 *
 * A single client is shared by the on-demand handler and the on-capture search
 * so its rate limiter sees every request and can never be raced into exceeding
 * GGG's per-IP budget. Kept out of `handlers.ts` because the automatic search
 * is a capture-pipeline concern, not an IPC one, and both need this instance.
 */
const client = new TradeClient();

export const specForItem = (item: ParsedItem, league: string): TradeQuerySpec =>
  defaultSpecFor(item, league);

export const runTradeSearch = (spec: TradeQuerySpec): Promise<Result<TradeResult>> =>
  client.search(spec);

/**
 * Whether an item is worth an automatic price check on capture.
 *
 * Currency, gems and white bases are skipped: they are not what a player copies
 * to price, and firing a search for each would spend the rate-limit budget on
 * noise. A rare or magic needs at least one *matched* modifier — the only kind
 * the market can search on — and a unique is priced by its name, so it always
 * qualifies.
 */
export function worthPricing(item: ParsedItem): boolean {
  if (item.flags.isCurrency) return false;
  if (item.rarity === 'Unique') return true;
  if (item.rarity !== 'Rare' && item.rarity !== 'Magic') return false;
  return item.mods.some((mod) => mod.matched);
}
