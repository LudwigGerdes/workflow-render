import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'happy-dom' },
  resolve: {
    // Exact matches only: the data/*.json subpaths must still resolve through
    // the package's own exports.
    alias: [
      { find: /^workflow-render-core$/, replacement: new URL('../core/src/index.ts', import.meta.url).pathname },
      { find: /^workflow-render-assets$/, replacement: new URL('../assets/src/index.ts', import.meta.url).pathname },
      { find: /^workflow-render-assets\/version$/, replacement: new URL('../assets/src/version.ts', import.meta.url).pathname },
    ],
  },
});
