import type { ItemMod } from '@poe2/models';

/**
 * The affix budget, as slots rather than a number.
 *
 * "3 of 6 used" hides the thing that decides the craft: prefixes and suffixes
 * have independent halves, and three open suffixes with no open prefix is a
 * completely different item from one open on each side. Drawing them separately
 * makes the constraint visible before any advice is read.
 */
export function SlotBar({
  label,
  used,
  capacity,
  mods,
}: {
  label: string;
  used: number;
  capacity: number;
  mods: ItemMod[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] tracking-wider text-ink-dim uppercase">{label}</h3>
        <span className="font-mono text-[11px] text-ink-muted">
          {used} / {capacity}
        </span>
      </div>

      <div className="flex gap-1.5">
        {Array.from({ length: capacity }, (_, index) => {
          const mod = mods[index];
          return (
            <div
              key={index}
              title={mod ? `${mod.text}${mod.tier ? ` (T${mod.tier.value})` : ''}` : 'Open slot'}
              className={[
                'h-1.5 flex-1 rounded-full',
                mod ? 'bg-accent/70' : 'bg-surface-3',
              ].join(' ')}
            />
          );
        })}
      </div>

      <ul className="flex flex-col gap-1">
        {mods.map((mod, index) => (
          <li key={index} className="flex items-baseline gap-2 text-[12px]">
            <span className="truncate text-ink-muted">{mod.text.replace(/\n/g, ' / ')}</span>
            {mod.tier && (
              <span className="shrink-0 font-mono text-[10px] text-ink-dim">
                T{mod.tier.value}
                {mod.tier.total === null ? '' : `/${mod.tier.total}`}
              </span>
            )}
          </li>
        ))}
        {used < capacity && (
          <li className="text-[12px] text-ink-dim">
            {capacity - used} open — see what can still roll below
          </li>
        )}
      </ul>
    </div>
  );
}
