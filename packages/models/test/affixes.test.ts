import { describe, expect, it } from 'vitest';
import {
  affixBudget,
  affixMods,
  exceedsAffixBudget,
  intrinsicMods,
  type ItemMod,
  type ModCategory,
  type ParsedItem,
  type Rarity,
} from '../src/index.js';

const mod = (category: ModCategory): ItemMod => ({
  statId: `stat_${category}`,
  category,
  affixType: 'unknown',
  text: `a ${category} modifier`,
  template: 'a # modifier',
  values: [1],
  tier: null,
  matched: false,
});

function item(rarity: Rarity, categories: ModCategory[]): ParsedItem {
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
    },
    requirements: { level: null, strength: null, dexterity: null, intelligence: null },
    sockets: 2,
    mods: categories.map(mod),
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
    raw: '',
  };
}

describe('affix classification', () => {
  it('separates slot-consuming affixes from intrinsic modifiers', () => {
    // The shape that prompted this: a rare with runes and an implicit, where a
    // naive `mods.length` badly overstates how full the item is.
    const gloves = item('Rare', [
      'implicit',
      'rune',
      'rune',
      'enchant',
      'explicit',
      'explicit',
      'explicit',
      'crafted',
    ]);

    expect(affixMods(gloves)).toHaveLength(4);
    expect(intrinsicMods(gloves)).toHaveLength(4);
    expect(gloves.mods).toHaveLength(8);
  });

  it('counts fractured and desecrated modifiers as affixes', () => {
    const gloves = item('Rare', ['fractured', 'desecrated', 'explicit']);
    expect(affixMods(gloves)).toHaveLength(3);
    expect(intrinsicMods(gloves)).toHaveLength(0);
  });

  it('never counts a rune or an implicit against the budget', () => {
    // Six runes and six implicits are nonsense in game, but the point stands:
    // no quantity of intrinsic modifiers can fill an item.
    const overloaded = item(
      'Rare',
      Array.from({ length: 12 }, (_, i): ModCategory => (i % 2 === 0 ? 'rune' : 'implicit')),
    );

    expect(affixMods(overloaded)).toHaveLength(0);
    expect(exceedsAffixBudget(overloaded)).toBe(false);
  });
});

describe('affix budget', () => {
  it('reflects what each rarity can roll', () => {
    expect(affixBudget('Magic')).toBe(2);
    expect(affixBudget('Rare')).toBe(6);
    // Uniques carry a fixed list; the concept does not apply.
    expect(affixBudget('Unique')).toBeNull();
    expect(affixBudget('Normal')).toBeNull();
  });

  it('flags an item carrying more affixes than the game can produce', () => {
    const legal = item('Rare', Array.from<ModCategory>({ length: 6 }).fill('explicit'));
    expect(exceedsAffixBudget(legal)).toBe(false);

    const impossible = item('Rare', Array.from<ModCategory>({ length: 7 }).fill('explicit'));
    expect(exceedsAffixBudget(impossible)).toBe(true);
  });

  it('does not flag rarities without a budget', () => {
    const unique = item('Unique', Array.from<ModCategory>({ length: 9 }).fill('explicit'));
    expect(exceedsAffixBudget(unique)).toBe(false);
  });

  it('holds a magic item to one prefix and one suffix', () => {
    expect(exceedsAffixBudget(item('Magic', ['explicit', 'explicit']))).toBe(false);
    expect(exceedsAffixBudget(item('Magic', ['explicit', 'explicit', 'explicit']))).toBe(true);
  });
});
