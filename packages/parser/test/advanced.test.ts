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

  it('reads a unique’s own modifier as explicit, not implicit', () => {
    // A Headhunter's `{ Unique Modifier — Attribute }` header: the trade site
    // searches these as `explicit.stat_…`, so mislabelling them implicit gives
    // the wrong stat id and the search matches nothing.
    expect(parseModifierHeader('{ Unique Modifier — Attribute }')).toMatchObject({
      category: 'explicit',
      affixType: 'unknown',
    });
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

/**
 * A hybrid modifier grants two statistics under one header, printed as two
 * lines. The client says it is one prefix; the parser must agree, or the affix
 * count comes out one too high and the item looks over-rolled.
 */
describe('hybrid modifiers (one header, two statistics)', () => {
  const HYBRID = `Item Class: Body Armours
Rarity: Rare
Stag's Hide
Advanced Wyrmscale
--------
Item Level: 81
--------
{ Prefix Modifier "Stag's" (Tier: 1) — Life, Evasion }
39(39-42)% increased Evasion Rating
+49(42-49) to maximum Life
{ Suffix Modifier "of the Wind" (Tier: 2) — Speed }
8(7-9)% increased Movement Speed
`;

  const item = parsed(HYBRID);

  it('counts the hybrid as one prefix, not two mods', () => {
    const affixes = affixMods(item);
    expect(affixes.filter((m) => m.affixType === 'prefix')).toHaveLength(1);
    expect(affixes.filter((m) => m.affixType === 'suffix')).toHaveLength(1);
    expect(affixes).toHaveLength(2);
  });

  it('keeps both statistics inside the one modifier', () => {
    const hybrid = affixMods(item).find((m) => m.affixName === "Stag's");
    expect(hybrid?.text).toContain('Evasion Rating');
    expect(hybrid?.text).toContain('maximum Life');
    // Both rolled values are captured, in order.
    expect(hybrid?.values).toEqual([39, 49]);
    // The client stated the tier; it is fact, not inference.
    expect(hybrid?.tier).toMatchObject({ value: 1, confidence: 'exact' });
  });

  it('does not exceed the affix budget', () => {
    expect(exceedsAffixBudget(item)).toBe(false);
  });
});

/**
 * The game heads more than prefixes and suffixes with `{ … }`: corruption, runes
 * and Soul Cores get one too, and several omit the word "Modifier". Reading only
 * the "… Modifier …" form let a corruption header slip through as a statistic,
 * fusing the line under it onto the modifier above — which is how a corruption
 * Evasion and half of a hybrid Life/Evasion prefix ended up as one nonsense mod.
 */
describe('non-affix sources are not read as prefixes', () => {
  const CORRUPTED = `Item Class: Body Armours
Rarity: Rare
Stag's Hide
Advanced Wyrmscale
--------
Item Level: 81
--------
{ Prefix Modifier "Stag's" (Tier: 1) — Life, Evasion }
39(39-42)% increased Evasion Rating
+49(42-49) to maximum Life
--------
{ Corruption Enhancement — Evasion }
20(15-25)% increased Evasion Rating
--------
Corrupted
`;

  const item = parsed(CORRUPTED);

  it('reads the header without the word "Modifier"', () => {
    const header = parseModifierHeader('{ Corruption Enhancement — Evasion }');
    expect(header).toMatchObject({ category: 'corrupted', affixType: 'unknown', tags: ['Evasion'] });
  });

  it('counts the corruption mod as intrinsic, not an affix', () => {
    // One prefix (the hybrid), zero suffixes, and the corruption rides along
    // outside the budget. Before the fix this came out as two prefixes.
    expect(affixMods(item).filter((m) => m.affixType === 'prefix')).toHaveLength(1);
    expect(affixMods(item)).toHaveLength(1);
    expect(intrinsicMods(item).some((m) => m.category === 'corrupted')).toBe(true);
    expect(exceedsAffixBudget(item)).toBe(false);
  });

  it('keeps the corruption Evasion separate from the hybrid’s Evasion', () => {
    const hybrid = affixMods(item).find((m) => m.affixName === "Stag's");
    expect(hybrid?.text).toContain('maximum Life');
    // The corruption line is its own modifier, not appended to the prefix.
    const corruption = intrinsicMods(item).find((m) => m.category === 'corrupted');
    expect(corruption?.text).toContain('increased Evasion Rating');
    expect(corruption?.text).not.toContain('maximum Life');
  });

  it('treats a Rune header as intrinsic with no affix type', () => {
    expect(parseModifierHeader('{ Rune Modifier — Cold }')).toMatchObject({
      category: 'rune',
      affixType: 'unknown',
    });
  });

  it('treats a Soul Core header as intrinsic', () => {
    expect(parseModifierHeader('{ Soul Core — Attack }')?.category).toBe('soulcore');
  });

  it('defaults an unfamiliar brace header to intrinsic, never a prefix', () => {
    const header = parseModifierHeader('{ Some Future Source — Life }');
    expect(header?.affixType).toBe('unknown');
    expect(header?.category).toBe('implicit');
  });
});
