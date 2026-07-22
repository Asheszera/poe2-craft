import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Target, X } from 'lucide-react';
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
  /** Each step is a currency, with an omen the player can attach or clear. */
  const [sequence, setSequence] = useState<{ currency: string; omen: string | null }[]>([]);

  const currencies = useQuery({
    queryKey: ['craft-currencies'],
    queryFn: () => invoke('craft:currencies', null),
    staleTime: Infinity,
  });

  const omens = useQuery({
    queryKey: ['craft-omens'],
    queryFn: () => invoke('craft:omens', null),
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
      <p className="-mt-2 text-[10px] leading-relaxed text-ink-dim">
        Omens that restrict a currency to one side or repeat it are computed here. Others — Whittling,
        Homogenising, Catalysing, essences, fossils — are real and the AI Craft Advisor plans with
        them, but their odds are not simulated. Ask the advisor for those.
      </p>

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

      {/* Sequence builder — add a currency, then optionally attach an omen. */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-ink-dim">Add currencies, applied in order</span>

        {currencies.isLoading ? (
          <Loader2 size={14} className="animate-spin text-ink-dim" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {currencies.data?.map((currency) => (
              <button
                key={currency.name}
                type="button"
                onClick={() => setSequence((s) => [...s, { currency: currency.name, omen: null }])}
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
          <ol className="mt-1 flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2">
            {sequence.map((step, index) => {
              // Only omens whose effect names this currency do anything to it.
              // Others are shown too, so the player has the freedom to try — the
              // simulation reports the pairing as no-effect if it does not fit.
              const compatible = (omens.data ?? []).filter((o) => o.appliesTo === step.currency);
              const others = (omens.data ?? []).filter((o) => o.appliesTo !== step.currency);
              const setOmen = (omen: string | null): void =>
                setSequence((s) => s.map((v, i) => (i === index ? { ...v, omen } : v)));

              return (
                <li key={index} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-ink-dim">{index + 1}.</span>
                  <span className="rounded bg-surface-3 px-2 py-1 text-ink">{step.currency}</span>

                  <span className="text-ink-dim">with</span>
                  <select
                    value={step.omen ?? ''}
                    onChange={(e) => setOmen(e.target.value === '' ? null : e.target.value)}
                    className="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none focus:border-accent/50"
                  >
                    <option value="">no omen</option>
                    {compatible.length > 0 && (
                      <optgroup label="affects this currency">
                        {compatible.map((o) => (
                          <option key={o.name} value={o.name} title={o.description}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label="no effect here">
                        {others.map((o) => (
                          <option key={o.name} value={o.name} title={o.description}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => setSequence((s) => s.filter((_, i) => i !== index))}
                    className="text-ink-dim hover:text-red-300"
                    title="Remove step"
                  >
                    <X size={11} />
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setSequence([])}
                className="text-[10px] text-ink-dim hover:text-ink"
              >
                clear all
              </button>
            </li>
          </ol>
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
