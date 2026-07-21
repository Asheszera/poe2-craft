import { z } from 'zod';
import { ParsedItemSchema, RaritySchema } from './item.js';

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

/**
 * One route from the item's current state to the player's goal.
 *
 * Crafting has more than one answer. The cheap gamble and the expensive
 * deterministic route are both legitimate, and which is right depends on a
 * budget only the player knows — so the model presents them side by side rather
 * than choosing on their behalf.
 *
 * A single `steps` array could not express this: it forced every plan into one
 * linear sequence, which is why advice collapsed to a single currency and
 * deterministic methods like essences were quietly dropped.
 */
export const CraftPlanSchema = z.object({
  /** Short label, e.g. "Essence-first, budget". */
  name: z.string(),
  /** How the route gets there — the axis the player actually chooses on. */
  approach: z.enum(['deterministic', 'gamble', 'hybrid']),
  /** Ordered actions. A route worth naming has more than one step. */
  steps: z.array(z.string()),
  /** Total cost, or an admission that it is unknown. */
  estimatedCost: z.string(),
  /** What "done" looks like for this route. */
  stopWhen: z.string(),
  /** The result that means abandon the item and start from a fresh base. */
  abandonWhen: z.string(),
});
export type CraftPlan = z.infer<typeof CraftPlanSchema>;

/** Layer 2: free-form prose produced by the configured AI provider. */
export const NarrativeAnalysisSchema = z.object({
  summary: z.string(),
  /**
   * Routes the player can take, best-fit first. Empty when nothing can be done
   * — corrupted, finished, or not worth further currency.
   */
  plans: z.array(CraftPlanSchema).default([]),
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

/**
 * A stored analysis.
 *
 * Denormalised on purpose: the list and the dashboard read `score`, `rarity`
 * and the rest directly rather than re-parsing every row, while `raw` keeps the
 * original text so an entry can be re-analysed after a parser or dataset
 * improvement.
 */
export const HistoryEntrySchema = z.object({
  id: z.number().int().positive(),
  capturedAt: z.string(),
  name: z.string(),
  baseType: z.string(),
  rarity: RaritySchema,
  itemLevel: z.number().int().nullable(),
  score: z.number().int(),
  affixCount: z.number().int(),
  /** Lines the parser could not attribute — the quality signal, kept per entry. */
  unparsedCount: z.number().int(),
  raw: z.string(),
  narrative: NarrativeAnalysisSchema.nullable(),
  notes: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const HistoryStatsSchema = z.object({
  total: z.number().int(),
  rares: z.number().int(),
  bestScore: z.number().int(),
  averageScore: z.number().int(),
  withParseWarnings: z.number().int(),
  narrated: z.number().int(),
  firstCapturedAt: z.string().nullable(),
});
export type HistoryStats = z.infer<typeof HistoryStatsSchema>;

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
