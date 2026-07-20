import { describe, expect, it } from 'vitest';
import {
  SettingsStore,
  type SecretCipher,
  type SettingsIO,
} from '../src/main/settings/store.js';

/** Reversible stand-in for DPAPI — proves the plumbing, not the cryptography. */
function fakeCipher(available = true): SecretCipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (buf) => {
      const text = buf.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('not encrypted by this cipher');
      return text.slice(4);
    },
  };
}

function memoryIO(initial: string | null = null): SettingsIO & { contents: string | null } {
  const io = {
    contents: initial,
    read: () => io.contents,
    write: (_path: string, contents: string) => {
      io.contents = contents;
    },
  };
  return io;
}

const PATH = 'C:/fake/settings.json';

describe('SettingsStore', () => {
  it('starts from defaults on first run', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    expect(store.settings.league).toBe('Standard');
    expect(store.hasApiKey).toBe(false);
    expect(store.apiKey()).toBeNull();
  });

  it('never exposes the key through the renderer-facing view', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    store.update({ apiKey: 'sk-ant-secret' });

    const view = store.view();
    expect(view.hasApiKey).toBe(true);
    // The whole point: no field of the view may carry the secret.
    expect(JSON.stringify(view)).not.toContain('sk-ant-secret');
  });

  it('writes the key to disk encrypted, never in plaintext', () => {
    const io = memoryIO();
    new SettingsStore(PATH, fakeCipher(), io).update({ apiKey: 'sk-ant-secret' });

    expect(io.contents).not.toContain('sk-ant-secret');
    expect(io.contents).toContain('encryptedApiKey');
  });

  it('round-trips the key across a restart', () => {
    const io = memoryIO();
    new SettingsStore(PATH, fakeCipher(), io).update({ apiKey: 'sk-ant-secret' });

    const reopened = new SettingsStore(PATH, fakeCipher(), io);
    expect(reopened.apiKey()).toBe('sk-ant-secret');
  });

  it('clears the key when given an empty string', () => {
    const io = memoryIO();
    const store = new SettingsStore(PATH, fakeCipher(), io);
    store.update({ apiKey: 'sk-ant-secret' });
    store.update({ apiKey: '' });

    expect(store.hasApiKey).toBe(false);
    expect(io.contents).not.toContain('encryptedApiKey');
  });

  it('refuses to store a key when OS encryption is unavailable', () => {
    const io = memoryIO();
    const store = new SettingsStore(PATH, fakeCipher(false), io);

    // Writing plaintext to disk instead would be worse than failing.
    expect(() => store.update({ apiKey: 'sk-ant-secret' })).toThrow(/encryption is unavailable/i);
    expect(io.contents).toBeNull();
  });

  it('returns null rather than throwing when the ciphertext cannot be decrypted', () => {
    // Real case: DPAPI blobs do not survive being copied to another machine.
    const io = memoryIO(JSON.stringify({ encryptedApiKey: Buffer.from('garbage').toString('base64') }));
    expect(new SettingsStore(PATH, fakeCipher(), io).apiKey()).toBeNull();
  });

  it('survives a corrupt settings file', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO('{ not json at all'));
    expect(store.settings.league).toBe('Standard');
  });

  it('keeps known fields when the file predates a schema change', () => {
    const io = memoryIO(JSON.stringify({ league: 'Rise of the Abyssal', removedField: 42 }));
    const store = new SettingsStore(PATH, fakeCipher(), io);

    expect(store.settings.league).toBe('Rise of the Abyssal');
    expect(store.settings.aiEffort).toBe('low'); // filled from defaults
  });

  it('merges patches instead of replacing the whole object', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    store.update({ league: 'Standard', mainSkill: 'Explosive Shot' });
    store.update({ characterClass: 'Mercenary' });

    expect(store.settings.mainSkill).toBe('Explosive Shot');
    expect(store.settings.characterClass).toBe('Mercenary');
  });
});
