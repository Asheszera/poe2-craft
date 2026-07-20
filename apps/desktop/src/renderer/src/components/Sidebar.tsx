import { useAppStore } from '@/app/store';
import { VIEWS } from '@/app/navigation';

/**
 * Fixed navigation rail. Mirrors the NVIDIA App layout: a compact brand block,
 * a flat list of sections with an accent bar marking the active one.
 */
export function Sidebar(): React.JSX.Element {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-md bg-accent/15 text-accent">
          <span className="text-sm font-bold tracking-tight">P2</span>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">PoE2 Assistant</div>
          <div className="text-[11px] text-ink-dim">AI Crafting Analysis</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 px-2">
        {VIEWS.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={[
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] transition-colors',
                isActive
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute left-0 h-5 w-0.5 rounded-r bg-accent transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
              <Icon
                size={17}
                strokeWidth={1.75}
                className={isActive ? 'text-accent' : 'text-current'}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="px-5 py-4 text-[11px] text-ink-dim">v0.1.0 · stage 2</div>
    </nav>
  );
}
