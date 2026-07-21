import { BuildVerdictSchema, NarrativeAnalysisSchema } from '@poe2/models';
import { appError, err, ok, type AppError, type Result } from '@poe2/shared';
import type { z } from 'zod';
import { buildBuildSystemPrompt, buildCraftPrompt, buildFitPrompt, buildJsonSystemPrompt } from '../prompts.js';
import type {
  AIProvider,
  AIUsage,
  BuildResponse,
  NarrativeRequest,
  NarrativeResponse,
  ProviderConfig,
} from '../types.js';

/**
 * One adapter for every provider that speaks the OpenAI `/chat/completions`
 * dialect — Gemini, Groq, Cerebras, Mistral, OpenRouter, OpenAI, Ollama and
 * LM Studio all do.
 *
 * Written against `fetch` rather than the OpenAI SDK on purpose: the request and
 * response shapes used here are four fields wide and stable across all of them,
 * while the SDK would add a dependency, its own auth conventions and its own
 * opinions about base URLs — for no capability this needs.
 */

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

/**
 * Output budget.
 *
 * Deliberately generous, because reasoning models spend this budget *thinking*
 * before they write anything: a Gemini 3.5 Flash call was observed using ~1,950
 * tokens of internal reasoning, leaving 78 of a 2,048 budget for the answer —
 * which arrived as JSON cut off mid-string. The narrative itself needs a few
 * hundred tokens; the rest is headroom for reasoning.
 */
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Recovers a JSON object from a response that may be wrapped.
 *
 * Free and local models frequently ignore "no code fences" and answer with
 * ```json … ``` or a sentence of preamble. Being strict here would fail on
 * output that is perfectly usable, so the fence is stripped and, failing that,
 * the outermost brace-delimited span is taken.
 */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (candidate.startsWith('{')) return candidate;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : null;
}

