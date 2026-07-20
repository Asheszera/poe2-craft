import type { ItemAnalysis } from '@poe2/models';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import { analyse } from '@poe2/rules';
import type { Result } from '@poe2/shared';

/**
 * Layer 0 of the analysis pipeline (ADR-001): parse → enrich → advise.
 *
 * Every entry point — manual paste, clipboard button, background capture —
 * funnels through here, so an item can never reach the UI half-processed. The
 * AI narrative (layer 2) is attached later and streams in on top; `narrative`
 * is null here by design, not by omission.
 *
 * Each stage is timed and the timings travel with the result, which is what
 * makes the latency budget observable in production rather than aspirational.
 */
export function analyzeText(raw: string): Result<ItemAnalysis> {
  const startedAt = performance.now();

  const parsed = parseItem(raw);
  if (!parsed.ok) return parsed;
  const parsedAt = performance.now();

  const item = enrichItem(parsed.value, defaultKnowledgeBase());
  const enrichedAt = performance.now();

  const deterministic = analyse(item, {
    timings: {
      parse: round(parsedAt - startedAt),
      enrich: round(enrichedAt - parsedAt),
    },
  });

  return { ok: true, value: { item, deterministic, narrative: null } };
}

const round = (ms: number): number => Math.round(ms * 1000) / 1000;
