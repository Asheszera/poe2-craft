import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the repository against text corruption.
 *
 * Two failure modes have already happened here, both from rewriting files with
 * PowerShell: a UTF-8 BOM that made a `package.json` unparseable to PostCSS,
 * and doubly-encoded characters that turned `->` into `â†'` inside comments.
 * Both are invisible in a diff and obvious to a reader, which is the worst
 * combination — so a test looks instead of a person.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git', '.vite', 'coverage']);
const CHECKED = new Set(['.ts', '.tsx', '.md', '.json', '.css', '.html', '.yaml', '.yml']);

/** Files that legitimately contain the byte sequences below. */
const EXEMPT = ['packages/shared/test/encoding.test.ts'];

/**
 * Signatures of UTF-8 that was decoded as Latin-1 and re-encoded. These appear
 * only through a broken tool chain — never by typing.
 */
const MOJIBAKE = /â€|â”|â†|Ã¢|Ã£|Ã§|Ã©|Ãµ|Â·|Â»|ï»¿/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (CHECKED.has(extname(entry))) yield full;
  }
}

const files = [...walk(ROOT)].filter(
  (file) => !EXEMPT.includes(relative(ROOT, file).replace(/\\/g, '/')),
);

describe('repository text encoding', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no byte-order marks', () => {
    // A BOM in package.json breaks every tool that reads it as plain JSON.
    const offenders = files.filter((file) => {
      const bytes = readFileSync(file);
      return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    });

    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('has no doubly-encoded characters', () => {
    const offenders = files.filter((file) => MOJIBAKE.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
