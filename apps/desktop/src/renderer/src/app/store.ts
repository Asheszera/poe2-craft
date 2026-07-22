import type { ItemAnalysis, NarrativeAnalysis } from '@poe2/models';
import type { IpcEventPayload, SerializableError } from '@shared/ipc';
import { create } from 'zustand';
import type { ViewId } from './navigation.js';

/** The auto price check for the item on screen: its search and the listings. */
export type PriceUpdate = IpcEventPayload<'price:update'>;

const MAX_RECENT = 25;

/**
 * UI state only.
 *
 * Server-ish state (prices, AI output) belongs to TanStack Query. The analysed
 * item lives here rather than in the Analyzer component because it now has two
 * producers — the manual flow and the background clipboard capture — and the
 * latter can arrive while the user is on another view.
 *
 * `recentItems` is session-scoped until stage 3 replaces it with the
 * SQLite-backed history repository.
 */
interface AppState {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;

  currentAnalysis: ItemAnalysis | null;
  currentError: SerializableError | null;
  /** Accepts an analysis from any source and records it as recent. */
  setCurrentAnalysis: (analysis: ItemAnalysis) => void;
  setCurrentError: (error: SerializableError) => void;

  /**
   * The price check for the item on screen, pushed from the capture pipeline.
   *
   * Held here, not in the Price Check view, because the search resolves after
   * the capture and the view may not be mounted yet — a player watching the
   * overlay is on the Analyzer. Kept only while it matches the current item.
   */
  currentPrice: PriceUpdate | null;
  setCurrentPrice: (update: PriceUpdate) => void;
  /**
   * Attaches a narrative to the analysis it describes.
   *
   * Keyed by the item's raw text: an AI request takes seconds, and the user may
   * well have captured another item by the time it lands. Without the key, a
   * late response would be stapled onto the wrong item.
   */
  setNarrative: (itemRaw: string, narrative: NarrativeAnalysis) => void;

  recentAnalyses: ItemAnalysis[];
  clearRecentAnalyses: () => void;

  /**
   * What the player wants from the item currently on screen.
   *
   * Kept at session scope, not per item: while playing you are usually doing
   * the same thing to a run of similar items, and retyping the intent for each
   * capture would be friction exactly where the app is meant to be fast.
   */
  craftIntent: string;
  setCraftIntent: (intent: string) => void;

  /**
   * Raw text in the Analyzer's paste box.
   *
   * Lives here rather than in the component because switching views unmounts
   * it, and losing what you pasted just because you glanced at the Dashboard is
   * indefensible.
   */
  pasteBuffer: string;
  setPasteBuffer: (raw: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'analyzer',
  setActiveView: (activeView) => set({ activeView }),

  currentAnalysis: null,
  currentError: null,
  currentPrice: null,
  setCurrentAnalysis: (analysis) =>
    set((state) => ({
      currentAnalysis: analysis,
      currentError: null,
      // A new item invalidates the last one's price until its own search lands.
      currentPrice: state.currentPrice?.raw === analysis.item.raw ? state.currentPrice : null,
      // The paste box always shows the item on screen, whichever route brought
      // it in. Doing this here rather than at each call site means a future
      // third route cannot forget to, and after a background capture the text
      // is right there to tweak and re-parse.
      pasteBuffer: analysis.item.raw,
      recentAnalyses: [analysis, ...state.recentAnalyses].slice(0, MAX_RECENT),
    })),
  setCurrentError: (error) => set({ currentError: error, currentAnalysis: null }),
  setCurrentPrice: (update) => set({ currentPrice: update }),
  setNarrative: (itemRaw, narrative) =>
    set((state) => {
      if (state.currentAnalysis?.item.raw !== itemRaw) return {}; // stale response
      const updated = { ...state.currentAnalysis, narrative };
      return {
        currentAnalysis: updated,
        recentAnalyses: state.recentAnalyses.map((a) => (a.item.raw === itemRaw ? updated : a)),
      };
    }),

  recentAnalyses: [],
  clearRecentAnalyses: () => set({ recentAnalyses: [] }),

  craftIntent: '',
  setCraftIntent: (craftIntent) => set({ craftIntent }),

  pasteBuffer: '',
  setPasteBuffer: (pasteBuffer) => set({ pasteBuffer }),
}));
