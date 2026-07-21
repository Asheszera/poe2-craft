import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import type { ItemAnalysis } from '@poe2/models';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';
import { IntentPicker } from './IntentPicker';

/**
 * Layer 2 of the pipeline: the model's explanation of the analysis above it.
 *
 * Rendered as an *addition*, never a replacement. Everything below this panel
 * is already on screen and correct before a request is made, so a missing key,
 * a rate limit or no connection costs the user nothing but this box.
 */
export function NarrativePanel({ analysis }: { analysis: ItemAnalysis }): React.JSX.Element {
  const setNarrative = useAppStore((s) => s.setNarrative);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const craftIntent = useAppStore((s) => s.craftIntent);
  const narrative = analysis.narrative;

  const narrate = useMutation({
    mutationFn: () =>
      invoke('ai:narrate', {
        raw: analysis.item.raw,
        craftIntent: craftIntent.trim() === '' ? null : craftIntent.trim(),
      }),
    onSuccess: (result) => {
      if (result.ok) setNarrative(analysis.item.raw, result.value);
    },
  });

  const failure = narrate.data && !narrate.data.ok ? narrate.data.error : null;
  const notConfigured = failure?.code === 'AI_NOT_CONFIGURED';

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <h2 className="text-[13px] font-semibold">AI explanation</h2>
        </div>
        {!narrative && (
          <button
            type="button"
            disabled={narrate.isPending}
            onClick={() => narrate.mutate()}
            className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {narrate.isPending && <Loader2 size={13} className="animate-spin" />}
            {narrate.isPending ? 'Thinking…' : 'Explain this item'}
          </button>
        )}
      </header>

      {narrative && (
        <div className="mt-4 flex flex-col gap-4 text-[13px] leading-relaxed">
          <p className="text-ink">{narrative.summary}</p>

          <div>
            <h3 className="mb-1 text-[10px] tracking-wider text-ink-dim uppercase">
              Craft recommendation
            </h3>
            <p className="text-ink-muted">{narrative.craftRecommendation}</p>
          </div>

          {narrative.steps.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] tracking-wider text-ink-dim uppercase">
                Step by step
              </h3>
              <ol className="flex flex-col gap-2">
                {narrative.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[10px] text-ink-muted">
                      {i + 1}
                    </span>
                    <span className="text-ink-muted">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {narrative.possibleUpgrades.length > 0 && (
            <div>
              <h3 className="mb-1 text-[10px] tracking-wider text-ink-dim uppercase">
                Possible upgrades
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-muted">
                {narrative.possibleUpgrades.map((upgrade, i) => (
                  <li key={i}>{upgrade}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <span className="text-[10px] tracking-wider text-ink-dim uppercase">Next</span>
            <p className="mt-0.5 text-ink">{narrative.nextBestAction}</p>
          </div>

          <div className="font-mono text-[10px] text-ink-dim">{narrative.model}</div>
        </div>
      )}

      {failure && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
          {failure.message}
          {notConfigured && (
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className="ml-2 text-accent hover:underline"
            >
              Open Settings
            </button>
          )}
        </div>
      )}

      {narrate.isError && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-200">
          {narrate.error.message}
        </div>
      )}

      {!narrative && (
        <div className="mt-4 flex flex-col gap-2">
          <h3 className="text-[10px] tracking-wider text-ink-dim uppercase">
            What do you want from this item?
          </h3>
          <IntentPicker />
        </div>
      )}

      {!narrative && !failure && !narrate.isPending && (
        <p className="mt-3 text-[12px] text-ink-dim">
          The analysis above is complete and computed locally. This adds a written explanation of
          it — it never changes the score or the advice.
        </p>
      )}
    </section>
  );
}
