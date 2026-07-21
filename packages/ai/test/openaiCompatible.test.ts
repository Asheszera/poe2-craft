import { describe, expect, it } from 'vitest';
import type { AnalysisContext } from '@poe2/models';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import { analyse } from '@poe2/rules';
import { createProvider, extractJson, OpenAICompatibleProvider, PROVIDER_PRESETS } from '../src/index.js';
import type { NarrativeRequest } from '../src/index.js';

const CONTEXT: AnalysisContext = {
  league: 'Standard',
  characterClass: null,
  ascendancy: null,
  mainSkill: null,
  goal: null,
  craftIntent: null,
};

function requestFor(): NarrativeRequest {
  const parsed = parseItem(`Item Class: Gloves
Rarity: Rare
Free Tier Test
Expert Vaal Gauntlets
--------
Item Level: 82
--------
+120 to maximum Life
`);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const item = enrichItem(parsed.value, defaultKnowledgeBase());
  return { item, deterministic: analyse(item), context: CONTEXT };
}

const BODY = {
  summary: 'Decent life base.',
  plans: [
    {
      name: 'Essence-first',
      approach: 'deterministic',
      steps: ['Apply an essence.', 'Regal.', 'Exalt.'],
      estimatedCost: 'unknown',
      stopWhen: 'Three useful affixes.',
      abandonWhen: 'Lowest tier twice.',
    },
  ],
  possibleUpgrades: ['Higher life tier'],
  nextBestAction: 'Use an Exalted Orb.',
};

