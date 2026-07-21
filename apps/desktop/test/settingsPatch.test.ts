import { describe, expect, it } from 'vitest';
import { SettingsPatchSchema } from '../src/shared/settings.js';
import { SettingsStore } from '../src/main/settings/store.js';

/**
 * The IPC boundary, which the store's own tests bypass.
 *
 * Main validates every request with `SettingsPatchSchema.parse` before the
 * handler sees it, so what that parse *emits* is what actually gets merged into
 * the stored settings — not the object the renderer sent.
 */
describe('SettingsPatchSchema', () => {
  it('emits only the fields the renderer actually sent', () => {
    const parsed = SettingsPatchSchema.parse({ league: 'Runes of Aldur' });

    // If absent fields come back as explicit `undefined` keys, spreading the
    // patch over the stored settings blanks every one of them — and the
    // schema's own defaults then refill them, which reads as "filling one
    // field cleared the others".
    expect(Object.keys(parsed)).toEqual(['league']);
    expect('characterClass' in parsed).toBe(false);
  });

  it('preserves an explicit null (clearing a field on purpose)', () => {
    const parsed = SettingsPatchSchema.parse({ characterClass: null });
    expect(parsed.characterClass).toBeNull();
  });

  it('survives the full round trip the app performs, field by field', () => {
    // The regression, end to end: validate each patch exactly as main does,
    // then apply it. This is the path the store-only test could not see.
    let contents: string | null = null;
    const io = {
      read: () => contents,
      write: (_p: string, c: string) => {
        contents = c;
      },
    };
    const cipher = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString(),
    };

    const store = new SettingsStore('C:/fake.json', cipher, io);
    for (const patch of [
      { league: 'Runes of Aldur' },
      { characterClass: 'Mercenary' },
      { ascendancy: 'Gemling Legionnaire' },
      { mainSkill: 'Explosive Shot' },
      { goal: 'Clear T15 maps' },
    ]) {
      store.update(SettingsPatchSchema.parse(patch));
    }

    expect(store.settings).toMatchObject({
      league: 'Runes of Aldur',
      characterClass: 'Mercenary',
      ascendancy: 'Gemling Legionnaire',
      mainSkill: 'Explosive Shot',
      goal: 'Clear T15 maps',
    });
  });
});
