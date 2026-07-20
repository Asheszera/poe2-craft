import type { ItemMod, ModCategory, ParsedItem, Rarity } from '@poe2/models';
import { affixBudget, affixMods, exceedsAffixBudget, intrinsicMods } from '@poe2/models';
import { AlertTriangle } from 'lucide-react';

const RARITY_TEXT: Record<Rarity, string> = {
  Normal: 'text-rarity-normal',
  Magic: 'text-rarity-magic',
  Rare: 'text-rarity-rare',
  Unique: 'text-rarity-unique',
  Currency: 'text-rarity-currency',
  Gem: 'text-rarity-currency',
  Quest: 'text-rarity-currency',
};

const MOD_ACCENT: Record<ModCategory, string> = {
  implicit: 'border-mod-implicit',
  explicit: 'border-mod-explicit',
  crafted: 'border-mod-crafted',
  enchant: 'border-mod-enchant',
  fractured: 'border-mod-fractured',
  rune: 'border-mod-rune',
  desecrated: 'border-mod-desecrated',
  sanctum: 'border-mod-sanctum',
  scourge: 'border-mod-scourge',
};

/** Within each group, order mirrors how the game stacks modifiers. */
const INTRINSIC_ORDER: ModCategory[] = ['enchant', 'implicit', 'rune', 'sanctum', 'scourge'];
const AFFIX_ORDER: ModCategory[] = ['explicit', 'crafted', 'fractured', 'desecrated'];

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="text-[10px] tracking-wide text-ink-dim uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}

/** Collects the non-null properties into label/value pairs for display. */
function statsOf(item: ParsedItem): { label: string; value: string }[] {
  const p = item.properties;
  const stats: { label: string; value: string }[] = [];
  const push = (label: string, value: string | number | null): void => {
    if (value !== null && value !== '') stats.push({ label, value: String(value) });
  };

  if (p.physicalDamage) push('Physical', `${p.physicalDamage.min}-${p.physicalDamage.max}`);
  for (const e of p.elementalDamage) {
    push(e.element ? `${e.element} dmg` : 'Elemental', `${e.min}-${e.max}`);
  }
  if (p.chaosDamage) push('Chaos', `${p.chaosDamage.min}-${p.chaosDamage.max}`);
  push('Crit', p.criticalChance === null ? null : `${p.criticalChance}%`);
  push('Attacks/s', p.attacksPerSecond);
  push('Armour', p.armour);
  push('Evasion', p.evasion);
  push('Energy Shield', p.energyShield);
  push('Block', p.block === null ? null : `${p.block}%`);
  push('Spirit', p.spirit);
  push('Quality', p.quality === null ? null : `+${p.quality}%`);
  push('Item Level', item.itemLevel);
  push('Sockets', item.sockets > 0 ? item.sockets : null);
  push('Waystone Tier', p.waystoneTier);
  if (p.stackSize) push('Stack', `${p.stackSize.current}/${p.stackSize.max}`);

  return stats;
}

