import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, KeyRound, Loader2, PlugZap } from 'lucide-react';
// Imported from the dependency-free subpath, not the package root: the root
// pulls in the Anthropic SDK, which has no business in the renderer bundle.
import { presetFor, PROVIDER_PRESETS } from '@poe2/ai/presets';
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

/** Settings fields edited as free text. */
type TextKey = 'league' | 'characterClass' | 'ascendancy' | 'mainSkill' | 'goal' | 'aiCustomPrompt';

/** Of those, the ones whose empty value is `null` rather than `''`. */
const NULLABLE_KEYS = new Set<TextKey>(['characterClass', 'ascendancy', 'mainSkill', 'goal']);

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
  /** Uncommitted text edits, keyed by field. Absent means "use server value". */
  const [drafts, setDrafts] = useState<Partial<Record<TextKey, string>>>({});
  const [modelDraft, setModelDraft] = useState<string | undefined>(undefined);

  const settings = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => invoke('settings:get', null),
    staleTime: Infinity,
  });

  const test = useMutation({ mutationFn: () => invoke('ai:test', null) });

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

  /**
   * Text fields are edited locally and committed on blur.
   *
   * Writing on every keystroke fired one round trip per character, and since
   * each response carries the *whole* settings object, a reply computed before
   * a later keystroke would land after it and overwrite the newer value —
   * which looked like other fields clearing themselves as you typed.
   */
  const text = (key: TextKey) => ({
    value: drafts[key] ?? String(data[key] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDrafts((current) => ({ ...current, [key]: e.target.value })),
    onBlur: () => {
      const draft = drafts[key];
      if (draft === undefined) return;
      setDrafts(({ [key]: _dropped, ...rest }) => rest);
      if (draft === String(data[key] ?? '')) return; // nothing actually changed
      patch({ [key]: NULLABLE_KEYS.has(key) && draft.trim() === '' ? null : draft });
    },
  });
  const preset = presetFor(data.aiProvider);
  const configured = new Set(data.configuredProviders);
  const hasKey = configured.has(data.aiProvider);

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

        <Field label="Provider" hint={preset?.note}>
          <select
            value={data.aiProvider}
            onChange={(e) => {
              patch({ aiProvider: e.target.value });
              setApiKeyDraft('');
              setModelDraft(undefined); // the model field now shows another provider's value
            }}
            className={inputClass}
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {configured.has(p.id) ? ' · key saved' : ''}
                {!p.requiresKey ? ' · no key needed' : ''}
              </option>
            ))}
          </select>
        </Field>

        {preset?.requiresKey && (
          <Field
            label="API key"
            hint={
              hasKey
                ? 'A key is stored for this provider, encrypted by the operating system. Type a new one to replace it, or save an empty field to remove it.'
                : 'Stored encrypted via the OS keychain — it never reaches the interface layer once saved.'
            }
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                placeholder={hasKey ? '••••••••••••••••' : 'paste your key'}
                className={`flex-1 ${inputClass}`}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  patch({ setApiKey: { provider: data.aiProvider, key: apiKeyDraft } });
                  setApiKeyDraft('');
                }}
                className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-accent-soft"
              >
                {hasKey ? <Check size={14} /> : <KeyRound size={14} />}
                Save
              </button>
            </div>
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {preset && (
            <a
              href={preset.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-accent hover:underline"
            >
              {preset.requiresKey ? 'Get a key' : 'Setup instructions'}
              <ExternalLink size={12} />
            </a>
          )}

          <button
            type="button"
            disabled={test.isPending}
            onClick={() => test.mutate()}
            className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {test.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <PlugZap size={13} />
            )}
            Test connection
          </button>
        </div>

        {test.data?.ok && (
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-[12px] text-ink-muted">
            <div className="font-medium text-ink">
              Working — {test.data.value.model} answered in {test.data.value.elapsedMs}ms
            </div>
            <p className="selectable mt-1">{test.data.value.sample}</p>
          </div>
        )}

        {test.data && !test.data.ok && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <div className="text-[12px] font-medium text-red-200">
              {test.data.error.code}
            </div>
            {/* Selectable and unabbreviated: the provider's own words are what
                make a 400 diagnosable, so they must be copyable. */}
            <p className="selectable mt-1 font-mono text-[11px] break-words text-red-200/80">
              {test.data.error.message}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" hint={`Default: ${preset?.defaultModel ?? '—'}`}>
            <input
              // Same commit-on-blur treatment as the text fields, for the same
              // reason — this one writes a whole record, so per-keystroke
              // patches raced particularly badly.
              value={modelDraft ?? data.aiModelByProvider[data.aiProvider] ?? ''}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => {
                if (modelDraft === undefined) return;
                const next = modelDraft;
                setModelDraft(undefined);
                if (next === (data.aiModelByProvider[data.aiProvider] ?? '')) return;
                patch({
                  aiModelByProvider: { ...data.aiModelByProvider, [data.aiProvider]: next },
                });
              }}
              placeholder={preset?.defaultModel}
              className={inputClass}
              spellCheck={false}
            />
          </Field>

          {data.aiProvider === 'anthropic' && (
            <Field
              label="Effort"
              hint="Higher means deeper reasoning, more latency and more tokens."
            >
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
          )}
        </div>

        <Field
          label="Custom instructions"
          hint="Appended below the built-in rules, never in place of them."
        >
          <textarea
            {...text('aiCustomPrompt')}
            rows={8}
            className={`resize-y ${inputClass} font-mono text-[12px]`}
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
          <Field label="League" hint="Must match the league name in game.">
            <input {...text('league')} placeholder="Runes of Aldur" className={inputClass} />
          </Field>
          <Field label="Class">
            <input {...text('characterClass')} placeholder="Mercenary" className={inputClass} />
          </Field>
          <Field label="Ascendancy">
            <input
              {...text('ascendancy')}
              placeholder="Gemling Legionnaire"
              className={inputClass}
            />
          </Field>
          <Field label="Main skill">
            <input {...text('mainSkill')} placeholder="Explosive Shot" className={inputClass} />
          </Field>
          <Field label="Goal" hint="What you want from this build — the AI weighs items against it.">
            <input
              {...text('goal')}
              placeholder="Clear T15 maps safely on a budget"
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
