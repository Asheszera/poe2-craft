import { useQuery } from '@tanstack/react-query';
import { affixMods, exceedsAffixBudget } from '@poe2/models';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  // `| undefined` is required by `exactOptionalPropertyTypes`: JSX always
  // passes the prop, so the absent case is an explicit undefined.
  hint?: string | undefined;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11px] tracking-wide text-ink-dim uppercase">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-dim">{hint}</div>}
    </div>
  );
}

/**
 * Session dashboard.
 *
 * Metrics are computed from the in-memory session for now; stage 3 swaps the
 * source for the SQLite history repository without touching this component,
 * which is the point of keeping the selectors local.
 */
export function DashboardView(): React.JSX.Element {
  const recentItems = useAppStore((s) => s.recentItems);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const appInfo = useQuery({
    queryKey: ['app-info'],
    queryFn: () => invoke('app:info', null),
    staleTime: Infinity,
  });

  const rareCount = recentItems.filter((i) => i.rarity === 'Rare').length;
  // Both signals mean the same thing to the user: the parser mis-read an item.
  const withIssues = recentItems.filter(
    (i) => i.unparsedLines.length > 0 || exceedsAffixBudget(i),
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold">Dashboard</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          Session overview. Persistent history, profit tracking and craft counters arrive with the
          SQLite layer.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <Metric label="Items analysed" value={String(recentItems.length)} hint="this session" />
        <Metric label="Rares" value={String(rareCount)} />
        <Metric
          label="Parse warnings"
          value={String(withIssues)}
          hint={withIssues > 0 ? 'unattributed lines found' : 'clean'}
        />
        <Metric
          label="Electron"
          value={appInfo.data?.electron ?? '—'}
          hint={appInfo.data?.platform}
        />
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-4 py-3 text-[12px] font-medium">
          Recently analysed
        </header>
        {recentItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-dim">
            Nothing yet —{' '}
            <button
              type="button"
              onClick={() => setActiveView('analyzer')}
              className="text-accent hover:underline"
            >
              analyse an item
            </button>
            .
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recentItems.map((item, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="truncate">{item.name ?? item.baseType}</span>
                <span className="ml-4 shrink-0 font-mono text-[11px] text-ink-dim">
                  {item.rarity} · {affixMods(item).length} affixes
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
