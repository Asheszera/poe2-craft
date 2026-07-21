import { describe, expect, it } from 'vitest';
import { affixMods, exceedsAffixBudget, intrinsicMods } from '@poe2/models';
import { parseItem, parseModifierHeader } from '../src/index.js';

/**
 * A real capture with Advanced Item Description enabled, pasted verbatim.
 *
 * This format is the reason the parser previously reported absurd modifier
 * counts: every `{ … }` header was counted as a modifier of its own, and the
 * `(min-max)` windows were read as part of the statistic.
 */
const ADVANCED_GLOVES = `Item Class: Gloves
Rarity: Rare
Corpse Claw
Pauascale Gloves
--------
Energy Shield: 34
--------
Requires: Level 45, 56 Int
--------
Sockets: S
--------
Item Level: 69
--------
+14% to Cold Resistance (rune)
--------
{ Prefix Modifier "Opalescent" (Tier: 3) — Mana }
+80(80-89) to maximum Mana
{ Prefix Modifier "Freezing" (Tier: 5) — Damage, Elemental, Cold, Attack }
Adds 10(9-10) to 16(15-17) Cold damage to Attacks
{ Prefix Modifier "Deliberate" (Tier: 6) — Attack }
+107(85-123) to Accuracy Rating
{ Suffix Modifier "of Siphoning" (Tier: 3) — Mana }
Gain 24(21-27) Mana per enemy killed
{ Suffix Modifier "of Ease" (Tier: 3) — Attack, Speed }
9(8-10)% increased Attack Speed
{ Suffix Modifier "of Regrowth" (Tier: 2) — Life, Attack }
Gain 4 Life per Enemy Hit with Attacks
`;

function parsed(raw: string) {
  const result = parseItem(raw);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

describe('parseModifierHeader', () => {
  it('reads affix type, name, tier and tags', () => {
    expect(parseModifierHeader('{ Prefix Modifier "Opalescent" (Tier: 3) — Mana }')).toEqual({
      category: 'explicit',
      affixType: 'prefix',
      name: 'Opalescent',
      tier: 3,
      tags: ['Mana'],
    });
  });

  it('splits multiple tags', () => {
    const header = parseModifierHeader(
      '{ Prefix Modifier "Freezing" (Tier: 5) — Damage, Elemental, Cold, Attack }',
    );
    expect(header?.tags).toEqual(['Damage', 'Elemental', 'Cold', 'Attack']);
  });

  it('handles headers with no affix type, name or tier', () => {
    expect(parseModifierHeader('{ Implicit Modifier — Attack }')).toMatchObject({
      category: 'implicit',
      affixType: 'unknown',
      name: null,
      tier: null,
    });
  });

  it('reads a category and an affix type from the same header', () => {
    expect(parseModifierHeader('{ Crafted Suffix Modifier "of Haste" (Tier: 1) }')).toMatchObject({
      category: 'crafted',
      affixType: 'suffix',
      tier: 1,
    });
  });

  it('is not fooled by an ordinary modifier line', () => {
    expect(parseModifierHeader('+80 to maximum Mana')).toBeNull();
  });
});

describe('advanced item description', () => {
  const item = parsed(ADVANCED_GLOVES);

  it('counts six affixes and one rune, not thirteen modifiers', () => {
    // Header lines are not modifiers. Counting them is what produced the
    // impossible affix totals that started this whole investigation.
    expect(affixMods(item)).toHaveLength(6);
    expect(intrinsicMods(item)).toHaveLength(1);
    expect(exceedsAffixBudget(item)).toBe(false);
  });

  it('splits three prefixes from three suffixes, as the client stated them', () => {
    const affixes = affixMods(item);
    expect(affixes.filter((m) => m.affixType === 'prefix')).toHaveLength(3);
    expect(affixes.filter((m) => m.affixType === 'suffix')).toHaveLength(3);
  });

  it('takes the tier from the client as fact, not inference', () => {
    const mana = item.mods.find((m) => m.text.includes('maximum Mana'));
    expect(mana?.tier).toMatchObject({ value: 3, confidence: 'exact', name: 'Opalescent' });
  });

  it('keeps the rolled value and the window apart', () => {
    const mana = item.mods.find((m) => m.text.includes('maximum Mana'));
    expect(mana?.values).toEqual([80]);
    expect(mana?.valueRanges).toEqual([{ value: 80, min: 80, max: 89 }]);
    // The window's digits must not leak into the statistic itself.
    expect(mana?.template).toBe('# to maximum Mana');
  });

  it('handles a modifier with two rolled values', () => {
    const cold = item.mods.find((m) => m.text.includes('Cold damage'));
    expect(cold?.values).toEqual([10, 16]);
    expect(cold?.valueRanges).toEqual([
      { value: 10, min: 9, max: 10 },
      { value: 16, min: 15, max: 17 },
    ]);
  });

  it('carries the affix name and tags through', () => {
    const speed = item.mods.find((m) => m.text.includes('Attack Speed'));
    expect(speed?.affixName).toBe('of Ease');
    expect(speed?.tags).toEqual(['Attack', 'Speed']);
  });

  it('keeps a fixed-value modifier with no window', () => {
    const life = item.mods.find((m) => m.text.includes('Life per Enemy Hit'));
    expect(life?.values).toEqual([4]);
    expect(life?.valueRanges).toEqual([]);
    expect(life?.affixType).toBe('suffix');
  });

  it('still classifies the rune from its inline tag', () => {
    const rune = item.mods.find((m) => m.text.includes('Cold Resistance'));
    expect(rune?.category).toBe('rune');
    expect(rune?.affixType).toBe('unknown'); // runes occupy no affix slot
  });

  it('reads the single-line requirements format', () => {
    expect(item.requirements.level).toBe(45);
    expect(item.requirements.intelligence).toBe(56);
    expect(item.requirements.strength).toBeNull();
  });

  it('leaves nothing unattributed', () => {
    expect(item.unparsedLines).toEqual([]);
  });
});
