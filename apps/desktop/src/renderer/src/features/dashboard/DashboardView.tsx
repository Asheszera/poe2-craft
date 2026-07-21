import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

const HISTORY_KEY = ['history'];
const STATS_KEY = ['history-stats'];

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
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

const RARITY_TEXT: Record<string, string> = {
  Normal: 'text-rarity-normal',
  Magic: 'text-rarity-magic',
  Rare: 'text-rarity-rare',
  Unique: 'text-rarity-unique',
};

/**
 * Session-long history, read from the database rather than from memory.
 *
 * Everything here survives a restart: the counts are SQL aggregates and the
 * list is a paged query, so the dashboard stays honest as the table grows
 * instead of reflecting only what happened since the app was opened.
 */
export function DashboardView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const setActiveView = useAppStore((s) => s.setActiveView);
  /**
   * Two-step confirmation for the one irreversible action in the app.
   *
   * Deleting a single entry is cheap to redo — capture the item again. Clearing
   * the table is not: it takes every recorded sale and note with it, and a
   * misplaced click had been enough.
   */
  const [confirmingClear, setConfirmingClear] = useState(false);

  const stats = useQuery({ queryKey: STATS_KEY, queryFn: () => invoke('history:stats', null) });
  const entries = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => invoke('history:list', { limit: 50, offset: 0 }),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
    void queryClient.invalidateQueries({ queryKey: STATS_KEY });
  };

  const remove = useMutation({
    mutationFn: (id: number) => invoke('history:remove', { id }),
    onSuccess: refresh,
  });
  const clear = useMutation({
    mutationFn: () => invoke('history:clear', null),
    onSuccess: () => {
      setConfirmingClear(false);
      refresh();
    },
  });

  if (!stats.data || !entries.data) {
    return (
      <div className="grid h-full place-items-center text-ink-dim">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  const { total, rares, bestScore, averageScore, withParseWarnings, narrated } = stats.data;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold">Dashboard</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          Everything you have analysed, stored locally and kept between sessions.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        <Metric label="Items analysed" value={String(total)} hint="all time" />
        <Metric label="Rares" value={String(rares)} />
        <Metric label="Best score" value={total === 0 ? '—' : String(bestScore)} hint="out of 100" />
        <Metric label="Average" value={total === 0 ? '—' : String(averageScore)} />
        <Metric label="Explained by AI" value={String(narrated)} />
        <Metric
          label="Parse warnings"
          value={String(withParseWarnings)}
          hint={withParseWarnings > 0 ? 'unattributed lines found' : 'clean'}
        />
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12px] font-medium">History</span>
          {total > 0 &&
            (confirmingClear ? (
              <span className="flex items-center gap-2 text-[11px]">
                <span className="text-ink-muted">
                  Delete all {total} entries, including recorded sales?
                </span>
                <button
                  type="button"
                  onClick={() => clear.mutate()}
                  disabled={clear.isPending}
                  className="rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="rounded border border-line px-2 py-1 text-ink-dim transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="flex items-center gap-1.5 text-[11px] text-ink-dim transition-colors hover:text-red-300"
              >
                <Trash2 size={12} />
                Clear all
              </button>
            ))}
        </header>

        {entries.data.length === 0 ? (
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
            {entries.data.map((entry) => (
              <li
                key={entry.id}
                className="group flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`truncate ${RARITY_TEXT[entry.rarity] ?? 'text-ink'}`}>
                    {entry.name}
                  </span>
                  {entry.narrative && <Sparkles size={11} className="shrink-0 text-accent" />}
                </span>

                <span className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-ink-dim">
                  <span>{entry.affixCount} affixes</span>
                  <span className="text-ink-muted">score {entry.score}</span>
                  <span>{new Date(entry.capturedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
