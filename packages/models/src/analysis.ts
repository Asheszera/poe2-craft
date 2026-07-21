import { z } from 'zod';
import { ParsedItemSchema } from './item.js';

/**
 * Contracts between the analysis pipeline and its consumers.
 *
 * The pipeline is layered on purpose (see ADR-001): layer 0 is deterministic
 * and must render in ~50ms, the LLM narrative streams in afterwards. Therefore
 * `ItemAnalysis` is split into a `deterministic` half and a `narrative` half
 * that is nullable until the model responds.
 */

export const CurrencyAmountSchema = z.object({
  amount: z.number(),
  /** `divine`, `exalted`, `chaos`, … — resolved against currencies.json. */
  currency: z.string(),
});

export const PriceEstimateSchema = z.object({
  low: CurrencyAmountSchema,
  high: CurrencyAmountSchema,
  confidence: z.enum(['high', 'medium', 'low', 'unknown']),
  /** Which adapter produced this (`trade-official`, `ninja`, `heuristic`). */
  source: z.string(),
  sampleSize: z.number().int().nullable(),
});
export type PriceEstimate = z.infer<typeof PriceEstimateSchema>;

export const CraftActionSchema = z.object({
  /** e.g. `exalted-orb`, `regal-orb`, `chaos-orb`, `sell`, `stop`. */
  action: z.string(),
  label: z.string(),
  reasoning: z.string(),
  /** 0..1 — probability the action improves the item, from the rules engine. */
  successChance: z.number().min(0).max(1).nullable(),
  estimatedCost: CurrencyAmountSchema.nullable(),
  estimatedProfit: CurrencyAmountSchema.nullable(),
  risk: z.enum(['none', 'low', 'medium', 'high', 'destructive']),
});
export type CraftAction = z.infer<typeof CraftActionSchema>;

/** Layer 0 + layer 1: computed locally, no LLM involved. */
export const DeterministicAnalysisSchema = z.object({
  /** 0..100 composite score from the rules engine. */
  score: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(CraftActionSchema),
  price: PriceEstimateSchema.nullable(),
  /** ms spent in each stage — feeds the perf budget assertions. */
  timings: z.record(z.string(), z.number()),
});
export type DeterministicAnalysis = z.infer<typeof DeterministicAnalysisSchema>;

/** Layer 2: free-form prose produced by the configured AI provider. */
export const NarrativeAnalysisSchema = z.object({
  summary: z.string(),
  craftRecommendation: z.string(),
  /**
   * Ordered crafting plan, one action per entry.
   *
   * Separate from `craftRecommendation` so a multi-step walkthrough renders as
   * a numbered list rather than a wall of prose. Empty when the item needs no
   * plan — corrupted, finished, or not worth continuing.
   */
  steps: z.array(z.string()).default([]),
  possibleUpgrades: z.array(z.string()),
  nextBestAction: z.string(),
  model: z.string(),
});
export type NarrativeAnalysis = z.infer<typeof NarrativeAnalysisSchema>;

export const ItemAnalysisSchema = z.object({
  item: ParsedItemSchema,
  deterministic: DeterministicAnalysisSchema,
  narrative: NarrativeAnalysisSchema.nullable(),
});
export type ItemAnalysis = z.infer<typeof ItemAnalysisSchema>;

/** User context handed to both the rules engine and the prompt builder. */
export const AnalysisContextSchema = z.object({
  league: z.string(),
  characterClass: z.string().nullable(),
  ascendancy: z.string().nullable(),
  mainSkill: z.string().nullable(),
  /** Build-level objective: what the character needs. Stable across items. */
  goal: z.string().nullable(),
  /**
   * Item-level objective: what the player wants from *this* item.
   *
   * Separate from `goal` because it changes the plan rather than the judgement.
   * "Max DPS cheaply" and "best possible, cost no object" produce completely
   * different step lists for the same base.
   */
  craftIntent: z.string().nullable(),
});
export type AnalysisContext = z.infer<typeof AnalysisContextSchema>;
