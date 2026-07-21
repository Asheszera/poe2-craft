import Anthropic from '@anthropic-ai/sdk';
import { NarrativeAnalysisSchema } from '@poe2/models';
import { appError, err, ok, type Result } from '@poe2/shared';
import { buildCraftPrompt, buildSystemPrompt } from '../prompts.js';
import type { AIProvider, NarrativeRequest, NarrativeResponse, ProviderConfig } from '../types.js';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 16000;

/**
 * JSON schema for the narrative, hand-written rather than derived from the zod
 * model.
 *
 * The API's structured-output schema dialect does not accept everything zod can
 * express, so a generated schema would silently drift from what the endpoint
 * supports. This is small enough to state directly, and the response is still
 * validated against the zod model afterwards — the schema constrains the model,
 * zod verifies the result.
 */
const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          approach: { type: 'string', enum: ['deterministic', 'gamble', 'hybrid'] },
          steps: { type: 'array', items: { type: 'string' } },
          estimatedCost: { type: 'string' },
          stopWhen: { type: 'string' },
          abandonWhen: { type: 'string' },
        },
        required: ['name', 'approach', 'steps', 'estimatedCost', 'stopWhen', 'abandonWhen'],
        additionalProperties: false,
      },
    },
    possibleUpgrades: { type: 'array', items: { type: 'string' } },
    nextBestAction: { type: 'string' },
  },
  required: ['summary', 'plans', 'possibleUpgrades', 'nextBestAction'],
  additionalProperties: false,
} as const;

/**
 * The slice of the SDK this provider uses — the seam tests substitute.
 *
 * Note `signal` is a *request option* (second argument), not a body field;
 * putting it in the params object silently sends it to the API as JSON.
 */
export interface MessagesClient {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message>;
}

/**
 * Claude-backed narrative provider.
 *
 * Notes on the request shape, which is model-version sensitive:
 *  - `thinking: {type: 'adaptive'}` is the only on-mode on Opus 4.8. The old
 *    `budget_tokens` form is rejected with a 400.
 *  - `temperature` / `top_p` / `top_k` are likewise rejected; tone is steered
 *    through `prompts/system.md` instead.
 *  - `effort` defaults to `low` here because layer 2 is latency-sensitive and
 *    the reasoning has already been done by the rules engine.
 *
 * Prompt caching is deliberately *not* used: the cacheable prefix minimum for
 * this model is 4096 tokens and the system prompt is far below it, so a
 * `cache_control` marker would be an inert decoration that only looks like an
 * optimisation.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly model: string;

  readonly #messages: MessagesClient;
  readonly #config: ProviderConfig;

  constructor(config: ProviderConfig, messages?: MessagesClient) {
    this.#config = config;
    this.model = config.model ?? DEFAULT_MODEL;
    this.#messages = messages ?? new Anthropic({ apiKey: config.apiKey }).messages;
  }

  async narrate(
    request: NarrativeRequest,
    signal?: AbortSignal,
  ): Promise<Result<NarrativeResponse>> {
    if (this.#config.apiKey.trim().length === 0) {
      return err(appError('AI_NOT_CONFIGURED', 'No API key is configured for Claude.'));
    }

    const startedAt = performance.now();

    try {
      const message = await this.#messages.create(
        {
          model: this.model,
          max_tokens: this.#config.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: buildSystemPrompt(this.#config.extraInstructions),
          thinking: { type: 'adaptive' },
          output_config: {
            effort: this.#config.effort ?? 'low',
            format: { type: 'json_schema', schema: NARRATIVE_SCHEMA },
          },
          messages: [{ role: 'user', content: buildCraftPrompt(request) }],
        },
        signal ? { signal } : undefined,
      );

      return this.#toResult(message, startedAt);
    } catch (error) {
      return err(this.#toAppError(error));
    }
  }

  #toResult(message: Anthropic.Message, startedAt: number): Result<NarrativeResponse> {
    // Safety classifiers decline with HTTP 200 and an empty or partial body, so
    // `stop_reason` must be checked before `content` is touched.
    if (message.stop_reason === 'refusal') {
      return err(
        appError('AI_PROVIDER_ERROR', 'The model declined to analyse this item.', {
          details: { stopReason: message.stop_reason },
        }),
      );
    }
    if (message.stop_reason === 'max_tokens') {
      return err(
        appError('AI_PROVIDER_ERROR', 'The response was cut off before it was complete.', {
          details: { stopReason: message.stop_reason },
        }),
      );
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return err(
        appError('AI_PROVIDER_ERROR', 'The model returned text that is not valid JSON.', {
          cause: error,
        }),
      );
    }

    // Structured outputs make this near-certain, but "near-certain" is not a
    // contract — the boundary validates like every other boundary in the app.
    const narrative = NarrativeAnalysisSchema.safeParse({ ...(parsed as object), model: this.model });
    if (!narrative.success) {
      return err(
        appError('AI_PROVIDER_ERROR', 'The model response did not match the expected shape.', {
          details: { issues: narrative.error.issues },
        }),
      );
    }

    return ok({
      narrative: narrative.data,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
      },
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  }

  /** Maps SDK exceptions onto the app's stable error codes. */
  #toAppError(error: unknown): ReturnType<typeof appError> {
    if (error instanceof Anthropic.AuthenticationError) {
      return appError('AI_NOT_CONFIGURED', 'The Claude API key was rejected.', { cause: error });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return appError('RATE_LIMITED', 'Claude is rate limiting this key. Try again shortly.', {
        cause: error,
      });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return appError('AI_PROVIDER_ERROR', 'Could not reach the Claude API.', { cause: error });
    }
    if (error instanceof Anthropic.APIError) {
      return appError('AI_PROVIDER_ERROR', error.message, { cause: error });
    }
    return appError('UNKNOWN', 'The AI provider failed unexpectedly.', { cause: error });
  }
}
