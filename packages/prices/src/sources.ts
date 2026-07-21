import { appError, err, ok, type Result } from '@poe2/shared';
import { PriceTableSchema, type PriceSource, type PriceTable } from './types.js';

/**
 * Prices the user entered themselves.
 *
 * The adapter that works today, and the one that is always correct: the player
 * reads the rate off the in-game currency exchange and types it in. No network,
 * no rate limit, no third party, and no chance of the advisor quoting a number
 * nobody can trace.
 */
export class ManualPriceSource implements PriceSource {
  readonly id = 'manual';
  readonly label = 'Entered manually';

  constructor(private readonly read: (league: string) => PriceTable) {}

  fetch(league: string): Promise<Result<PriceTable>> {
    const table = this.read(league);
    const parsed = PriceTableSchema.safeParse(table);
    return Promise.resolve(
      parsed.success
        ? ok(parsed.data)
        : err(appError('PRICE_SOURCE_UNAVAILABLE', 'Stored prices are malformed.')),
    );
  }
}

/**
 * Fetches a price table from an HTTP endpoint returning `PriceTable` JSON.
 *
 * Exists so a community mirror, a self-hosted scraper or a future official
 * endpoint can be plugged in without touching anything above this line.
 *
 * There is deliberately no bundled poe.ninja or trade-site adapter: the trade
 * API requires an authenticated session and rate-limits automated search, and
 * poe.ninja serves its economy data to a browser application rather than
 * through a documented public endpoint. Shipping a scraper against either would
 * be fragile at best and against the terms at worst — so the choice of source
 * is left to the person running the app.
 */
export class HttpPriceSource implements PriceSource {
  readonly id = 'http';

  constructor(
    readonly label: string,
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async fetch(league: string): Promise<Result<PriceTable>> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url.replace('{league}', encodeURIComponent(league)), {
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      return err(
        appError('PRICE_SOURCE_UNAVAILABLE', `Could not reach ${this.label}.`, { cause: error }),
      );
    }

    if (!response.ok) {
      return err(
        appError('PRICE_SOURCE_UNAVAILABLE', `${this.label} responded ${response.status}.`),
      );
    }

    const parsed = PriceTableSchema.safeParse(await response.json().catch(() => null));
    return parsed.success
      ? ok(parsed.data)
      : err(appError('PRICE_SOURCE_UNAVAILABLE', `${this.label} returned an unexpected shape.`));
  }
}
