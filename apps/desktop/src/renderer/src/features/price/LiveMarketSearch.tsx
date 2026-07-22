import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  TradeIndexed,
  TradeListing,
  TradeQuerySpec,
  TradeResult,
  TradeStatus,
} from '@poe2/prices';
import { ExternalLink, Loader2, Search, Tag } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

/** The trade site's status options, in its own words. */
const STATUS_LABELS: Record<TradeStatus, string> = {
  available: 'Buyout + in person',
  securable: 'Instant buyout only',
  onlineleague: 'In person (in league)',
  online: 'In person (online)',
  any: 'Any, incl. offline',
};

/** "Listed within" options; empty string is the null "any age". */
const INDEXED_LABELS: Record<TradeIndexed, string> = {
  '1hour': '1 hour',
  '3hours': '3 hours',
  '12hours': '12 hours',
  '1day': '1 day',
  '3days': '3 days',
  '1week': '1 week',
  '2weeks': '2 weeks',
  '1month': '1 month',
  '2months': '2 months',
};

/** A tri-state (Any / Yes / No) as the trade filters model it. */
const triValue = (v: boolean | null): string => (v === null ? '' : v ? 'true' : 'false');
const triParse = (s: string): boolean | null => (s === '' ? null : s === 'true');

const controlClass =
  'rounded border border-line bg-surface-2 px-1.5 py-1 text-ink outline-none focus:border-accent/50';

/**
 * A live price check against the official PoE2 trade site.
 *
 * The item on screen becomes an editable search: every matched modifier is a
 * toggle with an optional value window, so the player tightens or loosens the
 * query without the app ever imposing a number it was not given (ADR — the same
 * rule the rest of `@poe2/prices` follows: no invented prices). The search runs
 * automatically on capture and its result is seeded here from the store; the
 * "Search" button re-runs it after edits. The odds are the market's, and
 * "no listings" is shown as itself rather than as a misleading zero.
 */
