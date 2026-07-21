import { globalShortcut } from 'electron';
import type { KeySender } from './keySender.js';

/**
 * The global capture hotkey.
 *
 * Pressing it sends Ctrl+C to the game; the clipboard watcher then does exactly
 * what it already does for a manual copy. That is the whole design — the hotkey
 * adds a keystroke, not a second capture path, so there is only ever one way an
 * item enters the app.
 *
 * The app never reads the game's memory and never automates play: it presses
 * the same copy shortcut the player would, and only when the player asks.
 */
export interface HotkeyStatus {
  readonly enabled: boolean;
  readonly accelerator: string;
  /**
   * Set when registration failed — almost always because another application
   * already owns the key. Surfaced rather than swallowed: a hotkey that
   * silently does nothing is the worst possible outcome.
   */
  readonly error: string | null;
}

export class HotkeyRegistry {
  #status: HotkeyStatus = { enabled: false, accelerator: '', error: null };

  constructor(
    private readonly keys: KeySender,
    private readonly onError: (message: string) => void,
  ) {}

  get status(): HotkeyStatus {
    return this.#status;
  }

  /**
   * Applies the desired configuration, replacing whatever was registered.
   *
   * Idempotent: called on startup and again on every settings change.
   */
  apply(enabled: boolean, accelerator: string): HotkeyStatus {
    globalShortcut.unregisterAll();

    if (!enabled || accelerator.trim().length === 0) {
      this.#status = { enabled: false, accelerator, error: null };
      return this.#status;
    }

    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => {
        // Failure here is asynchronous and invisible to the player, who is
        // looking at the game — so it is reported through the app rather than
        // thrown into the void.
        void this.keys.sendCopy().catch((error: unknown) => {
          this.onError(error instanceof Error ? error.message : 'Could not send the copy keystroke');
        });
      });
    } catch (error) {
      this.#status = {
        enabled: false,
        accelerator,
        error: error instanceof Error ? error.message : 'Invalid shortcut',
      };
      return this.#status;
    }

    this.#status = registered
      ? { enabled: true, accelerator, error: null }
      : {
          enabled: false,
          accelerator,
          error: `Another application already owns ${accelerator}. Pick a different key.`,
        };

    return this.#status;
  }

  dispose(): void {
    globalShortcut.unregisterAll();
    this.#status = { ...this.#status, enabled: false };
  }
}
