import type { DeterministicAnalysis, ParsedItem } from '@poe2/models';
import { deriveFacts, type ItemFacts } from './facts.js';
import { RULES, type Rule } from './rules.js';
import { score } from './scoring.js';

export interface EngineOptions {
  /** Override the catalogue — used by tests and, later, by user rule sets. */
  readonly rules?: readonly Rule[];
  /** Merged into the reported timings so callers can attribute earlier stages. */
  readonly timings?: Readonly<Record<string, number>>;
}

/**
 * Layer 0 of the analysis pipeline (ADR-001).
 *
 * Deterministic, offline and fast: no network, no LLM, no randomness. This is
 * the product's floor — it works with no API key and no connection, and the AI
 * layer explains its output rather than replacing it.
 */
export function analyse(item: ParsedItem, options: EngineOptions = {}): DeterministicAnalysis {
  const startedAt = performance.now();

  const facts = deriveFacts(item);
  const factsAt = performance.now();

  const breakdown = score(facts);
  const rules = options.rules ?? RULES;

  const recommendations = rules
    .filter((rule) => safeWhen(rule, facts))
    .sort((a, b) => b.priority - a.priority)
    .map((rule) => rule.then(facts));

  const finishedAt = performance.now();

  return {
    score: breakdown.score,
    strengths: breakdown.strengths,
    weaknesses: breakdown.weaknesses,
    recommendations,
    // Populated by the price adapters in a later stage; null is honest.
    price: null,
    timings: {
      ...options.timings,
      facts: round(factsAt - startedAt),
      rules: round(finishedAt - factsAt),
      total: round(finishedAt - startedAt),
    },
  };
}

/**
 * A throwing rule must not take the whole analysis down with it.
 *
 * Rules are the part of this system most likely to be edited casually — by a
 * future contributor, or eventually by users — so one bad predicate degrades to
 * "this rule did not fire" instead of an empty analysis panel.
 */
function safeWhen(rule: Rule, facts: ItemFacts): boolean {
  try {
    return rule.when(facts);
  } catch (error) {
    console.error(`[rules] "${rule.id}" threw while evaluating`, error);
    return false;
  }
}

const round = (ms: number): number => Math.round(ms * 1000) / 1000;
