/**
 * Real clipboard captures. Keep these byte-faithful — including the trailing
 * space the client emits after `Sockets:` — because the parser's job is to
 * tolerate exactly what the game produces, not a cleaned-up idealisation.
 */

export const RARE_WEAPON = `Item Class: Two Hand Maces
Rarity: Rare
Bone Bludgeon
Expert Forge Maul
--------
Physical Damage: 168-252 (augmented)
Critical Hit Chance: 5.00%
Attacks per Second: 1.05
Weapon Range: 1.3 metres
--------
Requirements:
Level: 67
Strength: 174
--------
Sockets: S S
--------
Item Level: 81
--------
+15 to Strength (implicit)
--------
128% increased Physical Damage
+165 to Accuracy Rating
Adds 12 to 24 Fire Damage
+38 to maximum Life
-25% to Fire Resistance
--------
Note: ~price 3 divine
`;

export const CORRUPTED_UNIQUE = `Item Class: Body Armours
Rarity: Unique
Wandering Reliquary
Sacrificial Vest
--------
Energy Shield: 42
--------
Requirements:
Level: 16
Intelligence: 33
--------
Item Level: 30
--------
+20 to maximum Energy Shield
15% increased Rarity of Items found
--------
The relic wanders,
and so must you.
--------
Corrupted
`;

export const MAGIC_ITEM = `Item Class: Rings
Rarity: Magic
Sapphire Ring of the Bear
--------
Requirements:
Level: 20
--------
Item Level: 44
--------
+18% to Cold Resistance (implicit)
--------
+12 to Strength
`;

export const CURRENCY = `Item Class: Stackable Currency
Rarity: Currency
Divine Orb
--------
Stack Size: 7/10
--------
Randomises the numeric values of the modifiers on an item
`;

export const CRLF_ARMOUR = [
  'Item Class: Gloves',
  'Rarity: Rare',
  'Dread Grip',
  'Expert Vaal Gauntlets',
  '--------',
  'Quality: +20% (augmented)',
  'Armour: 214 (augmented)',
  'Evasion Rating: 55',
  '--------',
  'Item Level: 78',
  '--------',
  '+42 to maximum Life (fractured)',
  '18% increased Attack Speed (crafted)',
  '+15% to Chaos Resistance (rune)',
  '',
].join('\r\n');

export const NOT_AN_ITEM = 'https://example.com/some-random-copied-url';
