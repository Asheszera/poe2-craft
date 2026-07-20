/**
 * `@poe2/rules` — the deterministic crafting advisor.
 *
 * Contract:
 *  - pure and synchronous: same item in, same advice out;
 *  - no network, no LLM, no persistence;
 *  - reads only `ItemFacts`, never the raw `ParsedItem`, so every rule sees the
 *    same derived view of an item.
 *
 * Pipeline position: layer 0 (ADR-001). Its output renders immediately and the
 * AI narrative is layered on top later — the model explains this advice, it
 * does not produce it.
 */
export { deriveFacts, type ItemFacts } from './facts.js';
export { deriveSignals, score, type ScoreBreakdown, type Signal } from './scoring.js';
export { RULES, type Rule } from './rules.js';
export { analyse, type EngineOptions } from './engine.js';
