import { appError, err, ok, type Result } from '@poe2/shared';
import { AnthropicProvider } from './providers/anthropic.js';
import type { AIProvider, ProviderConfig } from './types.js';

/**
 * Providers the application can construct, keyed by the id stored in settings.
 *
 * A factory map rather than a `switch`: adding Ollama, LM Studio, OpenRouter or
 * any OpenAI-compatible endpoint is one entry here plus one file under
 * `providers/`, and nothing else in the codebase learns about it. The rest of
 * the app only ever holds an `AIProvider`.
 */
const FACTORIES: Readonly<Record<string, (config: ProviderConfig) => AIProvider>> = {
  anthropic: (config) => new AnthropicProvider(config),
};

export const AVAILABLE_PROVIDERS = Object.keys(FACTORIES);

export function createProvider(id: string, config: ProviderConfig): Result<AIProvider> {
  const factory = FACTORIES[id];
  if (!factory) {
    return err(
      appError('AI_NOT_CONFIGURED', `Unknown AI provider "${id}".`, {
        details: { available: AVAILABLE_PROVIDERS },
      }),
    );
  }
  return ok(factory(config));
}
