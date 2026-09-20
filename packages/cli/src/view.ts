/**
 * `workflow-render view` — look at a workflow locally.
 *
 * Serves the element bundle and its sidecars straight from the package, plus
 * the file you named, on an ephemeral port. Nothing leaves the machine: the page
 * fetches only from this server.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8',
};

/** The element bundle's file name; its sidecars sit beside it. */
export const ELEMENT_BUNDLE = 'workflow-render.js';

/**
 * Where the built element and its sidecars live: `dist/element/`, staged there
 * by this package's build (scripts/build.mjs) and shipped at that path, which
 * is also the documented CDN path. Found relative to this file, never through
 * a package name: from the bundle (`dist/*.js`) it is `./element`, from the
 * sources under test (`src/*.ts`) it is `../dist/element`.
 */
export function elementDir(): string {
  const candidates = ['./element/', '../dist/element/'].map((relative) =>
    fileURLToPath(new URL(relative, import.meta.url)),
  );
  const found = candidates.find((candidate) => existsSync(join(candidate, ELEMENT_BUNDLE)));
  if (found === undefined) {
    throw new Error('the element bundle is not built — run `pnpm build` first');
  }
  return found;
}

const PAGE = `<!doctype html>
<meta charset="utf-8" />
<title>workflow-render</title>
<style>html,body{margin:0;height:100%}workflow-render{display:block;height:100%}</style>
<script type="module" src="./workflow-render.js"></script>
<workflow-render src="./workflow.json"></workflow-render>
`;

export interface ViewServer {
  url: string;
  close: () => Promise<void>;
}

export async function serve(file: string, port = 0): Promise<ViewServer> {
  const workflow = await readFile(file, 'utf8'); // fail fast if it is unreadable
  const dist = elementDir();

  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';

    if (path === '/' || path === '/index.html') {
      response.writeHead(200, { 'content-type': TYPES['.html'] as string }).end(PAGE);
      return;
    }
    if (path === '/workflow.json') {
      response.writeHead(200, { 'content-type': TYPES['.json'] as string }).end(workflow);
      return;
    }

    // Everything else comes from the element's dist, and only from there.
    const name = path.replace(/^\/+/, '');
    const target = join(dist, name);
    if (!target.startsWith(dist.endsWith(sep) ? dist : dist + sep) || !existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(response);
  });

  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${actual}/`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
