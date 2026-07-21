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
  const setKey = (provider: string, key: string) => ({ setApiKey: { provider, key } });

  it('starts from defaults on first run', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    expect(store.settings.league).toBe('Standard');
    expect(store.hasApiKey('gemini')).toBe(false);
    expect(store.apiKey('gemini')).toBeNull();
  });

  it('never exposes a key through the renderer-facing view', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    store.update(setKey('gemini', 'AIza-secret'));

    const view = store.view();
    expect(view.configuredProviders).toEqual(['gemini']);
    // The whole point: no field of the view may carry the secret.
    expect(JSON.stringify(view)).not.toContain('AIza-secret');
  });

  it('writes keys to disk encrypted, never in plaintext', () => {
    const io = memoryIO();
    new SettingsStore(PATH, fakeCipher(), io).update(setKey('gemini', 'AIza-secret'));

    expect(io.contents).not.toContain('AIza-secret');
    expect(io.contents).toContain('encryptedApiKeys');
  });

  it('keeps one key per provider so switching does not discard the other', () => {
    const io = memoryIO();
    const store = new SettingsStore(PATH, fakeCipher(), io);
    store.update(setKey('gemini', 'AIza-gemini'));
    store.update(setKey('groq', 'gsk-groq'));

    expect(store.apiKey('gemini')).toBe('AIza-gemini');
    expect(store.apiKey('groq')).toBe('gsk-groq');
    expect(store.view().configuredProviders).toEqual(['gemini', 'groq']);
  });

  it('round-trips keys across a restart', () => {
    const io = memoryIO();
    new SettingsStore(PATH, fakeCipher(), io).update(setKey('groq', 'gsk-groq'));

    expect(new SettingsStore(PATH, fakeCipher(), io).apiKey('groq')).toBe('gsk-groq');
  });

  it('clears only the named provider when given an empty key', () => {
    const io = memoryIO();
    const store = new SettingsStore(PATH, fakeCipher(), io);
    store.update(setKey('gemini', 'AIza-gemini'));
    store.update(setKey('groq', 'gsk-groq'));
    store.update(setKey('gemini', ''));

    expect(store.hasApiKey('gemini')).toBe(false);
    expect(store.hasApiKey('groq')).toBe(true);
  });

  it('refuses to store a key when OS encryption is unavailable', () => {
    const io = memoryIO();
    const store = new SettingsStore(PATH, fakeCipher(false), io);

    // Writing plaintext to disk instead would be worse than failing.
    expect(() => store.update(setKey('gemini', 'AIza-secret'))).toThrow(
      /encryption is unavailable/i,
    );
    expect(io.contents).toBeNull();
  });

  it('returns null rather than throwing when the ciphertext cannot be decrypted', () => {
    // Real case: DPAPI blobs do not survive being copied to another machine.
    const io = memoryIO(
      JSON.stringify({ encryptedApiKeys: { gemini: Buffer.from('garbage').toString('base64') } }),
    );
    expect(new SettingsStore(PATH, fakeCipher(), io).apiKey('gemini')).toBeNull();
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

  it('filling one field does not reset the others', () => {
    // Reproduces the reported bug: typing into League, then Class, then
    // Ascendancy, one commit at a time — exactly what the UI sends.
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());

    store.update({ league: 'Runes of Aldur' });
    store.update({ characterClass: 'Mercenary' });
    store.update({ ascendancy: 'Gemling Legionnaire' });
    store.update({ mainSkill: 'Explosive Shot' });

    expect(store.settings.league).toBe('Runes of Aldur');
    expect(store.settings.characterClass).toBe('Mercenary');
    expect(store.settings.ascendancy).toBe('Gemling Legionnaire');
    expect(store.settings.mainSkill).toBe('Explosive Shot');
  });

  it('merges patches instead of replacing the whole object', () => {
    const store = new SettingsStore(PATH, fakeCipher(), memoryIO());
    store.update({ league: 'Standard', mainSkill: 'Explosive Shot' });
    store.update({ characterClass: 'Mercenary' });

    expect(store.settings.mainSkill).toBe('Explosive Shot');
    expect(store.settings.characterClass).toBe('Mercenary');
  });
});
