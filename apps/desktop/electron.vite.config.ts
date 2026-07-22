import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * The workspace packages are published as TypeScript sources (`exports` ->
 * `src/index.ts`), so they must be bundled into the main/preload output.
 * Letting `externalizeDepsPlugin` externalize them would emit a runtime
 * `require('@poe2/parser')` that resolves to a `.ts` file Electron cannot load.
 */
const INTERNAL_PACKAGES = ['@poe2/shared', '@poe2/models', '@poe2/parser', '@poe2/data', '@poe2/rules', '@poe2/ai', '@poe2/prices', '@poe2/craft'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: INTERNAL_PACKAGES })],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: INTERNAL_PACKAGES })],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') },
    },
    build: {
      // `root` points at src/renderer, so outDir must be pinned back to the
      // app package - otherwise the bundle lands in the repository root.
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // The overlay is its own entry rather than a route: it is created on
          // a hot path and needs none of the main window's machinery.
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
