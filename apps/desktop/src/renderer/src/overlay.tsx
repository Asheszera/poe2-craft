import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './OverlayApp';
import './styles.css';

/**
 * Entry point for the overlay window.
 *
 * Separate from `main.tsx` on purpose: the overlay needs neither the router,
 * the store, nor TanStack Query, and it is created on a hot path where the
 * player is mid-fight. Its own entry keeps that bundle to what it draws.
 */
const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from overlay.html');

createRoot(container).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
