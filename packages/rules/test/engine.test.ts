import { describe, expect, it } from 'vitest';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import { analyse, deriveFacts, RULES } from '../src/index.js';

const kb = defaultKnowledgeBase();

/** Full layer-0 path: parse → enrich → facts, exactly as the app runs it. */
function factsFor(raw: string) {
  const result = parseItem(raw);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return deriveFacts(enrichItem(result.value, kb));
}

const advice = (raw: string) => analyse(factsFor(raw).item).recommendations.map((r) => r.action);

const RARE_OPEN_SLOTS = `Item Class: Gloves
Rarity: Rare
Victory Fingers
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+120 to maximum Life
+45% to Fire Resistance
`;

const CORRUPTED = `Item Class: Gloves
Rarity: Rare
Locked Grips
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+120 to maximum Life
--------
Corrupted
`;

describe('facts', () => {
  it('tracks prefix and suffix budgets independently', () => {
    const facts = factsFor(RARE_OPEN_SLOTS);

    expect(facts.prefixes).toBe(1);
    expect(facts.suffixes).toBe(1);
    // A rare holds three of each, so one of each used leaves two of each open.
    expect(facts.openPrefixes).toBe(2);
    expect(facts.openSuffixes).toBe(2);
    expect(facts.openAffixes).toBe(4);
    expect(facts.isFull).toBe(false);
  });

  it('reports corruption as uncraftable', () => {
    const facts = factsFor(CORRUPTED);
    expect(facts.isCorrupted).toBe(true);
    expect(facts.isCraftable).toBe(false);
  });

  it('leaves tier quality null when nothing could be placed on a ladder', () => {
    const facts = factsFor(`Item Class: Gloves
Rarity: Rare
Mystery Grips
Expert Vaal Gauntlets
--------
Item Level: 80
--------
Totally Not A Real Modifier
`);
    expect(facts.tierQuality).toBeNull();
    expect(facts.unknownMods).toBe(1);
  });

  it('computes weapon dps from damage and attack speed', () => {
    const facts = factsFor(`Item Class: Two Hand Maces
Rarity: Rare
Bone Bludgeon
Expert Forge Maul
--------
Physical Damage: 100-200
Attacks per Second: 2.00
--------
Item Level: 81
--------
+120 to maximum Life
`);
    // (100+200)/2 * 2.00
    expect(facts.dps).toBe(300);
    expect(facts.isWeapon).toBe(true);
  });
});

