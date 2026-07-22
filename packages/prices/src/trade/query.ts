import type { ItemMod, ParsedItem, Rarity } from '@poe2/models';
import {
  TRADE_REALM,
  TRADE_SITE,
  type TradeQuerySpec,
  type TradeRangeFilter,
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
    const rolled = mod.values[0] ?? null;
    filters.push({
      id: mod.statId,
      text: mod.text,
      rolled,
      enabled: true,
      // Seeded to the item's own roll: "at least as good as mine" is the search
      // a price check wants, and the player loosens it by clearing the field.
      // A hybrid mod's second value is left for them to add if it matters.
      min: rolled,
      max: null,
    });
  }

  return filters;
}

/**
 * The item's defensive properties as equipment filters, seeded to its rolls.
 *
 * Armour, evasion and energy shield are searchable in their own right — a
 * player pricing a chest often cares about its defences as much as its
 * modifiers — so they are offered as filters the same way, keyed by the trade
 * site's own equipment ids.
 */
function equipmentFilters(item: ParsedItem): TradeRangeFilter[] {
  const source: { id: string; label: string; value: number | null }[] = [
    { id: 'ar', label: 'Armour', value: item.properties.armour },
    { id: 'ev', label: 'Evasion Rating', value: item.properties.evasion },
    { id: 'es', label: 'Energy Shield', value: item.properties.energyShield },
  ];

  return source
    .filter((entry): entry is typeof entry & { value: number } => entry.value !== null && entry.value > 0)
    .map((entry) => ({ id: entry.id, label: entry.label, enabled: true, min: entry.value, max: null }));
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
    // Instant Buyout: only listings with a fixed price you can act on, which is
    // the cleanest signal for "what is this worth" — the player can widen it to
    // in-person or offline from the panel.
    status: 'securable',
    minItemLevel: null,
    // Match the item's own state: a corrupted or mirrored item is a different
    // market, and pricing it against clean ones would mislead.
    corrupted: item.flags.corrupted,
    mirrored: item.flags.mirrored,
    collapse: false,
    indexed: null,
    maxBuyout: null,
    equipment: equipmentFilters(item),
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
    status: { option: spec.status },
  };

  if (spec.name) query['name'] = spec.name;
  if (spec.baseType) query['type'] = spec.baseType;

  const typeFilters: Record<string, unknown> = {};
  if (spec.rarity !== 'any') typeFilters['rarity'] = { option: spec.rarity };
  if (spec.minItemLevel !== null) typeFilters['ilvl'] = { min: spec.minItemLevel };

  // The trade site's option ids for a yes/no filter are the strings "true"
  // and "false"; a null tri-state is left out to mean "either".
  const miscFilters: Record<string, unknown> = {};
  if (spec.corrupted !== null) miscFilters['corrupted'] = { option: String(spec.corrupted) };
  if (spec.mirrored !== null) miscFilters['mirrored'] = { option: String(spec.mirrored) };

  const tradeFilters: Record<string, unknown> = {};
  if (spec.collapse) tradeFilters['collapse'] = { option: 'true' };
  if (spec.indexed !== null) tradeFilters['indexed'] = { option: spec.indexed };
  // No option = the Exalted-Orb-equivalent the site normalises every price to.
  if (spec.maxBuyout !== null) tradeFilters['price'] = { max: spec.maxBuyout };

  const equipmentFilters: Record<string, unknown> = {};
  for (const filter of spec.equipment) {
    if (!filter.enabled) continue;
    const range: Record<string, number> = {};
    if (filter.min !== null) range.min = filter.min;
    if (filter.max !== null) range.max = filter.max;
    if (Object.keys(range).length > 0) equipmentFilters[filter.id] = range;
  }

  const filters: Record<string, unknown> = {};
  if (Object.keys(typeFilters).length > 0) filters['type_filters'] = { filters: typeFilters };
  if (Object.keys(equipmentFilters).length > 0) {
    filters['equipment_filters'] = { filters: equipmentFilters };
  }
  if (Object.keys(miscFilters).length > 0) filters['misc_filters'] = { filters: miscFilters };
  if (Object.keys(tradeFilters).length > 0) filters['trade_filters'] = { filters: tradeFilters };
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
