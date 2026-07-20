import { join } from 'node:path';
import { app, BrowserWindow, clipboard, shell } from 'electron';
import { looksLikeItem } from '@poe2/parser';
import { affixBudget, affixMods, intrinsicMods } from '@poe2/models';
import { unmatchedMods } from '@poe2/data';
import { analyzeText } from './analysis/pipeline.js';
import { registerIpcHandlers } from './ipc/registry.js';
import { createHandlers } from './ipc/handlers.js';
import { ClipboardWatcher } from './clipboard/watcher.js';
import type { IpcEventPayload } from '../shared/ipc.js';

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
    const result = analyzeText(raw);
    if (!result.ok) return;

    if (isDev) {
      const item = result.value;
      const budget = affixBudget(item.rarity);
      const unknown = unmatchedMods(item).length;
      const affixes = affixMods(item);
      const tiers = affixes
        .map((m) => (m.tier ? `${m.affixType[0]?.toUpperCase()}T${m.tier.value}` : '—'))
        .join(' ');
      console.log(
        `[capture] ${item.rarity} · ${item.name ?? item.baseType} · ` +
          `${affixes.length}${budget === null ? '' : `/${budget}`} affixes [${tiers}] · ` +
          `${intrinsicMods(item).length} intrinsic` +
          (unknown > 0 ? ` · ${unknown} UNMATCHED` : ''),
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
    registerIpcHandlers(createHandlers({ watcher }));
    createMainWindow();
    watcher.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
