import { VIEWS } from '@/app/navigation';
import { useAppStore } from '@/app/store';

/**
 * Custom title bar.
 *
 * The native window buttons are still drawn by Windows through
 * `titleBarOverlay`, so this only needs to provide the drag region and the
 * contextual heading — hence the right padding reserved for the real controls.
 */
export function TitleBar(): React.JSX.Element {
  const activeView = useAppStore((s) => s.activeView);
  const current = VIEWS.find((v) => v.id === activeView);

  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-base pr-36 pl-5"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-ink-dim">PoE2 AI Assistant</span>
        <span className="text-ink-dim">/</span>
        <span className="text-ink-muted">{current?.label}</span>
      </div>
    </header>
  );
}
