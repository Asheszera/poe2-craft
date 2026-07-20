import { Construction } from 'lucide-react';

/**
 * Placeholder for sections whose roadmap stage has not landed yet. Naming the
 * stage keeps the app honest about what exists instead of shipping a dead
 * button.
 */
export function ComingSoon({ label, stage }: { label: string; stage: number }): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm">
        <Construction size={36} strokeWidth={1.25} className="mx-auto mb-4 text-ink-dim" />
        <h1 className="text-[15px] font-semibold">{label}</h1>
        <p className="mt-2 text-[13px] text-ink-muted">
          Planned for stage {stage}. The navigation entry exists so the shape of the app is visible
          while the underlying package is built.
        </p>
      </div>
    </div>
  );
}
