import type { DamageRange, ItemProperties } from '@poe2/models';
import { extractNumbers } from '@poe2/shared';
import { splitKeyValue } from './blocks.js';

/**
 * Mutable accumulator used while parsing. Kept internal to the package: the
 * public surface only ever hands out a frozen `ParsedItem`.
 */
export interface ItemDraft {
  properties: ItemProperties;
  requirements: {
    level: number | null;
    strength: number | null;
    dexterity: number | null;
    intelligence: number | null;
  };
  itemLevel: number | null;
  sockets: number;
  note: string | null;
}

export function emptyDraft(): ItemDraft {
  return {
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
    itemLevel: null,
    sockets: 0,
    note: null,
  };
}

/** `(augmented)`, `(enchant)` and friends decorate values; drop them. */
const VALUE_TAG_RE = /\s*\([a-z ]+\)\s*$/i;

const int = (v: string): number | null => {
  const n = extractNumbers(v)[0];
  return n === undefined ? null : Math.trunc(n);
};

const float = (v: string): number | null => extractNumbers(v)[0] ?? null;

const range = (v: string): DamageRange | null => {
  const [min, max] = extractNumbers(v);
  if (min === undefined) return null;
  return { min, max: max ?? min };
};

/** `Elemental Damage: 12-24, 5-9` → two ranges of unknown element. */
const ranges = (v: string): DamageRange[] =>
  v
    .split(',')
    .map((part) => range(part))
    .filter((r): r is DamageRange => r !== null);

type Handler = (draft: ItemDraft, value: string) => void;

/**
 * Table-driven property parsing.
 *
 * Adding a property is a one-line change here, and localisation later becomes a
 * matter of mapping translated keys onto the same handlers — which is why this
 * is a lookup table and not a chain of `if (line.startsWith(...))`.
 */
const HANDLERS: Readonly<Record<string, Handler>> = {
  quality: (d, v) => (d.properties.quality = int(v)),
  armour: (d, v) => (d.properties.armour = int(v)),
  evasion: (d, v) => (d.properties.evasion = int(v)),
  'evasion rating': (d, v) => (d.properties.evasion = int(v)),
  'energy shield': (d, v) => (d.properties.energyShield = int(v)),
  block: (d, v) => (d.properties.block = float(v)),
  'block chance': (d, v) => (d.properties.block = float(v)),
  spirit: (d, v) => (d.properties.spirit = int(v)),

  'physical damage': (d, v) => (d.properties.physicalDamage = range(v)),
  'chaos damage': (d, v) => (d.properties.chaosDamage = range(v)),
  'elemental damage': (d, v) => {
    d.properties.elementalDamage.push(...ranges(v).map((r) => ({ ...r, element: null })));
  },
  'fire damage': (d, v) => {
    const r = range(v);
    if (r) d.properties.elementalDamage.push({ ...r, element: 'fire' as const });
  },
  'cold damage': (d, v) => {
    const r = range(v);
    if (r) d.properties.elementalDamage.push({ ...r, element: 'cold' as const });
  },
  'lightning damage': (d, v) => {
    const r = range(v);
    if (r) d.properties.elementalDamage.push({ ...r, element: 'lightning' as const });
  },

  'critical hit chance': (d, v) => (d.properties.criticalChance = float(v)),
  'critical strike chance': (d, v) => (d.properties.criticalChance = float(v)),
  'attacks per second': (d, v) => (d.properties.attacksPerSecond = float(v)),
  'weapon range': (d, v) => (d.properties.weaponRange = float(v)),

  'waystone tier': (d, v) => (d.properties.waystoneTier = int(v)),
  'map tier': (d, v) => (d.properties.waystoneTier = int(v)),
  'stack size': (d, v) => {
    const [current, max] = extractNumbers(v);
    if (current !== undefined && max !== undefined) d.properties.stackSize = { current, max };
  },

  /**
   * The single-line form: `Requires: Level 45, 56 Int`.
   *
   * The client uses this instead of a `Requirements:` block on some items, and
   * the attribute order is not fixed — so each part is matched by its name
   * rather than by position.
   */
  requires: (d, v) => {
    for (const part of v.split(',')) {
      const text = part.trim();
      const amount = int(text);
      if (amount === null) continue;

      if (/level/i.test(text)) d.requirements.level = amount;
      else if (/str/i.test(text)) d.requirements.strength = amount;
      else if (/dex/i.test(text)) d.requirements.dexterity = amount;
      else if (/int/i.test(text)) d.requirements.intelligence = amount;
    }
  },

  'item level': (d, v) => (d.itemLevel = int(v)),
  sockets: (d, v) => (d.sockets = (v.match(/S/gi) ?? []).length),
  note: (d, v) => (d.note = v),

  // Requirement lines. The client emits full words in PoE2 and abbreviations in
  // older exports; both are accepted.
  level: (d, v) => (d.requirements.level = int(v)),
  strength: (d, v) => (d.requirements.strength = int(v)),
  str: (d, v) => (d.requirements.strength = int(v)),
  dexterity: (d, v) => (d.requirements.dexterity = int(v)),
  dex: (d, v) => (d.requirements.dexterity = int(v)),
  intelligence: (d, v) => (d.requirements.intelligence = int(v)),
  int: (d, v) => (d.requirements.intelligence = int(v)),
};

/**
 * Applies a `Key: value` line to the draft.
 *
 * @returns true when the line was recognised and consumed.
 */
export function applyPropertyLine(draft: ItemDraft, line: string): boolean {
  const kv = splitKeyValue(line);
  if (!kv) return false;

  const handler = HANDLERS[kv.key.toLowerCase()];
  if (!handler) return false;

  handler(draft, kv.value.replace(VALUE_TAG_RE, '').trim());
  return true;
}

/** True when a block looks like properties/requirements rather than modifiers. */
export function isPropertyBlock(lines: string[]): boolean {
  const recognised = lines.filter((l) => {
    const kv = splitKeyValue(l);
    return kv !== null && HANDLERS[kv.key.toLowerCase()] !== undefined;
  });
  // `Requirements:` is a bare header line, so allow one unrecognised line.
  return recognised.length > 0 && recognised.length >= lines.length - 1;
}
