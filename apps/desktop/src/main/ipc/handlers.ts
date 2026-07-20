import { app, clipboard } from 'electron';
import type { AnalysisContext } from '@poe2/models';
import { createProvider } from '@poe2/ai';
import { appError, err } from '@poe2/shared';
import { analyzeText } from '../analysis/pipeline.js';
import type { ClipboardWatcher } from '../clipboard/watcher.js';
import type { SettingsStore } from '../settings/store.js';
import type { IpcHandlers } from './registry.js';
import { serializeResult } from './registry.js';

export interface HandlerDeps {
  readonly watcher: ClipboardWatcher;
  readonly settings: SettingsStore;
}

/** The analysis context the prompt and rules see, drawn from user settings. */
const contextFrom = (settings: SettingsStore): AnalysisContext => {
  const s = settings.settings;
  return {
    league: s.league,
    characterClass: s.characterClass,
    ascendancy: s.ascendancy,
    mainSkill: s.mainSkill,
    goal: s.goal,
  };
};

/**
 * Handler implementations.
 *
 * Built through a factory so collaborators are injected rather than reached for
 * through module scope — `main/index.ts` stays the only place that wires the
 * application together. Handlers remain thin adapters; anything with real logic
 * lives in a package and is tested without Electron.
 */
export const createHandlers = ({ watcher, settings }: HandlerDeps): IpcHandlers => ({
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

  'ai:narrate': async ({ raw }) => {
    const apiKey = settings.apiKey();
    if (apiKey === null) {
      return serializeResult(
        err(appError('AI_NOT_CONFIGURED', 'Add an API key in Settings to enable AI analysis.')),
      );
    }

    // Re-derived here, not accepted from the renderer: the model must only ever
    // explain an analysis this process computed.
    const analysis = analyzeText(raw);
    if (!analysis.ok) return serializeResult(analysis);

    const s = settings.settings;
    const provider = createProvider(s.aiProvider, {
      apiKey,
      model: s.aiModel,
      effort: s.aiEffort,
      extraInstructions: s.aiCustomPrompt,
    });
    if (!provider.ok) return serializeResult(provider);

    const narrated = await provider.value.narrate({
      item: analysis.value.item,
      deterministic: analysis.value.deterministic,
      context: contextFrom(settings),
    });

    return narrated.ok
      ? { ok: true, value: narrated.value.narrative }
      : serializeResult(narrated);
  },
});
