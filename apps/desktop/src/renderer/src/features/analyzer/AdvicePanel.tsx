import type { CraftAction, DeterministicAnalysis } from '@poe2/models';
import { AlertTriangle, Check, Minus, TriangleAlert } from 'lucide-react';

/** Risk drives colour: destructive advice must never look like safe advice. */
const RISK_STYLE: Record<CraftAction['risk'], string> = {
  none: 'border-line',
  low: 'border-accent/40',
  medium: 'border-amber-500/40',
  high: 'border-orange-500/50',
  destructive: 'border-red-500/50',
};

const RISK_LABEL: Record<CraftAction['risk'], string> = {
  none: 'no risk',
  low: 'safe',
  medium: 'some risk',
  high: 'risky',
  destructive: 'can destroy the item',
};

function ScoreDial({ score }: { score: number }): React.JSX.Element {
  // Colour bands, not a gradient: a score should read as a verdict at a glance.
  const tone =
    score >= 75 ? 'text-accent' : score >= 50 ? 'text-amber-300' : 'text-ink-muted';

  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-3xl font-semibold tabular-nums ${tone}`}>{score}</span>
      <span className="text-[11px] text-ink-dim">/ 100</span>
    </div>
  );
}

function Recommendation({ rec }: { rec: CraftAction }): React.JSX.Element {
  return (
    <li className={`rounded-md border bg-surface-2 p-3 ${RISK_STYLE[rec.risk]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{rec.label}</span>
        <span className="shrink-0 font-mono text-[10px] text-ink-dim">{RISK_LABEL[rec.risk]}</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{rec.reasoning}</p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-ink-dim">
        <span>{rec.action}</span>
        {rec.successChance !== null && (
          <span>{Math.round(rec.successChance * 100)}% chance of hitting the weak affix</span>
        )}
        {/* Price data arrives with the trade adapters; saying so beats a blank. */}
        {rec.estimatedCost === null && <span>cost: needs price data</span>}
      </div>
    </li>
  );
}

/**
 * Layer 0 output: score, reasoning and crafting advice.
 *
 * Everything here is computed locally and deterministically — no network, no
 * model. The AI narrative will be appended below this panel, never in place of
 * it, so the advice remains available offline and without an API key.
 */
export function AdvicePanel({
  analysis,
}: {
  analysis: DeterministicAnalysis;
}): React.JSX.Element {
  const total = analysis.timings['total'];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold">Craft Advisor</h2>
          <p className="mt-0.5 text-[11px] text-ink-dim">
            Deterministic analysis · {total === undefined ? 'timed' : `${total}ms`}
          </p>
        </div>
        <ScoreDial score={analysis.score} />
      </header>

      {(analysis.strengths.length > 0 || analysis.weaknesses.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">Strengths</h3>
            <ul className="flex flex-col gap-1">
              {analysis.strengths.length === 0 && (
                <li className="flex gap-1.5 text-[12px] text-ink-dim">
                  <Minus size={13} className="mt-0.5 shrink-0" />
                  Nothing stands out
                </li>
              )}
              {analysis.strengths.map((text, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] text-ink-muted">
                  <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">Weaknesses</h3>
            <ul className="flex flex-col gap-1">
              {analysis.weaknesses.length === 0 && (
                <li className="flex gap-1.5 text-[12px] text-ink-dim">
                  <Minus size={13} className="mt-0.5 shrink-0" />
                  No clear weakness
                </li>
              )}
              {analysis.weaknesses.map((text, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] text-ink-muted">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-400/80" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">
          Next best action
        </h3>
        {analysis.recommendations.length === 0 ? (
          <div className="flex gap-2 rounded-md border border-line bg-surface-2 p-3 text-[12px] text-ink-dim">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            No rule matched this item. That is a gap in the rule set, not a verdict on the item.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {analysis.recommendations.map((rec, i) => (
              <Recommendation key={`${rec.action}-${i}`} rec={rec} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
