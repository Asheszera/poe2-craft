import { useMemo, useState } from 'react';
import { Ban, Check, Lock, Search } from 'lucide-react';
import type { PoolOption } from '@shared/ipc';

/**
 * Everything the base can still roll on one affix side.
 *
 * This is the dataset the AI has been planning against; showing it to the
 * player closes the gap where they had to take the model's word for what was
 * possible. Options already on the item are kept in the list but marked, since
 * "you already have the good one" is as useful as "this is available".
 *
 * Two ways a modifier can be unavailable, and they read differently:
 *  - it is *already on the item*, or
 *  - something else on the item occupies its exclusion group. A belt with
 *    increased flask life recovery can never roll flask *mana* recovery — a
 *    different modifier with different text and its own tier ladder. Marking
 *    only exact matches would show that one as an opportunity.
 *
 * Sorted by reachable tier, so what is worth chasing is at the top.
 */
export function PoolList({
  title,
  options,
  present,
  itemLevel,
  chanceBasis,
}: {
  title: string;
  options: PoolOption[];
  present: Set<string>;
  itemLevel: number | null;
  chanceBasis: 'weights' | 'tiers';
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [hideTaken, setHideTaken] = useState(true);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (hideTaken && (option.blockedBy !== null || present.has(option.key))) return false;
      // Tags are searchable too: "attack" or "life" is how a player thinks about
      // what they want, and it is rarely a word in the modifier's own text.
      return (
        needle.length === 0 ||
        option.text.toLowerCase().includes(needle) ||
        option.tags.some((tag) => tag.includes(needle))
      );
    });
  }, [options, present, query, hideTaken]);

  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
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
            title={
              hideTaken
                ? 'Showing only what this item can still roll'
                : 'Showing everything, including what is blocked'
            }
          >
            {hideTaken ? 'available only' : 'all'}
          </button>
        </div>
      </header>

      {/* A generous cap so many modifiers show at once; the page scrolls for
          the rest, and a very long pool scrolls within this box. */}
      <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-[12px] text-ink-dim">
            {options.length === 0 ? 'No data for this base.' : 'Nothing matches.'}
          </li>
        )}

        {visible.map((option) => {
          const taken = present.has(option.key);
          // Blocked *and* not on the item: a different modifier holds the group.
          const excluded = option.blockedBy !== null && !taken;
          const unavailable = taken || excluded;
          // Tier 1 out of reach is the single most actionable fact here: it
          // means a higher-level base is the real upgrade, not more currency.
          const gated = option.bestTier > 1 && option.topTierLevel !== null;

          return (
            <li key={`${option.type}-${option.key}`} className="flex flex-col gap-0.5 px-3 py-2">
              <div className="flex items-baseline gap-2">
                {taken && <Check size={11} className="shrink-0 text-accent" />}
                {excluded && <Ban size={11} className="shrink-0 text-ink-dim" />}
                <span
                  className={`text-[12px] ${unavailable ? 'text-ink-dim line-through' : 'text-ink'}`}
                >
                  {option.text}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 font-mono text-[10px] text-ink-dim">
                <span className={option.bestTier === 1 ? 'text-accent' : undefined}>
                  best T{option.bestTier}/{option.tierTotal}
                </span>
                {!unavailable &&
                  (option.chance === null ? (
                    <span className="text-ink-dim/70" title="No spawn weight is published here">
                      chance unknown
                    </span>
                  ) : (
                    <span
                      className={option.chance >= 0.08 ? 'text-ink-muted' : undefined}
                      title={
                        option.weight === null
                          ? `${option.eligibleTiers} reachable tiers`
                          : `spawn weight ${option.weight} across ${option.eligibleTiers} reachable tiers`
                      }
                    >
                      {(option.chance * 100).toFixed(1)}%
                    </span>
                  ))}
                {excluded && (
                  <span className="text-ink-muted">
                    blocked — this item already has a {option.blockedBy} modifier
                  </span>
                )}
                {gated && (
                  <span className="flex items-center gap-1 text-amber-300/70">
                    <Lock size={9} />T1 needs ilvl {option.topTierLevel}
                    {itemLevel !== null && ` (yours: ${itemLevel})`}
                  </span>
                )}
                {option.tags.length > 0 && (
                  <span className="text-ink-dim/70">{option.tags.slice(0, 4).join(' ')}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        The percentage is the kind of number that gets trusted more than it
        deserves, so where it comes from sits next to it rather than in a manual.
      */}
      <footer className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-ink-dim">
        {chanceBasis === 'weights'
          ? "Chance that a new modifier on this side lands on this one, from the game's published spawn weights for this base. Per rolled modifier, not per orb."
          : 'No spawn weights are published for this base, so percentages assume every reachable tier is equally likely. Rough ranking only, not the game’s odds.'}
      </footer>
    </section>
  );
}
