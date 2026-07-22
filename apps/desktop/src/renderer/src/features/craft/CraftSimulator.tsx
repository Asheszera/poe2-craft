import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, Target, X } from 'lucide-react';
import type { GoalSpecShape, PoolOption } from '@shared/ipc';
import { invoke } from '@/lib/ipc';

/**
 * A currency sequence, and the chance it reaches a chosen modifier.
 *
 * This is where the state machine surfaces: the player picks a goal and stacks
 * currencies, and the probability shown is conditional across the whole
 * sequence — each step planned against the pool the last one left, not a
 * per-currency guess (ADR-010). The numbers come from the main process, which
 * runs the simulator; nothing here computes a probability.
 */
export function CraftSimulator({
  raw,
  prefixes,
  suffixes,
}: {
  raw: string;
  prefixes: PoolOption[];
  suffixes: PoolOption[];
}): React.JSX.Element {
  const [goalKeys, setGoalKeys] = useState<string[]>([]);
  const [mode, setMode] = useState<'all' | 'any'>('all');
  const [sequence, setSequence] = useState<string[]>([]);

  const currencies = useQuery({
    queryKey: ['craft-currencies'],
    queryFn: () => invoke('craft:currencies', null),
    staleTime: Infinity,
  });

  // The available goals are the modifiers this base can roll. Keyed by template,
  // deduplicated across sides so the same modifier is not offered twice.
  const options = useMemo(() => {
    const seen = new Map<string, PoolOption>();
    for (const option of [...prefixes, ...suffixes]) {
      if (option.blockedBy === null && !seen.has(option.key)) seen.set(option.key, option);
    }
    return [...seen.values()].sort((a, b) => a.text.localeCompare(b.text));
  }, [prefixes, suffixes]);

  const goal: GoalSpecShape | null = useMemo(() => {
    const parts = goalKeys.map((key): GoalSpecShape => ({ kind: 'mod', key }));
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0] ?? null;
    return { kind: mode, of: parts };
  }, [goalKeys, mode]);

  const result = useQuery({
    queryKey: ['craft-simulate', raw, sequence, goal],
    queryFn: () => invoke('craft:simulate', { raw, sequence, goal: goal as GoalSpecShape }),
    enabled: goal !== null && sequence.length > 0,
    staleTime: Infinity,
  });

  const toggleGoal = (key: string): void =>
    setGoalKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-accent" />
        <h2 className="text-[12px] font-medium">Simulate a currency sequence</h2>
      </div>

      {/* Goal picker */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-dim">
            Goal — the modifier{goalKeys.length > 1 ? 's' : ''} you want
          </span>
          {goalKeys.length > 1 && (
            <div className="flex overflow-hidden rounded border border-line text-[10px]">
              {(['all', 'any'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2 py-0.5 transition-colors ${
                    mode === m ? 'bg-accent text-black' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {m === 'all' ? 'all of' : 'any of'}
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value=""
          onChange={(e) => e.target.value && toggleGoal(e.target.value)}
          className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/50"
        >
          <option value="">Add a target modifier…</option>
          {options.map((option) => (
            <option key={option.key} value={option.key} disabled={goalKeys.includes(option.key)}>
              {option.text}
              {option.chance !== null ? ` — ${pct(option.chance)} per roll` : ''}
            </option>
          ))}
        </select>

        {goalKeys.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {goalKeys.map((key) => {
              const option = options.find((o) => o.key === key);
              return (
                <span
                  key={key}
                  className="flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent"
                >
                  {option?.text ?? key}
                  <button type="button" onClick={() => toggleGoal(key)} className="hover:text-ink">
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Sequence builder */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-ink-dim">Currencies, applied in order</span>

        {currencies.isLoading ? (
          <Loader2 size={14} className="animate-spin text-ink-dim" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {currencies.data?.map((currency) => (
              <button
                key={currency.name}
                type="button"
                onClick={() => setSequence((s) => [...s, currency.name])}
                title={currency.description}
                className="flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                <Plus size={10} />
                {currency.name}
              </button>
            ))}
          </div>
        )}

        {sequence.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-2 p-2">
            {sequence.map((name, index) => (
              <span key={`${name}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <ArrowRight size={11} className="text-ink-dim" />}
                <span className="flex items-center gap-1 rounded bg-surface-3 px-2 py-1 text-[11px] text-ink">
                  {name}
                  <button
                    type="button"
                    onClick={() => setSequence((s) => s.filter((_, i) => i !== index))}
                    className="text-ink-dim hover:text-red-300"
                  >
                    <X size={10} />
                  </button>
                </span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSequence([])}
              className="ml-auto text-[10px] text-ink-dim hover:text-ink"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* Result */}
      {goal === null || sequence.length === 0 ? (
        <p className="text-[11px] text-ink-dim">
          Pick a goal and add at least one currency to see the odds.
        </p>
      ) : result.isLoading ? (
        <Loader2 size={16} className="animate-spin text-ink-dim" />
      ) : (
        result.data && <SimulationResult data={result.data} pct={pct} />
      )}
    </section>
  );
}

type SimResponse = Awaited<ReturnType<typeof invoke<'craft:simulate'>>>;

function SimulationResult({
  data,
  pct,
}: {
  data: SimResponse;
  pct: (n: number) => string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-ink-muted">Chance of {data.goalLabel}</span>
        <span className="text-2xl font-semibold text-accent">{pct(data.goalChance)}</span>
      </div>

      <ol className="flex flex-col gap-1">
        {data.steps.map((step, index) => (
          <li
            key={`${step.currency}-${index}`}
            className="flex items-center justify-between gap-3 text-[11px]"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-ink-dim">{index + 1}.</span>
              <span className={step.refusal ? 'text-red-300 line-through' : 'text-ink'}>
                {step.currency}
              </span>
              {step.refusal && <span className="text-red-300/80">— {step.refusal}</span>}
            </span>
            {!step.refusal && (
              <span className="font-mono text-ink-muted">{pct(step.goalChance)}</span>
            )}
          </li>
        ))}
      </ol>

      {/*
        The single honesty line the whole feature turns on: whether these are the
        game's own odds or the tier-density stand-in for a base without weights.
      */}
      <p className="text-[10px] leading-relaxed text-ink-dim">
        {data.weighted
          ? 'Conditional across the whole sequence, from the game’s published spawn weights. Each step is planned against the pool the previous one left.'
          : 'This base has no published spawn weights, so the odds assume every reachable modifier is equally likely — a rough estimate, not the game’s numbers.'}
      </p>
    </div>
  );
}
