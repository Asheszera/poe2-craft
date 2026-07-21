import { execFile } from 'node:child_process';

/**
 * Sends a copy keystroke to whatever window has focus.
 *
 * A port, because how you synthesise input is the most platform-specific and
 * most replaceable part of this feature — and because it is the one piece that
 * cannot be tested without actually moving the user's keyboard.
 */
export interface KeySender {
  /** Resolves once the keystroke has been delivered. */
  sendCopy(): Promise<void>;
}

/**
 * Windows implementation via PowerShell's `SendKeys`.
 *
 * Chosen over a native input library after measuring: spawning PowerShell and
 * loading `System.Windows.Forms` costs ~130 ms on this machine, and the
 * clipboard watcher polls every 250 ms — so the whole F8-to-overlay path stays
 * comfortably under half a second. A native module would save perhaps 100 ms in
 * exchange for a compiled dependency needing prebuilds for every Electron
 * release, which is a trade this feature does not justify.
 *
 * If that calculus ever changes, only this class does.
 */
export class PowerShellKeySender implements KeySender {
  constructor(
    private readonly exec: typeof execFile = execFile,
    private readonly timeoutMs = 3000,
  ) {}

  sendCopy(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.exec(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          // `^c` is Ctrl+C in SendKeys notation. It goes to the foreground
          // window, which is the game — this process never has focus when the
          // global shortcut fires.
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
        ],
        { timeout: this.timeoutMs, windowsHide: true },
        (error) => {
          if (!error) return resolve();
          // Re-wrapped rather than passed through: `ExecFileException` is a
          // structural type, not necessarily an `Error` instance, and the
          // message is all the caller shows.
          reject(new Error(`Could not send the copy keystroke: ${error.message}`));
        },
      );
    });
  }
}

/** Used on platforms where synthesising input is not implemented. */
export class UnsupportedKeySender implements KeySender {
  sendCopy(): Promise<void> {
    return Promise.reject(
      new Error('Sending a copy keystroke is only implemented on Windows for now.'),
    );
  }
}

export const defaultKeySender = (platform: string = process.platform): KeySender =>
  platform === 'win32' ? new PowerShellKeySender() : new UnsupportedKeySender();
