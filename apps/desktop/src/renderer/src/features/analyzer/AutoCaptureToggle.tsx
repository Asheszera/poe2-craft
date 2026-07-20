import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { invoke } from '@/lib/ipc';

const QUERY_KEY = ['clipboard-watch'];

/**
 * Switch for the background clipboard watcher.
 *
 * The watcher reads the clipboard continuously, so it gets a visible, always
 * reachable control rather than being buried in Settings — the user should
 * never have to wonder whether the app is currently watching.
 */
export function AutoCaptureToggle(): React.JSX.Element {
  const queryClient = useQueryClient();

  const state = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => invoke('clipboard:getWatch', null),
    staleTime: Infinity,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => invoke('clipboard:setWatch', { enabled }),
    onSuccess: (result) => queryClient.setQueryData(QUERY_KEY, result),
  });

  const enabled = state.data?.enabled ?? false;

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!enabled)}
      disabled={state.isLoading || toggle.isPending}
      title={
        enabled
          ? 'Watching the clipboard. Copy an item in game to import it.'
          : 'Auto-capture is off. Use the buttons below.'
      }
      className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-muted transition-colors hover:bg-surface-3 disabled:opacity-50"
    >
      <Radio
        size={13}
        className={enabled ? 'animate-pulse text-accent' : 'text-ink-dim'}
        strokeWidth={2}
      />
      Auto-capture
      <span
        className={[
          'relative h-3.5 w-6 rounded-full transition-colors',
          enabled ? 'bg-accent' : 'bg-surface-3',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 size-2.5 rounded-full bg-white transition-all',
            enabled ? 'left-3' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
