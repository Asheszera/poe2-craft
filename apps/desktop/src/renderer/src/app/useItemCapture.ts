import { useEffect } from 'react';
import { subscribe } from '@/lib/ipc';
import { useAppStore } from './store.js';

/**
 * Bridges the background clipboard capture into the UI.
 *
 * Mounted once at the app root, not inside the Analyzer: a capture that arrives
 * while the user is on the Dashboard must still be recorded, and the view
 * switch is part of the behaviour the user asked for ("copy in game, see it in
 * the app").
 *
 * Note this survives React 19 StrictMode's double-mount because `subscribe`
 * returns a real unsubscribe — a leaked listener here would double every
 * captured item.
 */
export function useItemCapture(): void {
  useEffect(() => {
    // Read from the store lazily so the effect never re-subscribes on state
    // changes; the actions themselves are stable for the store's lifetime.
    const { setCurrentAnalysis, setActiveView } = useAppStore.getState();

    return subscribe('item:captured', (analysis) => {
      setCurrentAnalysis(analysis);
      setActiveView('analyzer');
    });
  }, []);
}
