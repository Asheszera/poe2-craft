import { app, clipboard } from 'electron';
import type { AnalysisContext } from '@poe2/models';
import { createProvider, presetFor, type AIDebugEvent, type NarrativeResponse } from '@poe2/ai';
import { appError, err, type Result } from '@poe2/shared';
import { analyzeText } from '../analysis/pipeline.js';
import type { ClipboardWatcher } from '../clipboard/watcher.js';
import type { SettingsStore } from '../settings/store.js';
import type { IpcHandlers } from './registry.js';
import { serializeResult } from './registry.js';

export interface HandlerDeps {
  readonly watcher: ClipboardWatcher;
  readonly settings: SettingsStore;
  /** Traces provider traffic to the terminal. Development only. */
  readonly aiDebug?: ((event: AIDebugEvent) => void) | undefined;
}

/**
 * The analysis context the prompt and rules see.
 *
 * Build-level fields come from settings; the craft intent arrives per request,
 * because it is a property of the item in front of the player, not of the
 * character.
 */
const contextFrom = (settings: SettingsStore, craftIntent: string | null): AnalysisContext => {
  const s = settings.settings;
  return {
    league: s.league,
    characterClass: s.characterClass,
    ascendancy: s.ascendancy,
    mainSkill: s.mainSkill,
    goal: s.goal,
    craftIntent,
  };
};

/**
 * The one path from raw item text to a narrative.
 *
 * Shared by `ai:narrate` and `ai:test` so the connection test exercises exactly
 * the code the real feature uses — a test that takes a different route can pass
 * while the feature is broken, which is worse than having no test button.
 */
async function narrateWith(
  settings: SettingsStore,
  aiDebug: ((event: AIDebugEvent) => void) | undefined,
  raw: string,
  craftIntent: string | null,
): Promise<Result<NarrativeResponse>> {
  const s = settings.settings;
  const preset = presetFor(s.aiProvider);
  const apiKey = settings.apiKey(s.aiProvider);

  // Local runtimes (Ollama, LM Studio) need no credential at all.
  if (preset?.requiresKey !== false && apiKey === null) {
    return err(
      appError(
        'AI_NOT_CONFIGURED',
        `Add an API key for ${preset?.label ?? s.aiProvider} in Settings.`,
      ),
    );
  }

  // Re-derived here, not accepted from the renderer: the model must only ever
  // explain an analysis this process computed.
  const analysis = analyzeText(raw);
  if (!analysis.ok) return analysis;

  const provider = createProvider(s.aiProvider, {
    apiKey: apiKey ?? '',
    model: s.aiModelByProvider[s.aiProvider] ?? '',
    baseUrl: s.aiBaseUrlByProvider[s.aiProvider] ?? '',
    effort: s.aiEffort,
    extraInstructions: s.aiCustomPrompt,
    debug: aiDebug,
  });
  if (!provider.ok) return provider;

  return provider.value.narrate({
    item: analysis.value.item,
    deterministic: analysis.value.deterministic,
    context: contextFrom(settings, craftIntent),
  });
}

/**
 * Handler implementations.
 *
 * Built through a factory so collaborators are injected rather than reached for
 * through module scope — `main/index.ts` stays the only place that wires the
 * application together. Handlers remain thin adapters; anything with real logic
 * lives in a package and is tested without Electron.
 */
export const createHandlers = ({ watcher, settings, aiDebug }: HandlerDeps): IpcHandlers => ({
  'app:info': () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron ?? 'unknown',
  }),

  'item:parse': ({ raw }) => serializeResult(analyzeText(raw)),

  'clipboard:parse': () => serializeResult(analyzeText(clipboard.readText())),

  'clipboard:getWatch': () => ({ enabled: watcher.isRunning }),

  'clipboard:setWatch': ({ enabled }) => {
    watcher.setEnabled(enabled);
    return { enabled: watcher.isRunning };
  },

  'settings:get': () => settings.view(),

  'settings:update': (patch) => {
    try {
      const view = settings.update(patch);
      // Keep the watcher in step with the setting that controls it.
      if (patch.clipboardWatch !== undefined) watcher.setEnabled(patch.clipboardWatch);
      return { ok: true, value: view };
    } catch (error) {
      return serializeResult(
        err(appError('UNKNOWN', error instanceof Error ? error.message : 'Could not save settings.')),
      );
    }
  },

  /** A known-good item, so a failure can only be the provider configuration. */
  'ai:test': async () => {
    const probe = await narrateWith(
      settings,
      aiDebug,
      `Item Class: Gloves
Rarity: Rare
Connection Test
Expert Vaal Gauntlets
--------
Item Level: 82
--------
+120 to maximum Life
+45% to Fire Resistance
`,
      'This is a connection test. Answer briefly.',
    );

    if (!probe.ok) return serializeResult(probe);
    return {
      ok: true,
      value: {
        provider: settings.settings.aiProvider,
        model: probe.value.narrative.model,
        elapsedMs: probe.value.elapsedMs,
        sample: probe.value.narrative.summary,
      },
    };
  },

  'ai:narrate': async ({ raw, craftIntent }) => {
    const narrated = await narrateWith(settings, aiDebug, raw, craftIntent);
    return narrated.ok
      ? { ok: true, value: narrated.value.narrative }
      : serializeResult(narrated);
  },
});