describe('rules', () => {
  it('recommends an Exalted Orb when slots are open and rolls are good', () => {
    expect(advice(RARE_OPEN_SLOTS)).toContain('exalted-orb');
  });

  it('stops on a corrupted item and offers nothing else', () => {
    const actions = advice(CORRUPTED);
    expect(actions).toEqual(['stop']);
  });

  it('never suggests spending currency on an uncraftable item', () => {
    const spending = advice(CORRUPTED).filter((a) => a.endsWith('orb'));
    expect(spending).toEqual([]);
  });

  it('promotes a filled Magic item to Rare', () => {
    const actions = advice(`Item Class: Rings
Rarity: Magic
Sapphire Ring of the Bear
--------
Item Level: 80
--------
+120 to maximum Life
+45% to Fire Resistance
`);
    expect(actions).toContain('regal-orb');
  });

  it('states real odds for annulment and nothing else', () => {
    const analysis = analyse(
      factsFor(`Item Class: Gloves
Rarity: Rare
Mixed Grips
Expert Vaal Gauntlets
--------
Item Level: 80
--------
+200 to maximum Life
+15 to maximum Life
+45% to Fire Resistance
+45% to Cold Resistance
+45% to Lightning Resistance
+6% to Chaos Resistance
`).item,
    );

    const annul = analysis.recommendations.find((r) => r.action === 'orb-of-annulment');
    if (annul) {
      expect(annul.risk).toBe('destructive');
      expect(annul.successChance).toBeGreaterThan(0);
      expect(annul.successChance).toBeLessThanOrEqual(1);
    }

    // Cost and profit require the price adapters; they must not be invented.
    for (const rec of analysis.recommendations) {
      expect(rec.estimatedCost).toBeNull();
      expect(rec.estimatedProfit).toBeNull();
    }
  });

  it('survives a rule that throws', () => {
    const analysis = analyse(factsFor(RARE_OPEN_SLOTS).item, {
      rules: [
        {
          id: 'broken',
          priority: 99,
          when: () => {
            throw new Error('boom');
          },
          then: () => {
            throw new Error('never reached');
          },
        },
        ...RULES,
      ],
    });

    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it('orders advice by priority', () => {
    const analysis = analyse(factsFor(RARE_OPEN_SLOTS).item);
    const priorities = analysis.recommendations.map(
      (rec) => RULES.find((r) => r.then(factsFor(RARE_OPEN_SLOTS)).action === rec.action)?.priority ?? 0,
    );
    expect([...priorities]).toEqual([...priorities].sort((a, b) => b - a));
  });
});

describe('coverage', () => {
  it('advises on a filled rare with decent-but-imperfect tiers', () => {
    // The observed gap: a real six-affix item scored 88 and produced no advice
    // at all, because every rule wanted either excellence or failure.
    const actions = advice(`Item Class: Gloves
Rarity: Rare
Corpse Claw
Pauascale Gloves
--------
Item Level: 69
--------
{ Prefix Modifier "Opalescent" (Tier: 3) - Mana }
+80(80-89) to maximum Mana
{ Prefix Modifier "Freezing" (Tier: 5) - Damage, Elemental, Cold, Attack }
Adds 10(9-10) to 16(15-17) Cold damage to Attacks
{ Prefix Modifier "Deliberate" (Tier: 6) - Attack }
+107(85-123) to Accuracy Rating
{ Suffix Modifier "of Siphoning" (Tier: 3) - Mana }
Gain 24(21-27) Mana per enemy killed
{ Suffix Modifier "of Ease" (Tier: 3) - Attack, Speed }
9(8-10)% increased Attack Speed
{ Suffix Modifier "of Regrowth" (Tier: 2) - Life, Attack }
Gain 4 Life per Enemy Hit with Attacks
`);

    expect(actions).not.toEqual([]);
    expect(actions).not.toContain('assess');
  });

  it('never returns an empty recommendation list', () => {
    // "No advice" reads as a broken app. A named gap reads as an honest one.
    const analysis = analyse(factsFor(CORRUPTED).item, { rules: [] });

    expect(analysis.recommendations).toHaveLength(1);
    expect(analysis.recommendations[0]?.action).toBe('assess');
    expect(analysis.recommendations[0]?.reasoning).toMatch(/gap in the advisor/i);
  });
});

describe('scoring', () => {
  it('rates a corrupted single-affix item below a healthy one', () => {
    const good = analyse(factsFor(RARE_OPEN_SLOTS).item).score;
    const bad = analyse(factsFor(CORRUPTED).item).score;
    expect(good).toBeGreaterThan(bad);
  });

  it('stays within 0..100', () => {
    for (const raw of [RARE_OPEN_SLOTS, CORRUPTED]) {
      const { score: value } = analyse(factsFor(raw).item);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('explains itself — every score comes with strengths or weaknesses', () => {
    const analysis = analyse(factsFor(RARE_OPEN_SLOTS).item);
    expect(analysis.strengths.length + analysis.weaknesses.length).toBeGreaterThan(0);
  });
});

describe('performance budget', () => {
  it('analyses well inside the 50ms layer-0 budget', () => {
    const item = factsFor(RARE_OPEN_SLOTS).item;
    for (let i = 0; i < 20; i++) analyse(item);

    const start = performance.now();
    for (let i = 0; i < 100; i++) analyse(item);
    const perRun = (performance.now() - start) / 100;

    expect(perRun).toBeLessThan(2);
  });
});
