import { app, clipboard } from 'electron';
import type { AnalysisContext, ItemAnalysis } from '@poe2/models';
import {
  createProvider,
  presetFor,
  type AIDebugEvent,
  type AIProvider,
  type NarrativeResponse,
} from '@poe2/ai';
import { defaultModPool } from '@poe2/data';
import { modelledCurrencies, modelledOmens, runSimulation, goals } from '@poe2/craft';
import { canonicalTemplate } from '@poe2/shared';
import type { PriceTable } from '@poe2/prices';
import { appError, err, type Result } from '@poe2/shared';
import { analyzeText } from '../analysis/pipeline.js';
import type { ClipboardWatcher } from '../clipboard/watcher.js';
import type { HistoryRepository } from '../history/repository.js';
import type { HotkeyRegistry } from '../hotkey/registry.js';
import type { SettingsStore } from '../settings/store.js';
import type { IpcHandlers } from './registry.js';
import { serializeResult } from './registry.js';

export interface HandlerDeps {
  readonly watcher: ClipboardWatcher;
  readonly settings: SettingsStore;
  readonly history: HistoryRepository;
  /** Absent in tests, which do not register operating-system shortcuts. */
  readonly hotkeys?: HotkeyRegistry | undefined;
  /** Traces provider traffic to the terminal. Development only. */
  readonly aiDebug?: ((event: AIDebugEvent) => void) | undefined;
  /** Toggles the overlay's click-through. Wired only when an overlay exists. */
  readonly setOverlayInteractive?: ((interactive: boolean) => void) | undefined;
  /** Brings the main window forward, e.g. when the overlay is clicked. */
  readonly openMainWindow?: (() => void) | undefined;
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
 * Persists a successful analysis, and lets a storage failure pass.
 *
 * History is a record of work, not a precondition for it: a locked database or
 * a full disk must not stop the player seeing their item. The analysis is
 * returned either way and the failure is logged rather than surfaced.
 */
export function recordAnalysis(
  history: HistoryRepository,
  analysis: Result<ItemAnalysis>,
): Result<ItemAnalysis> {
  if (!analysis.ok) return analysis;

  try {
    history.save(analysis.value);
  } catch (error) {
    console.error('[history] could not store the analysis', error);
  }
  return analysis;
}

/**
 * The one path from raw item text to a narrative.
 *
 * Shared by `ai:narrate` and `ai:test` so the connection test exercises exactly
 * the code the real feature uses — a test that takes a different route can pass
 * while the feature is broken, which is worse than having no test button.
 */
function providerFor(
  settings: SettingsStore,
  aiDebug: ((event: AIDebugEvent) => void) | undefined,
): Result<AIProvider> {
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

  return createProvider(s.aiProvider, {
    apiKey: apiKey ?? '',
    model: s.aiModelByProvider[s.aiProvider] ?? '',
    baseUrl: s.aiBaseUrlByProvider[s.aiProvider] ?? '',
    effort: s.aiEffort,
    extraInstructions: s.aiCustomPrompt,
    debug: aiDebug,
  });
}

async function narrateWith(
  settings: SettingsStore,
  aiDebug: ((event: AIDebugEvent) => void) | undefined,
  raw: string,
  craftIntent: string | null,
): Promise<Result<NarrativeResponse>> {
  const provider = providerFor(settings, aiDebug);
  if (!provider.ok) return provider;

  // Re-derived here, not accepted from the renderer: the model must only ever
  // explain an analysis this process computed.
  const analysis = analyzeText(raw);
  if (!analysis.ok) return analysis;

  return provider.value.narrate({
    item: analysis.value.item,
    deterministic: analysis.value.deterministic,
    context: contextFrom(settings, craftIntent),
    prices: priceTableFrom(settings),
  });
}

/**
 * The player's own price list, as a table.
 *
 * Built from settings rather than fetched: no public endpoint serves PoE2
 * currency prices in a way this app may rely on (the trade API needs an
 * authenticated session and rate-limits automated search; poe.ninja serves its
 * browser application, not a documented feed). Whatever the player types is
 * therefore the most trustworthy source available — and it is traceable, which
 * a scraped number would not be.
 */
function priceTableFrom(settings: SettingsStore): PriceTable {
  const s = settings.settings;
  return {
    league: s.league,
    source: 'Entered manually',
    updatedAt: new Date().toISOString(),
    entries: Object.entries(s.currencyPrices).map(([currency, value]) => ({ currency, value })),
  };
}

/**
 * Handler implementations.
 *
 * Built through a factory so collaborators are injected rather than reached for
 * through module scope — `main/index.ts` stays the only place that wires the
 * application together. Handlers remain thin adapters; anything with real logic
 * lives in a package and is tested without Electron.
 */
export const createHandlers = ({
  watcher,
  settings,
  history,
  hotkeys,
  aiDebug,
  setOverlayInteractive,
  openMainWindow,
}: HandlerDeps): IpcHandlers => ({
  'overlay:setInteractive': ({ interactive }) => {
    setOverlayInteractive?.(interactive);
    return null;
  },

  'overlay:open': () => {
    openMainWindow?.();
    return null;
  },

  'craft:pool': ({ raw }) => {
    const analysis = analyzeText(raw);
    if (!analysis.ok) {
      return {
        known: false,
        baseType: '',
        itemLevel: null,
        prefix: [],
        suffix: [],
        chanceBasis: 'tiers',
        present: [],
      };
    }

    const { item } = analysis.value;
    const pool = defaultModPool();
    const present = item.mods.map((mod) => canonicalTemplate(mod.template));
    // The item's own modifiers are part of the question, not an afterthought:
    // each one closes its exclusion group, and an option in a closed group is
    // not an option.
    const options = pool.options(item.baseType, item.itemLevel, present);

    return {
      known: pool.knows(item.baseType),
      baseType: item.baseType,
      itemLevel: item.itemLevel,
      prefix: options.prefix,
      suffix: options.suffix,
      chanceBasis: options.chanceBasis,
      present,
    };
  },

  'craft:currencies': () => modelledCurrencies().map((c) => ({ ...c })),

  'craft:omens': () => modelledOmens().map((o) => ({ ...o })),

  'craft:simulate': ({ raw, sequence, goal }) => {
    const analysis = analyzeText(raw);
    if (!analysis.ok) {
      return { goalChance: 0, goalLabel: '', weighted: true, refusedAt: 0, steps: [] };
    }

    const result = runSimulation(defaultModPool(), analysis.value.item, sequence, goal);
    return {
      goalChance: result.goalChance,
      goalLabel: goals.fromSpec(goal).label,
      weighted: result.weighted,
      refusedAt: result.refusedAt,
      steps: result.steps.map((step) => ({
        currency: step.currency,
        refusal: step.refusal,
        goalChance: step.goalChance,
        weighted: step.weighted,
      })),
    };
  },

  'history:list': ({ limit, offset }) => history.list(limit, offset),
  'history:stats': () => history.stats(settings.settings.currencyPrices),
  'history:update': ({ id, ...patch }) => history.update(id, patch),
  'history:remove': ({ id }) => {
    history.remove(id);
    return null;
  },
  'history:clear': () => {
    history.clear();
    return null;
  },

  'app:info': () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron ?? 'unknown',
  }),

