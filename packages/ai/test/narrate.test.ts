import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisContext } from '@poe2/models';
import { defaultKnowledgeBase, enrichItem } from '@poe2/data';
import { parseItem } from '@poe2/parser';
import { analyse } from '@poe2/rules';
import { AnthropicProvider, buildCraftPrompt, buildSystemPrompt, render } from '../src/index.js';
import type { MessagesClient, NarrativeRequest } from '../src/index.js';

const CONTEXT: AnalysisContext = {
  league: 'Standard',
  characterClass: 'Mercenary',
  ascendancy: 'Gemling Legionnaire',
  mainSkill: 'Explosive Shot',
  goal: null,
  craftIntent: 'I want the highest DPS I can get for as little currency as possible.',
};

const RAW = `Item Class: Gloves
Rarity: Rare
Victory Fingers
Expert Vaal Gauntlets
--------
Item Level: 82
--------
+15 to Strength (implicit)
--------
+120 to maximum Life
+45% to Fire Resistance
`;

/** Full layer 0 → layer 2 handoff, exactly as the app assembles it. */
function requestFor(raw: string): NarrativeRequest {
  const parsed = parseItem(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const item = enrichItem(parsed.value, defaultKnowledgeBase());
  return { item, deterministic: analyse(item), context: CONTEXT };
}

/** A stand-in for `client.messages`, so no test touches the network. */
function fakeMessages(message: Partial<Anthropic.Message>): MessagesClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    create: (params) => {
      calls.push(params);
      return Promise.resolve({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-4-8',
        stop_reason: 'end_turn',
        stop_sequence: null,
        content: [],
        usage: { input_tokens: 100, output_tokens: 50 },
        ...message,
      } as Anthropic.Message);
    },
  };
}

const VALID_BODY = JSON.stringify({
  summary: 'A solid life-and-resistance base with room to grow.',
  plans: [
    {
      name: 'Essence-first, guaranteed',
      approach: 'deterministic',
      steps: ['Apply an essence for the missing resistance.', 'Regal.', 'Exalt the last slot.'],
      estimatedCost: 'unknown',
      stopWhen: 'Three useful affixes are present.',
      abandonWhen: 'The essence lands its lowest tier twice.',
    },
    {
      name: 'Exalt and hope, budget',
      approach: 'gamble',
      steps: ['Use an Exalted Orb.', 'Repeat while slots remain.'],
      estimatedCost: 'unknown',
      stopWhen: 'A useful affix lands.',
      abandonWhen: 'Two junk affixes fill the open slots.',
    },
  ],
  possibleUpgrades: ['Higher life tier', 'A second resistance'],
  nextBestAction: 'Use an Exalted Orb.',
});

const textContent = (text: string): Anthropic.ContentBlock[] =>
  [{ type: 'text', text, citations: null }] as Anthropic.ContentBlock[];

describe('prompt rendering', () => {
  it('refuses to send a prompt with an unfilled placeholder', () => {
    // Silently leaving "{{itemText}}" in a paid request is worse than failing.
    expect(() => render('a {{one}} b {{two}}', { one: 'x' })).toThrow(/two/);
  });

  it('gives the model the deterministic analysis, not just the item', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));

    expect(prompt).toContain('Victory Fingers');
    expect(prompt).toContain('Score:');
    expect(prompt).toContain('exalted-orb');
    expect(prompt).not.toContain('{{');
  });

  it('marks unresolved tiers as uncertain instead of omitting them', () => {
    const prompt = buildCraftPrompt(
      requestFor(`Item Class: Gloves
Rarity: Rare
Odd Grips
Expert Vaal Gauntlets
--------
Item Level: 80
--------
Totally Not A Real Modifier
`),
    );

    expect(prompt).toContain('tier unresolved');
    expect(prompt).toContain('unknown modifier');
  });

  it('passes player context through and marks absent fields unknown', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));
    expect(prompt).toContain('Gemling Legionnaire');
    expect(prompt).toContain('unknown'); // `goal` is null
  });

  it('tells the model what the base can still roll, with the level ceiling', () => {
    const prompt = buildCraftPrompt(
      requestFor(`Item Class: Gloves
Rarity: Rare
Corpse Claw
Pauascale Gloves
--------
Item Level: 69
--------
+80 to maximum Mana
`),
    );

    expect(prompt).toContain('What this base can still roll');
    expect(prompt).toMatch(/prefixes \(\d+ available\)/);
    expect(prompt).toMatch(/best here is T\d+\/\d+/);
  });

  it('names the real currency catalogue rather than relying on recall', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));

    // Items that postdate a model's training cutoff — it cannot suggest what it
    // has never heard of.
    expect(prompt).toContain('Perfect Regal Orb');
    expect(prompt).toContain('Essences');
  });

  it('admits when the base is not in the dataset instead of inventing a pool', () => {
    const prompt = buildCraftPrompt(
      requestFor(`Item Class: Gloves
Rarity: Rare
Mystery Grips
Totally Invented Base
--------
Item Level: 69
--------
+80 to maximum Mana
`),
    );

    expect(prompt).toContain('unknown base');
  });

  it('demands more than one route, and one of them deterministic', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));

    // The reported failure: only ever one plan, always gambling, essences
    // ignored as though they did not exist.
    expect(prompt).toMatch(/two or three distinct routes/i);
    expect(prompt).toMatch(/at least one route must use a deterministic method/i);
    expect(prompt).toMatch(/presenting only gambling/i);
  });

  it('demands the whole process rather than the next click', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));
    expect(prompt).toMatch(/the whole process, not the next click/i);
    expect(prompt).toMatch(/three or more actions/i);
  });

  it('stays within a sane prompt size', () => {
    const prompt = buildCraftPrompt(requestFor(RAW));
    // Roughly 4 characters per token: the possibility space and the currency
    // catalogue are worth their cost, but they must not crowd out the item.
    expect(prompt.length).toBeLessThan(24_000);
  });

  it("carries the player's intent for this item into the prompt", () => {
    const prompt = buildCraftPrompt(requestFor(RAW));
    expect(prompt).toContain('as little currency as possible');
  });

  it('tells the model to declare its assumption when no intent was given', () => {
    const base = requestFor(RAW);
    const prompt = buildCraftPrompt({
      ...base,
      context: { ...base.context, craftIntent: null },
    });

    // Silently assuming a goal would produce a confident plan for something the
    // player never asked for.
    expect(prompt).toMatch(/did not say/i);
    expect(prompt).toMatch(/note that you assumed/i);
  });

  it('appends custom instructions below the hard rules, never above', () => {
    const system = buildSystemPrompt('Always answer in Portuguese.');
    expect(system.indexOf('Never invent numbers')).toBeLessThan(
      system.indexOf('Always answer in Portuguese.'),
    );
  });
});

