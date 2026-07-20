import type { ItemAnalysis } from '@poe2/models';
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

  recentAnalyses: [],
  clearRecentAnalyses: () => set({ recentAnalyses: [] }),
}));