  'item:parse': ({ raw }) => serializeResult(recordAnalysis(history, analyzeText(raw))),

  'clipboard:parse': () =>
    serializeResult(recordAnalysis(history, analyzeText(clipboard.readText()))),

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
      // Re-register on any hotkey change, and report what the OS actually did.
      if (patch.hotkeyEnabled !== undefined || patch.hotkey !== undefined) {
        const status = hotkeys?.apply(view.hotkeyEnabled, view.hotkey);
        if (status) settings.hotkeyStatus = { active: status.enabled, error: status.error };
        return { ok: true, value: settings.view() };
      }
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

  'build:evaluate': async ({ raw }) => {
    const provider = providerFor(settings, aiDebug);
    if (!provider.ok) return serializeResult(provider);

    const analysis = analyzeText(raw);
    if (!analysis.ok) return serializeResult(analysis);

    const evaluated = await provider.value.evaluateBuild({
      item: analysis.value.item,
      deterministic: analysis.value.deterministic,
      context: contextFrom(settings, null),
      prices: priceTableFrom(settings),
    });

    return evaluated.ok ? { ok: true, value: evaluated.value.verdict } : serializeResult(evaluated);
  },

  'ai:narrate': async ({ raw, craftIntent }) => {
    const narrated = await narrateWith(settings, aiDebug, raw, craftIntent);
    if (!narrated.ok) return serializeResult(narrated);

    // Attach to the stored entry so the narrative survives a restart. Matched
    // on the item text: the entry was written the moment the item was captured,
    // seconds before the model answered.
    const entry = history.findByRaw(raw);
    if (entry) history.attachNarrative(entry.id, narrated.value.narrative);

    return { ok: true, value: narrated.value.narrative };
  },
});
