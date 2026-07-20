/**
 * `@poe2/ai` — the natural-language layer (layer 2 of ADR-001).
 *
 * Contract:
 *  - the model *explains* the deterministic analysis; it never produces it;
 *  - every provider is reachable only through the `AIProvider` port, so the app
 *    never imports a vendor SDK directly;
 *  - prompts live in `prompts/*.md`, never inline in code;
 *  - failures are `Result` values — a missing key, a rate limit or a refusal are
 *    conditions the UI renders, not exceptions that take the analysis down.
 *
 * If this layer is unavailable the product still works: layers 0 and 1 are
 * offline, deterministic and complete on their own.
 */
export type {
  AIProvider,
  AIUsage,
  EmbeddingProvider,
  NarrativeRequest,
  NarrativeResponse,
  ProviderConfig,
} from './types.js';
export { buildCraftPrompt, buildSystemPrompt, render } from './prompts.js';
export { AnthropicProvider, type MessagesClient } from './providers/anthropic.js';
export { AVAILABLE_PROVIDERS, createProvider } from './registry.js';
