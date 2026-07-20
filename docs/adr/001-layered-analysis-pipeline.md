# ADR-001 — The analysis pipeline is layered, not a single LLM call

**Status:** accepted · **Date:** 2026-07-20

## Context

The brief requires a complete analysis in under 2 seconds. A single LLM
round-trip carrying the item, the knowledge base and the build context does not
reliably fit that budget — not with a hosted model, and certainly not with a
local one. Modelling the analysis as one `await` would also make the entire
feature unavailable offline and unavailable when an API key is missing.

## Decision

The analysis runs as three layers with independent latency budgets, and the UI
renders each as it lands:

| Layer | Budget | Content | Depends on |
| --- | --- | --- | --- |
| 0 | ~50 ms | parse → mod-database enrichment (tier, affix type) → rules engine (score, next best action) | local data only |
| 1 | ~300 ms | price estimate | price adapter + cache |
| 2 | streaming | natural-language summary, craft reasoning, upgrade paths | AI provider |

The overlay appears at the end of layer 0. Layers 1 and 2 fill in place.

## Consequences

- The "< 2 s" requirement becomes "< 200 ms to something actionable", which is
  strictly better UX than a 2 s spinner.
- `ItemAnalysis.narrative` is nullable and the UI must render without it. This
  is enforced by the type, not by convention.
- The rules engine is the product's floor, not a fallback: it works offline,
  costs nothing per item, and is deterministic enough to unit-test. The LLM
  explains and nuances; it never gates.
- Every layer reports its own timing into `deterministic.timings`, so the
  budgets above are observable in production rather than aspirational.
