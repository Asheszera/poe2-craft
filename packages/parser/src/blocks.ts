import { toLines } from '@poe2/shared';

/**
 * The game client separates logical sections with a run of dashes. Length has
 * varied between clients/patches, so any run of 3+ dashes counts.
 */
const SEPARATOR_RE = /^-{3,}$/;

/**
 * Splits raw clipboard text into blocks of non-empty lines.
 *
 * Blocks are the unit every downstream classifier works on: the client groups
 * semantically related lines together, which is far more reliable than trying
 * to recognise lines in isolation.
 */
export function splitBlocks(raw: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of toLines(raw)) {
    const trimmed = line.trimEnd();
    if (SEPARATOR_RE.test(trimmed.trim())) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    if (trimmed.trim().length === 0) continue;
    current.push(trimmed);
  }
  if (current.length > 0) blocks.push(current);

  return blocks;
}

/** Splits `Key: value` lines. Returns null when the line has no key. */
export function splitKeyValue(line: string): { key: string; value: string } | null {
  const idx = line.indexOf(':');
  if (idx <= 0) return null;
  return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}
