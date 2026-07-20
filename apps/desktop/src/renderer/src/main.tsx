import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './styles.css';

/**
 * Everything this app queries is local IPC, so the defaults are tuned away from
 * the web-oriented ones: no refetch on focus (the window loses focus every time
 * the user tabs back into the game) and no automatic retries, because a failed
 * parse is a deterministic answer, not a transient error.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false, staleTime: 30_000 },
    mutations: { retry: false },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
