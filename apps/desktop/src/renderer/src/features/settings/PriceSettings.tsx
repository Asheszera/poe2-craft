import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { REFERENCE_CURRENCY } from '@poe2/prices';

/**
 * Currency prices, entered by hand.
 *
 * No rate ships with the app and none is fetched. PoE2 has no public price feed
 * this app may rely on — the trade API needs an authenticated session and
 * rate-limits automated search, and poe.ninja serves its own browser
 * application rather than a documented feed. Anything invented here would be
 * indistinguishable from a real quote by the time it reached the advice, so the
 * player's own reading of the in-game exchange is both the most accurate source
 * available and the only traceable one.
 *
 * Two or three entries are enough to be useful: the advisor only needs to know
 * what the expensive steps cost relative to the cheap ones.
 */
const SUGGESTED = ['Divine Orb', 'Chaos Orb', 'Orb of Annulment', 'Regal Orb', 'Vaal Orb'];

const inputClass =
  'rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50';

export function PriceSettings({
  prices,
  onChange,
}: {
  prices: Record<string, number>;
  onChange: (prices: Record<string, number>) => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const add = (): void => {
    const parsed = Number(value.replace(',', '.'));
    if (name.trim().length === 0 || !Number.isFinite(parsed) || parsed <= 0) return;
    onChange({ ...prices, [name.trim()]: parsed });
    setName('');
    setValue('');
  };

  const remove = (currency: string): void => {
    onChange(Object.fromEntries(Object.entries(prices).filter(([key]) => key !== currency)));
  };

  const entries = Object.entries(prices).sort((a, b) => b[1] - a[1]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="text-[12px] font-medium">Currency prices</h2>
        <p className="mt-1 text-[11px] text-ink-dim">
          In {REFERENCE_CURRENCY}s, read from the in-game currency exchange. The advisor uses these
          to judge whether a step is worth its cost — without them it can still plan, but it will
          say costs are unknown rather than guess.
        </p>
      </div>

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {entries.map(([currency, amount]) => (
            <li
              key={currency}
              className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-1.5 text-[12px]"
            >
              <span className="text-ink">{currency}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-ink-muted">{amount}</span>
                <button
                  type="button"
                  onClick={() => remove(currency)}
                  className="text-ink-dim hover:text-red-300"
                  title={`Remove ${currency}`}
                >
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          list="currency-suggestions"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Divine Orb"
          className={`flex-1 ${inputClass}`}
          spellCheck={false}
        />
        <datalist id="currency-suggestions">
          {SUGGESTED.map((currency) => (
            <option key={currency} value={currency} />
          ))}
        </datalist>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder="700"
          inputMode="decimal"
          className={`w-28 ${inputClass}`}
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink transition-colors hover:bg-surface-3"
        >
          <Plus size={13} />
          Add
        </button>
      </div>
    </section>
  );
}
