import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { EMULATED_VERSION } from 'workflow-render-assets';

const require = createRequire(import.meta.url);

/**
 * One source for which bundle ships. Hardcoding the version here let the
 * sidecar keep serving 2.10.0 after the pin moved, which is a silent way for
 * the shipped icons to disagree with the rest of the build.
 */
const data = (file: string): string =>
  require.resolve(`workflow-render-assets/data/${EMULATED_VERSION}/${file}`);

/**
 * Write the icon set, the subtitle templates and the Inter faces beside the
 * bundle. Inlining them would blow the 300 KB gzip budget, so they ship as
 * same-origin sidecars (see src/icons.ts).
 */
function iconSidecar(): Plugin {
  return {
    name: 'workflow-render-icon-sidecar',
    writeBundle(options) {
      const outDir = options.dir ?? resolve('dist');
      mkdirSync(outDir, { recursive: true });
      copyFileSync(
        data('icons.json'),
        resolve(outDir, 'workflow-render-icons.json'),
      );
      copyFileSync(
        data('subtitles.json'),
        resolve(outDir, 'workflow-render-subtitles.json'),
      );
      // The inspector's node descriptions: several MB, fetched only when a
      // panel is first opened.
      copyFileSync(
        data('descriptions.json'),
        resolve(outDir, 'workflow-render-descriptions.json'),
      );
      // n8n renders in Inter; ship it so text has the same metrics.
      for (const weight of [400, 500, 600]) {
        copyFileSync(
          require.resolve(`workflow-render-assets/data/fonts/inter-${weight}.woff2`),
          resolve(outDir, `inter-${weight}.woff2`),
        );
      }
    },
  };
}

// One self-contained ESM file plus its icon sidecar: nothing is fetched at
// runtime except that sidecar and the user's own `src`.
export default defineConfig({
  plugins: [iconSidecar()],
  build: {
    lib: { entry: 'src/workflow-render.ts', formats: ['es'], fileName: 'workflow-render' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    target: 'es2022',
  },
});
