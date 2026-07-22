import { appError, err, ok, type Result } from '@poe2/shared';
import { browseUrl, buildQueryBody } from './query.js';
import {
  TRADE_API,
  TRADE_REALM,
  type TradeListing,
  type TradePrice,
  type TradeQuerySpec,
  type TradeResult,
} from './types.js';

/**
 * The live price check, behind the official trade API's rate limit.
 *
 * The limit is per IP and the server publishes it in every response
 * (`X-Rate-Limit-Ip: 12:4:10,16:12:300` — 12 requests per 4s, 16 per 12s).
 * Honouring it is the whole difference between a companion the game tolerates
 * and a scraper it blocks, so this client serialises its requests through one
 * limiter and never fires a burst. A search is two requests (search, then
 * fetch), which is well inside the budget for the one-item-at-a-time use here.
 */

interface RateRule {
  readonly count: number;
  /** Window length in milliseconds. */
  readonly period: number;
}

/** GGG's default IP rules, replaced by whatever the live headers report. */
const DEFAULT_RULES: readonly RateRule[] = [
  { count: 12, period: 4000 },
  { count: 16, period: 12000 },
];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A sliding-window limiter that stays in step with the server.
 *
 * It keeps the timestamps of recent requests and, before each new one, waits
 * until every rule would admit it. The rules themselves are refreshed from the
 * response headers, so a mid-league change to GGG's policy is respected without
 * a code change.
 */
class RateLimiter {
  #rules: readonly RateRule[] = DEFAULT_RULES;
  #hits: number[] = [];
  /** All requests run through this chain, so the window is never raced. */
  #chain: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#chain.then(async () => {
      await this.#waitForSlot();
      this.#hits.push(Date.now());
      return task();
    });
    // Keep the chain alive regardless of this task's outcome.
    this.#chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  observe(headers: Headers): void {
    const rules = parseRules(headers.get('x-rate-limit-ip'));
    if (rules.length > 0) this.#rules = rules;
  }

  /** How long the server told us to wait after a 429, in ms. */
  static retryAfter(headers: Headers): number {
    const seconds = Number(headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000;
  }

  async #waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const longest = Math.max(...this.#rules.map((rule) => rule.period));
      this.#hits = this.#hits.filter((at) => now - at < longest);

      let wait = 0;
      for (const rule of this.#rules) {
        const inWindow = this.#hits.filter((at) => now - at < rule.period);
        if (inWindow.length >= rule.count) {
          const oldest = Math.min(...inWindow);
          wait = Math.max(wait, rule.period - (now - oldest) + 20);
        }
      }

      if (wait <= 0) return;
      await sleep(wait);
    }
  }
}

/** Parses `12:4:10,16:12:300` into `[{count:12,period:4000},…]`. */
function parseRules(header: string | null): RateRule[] {
  if (!header) return [];
  const rules: RateRule[] = [];
  for (const part of header.split(',')) {
    const [count, seconds] = part.split(':').map(Number);
    if (Number.isFinite(count) && Number.isFinite(seconds) && count && seconds) {
      rules.push({ count, period: seconds * 1000 });
    }
  }
  return rules;
}

export interface TradeClientOptions {
  /** Overridable for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** How many listings to fetch for the first page. GGG allows 10 per fetch. */
  readonly pageSize?: number;
  readonly userAgent?: string;
}

export class TradeClient {
  readonly #fetch: typeof fetch;
  readonly #pageSize: number;
  readonly #ua: string;
  readonly #limiter = new RateLimiter();

  constructor(options: TradeClientOptions = {}) {
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#pageSize = Math.min(options.pageSize ?? 10, 10);
    this.#ua = options.userAgent ?? 'POE2-AI-Assistant/0.1 (personal trade companion)';
  }

  /**
   * Runs a search and fetches the cheapest listings.
   *
   * Returns an empty result — not an error — when the market has nothing: "no
   * listings" is an answer a price check must be able to give plainly.
   */
  async search(spec: TradeQuerySpec): Promise<Result<TradeResult>> {
    const url = browseUrl(spec);

    const searchResponse = await this.#send(
      `${TRADE_API}/search/${TRADE_REALM}/${encodeURIComponent(spec.league)}`,
      { method: 'POST', body: JSON.stringify(buildQueryBody(spec)) },
    );
    if (!searchResponse.ok) return searchResponse;

    const search = searchResponse.value as { id?: string; result?: string[]; total?: number };
    const ids = Array.isArray(search.result) ? search.result : [];
    const total = typeof search.total === 'number' ? search.total : ids.length;

    if (ids.length === 0 || !search.id) {
      return ok({ total, listings: [], low: null, browseUrl: url });
    }

    const page = ids.slice(0, this.#pageSize).join(',');
    const fetchResponse = await this.#send(
      `${TRADE_API}/fetch/${page}?query=${search.id}&realm=${TRADE_REALM}`,
      { method: 'GET' },
    );
    if (!fetchResponse.ok) return fetchResponse;

    const fetched = fetchResponse.value as { result?: unknown[] };
    const listings = (fetched.result ?? []).map(toListing).filter((l): l is TradeListing => l !== null);

    return ok({ total, listings, low: listings[0]?.price ?? null, browseUrl: url });
  }

  /** One rate-limited request, with a single retry on a 429. */
  async #send(url: string, init: RequestInit): Promise<Result<unknown>> {
    return this.#limiter.run(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response: Response;
        try {
          response = await this.#fetch(url, {
            ...init,
            headers: {
              'User-Agent': this.#ua,
              Accept: 'application/json',
              ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            },
          });
        } catch (cause) {
          return err(appError('TRADE_UNAVAILABLE', 'Could not reach the trade site.', { cause }));
        }

        this.#limiter.observe(response.headers);

        if (response.status === 429) {
          if (attempt === 0) {
            await sleep(RateLimiter.retryAfter(response.headers));
            continue;
          }
          return err(appError('TRADE_RATE_LIMITED', 'The trade site is rate-limiting requests. Try again shortly.'));
        }

        if (!response.ok) {
          return err(appError('TRADE_UNAVAILABLE', `The trade site responded ${response.status}.`));
        }

        try {
          return ok(await response.json());
        } catch (cause) {
          return err(appError('TRADE_UNAVAILABLE', 'The trade site returned an unexpected response.', { cause }));
        }
      }
      return err(appError('TRADE_UNAVAILABLE', 'The trade request could not be completed.'));
    });
  }
}

/** Reduces one raw fetch result to a `TradeListing`, or null if it is unusable. */
function toListing(raw: unknown): TradeListing | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as {
    item?: { name?: string; typeLine?: string; baseType?: string };
    listing?: {
      indexed?: string;
      price?: { amount?: number; currency?: string };
      account?: { name?: string };
      whisper?: string;
    };
  };

  const listing = entry.listing;
  const item = entry.item;
  if (!listing || !item) return null;

  const name = [item.name, item.typeLine ?? item.baseType].filter(Boolean).join(' ').trim();

  let price: TradePrice | null = null;
  if (listing.price && typeof listing.price.amount === 'number' && listing.price.currency) {
    price = { amount: listing.price.amount, currency: listing.price.currency };
  }

  return {
    name: name || 'Unknown item',
    price,
    account: listing.account?.name ?? 'unknown',
    indexed: listing.indexed ?? null,
    whisper: listing.whisper ?? null,
  };
}
