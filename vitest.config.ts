import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Marks `node:sqlite` as external.
 *
 * It postdates the Vite version vitest bundles, so it is missing from that
 * version's list of Node builtins: Vite strips the `node:` prefix and then
 * fails to find a package called "sqlite" on disk. Resolving it explicitly is
 * the whole fix, and it disappears when vitest ships a newer Vite.
 */
const externalNodeSqlite: Plugin = {
  name: 'external-node-sqlite',
  enforce: 'pre',
  resolveId: (id) => (id === 'node:sqlite' ? { id, external: true } : null),
};

/**
 * Single root Vitest project. Workspace packages resolve through pnpm symlinks
 * straight to their TypeScript sources (`exports` → `./src/index.ts`), so there
 * is no build step to keep in sync while testing.
 */
export default defineConfig({
  plugins: [externalNodeSqlite],
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
});
