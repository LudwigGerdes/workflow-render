import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ELEMENT_DIST = fileURLToPath(new URL('../element/dist/', import.meta.url));

/** The files copy-assets stages into public/, and their content types. */
const STAGED: Record<string, string> = {
  'workflow-render.js': 'text/javascript',
  'workflow-render-icons.json': 'application/json',
  'workflow-render-subtitles.json': 'application/json',
  'workflow-render-descriptions.json': 'application/json',
  'inter-400.woff2': 'font/woff2',
  'inter-500.woff2': 'font/woff2',
  'inter-600.woff2': 'font/woff2',
};

/**
 * In dev, serve the element bundle straight from `element/dist`.
 *
 * `copy-assets` stages those files into `public/` once, when the dev server
 * starts. Rebuild the element after that and the server keeps serving the old
 * copy -- silently, with no error and no warning. That cost real debugging time
 * more than once: the code was right, the browser was running the previous
 * bundle. Reading the built file per request removes the stale copy from the
 * loop, and `no-store` keeps the browser from reintroducing it.
 *
 * Dev only. The production build still stages into `public/`, because the
 * output has to be a self-contained static directory.
 */
function liveElement(): Plugin {
  return {
    name: 'workflow-render-live-element',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(ELEMENT_DIST);
      server.watcher.on('change', (file) => {
        if (file.startsWith(ELEMENT_DIST)) server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        const type = STAGED[name];
        const file = resolve(ELEMENT_DIST, name);
        if (!type || !existsSync(file)) return next();
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
      });
    },
  };
}

// Fully static output: `dist/` can be copied to any web server as-is.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [liveElement()],
});