export function LiveMarketSearch(): React.JSX.Element {
  const analysis = useAppStore((s) => s.currentAnalysis);
  const currentPrice = useAppStore((s) => s.currentPrice);
  const [spec, setSpec] = useState<TradeQuerySpec | null>(null);
  const [result, setResult] = useState<TradeResult | null>(null);

  const raw = analysis?.item.raw ?? null;

  // Set up the search for whatever item is on screen. The pushed auto-search
  // (spec *and* listings) wins when it is for this exact item; otherwise a
  // fresh spec is built to edit, with no search run yet.
  useEffect(() => {
    if (!raw) {
      setSpec(null);
      setResult(null);
      return;
    }
    if (currentPrice && currentPrice.raw === raw) {
      setSpec(currentPrice.spec);
      setResult(currentPrice.result);
      return;
    }
    let cancelled = false;
    setResult(null);
    void invoke('trade:defaults', { raw }).then((response) => {
      if (!cancelled) setSpec(response.spec);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, currentPrice]);

  const search = useMutation({
    mutationFn: (next: TradeQuerySpec) => invoke('trade:search', { spec: next }),
    onSuccess: (response) => {
      if (response.ok) setResult(response.value);
    },
  });

  if (!analysis) {
    return (
      <section className="rounded-lg border border-line bg-surface p-5 text-[12px] text-ink-dim">
        Copy an item in game to price it on the trade site.
      </section>
    );
  }

  const patchSpec = (patch: Partial<TradeQuerySpec>): void =>
    setSpec((current) => (current ? { ...current, ...patch } : current));
  const patchFilter = (index: number, patch: Partial<TradeQuerySpec['filters'][number]>): void =>
    setSpec((current) =>
      current
        ? { ...current, filters: current.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) }
        : current,
    );

  const { item } = analysis;
  const searchError = search.data && !search.data.ok ? search.data.error.message : null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-accent" />
            <h2 className="text-[13px] font-semibold">Live market price</h2>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            {item.name ?? item.baseType} — searched on the official trade site. Toggle modifiers and
            set value bounds to price it your way.
          </p>
        </div>
        {spec && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => search.mutate(spec)}
              disabled={search.isPending}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {search.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Search size={12} />
              )}
              Search
            </button>
            {result && (
              <button
                type="button"
                onClick={() => void invoke('trade:open', { url: result.browseUrl })}
                title="Open this search on the trade site"
                className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                <ExternalLink size={12} />
                Trade site
              </button>
            )}
          </div>
        )}
      </div>

      {/* Price headline */}
      {result && (
        <div className="flex items-baseline justify-between rounded-md border border-line bg-surface-2 px-4 py-3">
          {result.low ? (
            <>
              <span className="text-[12px] text-ink-muted">Cheapest online</span>
              <span className="text-2xl font-semibold text-accent">
                {result.low.amount}{' '}
                <span className="text-[13px] font-normal text-ink-muted">{result.low.currency}</span>
              </span>
            </>
          ) : (
            <span className="text-[13px] text-ink-dim">No listings match this search.</span>
          )}
          {result.low && (
            <span className="text-[11px] text-ink-dim">
              {result.total.toLocaleString()} listed
            </span>
          )}
        </div>
      )}

      {searchError && <p className="text-[11px] text-amber-300">{searchError}</p>}

      {!spec ? (
        <Loader2 size={14} className="animate-spin text-ink-dim" />
      ) : (
        <>
          {/* Item-level constraints */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
            {spec.baseType && (
              <label className="flex items-center gap-1.5 text-ink-muted">
                <input
                  type="checkbox"
                  checked={spec.baseType === item.baseType}
                  onChange={(e) => patchSpec({ baseType: e.target.checked ? item.baseType : null })}
                />
                match base
              </label>
            )}
            <label className="flex items-center gap-1.5 text-ink-muted">
              rarity
              <select
                value={spec.rarity}
                onChange={(e) => patchSpec({ rarity: e.target.value as TradeQuerySpec['rarity'] })}
                className={controlClass}
              >
                {(['any', 'normal', 'magic', 'rare', 'unique', 'nonunique'] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              sellers
              <select
                value={spec.status}
                onChange={(e) => patchSpec({ status: e.target.value as TradeStatus })}
                className={controlClass}
              >
                {(Object.keys(STATUS_LABELS) as TradeStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              ilvl ≥
              <input
                inputMode="numeric"
                value={spec.minItemLevel ?? ''}
                onChange={(e) => patchSpec({ minItemLevel: parseNum(e.target.value) })}
                placeholder="any"
                className={`w-14 ${controlClass}`}
              />
            </label>
          </div>

          {/* Trade constraints */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
            <label className="flex items-center gap-1.5 text-ink-muted">
              corrupted
              <select
                value={triValue(spec.corrupted)}
                onChange={(e) => patchSpec({ corrupted: triParse(e.target.value) })}
                className={controlClass}
              >
                <option value="">any</option>
                <option value="true">yes</option>
                <option value="false">no</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              mirrored
              <select
                value={triValue(spec.mirrored)}
                onChange={(e) => patchSpec({ mirrored: triParse(e.target.value) })}
                className={controlClass}
              >
                <option value="">any</option>
                <option value="true">yes</option>
                <option value="false">no</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              listed
              <select
                value={spec.indexed ?? ''}
                onChange={(e) =>
                  patchSpec({ indexed: e.target.value === '' ? null : (e.target.value as TradeIndexed) })
                }
                className={controlClass}
              >
                <option value="">any time</option>
                {(Object.keys(INDEXED_LABELS) as TradeIndexed[]).map((i) => (
                  <option key={i} value={i}>
                    {INDEXED_LABELS[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              max ex
              <input
                inputMode="numeric"
                value={spec.maxBuyout ?? ''}
                onChange={(e) => patchSpec({ maxBuyout: parseNum(e.target.value) })}
                placeholder="any"
                title="Cap the buyout, in Exalted-Orb equivalent"
                className={`w-16 ${controlClass}`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              <input
                type="checkbox"
                checked={spec.collapse}
                onChange={(e) => patchSpec({ collapse: e.target.checked })}
              />
              one per seller
            </label>
          </div>

          {/* Modifier filters */}
          {spec.filters.length === 0 ? (
            <p className="text-[11px] text-ink-dim">
              None of this item’s modifiers could be matched to a searchable stat, so the search runs
              on the base and rarity alone.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {spec.filters.map((filter, index) => (
                <li
                  key={filter.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[11px]"
                >
                  <input
                    type="checkbox"
                    checked={filter.enabled}
                    onChange={(e) => patchFilter(index, { enabled: e.target.checked })}
                  />
                  <span className={`min-w-0 flex-1 truncate ${filter.enabled ? 'text-ink' : 'text-ink-dim line-through'}`}>
                    {filter.text}
                  </span>
                  {filter.rolled !== null && filter.enabled && (
                    <button
                      type="button"
                      onClick={() => patchFilter(index, { min: filter.rolled })}
                      title="Set the minimum to this item’s roll"
                      className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim hover:text-ink"
                    >
                      rolled {filter.rolled}
                    </button>
                  )}
                  <input
                    inputMode="numeric"
                    value={filter.min ?? ''}
                    onChange={(e) => patchFilter(index, { min: parseNum(e.target.value) })}
                    placeholder="min"
                    disabled={!filter.enabled}
                    className="w-14 rounded border border-line bg-surface px-1.5 py-1 text-ink outline-none focus:border-accent/50 disabled:opacity-40"
                  />
                  <input
                    inputMode="numeric"
                    value={filter.max ?? ''}
                    onChange={(e) => patchFilter(index, { max: parseNum(e.target.value) })}
                    placeholder="max"
                    disabled={!filter.enabled}
                    className="w-14 rounded border border-line bg-surface px-1.5 py-1 text-ink outline-none focus:border-accent/50 disabled:opacity-40"
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Listings */}
          {result && result.listings.length > 0 && (
            <ol className="flex flex-col divide-y divide-line rounded-md border border-line">
              {result.listings.map((listing, index) => (
                <ListingRow key={index} listing={listing} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function ListingRow({ listing }: { listing: TradeListing }): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-ink">{listing.name}</span>
        <span className="shrink-0 text-ink-dim">{listing.account}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {listing.indexed && <span className="text-ink-dim">{relativeAge(listing.indexed)}</span>}
        {listing.price ? (
          <span className="font-semibold text-accent">
            {listing.price.amount} {listing.price.currency}
          </span>
        ) : (
          <span className="text-ink-dim">no price</span>
        )}
      </span>
    </li>
  );
}

/** Parses a numeric input to a number, or null for empty/invalid. */
function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** A coarse "2d ago" from an ISO timestamp — enough to gauge staleness. */
function relativeAge(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
