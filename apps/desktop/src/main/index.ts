import { join } from 'node:path';
import { app, BrowserWindow, clipboard, safeStorage, shell } from 'electron';
import { looksLikeItem } from '@poe2/parser';
import { affixBudget, affixMods, intrinsicMods } from '@poe2/models';
import { unmatchedMods } from '@poe2/data';
import { analyzeText } from './analysis/pipeline.js';
import { createAiDebugLogger } from './analysis/aiDebug.js';
import { registerIpcHandlers } from './ipc/registry.js';
import { createHandlers, recordAnalysis } from './ipc/handlers.js';
import { SqliteHistoryRepository } from './history/sqlite.js';
import { ClipboardWatcher } from './clipboard/watcher.js';
import { SettingsStore } from './settings/store.js';
import type { IpcEventPayload } from '../shared/ipc.js';

/**
 * Set before anything reads a user path.
 *
 * Electron derives its data directories from the app name, which defaults to
 * the `name` field in package.json — here the scoped `@poe2/desktop`, which
 * produced `%APPDATA%\@poe2\desktop`. `sessionData` (Chromium's caches) is
 * resolved separately from `userData`, so both are pinned explicitly: naming
 * the app alone leaves the browser caches behind in the old folder.
 */
const APP_NAME = 'PoE2 AI Assistant';
app.setName(APP_NAME);
app.setPath('userData', join(app.getPath('appData'), APP_NAME));
app.setPath('sessionData', app.getPath('userData'));

const isDev = !app.isPackaged;

/**
 * Window chrome is hidden in favour of a custom title bar (see `TitleBar.tsx`),
 * but the native control buttons are kept through `titleBarOverlay` so window
 * management stays exactly as Windows users expect.
 */
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0a0a0c',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0a0c', symbolColor: '#8a8a94', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security baseline: the renderer gets no Node, no shared context with
      // the preload, and no ability to reach into the main world.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  });

  // Avoid the white flash before React has painted.
  window.on('ready-to-show', () => window.show());

  // Any navigation the app itself did not initiate goes to the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

/** Set once the app is ready; the clipboard watcher starts before that. */
let captureHistory: SqliteHistoryRepository | null = null;

/** Pushes an event to every open window. */
function broadcast<E extends 'item:captured'>(event: E, payload: IpcEventPayload<E>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(event, payload);
  }
}

/**
 * Background capture.
 *
 * The watcher hands over raw text; parsing happens here so that clipboard
 * content which merely *looks* like an item but fails to parse is dropped
 * silently instead of interrupting the user with an error they did not ask for.
 * Manual analysis (`item:parse`) still reports failures, because there the user
 * explicitly asked for a result.
 */
const watcher = new ClipboardWatcher({
  readText: () => clipboard.readText(),
  isRelevant: looksLikeItem,
  onCapture: (raw) => {
    // The watcher outlives `whenReady`, so the repository is reached through a
    // binding set at startup rather than captured at module scope.
    const result = captureHistory
      ? recordAnalysis(captureHistory, analyzeText(raw))
      : analyzeText(raw);
    if (!result.ok) return;

    if (isDev) {
      const { item, deterministic } = result.value;
      const budget = affixBudget(item.rarity);
      const unknown = unmatchedMods(item).length;
      const affixes = affixMods(item);
      const tiers = affixes
        .map((m) => (m.tier ? `${m.affixType[0]?.toUpperCase()}T${m.tier.value}` : '—'))
        .join(' ');
      // ASCII only: the Windows console is not UTF-8 by default, and a `·` or
      // an arrow arrives as mojibake in the very output meant to aid debugging.
      console.log(
        `[capture] ${item.rarity} | ${item.name ?? item.baseType} | ` +
          `score ${deterministic.score} | ` +
          `${affixes.length}${budget === null ? '' : `/${budget}`} affixes [${tiers}] | ` +
          `${intrinsicMods(item).length} intrinsic` +
          (unknown > 0 ? ` | ${unknown} UNMATCHED` : '') +
          ` | ${deterministic.timings['total'] ?? '?'}ms rules` +
          ` -> ${deterministic.recommendations[0]?.action ?? 'no advice'}`,
      );
    }
    broadcast('item:captured', result.value);
  },
});

app.on('will-quit', () => watcher.stop());

// A second instance would fight over the global hotkey (stage 4), so it is
// rejected up front and focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  void app.whenReady().then(() => {
    // `userData` is only resolvable after the app is ready, so the store is
    // constructed here rather than at module scope.
    const settings = new SettingsStore(
      join(app.getPath('userData'), 'settings.json'),
      safeStorage,
    );

    const history = new SqliteHistoryRepository(join(app.getPath('userData'), 'history.db'));

    registerIpcHandlers(
      createHandlers({ watcher, settings, history, aiDebug: createAiDebugLogger(isDev) }),
    );
    captureHistory = history;
    createMainWindow();
    watcher.setEnabled(settings.settings.clipboardWatch);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
