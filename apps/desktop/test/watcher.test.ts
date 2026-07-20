import { beforeEach, describe, expect, it, vi } from 'vitest';
import { looksLikeItem } from '@poe2/parser';
import { ClipboardWatcher } from '../src/main/clipboard/watcher.js';

const RARE_ITEM = 'Item Class: Rings\nRarity: Rare\nGloom Coil\nSapphire Ring\n--------\nItem Level: 70';

/** Test harness: a clipboard whose content the test controls directly. */
function harness(initial = '') {
  let content = initial;
  const captured: string[] = [];

  const watcher = new ClipboardWatcher({
    readText: () => content,
    isRelevant: looksLikeItem,
    onCapture: (raw) => captured.push(raw),
  });

  return {
    watcher,
    captured,
    set: (text: string) => {
      content = text;
    },
  };
}

describe('ClipboardWatcher', () => {
  beforeEach(() => vi.useRealTimers());

  it('adopts the existing clipboard as a baseline instead of importing it', () => {
    const h = harness(RARE_ITEM);
    h.watcher.start();
    h.watcher.tick();

    expect(h.captured).toEqual([]);
    h.watcher.stop();
  });

  it('captures an item copied after it started', () => {
    const h = harness('some unrelated text');
    h.watcher.start();

    h.set(RARE_ITEM);
    h.watcher.tick();

    expect(h.captured).toEqual([RARE_ITEM]);
    h.watcher.stop();
  });

  it('does not re-emit while the clipboard is unchanged', () => {
    const h = harness();
    h.watcher.start();
    h.set(RARE_ITEM);

    h.watcher.tick();
    h.watcher.tick();
    h.watcher.tick();

    expect(h.captured).toHaveLength(1);
    h.watcher.stop();
  });

  it('ignores copies that are not items', () => {
    const h = harness();
    h.watcher.start();

    h.set('https://example.com');
    h.watcher.tick();
    h.set('my password');
    h.watcher.tick();

    expect(h.captured).toEqual([]);
    h.watcher.stop();
  });

  it('re-captures an item after something else was copied in between', () => {
    const h = harness();
    h.watcher.start();

    h.set(RARE_ITEM);
    h.watcher.tick();
    h.set('unrelated');
    h.watcher.tick();
    h.set(RARE_ITEM);
    h.watcher.tick();

    expect(h.captured).toHaveLength(2);
    h.watcher.stop();
  });

  it('survives a clipboard read that throws', () => {
    const captured: string[] = [];
    let shouldThrow = false;
    const watcher = new ClipboardWatcher({
      readText: () => {
        if (shouldThrow) throw new Error('clipboard busy');
        return RARE_ITEM;
      },
      isRelevant: looksLikeItem,
      onCapture: (raw) => captured.push(raw),
    });

    watcher.start(); // baseline is RARE_ITEM
    shouldThrow = true;
    expect(() => watcher.tick()).not.toThrow();
    expect(captured).toEqual([]);
    watcher.stop();
  });

  it('reports and toggles its running state', () => {
    const h = harness();
    expect(h.watcher.isRunning).toBe(false);

    h.watcher.setEnabled(true);
    expect(h.watcher.isRunning).toBe(true);

    h.watcher.setEnabled(false);
    expect(h.watcher.isRunning).toBe(false);
  });

  it('polls on its interval once started', () => {
    vi.useFakeTimers();
    const h = harness();
    h.watcher.start();
    h.set(RARE_ITEM);

    vi.advanceTimersByTime(300);

    expect(h.captured).toEqual([RARE_ITEM]);
    h.watcher.stop();
    vi.useRealTimers();
  });
});
