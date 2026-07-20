import { describe, expect, it } from 'vitest';
import { ParsedItemSchema } from '@poe2/models';
import { looksLikeItem, parseItem } from '../src/index.js';
import {
  CORRUPTED_UNIQUE,
  CRLF_ARMOUR,
  CURRENCY,
  MAGIC_ITEM,
  NOT_AN_ITEM,
  RARE_WEAPON,
} from './fixtures.js';

/** Unwraps a Result, failing the test with the parser's own message. */
function parsed(raw: string) {
  const result = parseItem(raw);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

describe('parseItem — rare weapon', () => {
  const item = parsed(RARE_WEAPON);

  it('splits name from base type', () => {
    expect(item.rarity).toBe('Rare');
    expect(item.name).toBe('Bone Bludgeon');
    expect(item.baseType).toBe('Expert Forge Maul');
    expect(item.itemClass).toBe('Two Hand Maces');
  });

  it('parses weapon properties, discarding the (augmented) tag', () => {
    expect(item.properties.physicalDamage).toEqual({ min: 168, max: 252 });
    expect(item.properties.criticalChance).toBe(5);
    expect(item.properties.attacksPerSecond).toBe(1.05);
    expect(item.properties.weaponRange).toBe(1.3);
  });

  it('parses requirements, item level and rune sockets', () => {
    expect(item.requirements).toEqual({
      level: 67,
      strength: 174,
      dexterity: null,
      intelligence: null,
    });
    expect(item.itemLevel).toBe(81);
    expect(item.sockets).toBe(2);
  });

  it('separates implicit from explicit modifiers', () => {
    const implicits = item.mods.filter((m) => m.category === 'implicit');
    expect(implicits).toHaveLength(1);
    expect(implicits[0]?.text).toBe('+15 to Strength');
    expect(item.mods.filter((m) => m.category === 'explicit')).toHaveLength(5);
  });

  it('normalises modifiers into template + values', () => {
    const phys = item.mods.find((m) => m.text.includes('Physical Damage'));
    expect(phys).toMatchObject({
      template: '#% increased Physical Damage',
      values: [128],
      statId: 'pct_increased_physical_damage',
      affixType: 'unknown',
      tier: null,
      matched: false,
    });
  });

  it('keeps hyphenated ranges positive but real negatives negative', () => {
    const adds = item.mods.find((m) => m.text.startsWith('Adds'));
    expect(adds?.values).toEqual([12, 24]);
    const resist = item.mods.find((m) => m.text.includes('Fire Resistance'));
    expect(resist?.values).toEqual([-25]);
    expect(resist?.template).toBe('#% to Fire Resistance');
  });

  it('captures the trade note', () => {
    expect(item.note).toBe('~price 3 divine');
  });

  it('leaves nothing unattributed', () => {
    expect(item.unparsedLines).toEqual([]);
  });

  it('satisfies the published schema', () => {
    expect(ParsedItemSchema.safeParse(item).success).toBe(true);
  });
});

describe('parseItem — unique with flavour text', () => {
  const item = parsed(CORRUPTED_UNIQUE);

  it('routes lore into flavourText instead of modifiers', () => {
    expect(item.flavourText).toBe('The relic wanders,\nand so must you.');
    expect(item.mods).toHaveLength(2);
    expect(item.mods.every((m) => m.category === 'explicit')).toBe(true);
  });

  it('reads standalone state lines as flags', () => {
    expect(item.flags.corrupted).toBe(true);
    expect(item.flags.mirrored).toBe(false);
  });
});

describe('parseItem — magic item', () => {
  const item = parsed(MAGIC_ITEM);

  it('keeps the affixed name intact as the base type', () => {
    // Splitting "Sapphire Ring of the Bear" into its base requires the base
    // database; the parser must not guess.
    expect(item.name).toBeNull();
    expect(item.baseType).toBe('Sapphire Ring of the Bear');
  });
});

describe('parseItem — currency', () => {
  const item = parsed(CURRENCY);

  it('flags currency and parses the stack size', () => {
    expect(item.flags.isCurrency).toBe(true);
    expect(item.properties.stackSize).toEqual({ current: 7, max: 10 });
  });
});

describe('parseItem — CRLF armour with tagged modifiers', () => {
  const item = parsed(CRLF_ARMOUR);

  it('handles Windows line endings', () => {
    expect(item.baseType).toBe('Expert Vaal Gauntlets');
  });

  it('parses defences and quality', () => {
    expect(item.properties.quality).toBe(20);
    expect(item.properties.armour).toBe(214);
    expect(item.properties.evasion).toBe(55);
  });

  it('classifies every modifier source and derives the fractured flag', () => {
    expect(item.mods.map((m) => m.category)).toEqual(['fractured', 'crafted', 'rune']);
    expect(item.flags.fractured).toBe(true);
    expect(item.mods[0]?.text).toBe('+42 to maximum Life');
  });
});

describe('parseItem — rejection', () => {
  it('reports non-item text without throwing', () => {
    const result = parseItem(NOT_AN_ITEM);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_NOT_AN_ITEM');
  });

  it('rejects empty input', () => {
    expect(parseItem('   ').ok).toBe(false);
  });

  it('guards the clipboard watcher cheaply', () => {
    expect(looksLikeItem(RARE_WEAPON)).toBe(true);
    expect(looksLikeItem(NOT_AN_ITEM)).toBe(false);
  });
});

describe('performance budget', () => {
  it('parses a full rare item in well under 20ms', () => {
    // Warm up so the measurement is not dominated by first-call JIT.
    for (let i = 0; i < 50; i++) parseItem(RARE_WEAPON);

    const start = performance.now();
    for (let i = 0; i < 100; i++) parseItem(RARE_WEAPON);
    const perParse = (performance.now() - start) / 100;

    expect(perParse).toBeLessThan(20);
  });
});
