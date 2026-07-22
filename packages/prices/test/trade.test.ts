import { describe, expect, it } from 'vitest';
import type { ItemMod, ParsedItem, Rarity } from '@poe2/models';
import {
  browseUrl,
  buildQueryBody,
  defaultSpecFor,
  type TradeQuerySpec,
} from '../src/index.js';

/**
 * A modifier that either matched the stat database (so it carries a real trade
 * id) or did not (so its id is a local slug the market cannot search).
 */
const mod = (overrides: Partial<ItemMod>): ItemMod => ({
  statId: 'explicit.stat_test',
  category: 'explicit',
  affixType: 'prefix',
  affixName: null,
  tags: [],
  valueRanges: [],
  text: 'a modifier',
  template: 'a # modifier',
  values: [1],
  tier: null,
  matched: true,
  ...overrides,
});

function item(
  mods: ItemMod[],
  rarity: Rarity = 'Rare',
  properties: Partial<ParsedItem['properties']> = {},
): ParsedItem {
  return {
    itemClass: 'Gloves',
    rarity,
    name: 'Victory Fingers',
    baseType: 'Expert Vaal Gauntlets',
    itemLevel: 80,
    properties: {
      quality: null,
      armour: null,
      evasion: null,
      energyShield: null,
      block: null,
      spirit: null,
      physicalDamage: null,
      elementalDamage: [],
      chaosDamage: null,
      criticalChance: null,
      attacksPerSecond: null,
      weaponRange: null,
      waystoneTier: null,
      stackSize: null,
      ...properties,
    },
    requirements: { level: null, strength: null, dexterity: null, intelligence: null },
    sockets: 2,
    mods,
    flags: {
      corrupted: false,
      mirrored: false,
      unidentified: false,
      fractured: false,
      desecrated: false,
      isCurrency: false,
    },
    note: null,
    flavourText: null,
    unparsedLines: [],
    raw: 'Rarity: Rare\nVictory Fingers\nExpert Vaal Gauntlets',
  } satisfies ParsedItem;
}

describe('building a search from a captured item', () => {
  it('turns every matched modifier into a presence filter, base and rarity set', () => {
    const spec = defaultSpecFor(
      item([
        mod({ statId: 'explicit.stat_life', text: '+80 to maximum Life', values: [80] }),
        mod({ statId: 'explicit.stat_fireres', text: '+30% to Fire Resistance', values: [30] }),
      ]),
      'Runes of Aldur',
    );

    expect(spec.baseType).toBe('Expert Vaal Gauntlets');
    expect(spec.rarity).toBe('rare');
    // A rare's name is random; it is not a search term.
    expect(spec.name).toBeNull();
    // Instant buyout by default — the cleanest price signal.
    expect(spec.status).toBe('securable');
    expect(spec.filters).toHaveLength(2);
    // Seeded to the item's own roll: "at least as good as mine".
    expect(spec.filters[0]?.rolled).toBe(80);
    expect(spec.filters[0]?.min).toBe(80);
    expect(spec.filters.every((f) => f.enabled && f.max === null)).toBe(true);
  });

  it('drops unmatched modifiers, whose id the market cannot search', () => {
    const spec = defaultSpecFor(
      item([
        mod({ statId: 'explicit.stat_life', text: '+80 to maximum Life', matched: true }),
        // A line the stat database had no entry for: its id is a slug.
        mod({ statId: 'a-modifier', text: 'some unknown line', matched: false }),
      ]),
      'Standard',
    );

    expect(spec.filters).toHaveLength(1);
    expect(spec.filters[0]?.id).toBe('explicit.stat_life');
  });

  it('collapses two lines that resolve to one stat id', () => {
    const spec = defaultSpecFor(
      item([
        mod({ statId: 'explicit.stat_life', text: 'first' }),
        mod({ statId: 'explicit.stat_life', text: 'second' }),
      ]),
      'Standard',
    );
    expect(spec.filters).toHaveLength(1);
  });

  it('maps rarity, and leaves non-gear rarities unconstrained', () => {
    expect(defaultSpecFor(item([], 'Magic'), 'x').rarity).toBe('magic');
    expect(defaultSpecFor(item([], 'Currency'), 'x').rarity).toBe('any');
  });

  it('prices an item against its own corruption and mirror state', () => {
    const clean = defaultSpecFor(item([]), 'x');
    expect(clean.corrupted).toBe(false);
    expect(clean.mirrored).toBe(false);

    const corrupted = item([]);
    corrupted.flags.corrupted = true;
    expect(defaultSpecFor(corrupted, 'x').corrupted).toBe(true);
  });

  it('offers the item’s own armour/evasion/ES as filters, seeded to its rolls', () => {
    const spec = defaultSpecFor(item([], 'Rare', { evasion: 420, armour: null }), 'Standard');
    const ev = spec.equipment.find((f) => f.id === 'ev');
    expect(ev).toMatchObject({ id: 'ev', label: 'Evasion Rating', enabled: true, min: 420 });
    // A property the item does not have is not offered as a filter.
    expect(spec.equipment.find((f) => f.id === 'ar')).toBeUndefined();

    const body = buildQueryBody(spec) as {
      query: { filters?: { equipment_filters?: { filters: { ev?: { min: number } } } } };
    };
    expect(body.query.filters?.equipment_filters?.filters.ev?.min).toBe(420);
  });

  it('searches a unique by its name, which is how the market indexes it', () => {
    const unique = item([], 'Unique');
    const spec = defaultSpecFor(unique, 'Standard');
    expect(spec.name).toBe('Victory Fingers');

    const body = buildQueryBody(spec) as { query: { name?: string } };
    expect(body.query.name).toBe('Victory Fingers');
  });
});

