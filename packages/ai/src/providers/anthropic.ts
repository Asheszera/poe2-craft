import Anthropic from '@anthropic-ai/sdk';
import { BuildVerdictSchema, NarrativeAnalysisSchema } from '@poe2/models';
import { appError, err, ok, type Result } from '@poe2/shared';
import type { z } from 'zod';
import { buildCraftPrompt, buildFitPrompt, buildSystemPrompt } from '../prompts.js';
import type {
  AIProvider,
  AIUsage,
  BuildResponse,
  NarrativeRequest,
  NarrativeResponse,
  ProviderConfig,
} from '../types.js';

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

/** Same rationale as `NARRATIVE_SCHEMA`: stated here, verified by zod after. */
const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    verdict: { type: 'string', enum: ['equip', 'craft', 'sell', 'vendor', 'unclear'] },
    reasoning: { type: 'string' },
    whatWorks: { type: 'array', items: { type: 'string' } },
    whatIsMissing: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'verdict', 'reasoning', 'whatWorks', 'whatIsMissing', 'assumptions'],
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
    const result = await this.#complete(
      buildCraftPrompt(request),
      NARRATIVE_SCHEMA,
      NarrativeAnalysisSchema,
      signal,
    );
    return result.ok
      ? ok({
          narrative: result.value.data,
          usage: result.value.usage,
          elapsedMs: result.value.elapsedMs,
        })
      : result;
  }

  async evaluateBuild(
    request: NarrativeRequest,
    signal?: AbortSignal,
  ): Promise<Result<BuildResponse>> {
    const result = await this.#complete(
      buildFitPrompt(request),
      BUILD_SCHEMA,
      BuildVerdictSchema,
      signal,
    );
    return result.ok
      ? ok({
          verdict: result.value.data,
          usage: result.value.usage,
          elapsedMs: result.value.elapsedMs,
        })
      : result;
  }

  /**
   * One structured-output request.
   *
   * Both operations differ only in prompt and schema; the request shape, the
   * refusal handling and the validation are the same and live here once.
   */
  async #complete<T extends z.ZodTypeAny>(
    userPrompt: string,
    /** The API's own schema dialect — see `NARRATIVE_SCHEMA`. */
    jsonSchema: Record<string, unknown>,
    schema: T,
    signal?: AbortSignal,
  ): Promise<Result<{ data: z.infer<T>; usage: AIUsage; elapsedMs: number }>> {
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
            format: { type: 'json_schema', schema: jsonSchema },
          },
          messages: [{ role: 'user', content: userPrompt }],
        },
        signal ? { signal } : undefined,
      );

      return this.#toResult(message, startedAt, schema);
    } catch (error) {
      return err(this.#toAppError(error));
    }
  }

  #toResult<T extends z.ZodTypeAny>(
    message: Anthropic.Message,
    startedAt: number,
    schema: T,
  ): Result<{ data: z.infer<T>; usage: AIUsage; elapsedMs: number }> {
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
    const validated = schema.safeParse({ ...(parsed as object), model: this.model });
    if (!validated.success) {
      return err(
        appError('AI_PROVIDER_ERROR', 'The model response did not match the expected shape.', {
          details: { issues: validated.error.issues },
        }),
      );
    }

    return ok({
      data: validated.data,
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
