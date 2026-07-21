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

/** On-disk shape. Keys are base64 ciphertext per provider, never plaintext. */
interface PersistedSettings extends Partial<AppSettings> {
  encryptedApiKeys?: Record<string, string>;
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
  /** provider id → base64 ciphertext. One credential per provider, so
   *  switching between them never discards a key the user already entered. */
  #encryptedApiKeys: Record<string, string> = {};

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

    const { encryptedApiKeys, ...rest } = parsed;
    this.#encryptedApiKeys = encryptedApiKeys ?? {};
    // Unknown or invalid fields fall back to defaults field-by-field rather
    // than discarding the whole file — a settings shape change between
    // versions should not wipe the user's league or custom prompt.
    this.#settings = AppSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...rest });
  }

  get settings(): AppSettings {
    return this.#settings;
  }

  hasApiKey(provider: string): boolean {
    return this.#encryptedApiKeys[provider] !== undefined;
  }

  view(): SettingsView {
    return { ...this.#settings, configuredProviders: Object.keys(this.#encryptedApiKeys) };
  }

  /**
   * The decrypted key for one provider. Main-process only — never route this
   * through IPC. Returns null when unset, or when the ciphertext cannot be
   * decrypted (which happens legitimately: DPAPI blobs do not survive being
   * copied to another machine or user account).
   */
  apiKey(provider: string): string | null {
    const encrypted = this.#encryptedApiKeys[provider];
    if (encrypted === undefined) return null;
    try {
      return this.cipher.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      return null;
    }
  }

  update(patch: SettingsPatch): SettingsView {
    const { setApiKey, ...rest } = patch;

    if (setApiKey !== undefined) {
      const { provider, key } = setApiKey;
      if (key.trim().length === 0) {
        delete this.#encryptedApiKeys[provider];
      } else if (this.cipher.isEncryptionAvailable()) {
        this.#encryptedApiKeys[provider] = this.cipher.encryptString(key).toString('base64');
      } else {
        // Refuse rather than silently writing a plaintext credential to disk.
        throw new Error('OS encryption is unavailable; refusing to store the API key.');
      }
    }

    // Belt and braces: only keys the caller actually set may overwrite stored
    // values. A schema that ever starts emitting `undefined` for absent fields
    // would otherwise blank the whole object — which is precisely the bug this
    // guards against, and it cost an afternoon once already.
    const provided = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );

    this.#settings = AppSettingsSchema.parse({ ...this.#settings, ...provided });
    this.#persist();
    return this.view();
  }

  #persist(): void {
    const persisted: PersistedSettings = {
      ...this.#settings,
      ...(Object.keys(this.#encryptedApiKeys).length === 0
        ? {}
        : { encryptedApiKeys: this.#encryptedApiKeys }),
    };
    this.io.write(this.path, `${JSON.stringify(persisted, null, 2)}\n`);
  }
}
