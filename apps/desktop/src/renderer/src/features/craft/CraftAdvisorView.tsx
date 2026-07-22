import { useQuery } from '@tanstack/react-query';
import { affixBudget, affixMods } from '@poe2/models';
import { Hammer, Loader2, TriangleAlert } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';
import { CraftSimulator } from './CraftSimulator';
import { PoolList } from './PoolList';
import { SlotBar } from './SlotBar';

/**
 * The crafting workspace for the item currently on screen.
 *
 * Where the Analyzer answers "what is this?", this answers "what can it still
 * become?" — the affix budget as slots, and the full pool of modifiers the base
 * accepts at this item level. Until now that pool existed only inside the
 * prompt, so the player had to take the model's word for what was possible.
 */
export function CraftAdvisorView(): React.JSX.Element {
  const analysis = useAppStore((s) => s.currentAnalysis);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const pool = useQuery({
    queryKey: ['craft-pool', analysis?.item.raw],
    queryFn: () => invoke('craft:pool', { raw: analysis?.item.raw ?? '' }),
    enabled: analysis !== null,
    staleTime: Infinity,
  });

  if (!analysis) {
    return (
      <div className="grid h-full place-items-center text-center text-[13px] text-ink-dim">
        <div>
          <Hammer size={36} strokeWidth={1.25} className="mx-auto mb-3 opacity-40" />
          No item loaded.
          <div className="mt-1 text-[12px]">
            Copy one in game, or{' '}
            <button
              type="button"
              onClick={() => setActiveView('analyzer')}
              className="text-accent hover:underline"
            >
              paste one in the Analyzer
            </button>
            .
          </div>
        </div>
      </div>
    );
  }

  const { item } = analysis;
  const affixes = affixMods(item);
  const budget = affixBudget(item.rarity);
  // Prefixes and suffixes each get half the budget, and they fill independently.
  const half = budget === null ? 0 : Math.floor(budget / 2);
  const prefixes = affixes.filter((mod) => mod.affixType === 'prefix');
  const suffixes = affixes.filter((mod) => mod.affixType === 'suffix');
  const unclassified = affixes.length - prefixes.length - suffixes.length;

  return (
    // Grows with its content and scrolls through the page, rather than pinning
    // to the viewport and squeezing the pool lists into a single visible row.
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[15px] font-semibold">Craft Advisor</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          {item.name ?? item.baseType} · {item.baseType}
          {item.itemLevel !== null && ` · item level ${item.itemLevel}`}
        </p>
      </div>

      {budget === null ? (
        <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-ink-muted">
          A {item.rarity.toLowerCase()} item has no affix budget to plan against.
        </div>
      ) : (
        <section className="grid gap-6 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
          <SlotBar label="Prefixes" used={prefixes.length} capacity={half} mods={prefixes} />
          <SlotBar label="Suffixes" used={suffixes.length} capacity={half} mods={suffixes} />
        </section>
      )}

      {unclassified > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {unclassified} affix{unclassified > 1 ? 'es' : ''} could not be placed as prefix or
            suffix. Turning on Advanced Item Description in game makes the client state this
            directly.
          </span>
        </div>
      )}

      {pool.isLoading && (
        <div className="grid flex-1 place-items-center text-ink-dim">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}

      {pool.data && !pool.data.known && (
        <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-ink-muted">
          This base is not in the modifier dataset, so the pool of possible modifiers is unknown.
          Regenerating the knowledge base may add it.
        </div>
      )}

      {pool.data?.known && (
        <>
          <CraftSimulator
            raw={item.raw}
            prefixes={pool.data.prefix}
            suffixes={pool.data.suffix}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <PoolList
              title="Prefixes this base can roll"
              options={pool.data.prefix}
              present={new Set(pool.data.present)}
              itemLevel={pool.data.itemLevel}
              chanceBasis={pool.data.chanceBasis}
            />
            <PoolList
              title="Suffixes this base can roll"
              options={pool.data.suffix}
              present={new Set(pool.data.present)}
              itemLevel={pool.data.itemLevel}
              chanceBasis={pool.data.chanceBasis}
            />
          </div>
        </>
      )}
    </div>
  );
}
