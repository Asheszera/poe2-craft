import { describe, expect, it } from 'vitest';
import {
  costOfPlan,
  EMPTY_TABLE,
  formatCost,
  HttpPriceSource,
  ManualPriceSource,
  priceOf,
  pricePrompt,
  type PriceTable,
} from '../src/index.js';

const TABLE: PriceTable = {
  league: 'Runes of Aldur',
  source: 'Entered manually',
  updatedAt: '2026-07-21T00:00:00.000Z',
  entries: [
    { currency: 'Exalted Orb', value: 1 },
    { currency: 'Divine Orb', value: 700 },
    { currency: 'Chaos Orb', value: 0.5 },
  ],
};

describe('lookup', () => {
  it('is case insensitive about the currency name', () => {
    expect(priceOf(TABLE, 'divine orb')).toBe(700);
  });

  it('returns null for an unpriced currency, never zero', () => {
    // Zero would read as "free" everywhere downstream — the opposite of the
    // truth, which is that nobody knows.
    expect(priceOf(TABLE, 'Orb of Annulment')).toBeNull();
  });
});

describe('formatting', () => {
  it('renders whole orbs readably', () => {
    expect(formatCost(TABLE, 'Divine Orb')).toBe('700 Exalted Orbs');
    expect(formatCost(TABLE, 'Exalted Orb')).toBe('1 Exalted Orb');
  });

  it('keeps precision below one orb', () => {
    expect(formatCost(TABLE, 'Chaos Orb')).toBe('0.50 Exalted Orb');
  });

  it('multiplies by quantity', () => {
    expect(formatCost(TABLE, 'Divine Orb', 2)).toBe('1400 Exalted Orbs');
  });

  it('refuses to format an unpriced currency', () => {
    expect(formatCost(TABLE, 'Mirror of Kalandra')).toBeNull();
  });
});

describe('cost of a plan', () => {
  it('adds up the priced steps', () => {
    const { total, unpriced } = costOfPlan(TABLE, [
      { currency: 'Exalted Orb', quantity: 3 },
      { currency: 'Divine Orb' },
    ]);

    expect(total).toBe(703);
    expect(unpriced).toEqual([]);
  });

  it('names the steps it could not price instead of ignoring them', () => {
    const { total, unpriced } = costOfPlan(TABLE, [
      { currency: 'Exalted Orb' },
      { currency: 'Essence of Haste' },
    ]);

    // A plan whose total silently omits an unpriced step understates the cost.
    expect(total).toBe(1);
    expect(unpriced).toEqual(['Essence of Haste']);
  });
});

describe('price section of the prompt', () => {
  it('tells the model plainly when nothing is priced', () => {
    const prompt = pricePrompt(EMPTY_TABLE('Runes of Aldur'));

    expect(prompt).toMatch(/no currency prices are configured/i);
    expect(prompt).toMatch(/do not state or imply a price/i);
  });

  it('lists prices with their provenance and date', () => {
    const prompt = pricePrompt(TABLE);

    expect(prompt).toContain('Entered manually');
    expect(prompt).toContain('Runes of Aldur');
    expect(prompt).toContain('Divine Orb: 700 Exalted Orbs');
  });

  it('orders by value so the expensive steps are visible first', () => {
    const prompt = pricePrompt(TABLE);
    expect(prompt.indexOf('Divine Orb')).toBeLessThan(prompt.indexOf('Chaos Orb'));
  });

  it('warns that unlisted currencies are unknown, not cheap', () => {
    const prompt = pricePrompt(TABLE);
    expect(prompt).toMatch(/unpriced/i);
    expect(prompt).toMatch(/never invent a number/i);
  });

  it('asks the model to decide with prices, not just quote them', () => {
    const prompt = pricePrompt(TABLE);
    expect(prompt).toMatch(/costs more than[\s\S]*worth/i);
  });
});

describe('sources', () => {
  it('reads the manual table', async () => {
    const source = new ManualPriceSource(() => TABLE);
    const result = await source.fetch('Runes of Aldur');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries).toHaveLength(3);
  });

  it('reports a malformed stored table rather than half-loading it', async () => {
    const broken: PriceTable = { ...TABLE, entries: [{ currency: 'Divine Orb', value: -5 }] };
    const result = await new ManualPriceSource(() => broken).fetch('x');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PRICE_SOURCE_UNAVAILABLE');
  });

  it('substitutes the league into a configured URL', async () => {
    const seen: string[] = [];
    const source = new HttpPriceSource('Mirror', 'https://x.test/{league}.json', (url) => {
      // `fetch` accepts string | URL | Request; each exposes its href differently.
      seen.push(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      return Promise.resolve(new Response(JSON.stringify(TABLE), { status: 200 }));
    });

    await source.fetch('Runes of Aldur');
    expect(seen[0]).toBe('https://x.test/Runes%20of%20Aldur.json');
  });

  it('turns an unreachable source into a Result, not a crash', async () => {
    const source = new HttpPriceSource('Mirror', 'https://x.test/{league}.json', () =>
      Promise.reject(new Error('offline')),
    );

    const result = await source.fetch('Runes of Aldur');
    expect(result.ok).toBe(false);
  });
});