describe('AnthropicProvider', () => {
  it('validates a well-formed response and reports usage', async () => {
    const messages = fakeMessages({ content: textContent(VALID_BODY) });
    const provider = new AnthropicProvider({ apiKey: 'sk-test' }, messages);

    const result = await provider.narrate(requestFor(RAW));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.narrative.nextBestAction).toBe('Use an Exalted Orb.');
    expect(result.value.narrative.model).toBe('claude-opus-4-8');
    expect(result.value.usage.inputTokens).toBe(100);

    // Two routes of different kinds, each a real sequence rather than one click.
    expect(result.value.narrative.plans).toHaveLength(2);
    expect(result.value.narrative.plans[0]?.approach).toBe('deterministic');
    expect(result.value.narrative.plans[0]?.steps.length).toBeGreaterThan(1);
  });

  it('sends the request shape this model version requires', async () => {
    const messages = fakeMessages({ content: textContent(VALID_BODY) });
    await new AnthropicProvider({ apiKey: 'sk-test' }, messages).narrate(requestFor(RAW));

    const params = messages.calls[0] as Record<string, unknown>;
    expect(params['model']).toBe('claude-opus-4-8');
    // Adaptive is the only on-mode; the old budget_tokens form 400s.
    expect(params['thinking']).toEqual({ type: 'adaptive' });
    // Sampling parameters are rejected outright on this model.
    expect(params['temperature']).toBeUndefined();
    expect(params['top_p']).toBeUndefined();
  });

  it('reports a missing key without calling the API', async () => {
    const messages = fakeMessages({ content: textContent(VALID_BODY) });
    const result = await new AnthropicProvider({ apiKey: '  ' }, messages).narrate(requestFor(RAW));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AI_NOT_CONFIGURED');
    expect(messages.calls).toHaveLength(0);
  });

  it('handles a refusal without reading content', async () => {
    const messages = fakeMessages({ stop_reason: 'refusal', content: [] });
    const result = await new AnthropicProvider({ apiKey: 'sk-test' }, messages).narrate(
      requestFor(RAW),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AI_PROVIDER_ERROR');
  });

  it('reports a truncated response instead of parsing half a JSON object', async () => {
    const messages = fakeMessages({
      stop_reason: 'max_tokens',
      content: textContent('{"summary": "cut off'),
    });
    const result = await new AnthropicProvider({ apiKey: 'sk-test' }, messages).narrate(
      requestFor(RAW),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/cut off/i);
  });

  it('rejects a response missing a required field', async () => {
    const messages = fakeMessages({ content: textContent('{"summary": "only this"}') });
    const result = await new AnthropicProvider({ apiKey: 'sk-test' }, messages).narrate(
      requestFor(RAW),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AI_PROVIDER_ERROR');
  });

  it('turns a thrown SDK error into a Result instead of propagating', async () => {
    const provider = new AnthropicProvider(
      { apiKey: 'sk-test' },
      { create: () => Promise.reject(new Error('socket hang up')) },
    );

    const result = await provider.narrate(requestFor(RAW));
    expect(result.ok).toBe(false);
  });

  it('never throws for any failure mode the UI must render', async () => {
    const spy = vi.fn();
    const provider = new AnthropicProvider({ apiKey: 'sk-test' }, { create: spy });
    spy.mockRejectedValue(new Error('boom'));

    await expect(provider.narrate(requestFor(RAW))).resolves.toMatchObject({ ok: false });
  });
});
