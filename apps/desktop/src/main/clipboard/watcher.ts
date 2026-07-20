/**
 * Polling clipboard watcher.
 *
 * Neither Windows nor Electron offers a clipboard-change event without a native
 * listener, so change detection is a poll. The cost is a `readText()` per tick,
 * which is a few microseconds — cheaper than the native alternative's build and
 * anti-virus surface.
 *
 * The clipboard reader is injected rather than imported from `electron`, which
 * keeps this class unit-testable without spawning an Electron process.
 */

export interface ClipboardWatcherOptions {
  /** Injected so tests can drive it; production passes `clipboard.readText`. */
  readonly readText: () => string;
  /** Emitted only for text that changed *and* passed `isRelevant`. */
  readonly onCapture: (raw: string) => void;
  /** Gate that keeps unrelated copies (passwords, URLs) from leaving main. */
  readonly isRelevant: (raw: string) => boolean;
  readonly intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 250;

export class ClipboardWatcher {
  readonly #options: ClipboardWatcherOptions;
  readonly #intervalMs: number;
  #timer: NodeJS.Timeout | null = null;
  /** Last text seen, relevant or not — prevents re-emitting on every tick. */
  #lastSeen = '';

  constructor(options: ClipboardWatcherOptions) {
    this.#options = options;
    this.#intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  get isRunning(): boolean {
    return this.#timer !== null;
  }

  /**
   * Starts polling.
   *
   * The clipboard's current content is adopted as the baseline instead of being
   * emitted: whatever the user copied before launching the app is not something
   * they asked to import.
   */
  start(): void {
    if (this.#timer) return;
    this.#lastSeen = this.#safeRead();
    this.#timer = setInterval(() => this.tick(), this.#intervalMs);
  }

  stop(): void {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  setEnabled(enabled: boolean): void {
    if (enabled) this.start();
    else this.stop();
  }

  /** One poll iteration. Public so tests can step it deterministically. */
  tick(): void {
    const text = this.#safeRead();
    if (text === this.#lastSeen) return;

    this.#lastSeen = text;
    if (text.length > 0 && this.#options.isRelevant(text)) {
      this.#options.onCapture(text);
    }
  }

  /**
   * The clipboard can throw transiently on Windows when another process holds
   * it open. A failed read must not kill the interval.
   */
  #safeRead(): string {
    try {
      return this.#options.readText();
    } catch {
      return this.#lastSeen;
    }
  }
}
