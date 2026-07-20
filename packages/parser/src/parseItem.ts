import type { ItemMod, ParsedItem, Rarity } from '@poe2/models';
import { RaritySchema } from '@poe2/models';
import { appError, err, ok, type Result } from '@poe2/shared';
import { splitBlocks, splitKeyValue } from './blocks.js';
import { parseModLine } from './mods.js';
import { applyPropertyLine, emptyDraft, isPropertyBlock } from './properties.js';

/**
 * Standalone lines the client prints as item state. Compared case-insensitively
 * after trimming.
 */
const FLAG_LINES: Readonly<Record<string, keyof ParsedItem['flags'] | 'ignore'>> = {
  corrupted: 'corrupted',
  mirrored: 'mirrored',
  unidentified: 'unidentified',
  'fractured item': 'fractured',
  'desecrated item': 'desecrated',
  split: 'ignore',
  'synthesised item': 'ignore',
  'can have up to 3 crafted modifiers': 'ignore',
};

const isFlagLine = (line: string): boolean =>
  FLAG_LINES[line.trim().toLowerCase()] !== undefined;

interface Header {
  itemClass: string | null;
  rarity: Rarity;
  name: string | null;
  baseType: string;
  leftovers: string[];
}

/**
 * Parses the first block, which always carries `Item Class`, `Rarity` and the
 * item's name lines.
 *
 * Name-line arity is the discriminator the client gives us:
 * two lines means `name` + `baseType` (Rare/Unique), one line means the base
 * type alone (Normal, Currency, unidentified Rare) or a Magic item whose name
 * embeds its affixes — the latter needs the base database to be split, so it is
 * left intact here rather than guessed at.
 */
function parseHeader(block: string[]): Result<Header> {
  let itemClass: string | null = null;
  let rarity: Rarity | null = null;
  const nameLines: string[] = [];
  const leftovers: string[] = [];

  for (const line of block) {
    const kv = splitKeyValue(line);
    const key = kv?.key.toLowerCase();

    if (key === 'item class' && kv) {
      itemClass = kv.value;
    } else if (key === 'rarity' && kv) {
      const parsed = RaritySchema.safeParse(kv.value.trim());
      if (parsed.success) {
        rarity = parsed.data;
      } else {
        // Unknown rarity (a new client category) must not abort the parse —
        // degrade to Normal and surface the line for telemetry.
        rarity = 'Normal';
        leftovers.push(line);
      }
    } else {
      nameLines.push(line.trim());
    }
  }

  if (rarity === null) {
    return err(appError('PARSE_NOT_AN_ITEM', 'Clipboard text has no "Rarity:" line.'));
  }
  if (nameLines.length === 0) {
    return err(appError('PARSE_MALFORMED', 'Item header carries no name or base type.'));
  }

  const [first, second, ...rest] = nameLines;
  leftovers.push(...rest);

  return ok({
    itemClass,
    rarity,
    name: second === undefined ? null : (first ?? null),
    baseType: second ?? first ?? '',
    leftovers,
  });
}

/**
 * Parses raw clipboard text into a fully structured item.
 *
 * Pure and synchronous: no I/O, no database, no allocation beyond the result.
 * Affix type and tier are left unresolved here by design — see `parseModLine`.
 */
export function parseItem(raw: string): Result<ParsedItem> {
  const blocks = splitBlocks(raw);
  const firstBlock = blocks[0];
  if (!firstBlock) {
    return err(appError('PARSE_NOT_AN_ITEM', 'Clipboard is empty.'));
  }

  const header = parseHeader(firstBlock);
  if (!header.ok) return header;

  const draft = emptyDraft();
  const unparsedLines: string[] = [...header.value.leftovers];
  const flags = {
    corrupted: false,
    mirrored: false,
    unidentified: false,
    fractured: false,
    desecrated: false,
    isCurrency: header.value.rarity === 'Currency',
  };

  // Pass 1 — classify. Modifier blocks are collected rather than parsed so the
  // unique flavour-text heuristic below can still reclassify the last one.
  const modBlocks: string[][] = [];

  for (const block of blocks.slice(1)) {
    if (block.every(isFlagLine)) {
      for (const line of block) {
        const flag = FLAG_LINES[line.trim().toLowerCase()];
        if (flag && flag !== 'ignore') flags[flag] = true;
      }
      continue;
    }

    if (isPropertyBlock(block)) {
      for (const line of block) {
        if (applyPropertyLine(draft, line)) continue;
        if (line.trim().toLowerCase() === 'requirements:') continue;
        unparsedLines.push(line);
      }
      continue;
    }

    modBlocks.push(block);
  }

  // Uniques end with an italic lore block that is indistinguishable from a
  // modifier block structurally. It is always the last one, and only exists
  // when the item also has real modifiers.
  let flavourText: string | null = null;
  if (header.value.rarity === 'Unique' && modBlocks.length > 1) {
    flavourText = modBlocks.pop()!.join('\n');
  }

  // Pass 2 — parse modifiers. Flag lines can appear inline (e.g. `Corrupted`
  // sharing a block with an implicit) so they are filtered here too.
  const mods: ItemMod[] = [];
  for (const block of modBlocks) {
    for (const line of block) {
      if (isFlagLine(line)) {
        const flag = FLAG_LINES[line.trim().toLowerCase()];
        if (flag && flag !== 'ignore') flags[flag] = true;
        continue;
      }
      mods.push(parseModLine(line));
    }
  }

  if (mods.some((m) => m.category === 'fractured')) flags.fractured = true;
  if (mods.some((m) => m.category === 'desecrated')) flags.desecrated = true;

  return ok({
    itemClass: header.value.itemClass,
    rarity: header.value.rarity,
    name: header.value.name,
    baseType: header.value.baseType,
    itemLevel: draft.itemLevel,
    properties: draft.properties,
    requirements: draft.requirements,
    sockets: draft.sockets,
    mods,
    flags,
    note: draft.note,
    flavourText,
    unparsedLines,
    raw,
  });
}

/**
 * Cheap guard for the clipboard watcher: avoids running the full parser on
 * every unrelated copy the user makes outside the game.
 */
export function looksLikeItem(raw: string): boolean {
  return /^\s*(Item Class|Rarity):/m.test(raw);
}
