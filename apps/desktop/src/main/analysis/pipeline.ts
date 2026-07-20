import type { ParsedItem } from '@poe2/models';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import type { Result } from '@poe2/shared';

/**
 * Layer 0 of the analysis pipeline (ADR-001): parse, then enrich against the
 * knowledge base.
 *
 * Every entry point — manual paste, clipboard button, background capture —
 * funnels through here so an item can never reach the UI parsed but
 * un-enriched. The rules engine will extend this function, not bypass it.
 */
export function analyzeText(raw: string): Result<ParsedItem> {
  const parsed = parseItem(raw);
  if (!parsed.ok) return parsed;

  return { ok: true, value: enrichItem(parsed.value, defaultKnowledgeBase()) };
}
