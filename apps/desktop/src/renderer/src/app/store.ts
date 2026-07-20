import type { ParsedItem } from '@poe2/models';
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

  currentItem: ParsedItem | null;
  currentError: SerializableError | null;
  /** Accepts an analysed item from any source and records it as recent. */
  setCurrentItem: (item: ParsedItem) => void;
  setCurrentError: (error: SerializableError) => void;

  recentItems: ParsedItem[];
  clearRecentItems: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'analyzer',
  setActiveView: (activeView) => set({ activeView }),

  currentItem: null,
  currentError: null,
  setCurrentItem: (item) =>
    set((state) => ({
      currentItem: item,
      currentError: null,
      recentItems: [item, ...state.recentItems].slice(0, MAX_RECENT),
    })),
  setCurrentError: (error) => set({ currentError: error, currentItem: null }),

  recentItems: [],
  clearRecentItems: () => set({ recentItems: [] }),
}));
