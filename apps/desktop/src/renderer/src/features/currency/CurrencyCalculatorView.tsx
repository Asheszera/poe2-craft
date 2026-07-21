import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REFERENCE_CURRENCY } from '@poe2/prices';
import { ArrowRight, Calculator, Loader2 } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

const inputClass =
  'rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50';

/** Formats a value without pretending to a precision the rate does not have. */
function amount(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString();
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Converts between currencies using the player's own rates.
 *
 * Everything is expressed through {@link REFERENCE_CURRENCY}, so two currencies
 * convert by dividing their values. Anything not in the table simply is not
 * offered — the calculator refuses to convert what it was never told, rather
 * than inventing a bridge rate.
 */
export function CurrencyCalculatorView(): React.JSX.Element {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => invoke('settings:get', null) });

  const [quantity, setQuantity] = useState('1');
  const [from, setFrom] = useState(REFERENCE_CURRENCY);
  const [to, setTo] = useState('');

  /** The reference currency is always available, at a rate of one by definition. */
  const rates = useMemo<Record<string, number>>(() => {
    const configured = settings.data?.currencyPrices ?? {};
    return { [REFERENCE_CURRENCY]: 1, ...configured };
  }, [settings.data]);

  const names = Object.keys(rates).sort((a, b) => (rates[b] ?? 0) - (rates[a] ?? 0));

  if (settings.isLoading) {
    return (
      <div className="grid h-full place-items-center text-ink-dim">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  const parsed = Number(quantity.replace(',', '.'));
  const fromRate = rates[from];
  const toRate = to === '' ? undefined : rates[to];
  const converted =
    Number.isFinite(parsed) && fromRate !== undefined && toRate !== undefined && toRate > 0
      ? (parsed * fromRate) / toRate
      : null;

  const onlyReference = names.length <= 1;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold">Currency Calculator</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          Converts using the rates you entered, expressed in {REFERENCE_CURRENCY}s.
        </p>
      </div>

      {onlyReference ? (
        <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-ink-muted">
          No exchange rates configured yet.{' '}
          <button
            type="button"
            onClick={() => setActiveView('settings')}
            className="text-accent hover:underline"
          >
            Add a couple in Settings
          </button>{' '}
          — one line like &ldquo;Divine Orb = 700&rdquo; is enough to make this useful.
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-dim">Amount</span>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                className={`w-24 ${inputClass}`}
              />
            </label>

            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] text-ink-dim">From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <ArrowRight size={16} className="mb-3 shrink-0 text-ink-dim" />

            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-[11px] text-ink-dim">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
                <option value="">Pick one…</option>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {converted !== null && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-5 text-center">
              <div className="text-[12px] text-ink-dim">
                {amount(parsed)} {from}
              </div>
              <div className="mt-1 text-3xl font-semibold text-ink">
                {amount(converted)} <span className="text-[14px] text-ink-muted">{to}</span>
              </div>
            </div>
          )}

          <section className="rounded-lg border border-line bg-surface">
            <header className="border-b border-line px-4 py-3 text-[12px] font-medium">
              Your rates
            </header>
            <ul className="divide-y divide-line">
              {names.map((name) => (
                <li key={name} className="flex justify-between px-4 py-2 text-[12px]">
                  <span className="text-ink-muted">{name}</span>
                  <span className="font-mono text-ink-dim">
                    {amount(rates[name] ?? 0)} {REFERENCE_CURRENCY}
                    {(rates[name] ?? 0) === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="flex items-start gap-2 text-[11px] text-ink-dim">
            <Calculator size={12} className="mt-0.5 shrink-0" />
            These are your own readings from the in-game exchange, not a live feed. Rates move —
            update them in Settings when they drift.
          </p>
        </>
      )}
    </div>
  );
}
