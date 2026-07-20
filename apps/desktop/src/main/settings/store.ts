import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  type AppSettings,
  type SettingsPatch,
  type SettingsView,
} from '../../shared/settings.js';

/**
 * Encryption seam.
 *
 * Production passes Electron's `safeStorage`, which is backed by DPAPI on
 * Windows and the Keychain on macOS — the OS holds the key material, not this
 * app. Hand-rolled crypto here would mean shipping the decryption key next to
 * the ciphertext, which protects against nothing.
 */
export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** File I/O seam, so the store is testable without touching a real disk. */
export interface SettingsIO {
  read(path: string): string | null;
  write(path: string, contents: string): void;
}

export const nodeSettingsIO: SettingsIO = {
  read: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null; // First run, or a file we cannot read — both mean "defaults".
    }
  },
  write: (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  },
};

/** On-disk shape. The key is base64 ciphertext, never plaintext. */
interface PersistedSettings extends Partial<AppSettings> {
  encryptedApiKey?: string;
}

/**
 * Settings persistence with an encrypted credential.
 *
 * The API key never leaves this class as plaintext except through
 * `apiKey()`, which only the main process can reach. `view()` — the shape the
 * IPC layer returns — reports whether a key exists and nothing more.
 */
export class SettingsStore {
  #settings: AppSettings;
  #encryptedApiKey: string | null = null;

  constructor(
    private readonly path: string,
    private readonly cipher: SecretCipher,
    private readonly io: SettingsIO = nodeSettingsIO,
  ) {
    const raw = this.io.read(this.path);
    if (raw === null) {
      this.#settings = DEFAULT_SETTINGS;
      return;
    }

    let parsed: PersistedSettings = {};
    try {
      parsed = JSON.parse(raw) as PersistedSettings;
    } catch {
      // A corrupt settings file must not stop the app from starting.
      parsed = {};
    }

    const { encryptedApiKey, ...rest } = parsed;
    this.#encryptedApiKey = encryptedApiKey ?? null;
    // Unknown or invalid fields fall back to defaults field-by-field rather
    // than discarding the whole file — a settings shape change between
    // versions should not wipe the user's league or custom prompt.
    this.#settings = AppSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...rest });
  }

  get settings(): AppSettings {
    return this.#settings;
  }

  get hasApiKey(): boolean {
    return this.#encryptedApiKey !== null;
  }

  view(): SettingsView {
    return { ...this.#settings, hasApiKey: this.hasApiKey };
  }

  /**
   * The decrypted key. Main-process only — never route this through IPC.
   * Returns null when unset, or when the ciphertext cannot be decrypted (which
   * happens legitimately: DPAPI blobs do not survive being copied to another
   * machine or user account).
   */
  apiKey(): string | null {
    if (this.#encryptedApiKey === null) return null;
    try {
      return this.cipher.decryptString(Buffer.from(this.#encryptedApiKey, 'base64'));
    } catch {
      return null;
    }
  }

  update(patch: SettingsPatch): SettingsView {
    const { apiKey, ...rest } = patch;

    if (apiKey !== undefined) {
      if (apiKey.trim().length === 0) {
        this.#encryptedApiKey = null;
      } else if (this.cipher.isEncryptionAvailable()) {
        this.#encryptedApiKey = this.cipher.encryptString(apiKey).toString('base64');
      } else {
        // Refuse rather than silently writing a plaintext credential to disk.
        throw new Error('OS encryption is unavailable; refusing to store the API key.');
      }
    }

    this.#settings = AppSettingsSchema.parse({ ...this.#settings, ...rest });
    this.#persist();
    return this.view();
  }

  #persist(): void {
    const persisted: PersistedSettings = {
      ...this.#settings,
      ...(this.#encryptedApiKey === null ? {} : { encryptedApiKey: this.#encryptedApiKey }),
    };
    this.io.write(this.path, `${JSON.stringify(persisted, null, 2)}\n`);
  }
}
