import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { ItemAnalysis } from '@poe2/models';

/**
 * The in-game overlay.
 *
 * A second, frameless, click-through window that shows the verdict where the
 * player is already looking. The whole point of the app is a two-second loop;
 * alt-tabbing to read the answer costs more than the analysis saves.
 *
 * Two constraints shape everything here:
 *
 *  1. **It must never take input.** `focusable: false` plus
 *     `setIgnoreMouseEvents(true)` mean clicks and keys pass straight through to
 *     the game. An overlay that swallows a click during a fight is worse than
 *     no overlay.
 *  2. **It only helps when the game is in Windowed Fullscreen.** Exclusive
 *     fullscreen owns the display and nothing draws above it. That is a
 *     property of the operating system, not something to work around, so the
 *     interface says so rather than leaving the user to wonder.
 */

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const WIDTH = 380;
const HEIGHT = 260;
const MARGIN = 24;

export interface OverlayOptions {
  readonly preload: string;
  /** Dev server URL, when running under electron-vite. */
  readonly devUrl?: string | undefined;
  readonly rendererDir: string;
}

export class OverlayWindow {
  #window: BrowserWindow | null = null;
  #hideTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: OverlayOptions) {}

  /** Created lazily: a user who never enables the overlay never pays for it. */
  #ensure(): BrowserWindow {
    if (this.#window && !this.#window.isDestroyed()) return this.#window;

    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      // Never steal focus from the game, not even momentarily.
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // `screen-saver` is the highest level that still sits below system UI, and
    // is what keeps the overlay above a windowed-fullscreen game.
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setIgnoreMouseEvents(true);

    const { devUrl, rendererDir } = this.options;
    if (devUrl) void window.loadURL(`${devUrl}/overlay.html`);
    else void window.loadFile(join(rendererDir, 'overlay.html'));

    this.#window = window;
    return window;
  }

  #position(corner: OverlayCorner): void {
    const window = this.#ensure();
    const { workArea } = screen.getPrimaryDisplay();

    const x = corner.endsWith('right')
      ? workArea.x + workArea.width - WIDTH - MARGIN
      : workArea.x + MARGIN;
    const y = corner.startsWith('bottom')
      ? workArea.y + workArea.height - HEIGHT - MARGIN
      : workArea.y + MARGIN;

    window.setPosition(Math.round(x), Math.round(y));
  }

  /**
   * Shows an analysis, then hides after `durationMs`.
   *
   * `showInactive` rather than `show`: the latter would raise and focus the
   * window, which on Windows can minimise a fullscreen game.
   */
  show(analysis: ItemAnalysis, corner: OverlayCorner, durationMs: number): void {
    const window = this.#ensure();
    this.#position(corner);

    window.webContents.send('overlay:show', analysis);
    window.showInactive();

    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => this.hide(), durationMs);
  }

  hide(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    if (this.#window && !this.#window.isDestroyed()) this.#window.hide();
  }

  destroy(): void {
    this.hide();
    if (this.#window && !this.#window.isDestroyed()) this.#window.destroy();
    this.#window = null;
  }
}