export interface OpenAICompatibleOptions {
  readonly id: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requiresKey: boolean;
  /** See `ProviderPreset.supportsJsonMode`. Defaults to false — the safe side. */
  readonly supportsJsonMode?: boolean;
  /** Injected in tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly model: string;

  readonly #options: OpenAICompatibleOptions;
  readonly #config: ProviderConfig;
  readonly #fetch: typeof fetch;

  constructor(options: OpenAICompatibleOptions, config: ProviderConfig) {
    this.#options = options;
    this.#config = config;
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.id = options.id;
    this.model = config.model?.trim() || options.defaultModel;
  }

  async narrate(
    request: NarrativeRequest,
    signal?: AbortSignal,
  ): Promise<Result<NarrativeResponse>> {
    const result = await this.#complete(
      buildJsonSystemPrompt(this.#config.extraInstructions),
      buildCraftPrompt(request),
      NarrativeAnalysisSchema,
      signal,
    );
    return result.ok
      ? ok({ narrative: result.value.data, usage: result.value.usage, elapsedMs: result.value.elapsedMs })
      : result;
  }

  async evaluateBuild(
    request: NarrativeRequest,
    signal?: AbortSignal,
  ): Promise<Result<BuildResponse>> {
    const result = await this.#complete(
      buildBuildSystemPrompt(this.#config.extraInstructions),
      buildFitPrompt(request),
      BuildVerdictSchema,
      signal,
    );
    return result.ok
      ? ok({ verdict: result.value.data, usage: result.value.usage, elapsedMs: result.value.elapsedMs })
      : result;
  }

  /**
   * One request, one validated object.
   *
   * Both operations differ only in prompt and schema, so the transport,
   * the defensive JSON recovery and the failure mapping live here once.
   */
  async #complete<T extends z.ZodTypeAny>(
    system: string,
    user: string,
    schema: T,
    signal?: AbortSignal,
  ): Promise<Result<{ data: z.infer<T>; usage: AIUsage; elapsedMs: number }>> {
    if (this.#options.requiresKey && this.#config.apiKey.trim().length === 0) {
      return err(appError('AI_NOT_CONFIGURED', `No API key is configured for ${this.id}.`));
    }

    const startedAt = performance.now();
    const url = `${this.#options.baseUrl}/chat/completions`;

    const body = {
      model: this.model,
      max_tokens: this.#config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // Asked for, not relied upon — and only where the provider documents it.
      // The JSON shape is always also requested in the prompt, and the response
      // is parsed defensively regardless.
      ...(this.#options.supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    this.#debug('request', { url, body });

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Local runtimes ignore the header; sending it unconditionally keeps
          // one code path.
          Authorization: `Bearer ${this.#config.apiKey}`,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      this.#debug('error', { url, cause: String(error) });
      return err(
        appError('AI_PROVIDER_ERROR', `Could not reach ${this.id}. Is it running and reachable?`, {
          cause: error,
        }),
      );
    }

    if (!response.ok) return err(await this.#httpError(response));

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      return err(
        appError('AI_PROVIDER_ERROR', `${this.id} returned a malformed response.`, {
          cause: error,
        }),
      );
    }

    const choice = payload.choices?.[0];

    this.#debug('response', {
      status: response.status,
      finishReason: choice?.finish_reason ?? null,
      content: choice?.message?.content ?? null,
      usage: payload.usage,
    });

    // Diagnosed before parsing: truncated output is still syntactically broken
    // JSON, and "invalid JSON" would send the user hunting for the wrong
    // problem. Reasoning models spend the output budget thinking first, so this
    // fires with a perfectly capable model and a perfectly good prompt.
    if (choice?.finish_reason === 'length') {
      const usage = payload.usage;
      const reasoning =
        usage?.total_tokens !== undefined &&
        usage.prompt_tokens !== undefined &&
        usage.completion_tokens !== undefined
          ? usage.total_tokens - usage.prompt_tokens - usage.completion_tokens
          : 0;

      return err(
        appError(
          'AI_PROVIDER_ERROR',
          reasoning > 0
            ? `${this.id} ran out of output budget: ${reasoning} tokens went to internal reasoning and only ${usage?.completion_tokens ?? 0} were left for the answer. Raise the token limit or pick a model that reasons less.`
            : `${this.id} ran out of output budget before finishing the answer. Raise the token limit.`,
          { details: { usage } },
        ),
      );
    }

    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return err(appError('AI_PROVIDER_ERROR', `${this.id} returned an empty response.`));
    }

    const json = extractJson(content);
    if (json === null) {
      return err(
        appError('AI_PROVIDER_ERROR', `${this.id} did not return JSON. Try a stronger model.`),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      return err(
        appError('AI_PROVIDER_ERROR', `${this.id} returned invalid JSON.`, { cause: error }),
      );
    }

    const validated = schema.safeParse({ ...(parsed as object), model: `${this.id}/${this.model}` });
    if (!validated.success) {
      return err(
        appError(
          'AI_PROVIDER_ERROR',
          `${this.id} returned JSON in the wrong shape. Smaller models often struggle with this — try a larger one.`,
          { details: { issues: validated.error.issues } },
        ),
      );
    }

    return ok({
      data: validated.data,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        cachedInputTokens: 0,
      },
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  }

  #debug(phase: 'request' | 'response' | 'error', detail: Record<string, unknown>): void {
    this.#config.debug?.({ provider: this.id, model: this.model, phase, detail });
  }

  /** Maps HTTP status onto the app's stable codes, with the body as detail. */
  async #httpError(response: Response): Promise<AppError> {
    let message = `${response.status} ${response.statusText}`;
    // Read as text first: an error body is not always JSON, and consuming it
    // as JSON would discard the very detail needed to diagnose a 400.
    const raw = await response.text().catch(() => '');
    try {
      const body = JSON.parse(raw) as ChatCompletionResponse;
      if (body.error?.message) message = body.error.message;
    } catch {
      if (raw.trim().length > 0) message = `${message} — ${raw.slice(0, 400)}`;
    }

    this.#debug('error', { status: response.status, body: raw.slice(0, 2000) });

    if (response.status === 401 || response.status === 403) {
      return appError('AI_NOT_CONFIGURED', `${this.id} rejected the API key: ${message}`);
    }
    if (response.status === 429) {
      return appError(
        'RATE_LIMITED',
        `${this.id} is rate limiting this key — free tiers cap requests per minute. ${message}`,
      );
    }
    return appError('AI_PROVIDER_ERROR', `${this.id}: ${message}`);
  }
}
