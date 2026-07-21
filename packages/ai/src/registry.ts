import { appError, err, ok, type Result } from '@poe2/shared';
import { presetFor, PROVIDER_PRESETS } from './presets.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAICompatibleProvider } from './providers/openaiCompatible.js';
import type { AIProvider, ProviderConfig } from './types.js';

/**
 * Builds a provider from its id.
 *
 * Only Anthropic has a bespoke adapter — its API shape and its structured-output
 * parameter are its own. Everything else is the OpenAI-compatible dialect, so a
 * new provider is a row in `presets.ts` and nothing more. The rest of the
 * application only ever holds an `AIProvider`.
 */
export function createProvider(id: string, config: ProviderConfig): Result<AIProvider> {
  const preset = presetFor(id);
  if (!preset) {
    return err(
      appError('AI_NOT_CONFIGURED', `Unknown AI provider "${id}".`, {
        details: { available: PROVIDER_PRESETS.map((p) => p.id) },
      }),
    );
  }

  if (preset.baseUrl === null) {
    return ok(new AnthropicProvider({ ...config, model: config.model || preset.defaultModel }));
  }

  return ok(
    new OpenAICompatibleProvider(
      {
        id: preset.id,
        baseUrl: config.baseUrl?.trim() || preset.baseUrl,
        defaultModel: preset.defaultModel,
        requiresKey: preset.requiresKey,
        supportsJsonMode: preset.supportsJsonMode,
      },
      config,
    ),
  );
}

export { PROVIDER_PRESETS, presetFor, type ProviderPreset } from './presets.js';
