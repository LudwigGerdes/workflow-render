import { defineConfig } from 'vitest/config';

// Tests run against the assets package's TypeScript source so the suite never
// depends on a prior build step.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^workflow-render-assets$/, replacement: new URL('../assets/src/index.ts', import.meta.url).pathname },
      { find: /^workflow-render-assets\/version$/, replacement: new URL('../assets/src/version.ts', import.meta.url).pathname },
    ],
  },
});
