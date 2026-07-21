import { CRAFT_INTENTS } from '@poe2/ai/intents';
import { useAppStore } from '@/app/store';

/**
 * "What do you want from this item?"
 *
 * Presets first, free text second. While playing, the answer is usually one of
 * a handful of things and typing a sentence per captured item would defeat the
 * point of a two-second workflow — but the free field stays, because the
 * interesting cases are the ones no preset anticipates.
 */
export function IntentPicker(): React.JSX.Element {
  const craftIntent = useAppStore((s) => s.craftIntent);
  const setCraftIntent = useAppStore((s) => s.setCraftIntent);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_INTENTS.map((intent) => {
          const selected = craftIntent === intent.text;
          return (
            <button
              key={intent.id}
              type="button"
              title={intent.text}
              onClick={() => setCraftIntent(selected ? '' : intent.text)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                selected
                  ? 'border-accent/60 bg-accent/15 text-ink'
                  : 'border-line bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink',
              ].join(' ')}
            >
              {intent.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={craftIntent}
        onChange={(e) => setCraftIntent(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="…or describe it yourself: “I want this weapon at the highest DPS possible without spending much”"
        className="selectable resize-none rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50"
      />
    </div>
  );
}
