import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Electron is not loadable outside its own runtime, so `globalShortcut` is
 * replaced wholesale. The fake keeps the real semantics that matter here:
 * `register` returns false when the operating system refuses the key.
 */
const shortcut = {
  register: vi.fn<(accelerator: string, handler: () => void) => boolean>(),
  unregisterAll: vi.fn(),
};

vi.mock('electron', () => ({ globalShortcut: shortcut }));

const { HotkeyRegistry } = await import('../src/main/hotkey/registry.js');
import type { KeySender } from '../src/main/hotkey/keySender.js';

/** Fires whatever handler the last successful `register` call installed. */
const press = (): void => {
  const call = shortcut.register.mock.calls.at(-1);
  call?.[1]();
};

describe('HotkeyRegistry', () => {
  let sent: number;
  let sendResult: Promise<void>;
  let errors: string[];

  const keys: KeySender = { sendCopy: () => ((sent += 1), sendResult) };

  beforeEach(() => {
    shortcut.register.mockReset().mockReturnValue(true);
    shortcut.unregisterAll.mockReset();
    sent = 0;
    sendResult = Promise.resolve();
    errors = [];
  });

  const registry = () => new HotkeyRegistry(keys, (message) => errors.push(message));

  it('registers when enabled and reports it', () => {
    const status = registry().apply(true, 'F8');

    expect(status).toEqual({ enabled: true, accelerator: 'F8', error: null });
    expect(shortcut.register).toHaveBeenCalledWith('F8', expect.any(Function));
  });

  it('sends a copy keystroke when the shortcut fires', () => {
    registry().apply(true, 'F8');
    press();

    expect(sent).toBe(1);
  });

  it('names the likely cause when the OS refuses the key', () => {
    shortcut.register.mockReturnValue(false);

    const status = registry().apply(true, 'F8');

    expect(status.enabled).toBe(false);
    expect(status.error).toContain('Another application already owns F8');
  });

  it('reports an invalid accelerator instead of throwing', () => {
    shortcut.register.mockImplementation(() => {
      throw new Error('Invalid accelerator');
    });

    const status = registry().apply(true, 'not a key');

    expect(status.enabled).toBe(false);
    expect(status.error).toBe('Invalid accelerator');
  });

  it('reports a failed keystroke rather than leaving it unhandled', async () => {
    sendResult = Promise.reject(new Error('powershell is not available'));
    registry().apply(true, 'F8');

    press();
    await vi.waitFor(() => expect(errors).toEqual(['powershell is not available']));
  });

  it('registers nothing when disabled, and clears what was registered', () => {
    const registered = registry();
    registered.apply(true, 'F8');
    shortcut.register.mockClear();

    const status = registered.apply(false, 'F8');

    expect(status).toEqual({ enabled: false, accelerator: 'F8', error: null });
    expect(shortcut.register).not.toHaveBeenCalled();
    expect(shortcut.unregisterAll).toHaveBeenCalled();
  });

  it('treats a blank accelerator as disabled', () => {
    expect(registry().apply(true, '  ').enabled).toBe(false);
  });

  it('releases the key on dispose', () => {
    const registered = registry();
    registered.apply(true, 'F8');
    registered.dispose();

    expect(shortcut.unregisterAll).toHaveBeenCalledTimes(2); // apply + dispose
    expect(registered.status.enabled).toBe(false);
  });
});
