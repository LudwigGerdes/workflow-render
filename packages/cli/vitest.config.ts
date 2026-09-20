import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^workflow-render-core$/, replacement: new URL('../core/src/index.ts', import.meta.url).pathname },
      { find: /^workflow-render-assets$/, replacement: new URL('../assets/src/index.ts', import.meta.url).pathname },
      { find: /^workflow-render-assets\/version$/, replacement: new URL('../assets/src/version.ts', import.meta.url).pathname },
    ],
  },
});
