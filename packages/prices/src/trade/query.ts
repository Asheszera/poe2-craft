import type { ItemMod, ParsedItem, Rarity } from '@poe2/models';
import {
  TRADE_REALM,
  TRADE_SITE,
  type TradeQuerySpec,
  type TradeRarity,
  type TradeStatFilter,
} from './types.js';

/**
 * Turning a captured item into a search, and a search into the API's JSON.
 *
 * Two functions matter here. `defaultSpecFor` reads the item the player just
 * copied and proposes a search; `buildQueryBody` renders any (possibly edited)
 * search into the exact body the trade endpoint expects. Everything the panel
 * does in between is editing the app-shaped `TradeQuerySpec`, never this JSON.
 */

/** In-game rarity → the trade site's rarity option. */
function rarityOption(rarity: Rarity): TradeRarity {
  switch (rarity) {
    case 'Normal':
      return 'normal';
    case 'Magic':
      return 'magic';
    case 'Rare':
      return 'rare';
    case 'Unique':
      return 'unique';
    default:
      // Currency, Gem, Quest have no gear-rarity band; search unconstrained.
      return 'any';
  }
}

/**
 * The modifiers worth searching on.
 *
 * Only matched mods carry a real trade stat id (`explicit.stat_…`); an
 * unmatched line's `statId` is a local slug the market has never heard of, so
 * including it would return nothing and quietly break the search. Duplicates by
 * id are collapsed — a rare can, rarely, print two lines that resolve to one
 * stat, and the API rejects a repeated filter id.
 */
function searchableFilters(mods: readonly ItemMod[]): TradeStatFilter[] {
  const seen = new Set<string>();
  const filters: TradeStatFilter[] = [];

  for (const mod of mods) {
    if (!mod.matched || seen.has(mod.statId)) continue;
    seen.add(mod.statId);
    filters.push({
      id: mod.statId,
      text: mod.text,
      // The first rolled value is the natural floor to offer; a hybrid mod's
      // second value is left for the player to add if they care about it.
      rolled: mod.values[0] ?? null,
      enabled: true,
      // Presence match by default — the value is a hint, not a constraint the
      // app imposed. See the note in `types.ts`.
      min: null,
      max: null,
    });
  }

  return filters;
}

/**
 * Proposes a search for a freshly captured item.
 *
 * Deliberately broad: the exact base and rarity, every matched modifier present
 * but unconstrained. That returns "items like this one" — a floor price — which
 * is the right first answer. Tightening (a minimum roll, dropping a filler mod)
 * is what the panel is for.
 */
export function defaultSpecFor(item: ParsedItem, league: string): TradeQuerySpec {
  return {
    league,
    // Only a unique's name identifies it on the market; a rare's is random.
    name: item.rarity === 'Unique' ? item.name || null : null,
    baseType: item.baseType || null,
    rarity: rarityOption(item.rarity),
    minItemLevel: null,
    onlineOnly: true,
    filters: searchableFilters(item.mods),
  };
}

/** A stat filter as the API wants it: id, and a value window only if one is set. */
function apiFilter(filter: TradeStatFilter): Record<string, unknown> {
  const value: Record<string, number> = {};
  if (filter.min !== null) value.min = filter.min;
  if (filter.max !== null) value.max = filter.max;

  return Object.keys(value).length > 0 ? { id: filter.id, value } : { id: filter.id };
}

/**
 * Renders a spec into the trade2 search body.
 *
 * Empty filter groups are omitted rather than sent as `{}`: the API tolerates
 * their absence and is fussier about their presence, and an empty
 * `type_filters` has been enough to turn a good query into zero results.
 */
export function buildQueryBody(spec: TradeQuerySpec): Record<string, unknown> {
  const query: Record<string, unknown> = {
    status: { option: spec.onlineOnly ? 'online' : 'any' },
  };

  if (spec.name) query['name'] = spec.name;
  if (spec.baseType) query['type'] = spec.baseType;

  const typeFilters: Record<string, unknown> = {};
  if (spec.rarity !== 'any') typeFilters['rarity'] = { option: spec.rarity };

  const miscFilters: Record<string, unknown> = {};
  if (spec.minItemLevel !== null) miscFilters['ilvl'] = { min: spec.minItemLevel };

  const filters: Record<string, unknown> = {};
  if (Object.keys(typeFilters).length > 0) filters['type_filters'] = { filters: typeFilters };
  if (Object.keys(miscFilters).length > 0) filters['misc_filters'] = { filters: miscFilters };
  if (Object.keys(filters).length > 0) query['filters'] = filters;

  const enabled = spec.filters.filter((filter) => filter.enabled);
  if (enabled.length > 0) {
    query['stats'] = [{ type: 'and', filters: enabled.map(apiFilter) }];
  } else {
    // The API requires the stats block to exist even when it is empty.
    query['stats'] = [{ type: 'and', filters: [] }];
  }

  return { query, sort: { price: 'asc' } };
}

/**
 * The official trade-site URL that reproduces this search in a browser.
 *
 * The site accepts the query JSON in the `q` parameter, so "open on the trade
 * site" needs no extra round trip — the same body that drives the API drops
 * straight into the page the player already trusts.
 */
export function browseUrl(spec: TradeQuerySpec): string {
  const body = JSON.stringify(buildQueryBody(spec));
  return `${TRADE_SITE}/${TRADE_REALM}/${encodeURIComponent(spec.league)}?q=${encodeURIComponent(body)}`;
}
