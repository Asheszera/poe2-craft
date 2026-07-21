import type { HistoryEntry, HistoryStats, ItemAnalysis } from '@poe2/models';
import { affixMods, NarrativeAnalysisSchema, RaritySchema } from '@poe2/models';

/**
 * Persistent history of analysed items.
 *
 * The port, kept separate from the SQLite implementation so the dashboard and
 * the IPC layer depend on the operations rather than on the storage — which is
 * what makes swapping or adding a backend later a local change.
 */
export interface HistoryRepository {
  save(analysis: ItemAnalysis): HistoryEntry;
  /** Attaches a narrative to an entry already stored. */
  attachNarrative(id: number, narrative: unknown): void;
  list(limit: number, offset?: number): HistoryEntry[];
  find(id: number): HistoryEntry | null;
  /** Most recent entry with this exact item text, if any. */
  findByRaw(raw: string): HistoryEntry | null;
  stats(): HistoryStats;
  remove(id: number): void;
  clear(): void;
}

/** Row shape as stored. Narrative is JSON text; SQLite has no object column. */
export interface HistoryRow {
  id: number;
  captured_at: string;
  name: string;
  base_type: string;
  rarity: string;
  item_level: number | null;
  score: number;
  affix_count: number;
  unparsed_count: number;
  raw: string;
  narrative: string | null;
  notes: string | null;
}

/**
 * Turns a stored row back into a domain entry.
 *
 * A narrative that fails to parse is dropped rather than throwing: it was
 * written by an earlier version of the schema, and losing one optional field is
 * a far better outcome than a history list that cannot load.
 */
export function rowToEntry(row: HistoryRow): HistoryEntry {
  let narrative: HistoryEntry['narrative'] = null;
  if (row.narrative !== null) {
    try {
      const parsed = NarrativeAnalysisSchema.safeParse(JSON.parse(row.narrative));
      if (parsed.success) narrative = parsed.data;
    } catch {
      // Malformed JSON from an older build; treat as absent.
    }
  }

  const rarity = RaritySchema.safeParse(row.rarity);

  return {
    id: row.id,
    capturedAt: row.captured_at,
    name: row.name,
    baseType: row.base_type,
    rarity: rarity.success ? rarity.data : 'Normal',
    itemLevel: row.item_level,
    score: row.score,
    affixCount: row.affix_count,
    unparsedCount: row.unparsed_count,
    raw: row.raw,
    narrative,
    notes: row.notes,
  };
}

/** The values a fresh analysis contributes to a row. */
export function analysisToRow(analysis: ItemAnalysis): Omit<HistoryRow, 'id'> {
  const { item, deterministic, narrative } = analysis;

  return {
    captured_at: new Date().toISOString(),
    name: item.name ?? item.baseType,
    base_type: item.baseType,
    rarity: item.rarity,
    item_level: item.itemLevel,
    score: deterministic.score,
    affix_count: affixMods(item).length,
    unparsed_count: item.unparsedLines.length,
    raw: item.raw,
    narrative: narrative === null ? null : JSON.stringify(narrative),
    notes: null,
  };
}
