import { useEffect, useState } from 'react';
import type { ItemAnalysis, Rarity } from '@poe2/models';
import { affixBudget, affixMods } from '@poe2/models';
import type { TradePrice } from '@poe2/prices';
import { Tag } from 'lucide-react';
import { invoke, subscribe } from '@/lib/ipc';

/** The cheapest listing and how many the search found, for the current item. */
interface QuickPrice {
  low: TradePrice | null;
  total: number;
}

const RARITY_TEXT: Record<Rarity, string> = {
  Normal: 'text-rarity-normal',
  Magic: 'text-rarity-magic',
  Rare: 'text-rarity-rare',
  Unique: 'text-rarity-unique',
  Currency: 'text-rarity-currency',
  Gem: 'text-rarity-currency',
  Quest: 'text-rarity-currency',
};

/** Colour bands, so the verdict reads before the number does. */
function scoreTone(score: number): string {
  if (score >= 75) return 'text-accent';
  if (score >= 50) return 'text-amber-300';
  return 'text-ink-muted';
}

/**
 * The overlay's contents.
 *
 * Deliberately small: a rating, the item, the slot count and the single next
 * action. It is read in a glance mid-fight, so anything that needs a second
 * look belongs in the main window instead.
 */
export function OverlayApp(): React.JSX.Element | null {
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null);
  const [price, setPrice] = useState<QuickPrice | null>(null);

  useEffect(
    () =>
      subscribe('overlay:show', (next) => {
        setAnalysis(next);
        // A fresh capture clears the last item's price until its own lands.
        setPrice(null);
      }),
    [],
  );

  // The price arrives a moment after the card. Keyed by raw text so a late
  // result for the previous item never shows against the current one.
  useEffect(
    () =>
      subscribe('price:update', (update) => {
        setAnalysis((current) => {
          if (current && update.raw === current.item.raw) {
            setPrice({ low: update.result.low, total: update.result.total });
          }
          return current;
        });
      }),
    [],
  );

  if (!analysis) return null;

  const { item, deterministic } = analysis;
  const budget = affixBudget(item.rarity);
  const affixes = affixMods(item).length;
  const advice = deterministic.recommendations[0];

  // The overlay is click-through until the cursor is over the card. Telling the
  // main process to make it interactive on enter — and click-through again on
  // leave — is what lets a click land without ever intercepting one meant for
  // the game.
  const setInteractive = (interactive: boolean): void => {
    void invoke('overlay:setInteractive', { interactive });
  };

  return (
    <div className="flex h-screen w-screen items-start p-1">
      <button
        type="button"
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
        onClick={() => void invoke('overlay:open', null)}
        title="Open the full analysis"
        className="group block w-full cursor-pointer rounded-lg border border-line bg-base/95 p-4 text-left shadow-2xl backdrop-blur transition-colors hover:border-accent/50"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`truncate text-[14px] font-semibold ${RARITY_TEXT[item.rarity]}`}>
              {item.name ?? item.baseType}
            </div>
            <div className="truncate text-[11px] text-ink-dim">
              {item.baseType}
              {item.itemLevel !== null && ` · ilvl ${item.itemLevel}`}
            </div>
          </div>

          <div className="flex shrink-0 items-baseline gap-1">
            <span className={`text-3xl font-semibold tabular-nums ${scoreTone(deterministic.score)}`}>
              {deterministic.score}
            </span>
            <span className="text-[10px] text-ink-dim">/100</span>
          </div>
        </header>

        <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-ink-dim">
          <span>
            {affixes}
            {budget === null ? '' : `/${budget}`} affixes
          </span>
          {deterministic.strengths[0] && (
            <span className="truncate text-accent/80">{deterministic.strengths[0]}</span>
          )}
        </div>

        {advice && (
          <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <div className="text-[10px] tracking-wider text-ink-dim uppercase">Next</div>
            <div className="mt-0.5 text-[13px] text-ink">{advice.label}</div>
            <div className="mt-0.5 font-mono text-[10px] text-ink-dim">{advice.action}</div>
          </div>
        )}

        {deterministic.weaknesses[0] && (
          <div className="mt-2 truncate text-[11px] text-amber-200/70">
            {deterministic.weaknesses[0]}
          </div>
        )}

        {price && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <Tag size={11} className="text-accent" />
            {price.low ? (
              <span className="text-ink">
                from{' '}
                <span className="font-semibold text-accent">
                  {price.low.amount} {price.low.currency}
                </span>
                <span className="text-ink-dim"> · {price.total} listed</span>
              </span>
            ) : (
              <span className="text-ink-dim">no listings found</span>
            )}
          </div>
        )}

        {/* Only legible on hover, so it does not clutter the glance-read. */}
        <div className="mt-2 text-[10px] text-ink-dim opacity-0 transition-opacity group-hover:opacity-100">
          Click to open the full analysis
        </div>
      </button>
    </div>
  );
}
