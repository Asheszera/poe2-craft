import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Loader2 } from 'lucide-react';
import type { SettingsPatch } from '@shared/settings';
import { invoke } from '@/lib/ipc';

const QUERY_KEY = ['settings'];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-ink">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-dim">{hint}</span>}
    </label>
  );
}

const inputClass =
  'rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-dim focus:border-accent/50';

/**
 * Settings.
 *
 * Every field writes through to the main process immediately — there is no
 * Save button and therefore no draft state to lose. The API key is the one
 * exception: it is write-only, so the field shows whether a key is stored but
 * never its value, because the renderer is never told it.
 */
export function SettingsView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const settings = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => invoke('settings:get', null),
    staleTime: Infinity,
  });

  const update = useMutation({
    mutationFn: (patch: SettingsPatch) => invoke('settings:update', patch),
    onSuccess: (result) => {
      if (result.ok) queryClient.setQueryData(QUERY_KEY, result.value);
    },
  });

  const data = settings.data;
  if (!data) {
    return (
      <div className="grid h-full place-items-center text-[13px] text-ink-dim">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  const patch = (values: SettingsPatch): void => update.mutate(values);
  const failure = update.data && !update.data.ok ? update.data.error : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-[15px] font-semibold">Settings</h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          Changes save as you make them. Nothing here is sent anywhere except the AI provider you
          configure.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-[12px] font-medium">AI provider</h2>

        <Field
          label="API key"
          hint={
            data.hasApiKey
              ? 'A key is stored, encrypted by the operating system. Type a new one to replace it, or save an empty field to remove it.'
              : 'Stored encrypted via the OS keychain — it never reaches the interface layer once saved.'
          }
        >
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={data.hasApiKey ? '••••••••••••••••' : 'sk-ant-…'}
              className={`flex-1 ${inputClass}`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => {
                patch({ apiKey: apiKeyDraft });
                setApiKeyDraft('');
              }}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-accent-soft"
            >
              {data.hasApiKey ? <Check size={14} /> : <KeyRound size={14} />}
              Save
            </button>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model">
            <input
              value={data.aiModel}
              onChange={(e) => patch({ aiModel: e.target.value })}
              className={inputClass}
              spellCheck={false}
            />
          </Field>

          <Field label="Effort" hint="Higher means deeper reasoning, more latency and more tokens.">
            <select
              value={data.aiEffort}
              onChange={(e) => patch({ aiEffort: e.target.value as typeof data.aiEffort })}
              className={inputClass}
            >
              {(['low', 'medium', 'high', 'xhigh', 'max'] as const).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Custom instructions"
          hint="Appended below the built-in rules, never in place of them."
        >
          <textarea
            value={data.aiCustomPrompt}
            onChange={(e) => patch({ aiCustomPrompt: e.target.value })}
            rows={3}
            className={`resize-none ${inputClass}`}
            placeholder="e.g. Answer in Portuguese. Assume a budget build."
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-[12px] font-medium">Character</h2>
        <p className="-mt-2 text-[11px] text-ink-dim">
          Used by the AI layer to judge whether an item suits your build. Leave blank if unsure.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="League">
            <input
              value={data.league}
              onChange={(e) => patch({ league: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Class">
            <input
              value={data.characterClass ?? ''}
              onChange={(e) => patch({ characterClass: e.target.value || null })}
              placeholder="Mercenary"
              className={inputClass}
            />
          </Field>
          <Field label="Ascendancy">
            <input
              value={data.ascendancy ?? ''}
              onChange={(e) => patch({ ascendancy: e.target.value || null })}
              placeholder="Gemling Legionnaire"
              className={inputClass}
            />
          </Field>
          <Field label="Main skill">
            <input
              value={data.mainSkill ?? ''}
              onChange={(e) => patch({ mainSkill: e.target.value || null })}
              placeholder="Explosive Shot"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {failure && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-200">
          {failure.message}
        </div>
      )}
    </div>
  );
}
