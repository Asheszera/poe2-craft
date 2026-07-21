/**
 * `@poe2/parser` — clipboard text → `ParsedItem`.
 *
 * Contract:
 *  - pure, synchronous, no I/O, no external data;
 *  - never throws on user input (malformed text yields a `Result` error);
 *  - never silently drops a line: anything unrecognised lands in
 *    `unparsedLines`, which is what makes new game patches detectable instead
 *    of quietly wrong.
 */
export { parseItem, looksLikeItem } from './parseItem.js';
export { parseModLine, stripTag } from './mods.js';
export { isModifierHeader, parseModifierHeader, type ModifierHeader } from './advanced.js';
export { splitBlocks, splitKeyValue } from './blocks.js';
