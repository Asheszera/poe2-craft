import { DatabaseSync } from 'node:sqlite';
import type { HistoryEntry, HistoryStats, ItemAnalysis } from '@poe2/models';
import { analysisToRow, rowToEntry, type HistoryRepository, type HistoryRow } from './repository.js';

/**
 * SQLite-backed history.
 *
 * Uses Node's built-in `node:sqlite` rather than `better-sqlite3` (ADR-002):
 * the native module would need rebuilding against every Electron release, which
 * is a recurring build-and-CI cost on Windows for a feature that is, at bottom,
 * a table of rows. Verified to load in this Electron's Node without a flag.
 *
 * Synchronous by design. Every query here is a single indexed read over a table
 * measured in thousands of rows; making it async would add ceremony to the IPC
 * layer and buy nothing measurable.
 */

/** Bumped whenever the schema changes; see `#migrate`. */
const SCHEMA_VERSION = 1;

/**
 * `node:sqlite` types every row as `Record<string, SQLOutputValue>` — it cannot
 * know a query's columns. The cast is narrowed to this one helper so the
 * assumption ("the SELECT matches the row type") is stated once rather than
 * scattered across every query.
 */
const rows = <T>(result: unknown[]): T[] => result as T[];

export class SqliteHistoryRepository implements HistoryRepository {
  readonly #db: DatabaseSync;

  /** @param location A file path, or `:memory:` in tests. */
  constructor(location: string) {
    this.#db = new DatabaseSync(location);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#migrate();
  }

  /**
   * Steps the schema forward from whatever version the file is at.
   *
   * `user_version` rather than a migrations table: the whole history is one
   * table, and a second table to track the first would be ceremony. Each step
   * is additive so an older build's file still opens.
   */
  #migrate(): void {
    const [row] = this.#db.prepare('PRAGMA user_version').all() as { user_version: number }[];
    const current = row?.user_version ?? 0;
    if (current >= SCHEMA_VERSION) return;

    if (current < 1) {
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS analyses (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          captured_at   TEXT    NOT NULL,
          name          TEXT    NOT NULL,
          base_type     TEXT    NOT NULL,
          rarity        TEXT    NOT NULL,
          item_level    INTEGER,
          score         INTEGER NOT NULL,
          affix_count   INTEGER NOT NULL,
          unparsed_count INTEGER NOT NULL DEFAULT 0,
          raw           TEXT    NOT NULL,
          narrative     TEXT,
          notes         TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_analyses_captured_at ON analyses (captured_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analyses_raw ON analyses (raw);
      `);
    }

    this.#db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  save(analysis: ItemAnalysis): HistoryEntry {
    const row = analysisToRow(analysis);
    const result = this.#db
      .prepare(
        `INSERT INTO analyses
           (captured_at, name, base_type, rarity, item_level, score,
            affix_count, unparsed_count, raw, narrative, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.captured_at,
        row.name,
        row.base_type,
        row.rarity,
        row.item_level,
        row.score,
        row.affix_count,
        row.unparsed_count,
        row.raw,
        row.narrative,
        row.notes,
      );

    const saved = this.find(Number(result.lastInsertRowid));
    if (!saved) throw new Error('[history] row vanished immediately after insert');
    return saved;
  }

  attachNarrative(id: number, narrative: unknown): void {
    this.#db
      .prepare('UPDATE analyses SET narrative = ? WHERE id = ?')
      .run(JSON.stringify(narrative), id);
  }

  list(limit: number, offset = 0): HistoryEntry[] {
    const found = rows<HistoryRow>(
      this.#db
        .prepare('SELECT * FROM analyses ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(limit, offset),
    );
    return found.map(rowToEntry);
  }

  find(id: number): HistoryEntry | null {
    const found = rows<HistoryRow>(this.#db.prepare('SELECT * FROM analyses WHERE id = ?').all(id));
    return found[0] ? rowToEntry(found[0]) : null;
  }

  findByRaw(raw: string): HistoryEntry | null {
    const found = rows<HistoryRow>(
      this.#db
        .prepare('SELECT * FROM analyses WHERE raw = ? ORDER BY id DESC LIMIT 1')
        .all(raw),
    );
    return found[0] ? rowToEntry(found[0]) : null;
  }

  stats(): HistoryStats {
    const [row] = this.#db
      .prepare(
        `SELECT
           COUNT(*)                                      AS total,
           COALESCE(SUM(rarity = 'Rare'), 0)             AS rares,
           COALESCE(MAX(score), 0)                       AS best,
           COALESCE(ROUND(AVG(score)), 0)                AS average,
           COALESCE(SUM(unparsed_count > 0), 0)          AS warnings,
           COALESCE(SUM(narrative IS NOT NULL), 0)       AS narrated,
           MIN(captured_at)                              AS first_at
         FROM analyses`,
      )
      .all() as {
      total: number;
      rares: number;
      best: number;
      average: number;
      warnings: number;
      narrated: number;
      first_at: string | null;
    }[];

    return {
      total: row?.total ?? 0,
      rares: row?.rares ?? 0,
      bestScore: row?.best ?? 0,
      averageScore: row?.average ?? 0,
      withParseWarnings: row?.warnings ?? 0,
      narrated: row?.narrated ?? 0,
      firstCapturedAt: row?.first_at ?? null,
    };
  }

  remove(id: number): void {
    this.#db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
  }

  clear(): void {
    this.#db.exec('DELETE FROM analyses');
  }

  close(): void {
    this.#db.close();
  }
}