function ModRow({ mod }: { mod: ItemMod }): React.JSX.Element {
  return (
    <li className={`selectable border-l-2 py-1 pl-3 text-[13px] ${MOD_ACCENT[mod.category]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-ink">{mod.text}</span>
        {!mod.matched && (
          <span
            title="No modifier with this text exists in the game's stat list."
            className="shrink-0 rounded border border-amber-500/40 px-1 text-[9px] tracking-wide text-amber-300/90 uppercase"
          >
            unknown
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-ink-dim">
        {mod.affixType !== 'unknown' && (
          <span className="rounded bg-surface-3 px-1 text-ink-muted uppercase">
            {mod.affixType === 'prefix' ? 'P' : 'S'}
          </span>
        )}
        {mod.tier ? (
          <span
            className="text-ink-muted"
            title={
              mod.tier.confidence === 'ambiguous'
                ? 'Several tiers overlap this roll; showing the best one.'
                : 'Uniquely resolved against the modifier table.'
            }
          >
            {mod.tier.name && `${mod.tier.name} · `}T{mod.tier.value}
            {mod.tier.total !== null && `/${mod.tier.total}`}
            {mod.tier.confidence === 'ambiguous' && '?'}
          </span>
        ) : (
          mod.matched && <span>tier unresolved</span>
        )}
        <span>{mod.statId}</span>
        {mod.values.length > 0 && <span>[{mod.values.join(', ')}]</span>}
      </div>
    </li>
  );
}

/**
 * One modifier group, rendered only if it has content.
 *
 * `title` carries the group's meaning (affix budget vs. intrinsic) while the
 * per-category subheadings preserve provenance.
 */
function ModGroup({
  title,
  hint,
  order,
  mods,
}: {
  title: string;
  hint?: string | undefined;
  order: ModCategory[];
  mods: ItemMod[];
}): React.JSX.Element | null {
  if (mods.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 border-b border-line pb-1">
        <h3 className="text-[11px] font-medium tracking-wide text-ink uppercase">{title}</h3>
        {hint && <span className="font-mono text-[11px] text-ink-dim">{hint}</span>}
      </div>

      <div className="flex flex-col gap-3">
        {order.map((category) => {
          const inCategory = mods.filter((m) => m.category === category);
          if (inCategory.length === 0) return null;
          return (
            <div key={category}>
              <h4 className="mb-1.5 text-[10px] tracking-wider text-ink-dim uppercase">
                {category}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {inCategory.map((mod, i) => (
                  <ModRow key={`${mod.statId}-${i}`} mod={mod} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Renders a `ParsedItem` exactly as parsed — no interpretation, no scoring.
 *
 * At this stage the card doubles as the parser's debugging surface: every
 * modifier shows its derived `statId` and captured values, and unattributed
 * lines are called out instead of hidden.
 */
export function ItemCard({ item }: { item: ParsedItem }): React.JSX.Element {
  const stats = statsOf(item);
  const flags = Object.entries(item.flags)
    .filter(([, on]) => on)
    .map(([name]) => name);

  const affixes = affixMods(item);
  const intrinsics = intrinsicMods(item);
  const budget = affixBudget(item.rarity);
  const overBudget = exceedsAffixBudget(item);
  const unknownMods = item.mods.filter((mod) => !mod.matched);

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5">
      <header>
        <div className="flex items-baseline gap-2">
          <h2 className={`selectable text-lg font-semibold ${RARITY_TEXT[item.rarity]}`}>
            {item.name ?? item.baseType}
          </h2>
          <span className="text-[11px] text-ink-dim">{item.rarity}</span>
        </div>
        {item.name && (
          <div className={`selectable text-sm ${RARITY_TEXT[item.rarity]} opacity-80`}>
            {item.baseType}
          </div>
        )}
        {item.itemClass && <div className="mt-1 text-[11px] text-ink-dim">{item.itemClass}</div>}
      </header>

      {stats.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {stats.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      )}

      <ModGroup
        title="Intrinsic"
        hint={intrinsics.length > 0 ? 'does not use affix slots' : undefined}
        order={INTRINSIC_ORDER}
        mods={intrinsics}
      />

      <ModGroup
        title="Affixes"
        hint={[
          budget === null ? `${affixes.length}` : `${affixes.length} / ${budget}`,
          // Prefix/suffix have independent halves of the budget, so the split
          // matters more than the total when deciding what can still be added.
          `${affixes.filter((m) => m.affixType === 'prefix').length}P`,
          `${affixes.filter((m) => m.affixType === 'suffix').length}S`,
        ].join(' · ')}
        order={AFFIX_ORDER}
        mods={affixes}
      />

      {overBudget && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">More affixes than the game allows</div>
            <div className="mt-0.5 text-amber-200/70">
              A {item.rarity.toLowerCase()} item cannot roll more than {budget}. Some line is very
              likely being misread as a modifier — please report this item.
            </div>
          </div>
        </div>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <span
              key={flag}
              className="rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {item.note && <div className="text-[12px] text-ink-muted">Note: {item.note}</div>}

      {unknownMods.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">
              {unknownMods.length} line{unknownMods.length > 1 ? 's' : ''} match no known modifier
            </div>
            <div className="mt-0.5 text-amber-200/70">
              GGG&apos;s stat list is exhaustive, so these are most likely not modifiers at all —
              probably properties or descriptions read as one.
            </div>
            <ul className="selectable mt-1.5 font-mono text-[11px] text-amber-200/70">
              {unknownMods.map((mod, i) => (
                <li key={i}>{mod.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {item.unparsedLines.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Lines the parser could not attribute</div>
            <ul className="selectable mt-1 font-mono text-[11px] text-amber-200/70">
              {item.unparsedLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}
