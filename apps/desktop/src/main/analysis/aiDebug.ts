import type { AIDebugEvent } from '@poe2/ai';

/**
 * Prints AI provider traffic to the terminal running `pnpm dev`.
 *
 * "OpenAI-compatible" providers disagree about which fields they accept, and a
 * rejected request says only "Bad Request" in the interface. Being able to read
 * the exact body that went out and the exact body that came back turns a
 * guessing game into a two-minute fix — which is the whole reason this exists.
 *
 * Development only: it prints prompts, which is fine on your own machine and
 * wrong in a packaged build.
 */
const MAX_BODY = 1200;

const clip = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text === undefined) return 'undefined';
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n... (${text.length} chars)` : text;
};

export function createAiDebugLogger(enabled: boolean): ((event: AIDebugEvent) => void) | undefined {
  if (!enabled) return undefined;

  return ({ provider, model, phase, detail }) => {
    const tag = `[ai:${provider}/${model}]`;

    switch (phase) {
      case 'request': {
        const body = detail['body'] as { messages?: { role: string; content: string }[] };
        console.log(`\n${tag} POST ${String(detail['url'])}`);
        // The prompt is the part worth reading; the rest of the body is noise.
        for (const message of body?.messages ?? []) {
          console.log(`${tag} --- ${message.role} ---\n${clip(message.content)}`);
        }
        break;
      }
      case 'response':
        console.log(`${tag} ${clip(detail['status'] ?? 200)} ok`);
        console.log(`${tag} content:\n${clip(detail['content'])}`);
        if (detail['usage']) console.log(`${tag} usage: ${clip(detail['usage'])}`);
        break;
      case 'error':
        console.error(`${tag} FAILED`, clip(detail));
        break;
    }
  };
}
