import type { CraftPlan } from '@poe2/models';
import { Coins, Dices, OctagonX, Route, Target } from 'lucide-react';

/**
 * How a route reaches the goal — the axis a player actually chooses on.
 *
 * Shown as a badge rather than buried in prose, because "guaranteed but
 * expensive" versus "cheap but a coin flip" is usually the whole decision.
 */
const APPROACH: Record<CraftPlan['approach'], { label: string; className: string; icon: typeof Target }> =
  {
    deterministic: {
      label: 'guaranteed',
      className: 'border-accent/40 text-accent',
      icon: Target,
    },
    gamble: { label: 'gamble', className: 'border-amber-500/40 text-amber-300', icon: Dices },
    hybrid: { label: 'mixed', className: 'border-line text-ink-muted', icon: Route },
  };

export function PlanCard({ plan, primary }: { plan: CraftPlan; primary: boolean }): React.JSX.Element {
  const approach = APPROACH[plan.approach];
  const Icon = approach.icon;

  return (
    <article
      className={[
        'rounded-lg border p-4',
        // The first route is the recommended one; the alternatives are present
        // but must not compete with it for attention.
        primary ? 'border-accent/30 bg-accent/5' : 'border-line bg-surface-2',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-medium text-ink">{plan.name}</h3>
        <span
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${approach.className}`}
        >
          <Icon size={10} />
          {approach.label}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-ink-dim">
          <Coins size={11} />
          {plan.estimatedCost}
        </span>
      </header>

      <ol className="mt-3 flex flex-col gap-2">
        {plan.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[10px] text-ink-muted">
              {i + 1}
            </span>
            <span className="text-ink-muted">{step}</span>
          </li>
        ))}
      </ol>

      <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[12px]">
        <div className="flex gap-2">
          <dt className="flex shrink-0 items-center gap-1 text-ink-dim">
            <Target size={11} /> Stop when
          </dt>
          <dd className="text-ink-muted">{plan.stopWhen}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex shrink-0 items-center gap-1 text-ink-dim">
            <OctagonX size={11} /> Give up if
          </dt>
          <dd className="text-ink-muted">{plan.abandonWhen}</dd>
        </div>
      </dl>
    </article>
  );
}
