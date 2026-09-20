/**
 * Stage the element bundle and the example workflows into public/.
 *
 * The site loads <workflow-render> as a plain <script type="module"> next to its own
 * page — exactly the way someone self-hosting embeds it — which also keeps the
 * icon sidecar adjacent to the script that fetches it.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');
const elementDist = resolve(here, '../../element/dist');
const fixtures = resolve(here, '../../core/test/fixtures');

mkdirSync(resolve(publicDir, 'examples'), { recursive: true });

for (const file of [
  'workflow-render.js',
  'workflow-render-icons.json',
  'workflow-render-subtitles.json',
  'workflow-render-descriptions.json',
  'inter-400.woff2',
  'inter-500.woff2',
  'inter-600.woff2',
]) {
  copyFileSync(resolve(elementDist, file), resolve(publicDir, file));
}
for (const file of ['linear.json', 'branching.json', 'execution-success.json']) {
  copyFileSync(resolve(fixtures, file), resolve(publicDir, 'examples', file));
}

process.stdout.write('site assets staged\n');
