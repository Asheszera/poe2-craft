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
    const { setCurrentAnalysis, setActiveView, setCurrentPrice } = useAppStore.getState();

    const stopCapture = subscribe('item:captured', (analysis) => {
      setCurrentAnalysis(analysis);
      setActiveView('analyzer');
    });

    // The price lands a beat after the capture; the store keeps it for whichever
    // view is open, so the overlay and the Price Check screen agree.
    const stopPrice = subscribe('price:update', (update) => setCurrentPrice(update));

    return () => {
      stopCapture();
      stopPrice();
    };
  }, []);
}
