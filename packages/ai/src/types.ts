import type { AnalysisContext, DeterministicAnalysis, NarrativeAnalysis, ParsedItem } from '@poe2/models';
import type { PriceTable } from '@poe2/prices';
import type { Result } from '@poe2/shared';

/**
 * Everything the AI layer needs to narrate an analysis.
 *
 * The deterministic analysis is included on purpose: the model's job is to
 * *explain* advice the rules engine already produced, not to invent its own.
 * Passing only the item would invite it to make up tiers, prices and odds.
 */
export interface NarrativeRequest {
  readonly item: ParsedItem;
  readonly deterministic: DeterministicAnalysis;
  readonly context: AnalysisContext;
  /**
   * Currency prices, when the player has configured any.
   *
   * Optional on purpose: everything below still works without it, and the
   * prompt is explicit that unpriced means unknown rather than free.
   */
  readonly prices?: PriceTable | undefined;
}

export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Tokens served from the prompt cache, when the provider reports it. */
  readonly cachedInputTokens: number;
}

export interface NarrativeResponse {
  readonly narrative: NarrativeAnalysis;
  readonly usage: AIUsage;
  readonly elapsedMs: number;
}

/**
 * The port every AI backend implements.
 *
 * Deliberately narrow. The brief sketched `generate/chat/embeddings` on one
 * interface, but embeddings only matter once a vector store exists (stage 4),
 * and forcing every provider to implement a method it cannot support means
 * every provider throws from one third of its surface. Interface segregation
 * instead: capabilities are separate interfaces, and a provider declares what
 * it actually does.
 */
export interface AIProvider {
  /** Stable id used in settings and logs, e.g. `anthropic`. */
  readonly id: string;
  /** Model actually in use — recorded on every narrative for traceability. */
  readonly model: string;

  /**
   * Produces the natural-language layer of an analysis.
   *
   * Returns a `Result` rather than throwing: a missing key, a rate limit or a
   * refusal are all expected conditions the UI must render, not crashes.
   */
  narrate(request: NarrativeRequest, signal?: AbortSignal): Promise<Result<NarrativeResponse>>;
}

/** Optional capability — implemented only once RAG needs it (stage 4). */
export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<Result<number[][]>>;
}

/**
 * A trace point in a provider call.
 *
 * Providers differ in which fields they accept, and the only way to find out is
 * to read what actually went over the wire and what came back. Secrets are
 * never included — the key is redacted at the source, not at the sink.
 */
export interface AIDebugEvent {
  readonly provider: string;
  readonly model: string;
  readonly phase: 'request' | 'response' | 'error';
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface ProviderConfig {
  readonly apiKey: string;
  /** Optional trace sink. Wired to the terminal in development. */
  readonly debug?: ((event: AIDebugEvent) => void) | undefined;
  readonly model?: string;
  /** Overrides the preset endpoint — for self-hosted or proxied deployments. */
  readonly baseUrl?: string;
  /**
   * Thinking depth / token spend. `low` keeps the narrative fast, which is
   * what layer 2 wants; raise it for the Build Advisor's longer reasoning.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly maxTokens?: number;
  /** Appended to the system prompt. Exposed in Settings as "custom prompt". */
  readonly extraInstructions?: string;
}
