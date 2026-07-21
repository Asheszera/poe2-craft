import { useMutation, useQuery } from '@tanstack/react-query';
import type { BuildVerdict } from '@poe2/models';
import { Boxes, Check, HelpCircle, Loader2, Minus, Sparkles, X } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

const VERDICT: Record<BuildVerdict['verdict'], { label: string; className: string }> = {
  equip: { label: 'Equip it', className: 'border-accent/50 bg-accent/10 text-accent' },
  craft: { label: 'Worth crafting', className: 'border-amber-500/40 bg-amber-500/5 text-amber-300' },
  sell: { label: 'Sell it', className: 'border-line bg-surface-2 text-ink-muted' },
  vendor: { label: 'Vendor it', className: 'border-line bg-surface-2 text-ink-dim' },
  unclear: { label: 'Not enough information', className: 'border-line bg-surface-2 text-ink-dim' },
};

/**
 * Does this item serve *your* build?
 *
 * The one screen whose score is not computed. Affix tiers and slot usage are
 * data; whether attack speed matters to Explosive Shot on a Gemling Legionnaire
 * is game knowledge no dataset here carries. So this number is the model's
 * judgement, labelled as such and deliberately kept apart from the
 * deterministic score — blending them would launder an opinion into a
 * measurement.
 */
export function BuildAdvisorView(): React.JSX.Element {
  const analysis = useAppStore((s) => s.currentAnalysis);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => invoke('settings:get', null) });

  const evaluate = useMutation({
    mutationFn: () => invoke('build:evaluate', { raw: analysis?.item.raw ?? '' }),
  });

  if (!analysis) {
    return (
      <div className="grid h-full place-items-center text-center text-[13px] text-ink-dim">
        <div>
          <Boxes size={36} strokeWidth={1.25} className="mx-auto mb-3 opacity-40" />
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

  const build = settings.data;
  const described = [build?.characterClass, build?.ascendancy, build?.mainSkill].filter(Boolean);
  const verdict = evaluate.data?.ok ? evaluate.data.value : null;
  const failure = evaluate.data && !evaluate.data.ok ? evaluate.data.error : null;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold">Build Advisor</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          {analysis.item.name ?? analysis.item.baseType} judged against your character.
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
        {described.length === 0 ? (
          <span className="text-[12px] text-ink-muted">
            No build configured — the verdict will be a guess.{' '}
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className="text-accent hover:underline"
            >
              Set your class and skill
            </button>
            .
          </span>
        ) : (
          described.map((value) => (
            <span
              key={value}
              className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted"
            >
              {value}
            </span>
          ))
        )}

        <button
          type="button"
          disabled={evaluate.isPending}
          onClick={() => evaluate.mutate()}
          className="ml-auto flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-accent-soft disabled:opacity-50"
        >
          {evaluate.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {verdict ? 'Judge again' : 'Does this fit my build?'}
        </button>
      </section>

      {verdict && (
        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          <header className="flex items-center justify-between gap-4">
            <span
              className={`rounded-full border px-3 py-1 text-[12px] font-medium ${VERDICT[verdict.verdict].className}`}
            >
              {VERDICT[verdict.verdict].label}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums text-ink">{verdict.score}</span>
              <span className="text-[11px] text-ink-dim">/ 100 fit</span>
            </div>
          </header>

          <p className="text-[13px] leading-relaxed text-ink-muted">{verdict.reasoning}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">
                What works
              </h3>
              <ul className="flex flex-col gap-1">
                {verdict.whatWorks.length === 0 && (
                  <li className="flex gap-1.5 text-[12px] text-ink-dim">
                    <Minus size={13} className="mt-0.5 shrink-0" />
                    Nothing on this item helps
                  </li>
                )}
                {verdict.whatWorks.map((text, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] text-ink-muted">
                    <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">
                What is missing
              </h3>
              <ul className="flex flex-col gap-1">
                {verdict.whatIsMissing.map((text, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] text-ink-muted">
                    <X size={13} className="mt-0.5 shrink-0 text-amber-400/80" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {verdict.assumptions.length > 0 && (
            <div className="rounded-md border border-line bg-surface-2 p-3">
              <h3 className="flex items-center gap-1.5 text-[10px] tracking-wider text-ink-dim uppercase">
                <HelpCircle size={11} />
                Assumed, not told
              </h3>
              <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-ink-muted">
                {verdict.assumptions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-line pt-3 text-[11px] text-ink-dim">
            This score is {verdict.model}&apos;s judgement about your build, not a measurement. The
            score in the Analyzer is computed from affix tiers and is a different thing.
          </p>
        </section>
      )}

      {failure && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] text-amber-200/90">
          {failure.message}
        </div>
      )}
    </div>
  );
}
