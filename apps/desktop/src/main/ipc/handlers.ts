import { app, clipboard } from 'electron';
import { analyzeText } from '../analysis/pipeline.js';
import type { ClipboardWatcher } from '../clipboard/watcher.js';
import type { IpcHandlers } from './registry.js';
import { serializeResult } from './registry.js';

export interface HandlerDeps {
  readonly watcher: ClipboardWatcher;
}

/**
 * Handler implementations.
 *
 * Built through a factory rather than exported as a constant so collaborators
 * (here, the clipboard watcher) are injected instead of reached for through
 * module scope — which is what keeps `main/index.ts` the only place that wires
 * the application together.
 *
 * Handlers stay thin: they translate between the IPC contract and the domain
 * packages and nothing else.
 */
export const createHandlers = ({ watcher }: HandlerDeps): IpcHandlers => ({
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
});
