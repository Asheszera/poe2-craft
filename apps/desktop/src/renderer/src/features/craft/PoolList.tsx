import { useMemo, useState } from 'react';
import { Check, Lock, Search } from 'lucide-react';
import type { PoolOption } from '@shared/ipc';

/**
 * Everything the base can still roll on one affix side.
 *
 * This is the dataset the AI has been planning against; showing it to the
 * player closes the gap where they had to take the model's word for what was
 * possible. Options already on the item are kept in the list but marked, since
 * "you already have the good one" is as useful as "this is available".
 *
 * Sorted by reachable tier, so what is worth chasing is at the top.
 */
export function PoolList({
  title,
  options,
  present,
  itemLevel,
}: {
  title: string;
  options: PoolOption[];
  present: Set<string>;
  itemLevel: number | null;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [hideTaken, setHideTaken] = useState(true);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (hideTaken && present.has(option.key)) return false;
      return needle.length === 0 || option.text.toLowerCase().includes(needle);
    });
  }, [options, present, query, hideTaken]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface">
      <header className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[12px] font-medium">{title}</h3>
          <span className="font-mono text-[11px] text-ink-dim">{visible.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute top-2.5 left-2.5 text-ink-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-full rounded-md border border-line bg-surface-2 py-1.5 pr-2 pl-7 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50"
            />
          </div>
          <button
            type="button"
            onClick={() => setHideTaken(!hideTaken)}
            className={[
              'rounded-md border px-2 py-1.5 text-[11px] transition-colors',
              hideTaken
                ? 'border-line bg-surface-2 text-ink-muted'
                : 'border-accent/40 bg-accent/10 text-accent',
            ].join(' ')}
            title={hideTaken ? 'Showing only what is missing' : 'Showing everything'}
          >
            {hideTaken ? 'missing only' : 'all'}
          </button>
        </div>
      </header>

      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-[12px] text-ink-dim">
            {options.length === 0 ? 'No data for this base.' : 'Nothing matches.'}
          </li>
        )}

        {visible.map((option) => {
          const taken = present.has(option.key);
          // Tier 1 out of reach is the single most actionable fact here: it
          // means a higher-level base is the real upgrade, not more currency.
          const gated = option.bestTier > 1 && option.topTierLevel !== null;

          return (
            <li key={`${option.type}-${option.key}`} className="flex flex-col gap-0.5 px-3 py-2">
              <div className="flex items-baseline gap-2">
                {taken && <Check size={11} className="shrink-0 text-accent" />}
                <span className={`text-[12px] ${taken ? 'text-ink-dim line-through' : 'text-ink'}`}>
                  {option.text}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 font-mono text-[10px] text-ink-dim">
                <span className={option.bestTier === 1 ? 'text-accent' : undefined}>
                  best T{option.bestTier}/{option.tierTotal}
                </span>
                {gated && (
                  <span className="flex items-center gap-1 text-amber-300/70">
                    <Lock size={9} />T1 needs ilvl {option.topTierLevel}
                    {itemLevel !== null && ` (yours: ${itemLevel})`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
