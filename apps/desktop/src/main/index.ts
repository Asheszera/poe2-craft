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
import { OverlayWindow } from './overlay/window.js';
import { HotkeyRegistry } from './hotkey/registry.js';
import { defaultKeySender } from './hotkey/keySender.js';
import type { ItemAnalysis } from '@poe2/models';
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

  mainWindow = window;
  window.on('closed', () => {
    mainWindow = null;
    // Closing the app window closes the app. Without this, the overlay — which
    // is also a BrowserWindow — keeps `window-all-closed` from ever firing, so
    // the process lingers headless, holds the single-instance lock, and a
    // relaunch silently quits while only the overlay keeps appearing on capture.
    if (process.platform !== 'darwin') app.quit();
  });

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
let overlay: OverlayWindow | null = null;
let hotkeys: HotkeyRegistry | null = null;
let overlaySettings: SettingsStore | null = null;
/** The app window, tracked so a relaunch or activate can restore it by name
 *  rather than focusing whatever `getAllWindows()` happens to return — which is
 *  the invisible overlay once the main window has been closed. */
let mainWindow: BrowserWindow | null = null;

/** Brings the app window to the front, recreating it if it is gone. */
function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  createMainWindow();
}

/**
 * Shows the overlay for a fresh capture, when it would actually help.
 *
 * Suppressed while the app's own window has focus: the same analysis is already
 * on screen there, and a floating duplicate of what you are looking at is
 * noise. The overlay exists for the case where the player is in the game.
 */
function showOverlay(analysis: ItemAnalysis): void {
  const settings = overlaySettings?.settings;
  if (!settings?.overlayEnabled || !overlay) return;
  if (BrowserWindow.getAllWindows().some((window) => window.isFocused())) return;

  overlay.show(analysis, settings.overlayCorner, settings.overlayDurationMs);
}

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
    showOverlay(result.value);
  },
});

app.on('will-quit', () => {
  watcher.stop();
  overlay?.destroy();
  hotkeys?.dispose();
});

// A second instance would fight over the global hotkey (stage 4), so it is
// rejected up front and focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch should surface the app window that already exists — the
  // main one, not the overlay that `getAllWindows()` might hand back first.
  app.on('second-instance', showMainWindow);

  void app.whenReady().then(() => {
    // `userData` is only resolvable after the app is ready, so the store is
    // constructed here rather than at module scope.
    const settings = new SettingsStore(
      join(app.getPath('userData'), 'settings.json'),
      safeStorage,
    );

    const history = new SqliteHistoryRepository(join(app.getPath('userData'), 'history.db'));

    hotkeys = new HotkeyRegistry(defaultKeySender(), (message) =>
      console.error('[hotkey]', message),
    );
    const hotkeyStatus = hotkeys.apply(settings.settings.hotkeyEnabled, settings.settings.hotkey);
    settings.hotkeyStatus = { active: hotkeyStatus.enabled, error: hotkeyStatus.error };

    registerIpcHandlers(
      createHandlers({
        watcher,
        settings,
        history,
        hotkeys,
        aiDebug: createAiDebugLogger(isDev),
        // `overlay` is assigned just below and read at call time, not now.
        setOverlayInteractive: (interactive) => overlay?.setInteractive(interactive),
        openMainWindow: () => {
          showMainWindow();
          // The full analysis is now on screen in the main window, so the
          // corner card has done its job.
          overlay?.hide();
        },
      }),
    );
    captureHistory = history;
    overlaySettings = settings;
    overlay = new OverlayWindow({
      preload: join(__dirname, '../preload/index.js'),
      devUrl: process.env['ELECTRON_RENDERER_URL'],
      rendererDir: join(__dirname, '../renderer'),
    });
    createMainWindow();
    watcher.setEnabled(settings.settings.clipboardWatch);

    // macOS dock activation. `getAllWindows()` can be non-empty while only the
    // overlay survives, so the main window is restored by reference.
    app.on('activate', showMainWindow);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
