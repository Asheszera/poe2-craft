import type { ItemAnalysis, NarrativeAnalysis } from '@poe2/models';
import type { SerializableError } from '@shared/ipc';
import { create } from 'zustand';
import type { ViewId } from './navigation.js';

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
   * Attaches a narrative to the analysis it describes.
   *
   * Keyed by the item's raw text: an AI request takes seconds, and the user may
   * well have captured another item by the time it lands. Without the key, a
   * late response would be stapled onto the wrong item.
   */
  setNarrative: (itemRaw: string, narrative: NarrativeAnalysis) => void;

  recentAnalyses: ItemAnalysis[];
  clearRecentAnalyses: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'analyzer',
  setActiveView: (activeView) => set({ activeView }),

  currentAnalysis: null,
  currentError: null,
  setCurrentAnalysis: (analysis) =>
    set((state) => ({
      currentAnalysis: analysis,
      currentError: null,
      recentAnalyses: [analysis, ...state.recentAnalyses].slice(0, MAX_RECENT),
    })),
  setCurrentError: (error) => set({ currentError: error, currentAnalysis: null }),
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
}));
