import { defineConfig } from 'vitest/config';

/**
 * Single root Vitest project. Workspace packages resolve through pnpm symlinks
 * straight to their TypeScript sources (`exports` → `./src/index.ts`), so there
 * is no build step to keep in sync while testing.
 */
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
});
