import { useMutation } from '@tanstack/react-query';
import { ClipboardPaste, Loader2, ScanSearch } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { useAppStore } from '@/app/store';
import { AdvicePanel } from './AdvicePanel';
import { AutoCaptureToggle } from './AutoCaptureToggle';
import { ItemCard } from './ItemCard';
import { NarrativePanel } from './NarrativePanel';

/**
 * Manual analysis flow.
 *
 * Retained alongside auto-capture on purpose: it is how the parser gets
 * debugged against odd items, and it is the fallback whenever the watcher is
 * off. Both flows write to the same store slot, so the result panel does not
 * care which one produced the item.
 */
export function AnalyzerView(): React.JSX.Element {
  const raw = useAppStore((s) => s.pasteBuffer);
  const setRaw = useAppStore((s) => s.setPasteBuffer);
  const analysis = useAppStore((s) => s.currentAnalysis);
  const error = useAppStore((s) => s.currentError);
  const setCurrentAnalysis = useAppStore((s) => s.setCurrentAnalysis);
  const setCurrentError = useAppStore((s) => s.setCurrentError);

  const analyze = useMutation({
    mutationFn: async (input: { source: 'text' | 'clipboard'; raw: string }) =>
      input.source === 'clipboard'
        ? invoke('clipboard:parse', null)
        : invoke('item:parse', { raw: input.raw }),
    onSuccess: (result) => {
      if (result.ok) {
        // The paste box is refreshed by the store — see `setCurrentAnalysis`.
        setCurrentAnalysis(result.value);
      } else {
        setCurrentError(result.error);
      }
    },
  });

  const busy = analyze.isPending;

  return (
    <div className="grid h-full grid-cols-[minmax(340px,420px)_1fr] gap-5 overflow-hidden">
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold">Item Analyzer</h1>
            <p className="mt-1 text-[12px] text-ink-muted">
              With auto-capture on, copying an item in game imports it here automatically.
            </p>
          </div>
          <AutoCaptureToggle />
        </div>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          placeholder={'Item Class: Two Hand Maces\nRarity: Rare\n…'}
          className="selectable min-h-0 flex-1 resize-none rounded-lg border border-line bg-surface p-3 font-mono text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50"
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => analyze.mutate({ source: 'clipboard', raw: '' })}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-black transition-colors hover:bg-accent-soft disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ClipboardPaste size={15} />}
            Read clipboard
          </button>
          <button
            type="button"
            disabled={busy || raw.trim().length === 0}
            onClick={() => analyze.mutate({ source: 'text', raw })}
            className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface-2 px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-surface-3 disabled:opacity-40"
          >
            <ScanSearch size={15} />
            Parse text
          </button>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {analysis && (
          <>
            <AdvicePanel analysis={analysis.deterministic} />
            <NarrativePanel key={`ai-${analysis.item.raw}`} analysis={analysis} />
            <ItemCard key={analysis.item.raw} item={analysis.item} />
          </>
        )}

        {error && !analysis && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="font-mono text-[11px] text-red-300/70">{error.code}</div>
            <div className="mt-1 text-[13px] text-red-200">{error.message}</div>
          </div>
        )}

        {analyze.isError && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-200">
            {analyze.error.message}
          </div>
        )}

        {!analysis && !error && !analyze.isError && (
          <div className="grid h-full place-items-center text-center text-[13px] text-ink-dim">
            <div>
              <ScanSearch size={36} strokeWidth={1.25} className="mx-auto mb-3 opacity-40" />
              No item analysed yet.
              <div className="mt-1 text-[12px]">Copy an item in game to import it.</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