/** Fake `fetch` returning whatever the model supposedly said. */
function fakeFetch(content: string, init: { status?: number; body?: unknown } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = ((url: string, options: RequestInit) => {
    const body = typeof options.body === 'string' ? options.body : '{}';
    calls.push({ url, body: JSON.parse(body) as Record<string, unknown> });
    const payload = init.body ?? {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    };
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
  return Object.assign(impl, { calls });
}

const providerWith = (fetchImpl: typeof fetch, apiKey = 'key') =>
  new OpenAICompatibleProvider(
    {
      id: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      requiresKey: true,
      fetchImpl,
    },
    { apiKey },
  );

describe('extractJson', () => {
  it('accepts a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a fenced block, which free models emit constantly', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('recovers an object buried in prose', () => {
    expect(extractJson('Sure! Here you go:\n{"a":1}\nHope that helps.')).toBe('{"a":1}');
  });

  it('returns null when there is no object at all', () => {
    expect(extractJson('I cannot help with that.')).toBeNull();
  });
});

describe('OpenAICompatibleProvider', () => {
  it('parses a clean response', async () => {
    const result = await providerWith(fakeFetch(JSON.stringify(BODY))).narrate(requestFor());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.narrative.nextBestAction).toBe('Use an Exalted Orb.');
    // The model field records provider and model, so history stays traceable.
    expect(result.value.narrative.model).toBe('groq/llama-3.3-70b-versatile');
  });

  it('survives a model that wraps its JSON in a code fence', async () => {
    const result = await providerWith(
      fakeFetch(`Here is the analysis:\n\`\`\`json\n${JSON.stringify(BODY)}\n\`\`\``),
    ).narrate(requestFor());

    expect(result.ok).toBe(true);
  });

  it('posts to the chat completions endpoint with the model and auth header', async () => {
    const fetchImpl = fakeFetch(JSON.stringify(BODY));
    await providerWith(fetchImpl).narrate(requestFor());

    expect(fetchImpl.calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(fetchImpl.calls[0]?.body['model']).toBe('llama-3.3-70b-versatile');
  });

  it('omits response_format for providers that do not accept it', async () => {
    // Gemini's compatibility layer rejects the request rather than ignoring the
    // field - the cause of a "Bad Request" that said nothing else.
    const fetchImpl = fakeFetch(JSON.stringify(BODY));
    const gemini = new OpenAICompatibleProvider(
      {
        id: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: 'gemini-3.5-flash',
        requiresKey: true,
        supportsJsonMode: false,
        fetchImpl,
      },
      { apiKey: 'key' },
    );

    await gemini.narrate(requestFor());
    expect(fetchImpl.calls[0]?.body['response_format']).toBeUndefined();
  });

  it('sends response_format where the provider documents it', async () => {
    const fetchImpl = fakeFetch(JSON.stringify(BODY));
    await new OpenAICompatibleProvider(
      {
        id: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        requiresKey: true,
        supportsJsonMode: true,
        fetchImpl,
      },
      { apiKey: 'key' },
    ).narrate(requestFor());

    expect(fetchImpl.calls[0]?.body['response_format']).toEqual({ type: 'json_object' });
  });

  it('traces the request and the failure body for the terminal log', async () => {
    const events: { phase: string; detail: Record<string, unknown> }[] = [];
    const provider = new OpenAICompatibleProvider(
      {
        id: 'gemini',
        baseUrl: 'https://example.test/v1',
        defaultModel: 'gemini-3.5-flash',
        requiresKey: true,
        fetchImpl: fakeFetch('', {
          status: 400,
          body: { error: { message: 'Unknown name "response_format"' } },
        }),
      },
      { apiKey: 'key', debug: (e) => events.push({ phase: e.phase, detail: e.detail }) },
    );

    await provider.narrate(requestFor());

    expect(events.map((e) => e.phase)).toContain('request');
    const failure = events.find((e) => e.phase === 'error');
    // The whole point of the trace: the provider's own words, not "400".
    expect(JSON.stringify(failure?.detail)).toContain('response_format');
  });

  it('tells the model the JSON shape, since these providers cannot enforce it', async () => {
    const fetchImpl = fakeFetch(JSON.stringify(BODY));
    await providerWith(fetchImpl).narrate(requestFor());

    const messages = fetchImpl.calls[0]?.body['messages'] as { role: string; content: string }[];
    const system = messages[0];
    expect(system?.role).toBe('system');
    expect(system?.content).toContain('possibleUpgrades');
    // The hard rules must still precede the format instructions.
    expect(system?.content.indexOf('Never invent numbers')).toBeLessThan(
      system?.content.indexOf('Output format') ?? 0,
    );
  });

  it('reports a rejected key as a configuration problem, not a crash', async () => {
    const result = await providerWith(
      fakeFetch('', { status: 401, body: { error: { message: 'Invalid API key' } } }),
    ).narrate(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AI_NOT_CONFIGURED');
    expect(result.error.message).toContain('Invalid API key');
  });

  it('explains a 429 in terms of the free tier', async () => {
    const result = await providerWith(fakeFetch('', { status: 429 })).narrate(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
    expect(result.error.message).toMatch(/free tier/i);
  });

  it('names the real cause when the output budget ran out', async () => {
    // The observed failure: Gemini spent ~1,950 tokens reasoning and had 78
    // left, so the JSON arrived cut off mid-string. Reporting that as "invalid
    // JSON" sends the user hunting for the wrong problem.
    const result = await providerWith(
      fakeFetch('', {
        body: {
          choices: [
            { message: { content: '{"craftRecommendation": "The analysis rec' }, finish_reason: 'length' },
          ],
          usage: { prompt_tokens: 2326, completion_tokens: 78, total_tokens: 4370 },
        },
      }),
    ).narrate(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/output budget/i);
    expect(result.error.message).toContain('1966'); // reasoning tokens
    expect(result.error.message).not.toMatch(/invalid json/i);
  });

  it('asks for enough output budget for a reasoning model to think first', async () => {
    const fetchImpl = fakeFetch(JSON.stringify(BODY));
    await providerWith(fetchImpl).narrate(requestFor());

    expect(fetchImpl.calls[0]?.body['max_tokens']).toBeGreaterThanOrEqual(8192);
  });

  it('suggests a bigger model when a small one returns the wrong shape', async () => {
    const result = await providerWith(fakeFetch('{"summary": "only this"}')).narrate(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/larger/i);
  });

  it('turns an unreachable local server into a readable message', async () => {
    const provider = new OpenAICompatibleProvider(
      {
        id: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        defaultModel: 'llama3.2',
        requiresKey: false,
        fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')),
      },
      { apiKey: '' },
    );

    const result = await provider.narrate(requestFor());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/reach|running/i);
  });
});

describe('provider registry', () => {
  it('builds every preset without throwing', () => {
    for (const preset of PROVIDER_PRESETS) {
      const provider = createProvider(preset.id, { apiKey: 'key' });
      expect(provider.ok).toBe(true);
      if (provider.ok) expect(provider.value.id).toBe(preset.id);
    }
  });

  it('rejects an unknown provider id', () => {
    expect(createProvider('nope', { apiKey: 'k' }).ok).toBe(false);
  });

  it('lets a local provider run with no key at all', () => {
    expect(createProvider('ollama', { apiKey: '' }).ok).toBe(true);
  });
});
