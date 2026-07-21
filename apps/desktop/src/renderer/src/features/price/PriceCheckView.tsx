import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HistoryEntry } from '@poe2/models';
import { REFERENCE_CURRENCY } from '@poe2/prices';
import { Check, Coins, Loader2, X } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';

const inputClass =
  'rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50';

const RARITY_TEXT: Record<string, string> = {
  Normal: 'text-rarity-normal',
  Magic: 'text-rarity-magic',
  Rare: 'text-rarity-rare',
  Unique: 'text-rarity-unique',
};

/** Inline editor for one entry's sale. */
function SaleEditor({
  entry,
  currencies,
  onSave,
  onCancel,
}: {
  entry: HistoryEntry;
  currencies: string[];
  onSave: (amount: number, currency: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [amount, setAmount] = useState(entry.soldFor === null ? '' : String(entry.soldFor));
  const [currency, setCurrency] = useState(entry.soldCurrency ?? REFERENCE_CURRENCY);

  const commit = (): void => {
    const parsed = Number(amount.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) onSave(parsed, currency);
  };

  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="0"
        inputMode="decimal"
        className={`w-20 ${inputClass}`}
      />
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className={`w-40 ${inputClass}`}
      >
        {currencies.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" onClick={commit} className="text-accent" title="Save">
        <Check size={13} />
      </button>
      <button type="button" onClick={onCancel} className="text-ink-dim" title="Cancel">
        <X size={13} />
      </button>
    </span>
  );
}

/**
 * What items actually sold for.
 *
 * Not a price lookup, and deliberately so: no public feed serves PoE2 item
 * prices in a way this app may rely on, and a screen that guessed at values
 * would be dressing invention as data. What a real buyer paid is the one price
 * signal that is unarguable — so the app records that instead, and the totals
 * are built from it.
 */
export function PriceCheckView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [editing, setEditing] = useState<number | null>(null);

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => invoke('settings:get', null) });
  const stats = useQuery({ queryKey: ['history-stats'], queryFn: () => invoke('history:stats', null) });
  const entries = useQuery({
    queryKey: ['history'],
    queryFn: () => invoke('history:list', { limit: 100, offset: 0 }),
  });

  const update = useMutation({
    mutationFn: (vars: { id: number; soldFor: number | null; soldCurrency: string | null }) =>
      invoke('history:update', vars),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['history'] });
      void queryClient.invalidateQueries({ queryKey: ['history-stats'] });
    },
  });

  if (!entries.data || !stats.data) {
    return (
      <div className="grid h-full place-items-center text-ink-dim">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  const currencies = [
    REFERENCE_CURRENCY,
    ...Object.keys(settings.data?.currencyPrices ?? {}).filter((c) => c !== REFERENCE_CURRENCY),
  ];
  const { sold, earned, unpricedSales } = stats.data;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold">Price Check</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          Record what your items sold for. There is no public price feed for PoE2 that this app can
          rely on, so what a buyer actually paid is the only price data here — and it is better than
          any estimate.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="text-[11px] tracking-wide text-ink-dim uppercase">Items sold</div>
          <div className="mt-1.5 text-2xl font-semibold">{sold}</div>
        </div>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <div className="text-[11px] tracking-wide text-ink-dim uppercase">Earned</div>
          <div className="mt-1.5 text-2xl font-semibold text-accent">
            {Math.round(earned).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-ink-dim">{REFERENCE_CURRENCY}s</div>
        </div>
        {unpricedSales > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="text-[11px] tracking-wide text-ink-dim uppercase">Not counted</div>
            <div className="mt-1.5 text-2xl font-semibold text-amber-300">{unpricedSales}</div>
            {/* Excluded rather than treated as zero: a sale in a currency with
                no configured rate is worth an unknown amount, not nothing. */}
            <div className="mt-1 text-[11px] text-ink-dim">
              sold in a currency with no rate —{' '}
              <button
                type="button"
                onClick={() => setActiveView('settings')}
                className="text-accent hover:underline"
              >
                add one
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-4 py-3 text-[12px] font-medium">
          Analysed items
        </header>

        {entries.data.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-dim">
            Nothing analysed yet.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {entries.data.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-baseline gap-2 text-[13px]">
                  <span className={`truncate ${RARITY_TEXT[entry.rarity] ?? 'text-ink'}`}>
                    {entry.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-dim">
                    score {entry.score}
                  </span>
                </span>

                {editing === entry.id ? (
                  <SaleEditor
                    entry={entry}
                    currencies={currencies}
                    onCancel={() => setEditing(null)}
                    onSave={(amount, currency) =>
                      update.mutate({ id: entry.id, soldFor: amount, soldCurrency: currency })
                    }
                  />
                ) : entry.soldFor !== null ? (
                  <span className="flex shrink-0 items-center gap-2 text-[12px]">
                    <span className="flex items-center gap-1 text-accent">
                      <Coins size={11} />
                      {entry.soldFor} {entry.soldCurrency}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(entry.id)}
                      className="text-[11px] text-ink-dim hover:text-ink"
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update.mutate({ id: entry.id, soldFor: null, soldCurrency: null })
                      }
                      className="text-[11px] text-ink-dim hover:text-red-300"
                    >
                      clear
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(entry.id)}
                    className="shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    Record sale
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
