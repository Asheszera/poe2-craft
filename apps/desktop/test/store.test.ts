import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemAnalysis, ParsedItem } from '@poe2/models';
import { useAppStore } from '../src/renderer/src/app/store.js';

/** Only the fields these tests read; the store treats the rest as opaque. */
const item = (raw: string) => ({
  raw,
  name: 'Corpse Claw',
  baseType: 'Pauascale Gloves',
  rarity: 'Rare',
  mods: [],
  unparsedLines: [],
});

const analysis = (raw: string): ItemAnalysis => ({
  item: item(raw) as unknown as ParsedItem,
  deterministic: {
    score: 88,
    strengths: [],
    weaknesses: [],
    recommendations: [],
    price: null,
    timings: {},
  },
  narrative: null,
});

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({ currentAnalysis: null, pasteBuffer: '', recentAnalyses: [] });
  });

  it('fills the paste box from whichever route produced the analysis', () => {
    // The background capture never touched the text box, so after a Ctrl+C in
    // game there was nothing to edit and re-parse.
    useAppStore.getState().setCurrentAnalysis(analysis('Item Class: Gloves\nRarity: Rare'));

    expect(useAppStore.getState().pasteBuffer).toBe('Item Class: Gloves\nRarity: Rare');
  });

  it('replaces the previous text when a new item arrives', () => {
    const store = useAppStore.getState();
    store.setCurrentAnalysis(analysis('first item'));
    store.setCurrentAnalysis(analysis('second item'));

    expect(useAppStore.getState().pasteBuffer).toBe('second item');
  });

  it('ignores a narrative that arrives after the user moved on', () => {
    const store = useAppStore.getState();
    store.setCurrentAnalysis(analysis('first item'));
    store.setCurrentAnalysis(analysis('second item'));

    // A model call takes seconds; by the time it lands the player has usually
    // captured something else.
    store.setNarrative('first item', {
      summary: 'stale',
      craftRecommendation: '',
      steps: [],
      possibleUpgrades: [],
      nextBestAction: '',
      model: 'test',
    });

    expect(useAppStore.getState().currentAnalysis?.narrative).toBeNull();
  });

  it('attaches a narrative that matches the item on screen', () => {
    const store = useAppStore.getState();
    store.setCurrentAnalysis(analysis('current item'));

    store.setNarrative('current item', {
      summary: 'fresh',
      craftRecommendation: '',
      steps: [],
      possibleUpgrades: [],
      nextBestAction: '',
      model: 'test',
    });

    expect(useAppStore.getState().currentAnalysis?.narrative?.summary).toBe('fresh');
  });
});