describe('rendering a spec into the trade API body', () => {
  const base: TradeQuerySpec = {
    league: 'Runes of Aldur',
    name: null,
    baseType: 'Expert Vaal Gauntlets',
    rarity: 'rare',
    status: 'available',
    minItemLevel: null,
    corrupted: null,
    mirrored: null,
    collapse: false,
    indexed: null,
    maxBuyout: null,
    equipment: [],
    filters: [
      { id: 'explicit.stat_life', text: 'Life', rolled: 80, enabled: true, min: null, max: null },
    ],
  };

  it('nests type, rarity, status and the stat filter the way the API expects', () => {
    const body = buildQueryBody(base) as {
      query: {
        status: { option: string };
        type?: string;
        filters?: { type_filters?: { filters: { rarity?: { option: string } } } };
        stats: { type: string; filters: { id: string; value?: unknown }[] }[];
      };
    };

    expect(body.query.status.option).toBe('available');
    expect(body.query.type).toBe('Expert Vaal Gauntlets');
    expect(body.query.filters?.type_filters?.filters.rarity?.option).toBe('rare');
    expect(body.query.stats[0]?.filters[0]).toEqual({ id: 'explicit.stat_life' });
  });

  it('renders the trade and misc filters with the site’s own option ids', () => {
    const body = buildQueryBody({
      ...base,
      status: 'securable',
      corrupted: true,
      mirrored: false,
      collapse: true,
      indexed: '3days',
      maxBuyout: 50,
    }) as {
      query: {
        status: { option: string };
        filters?: {
          misc_filters?: { filters: { corrupted?: { option: string }; mirrored?: { option: string } } };
          trade_filters?: {
            filters: {
              collapse?: { option: string };
              indexed?: { option: string };
              price?: { max: number };
            };
          };
        };
      };
    };

    expect(body.query.status.option).toBe('securable');
    expect(body.query.filters?.misc_filters?.filters.corrupted?.option).toBe('true');
    expect(body.query.filters?.misc_filters?.filters.mirrored?.option).toBe('false');
    expect(body.query.filters?.trade_filters?.filters.collapse?.option).toBe('true');
    expect(body.query.filters?.trade_filters?.filters.indexed?.option).toBe('3days');
    expect(body.query.filters?.trade_filters?.filters.price?.max).toBe(50);
  });

  it('adds a value window only when a bound is set', () => {
    const withMin = buildQueryBody({
      ...base,
      filters: [{ id: 'explicit.stat_life', text: 'Life', rolled: 80, enabled: true, min: 70, max: null }],
    }) as { query: { stats: { filters: { id: string; value?: { min?: number } }[] }[] } };

    expect(withMin.query.stats[0]?.filters[0]?.value).toEqual({ min: 70 });
  });

  it('omits a disabled filter, and empty groups entirely', () => {
    const body = buildQueryBody({
      ...base,
      baseType: null,
      rarity: 'any',
      filters: [{ id: 'explicit.stat_life', text: 'Life', rolled: 80, enabled: false, min: null, max: null }],
    }) as { query: { type?: string; filters?: unknown; stats: { filters: unknown[] }[] } };

    expect(body.query.type).toBeUndefined();
    expect(body.query.filters).toBeUndefined();
    expect(body.query.stats[0]?.filters).toHaveLength(0);
  });

  it('produces a browse URL that carries the query for the trade site', () => {
    const url = browseUrl(base);
    expect(url).toContain('/trade2/search/poe2/Runes%20of%20Aldur?q=');
    expect(url).toContain(encodeURIComponent('explicit.stat_life'));
  });
});
