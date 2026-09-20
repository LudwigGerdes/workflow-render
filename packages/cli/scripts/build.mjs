/**
 * Build the ONE published package, `workflow-render`.
 *
 *   dist/cli.js, dist/index.js, dist/core.js   esbuild bundle of this package plus the
 *                                              internal workspace libraries (core, assets).
 *                                              One invocation with `splitting`, so the CLI
 *                                              and `workflow-render/core` share one copy.
 *   dist/index.d.ts, dist/core.d.ts            rolled-up declarations (dts-bundle-generator)
 *   dist/element/                              the browser bundle, its sidecars and its types,
 *                                              copied from packages/element/dist. This is the
 *                                              documented CDN path; keep the file names stable.
 *   data/                                      a copy of packages/assets/data (gitignored), so
 *                                              `dataRoot()` finds `../data` beside `dist/` in a
 *                                              checkout exactly as it does in the tarball.
 *
 * Third-party packages stay external and must be declared in package.json
 * `dependencies` (test/dist-deps.test.ts enforces it). `@resvg/resvg-js` is a
 * native addon and can never be bundled.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgDir, 'dist');
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const external = Object.keys(manifest.dependencies ?? {});

/** The files that make up the embeddable element. Names are a public contract. */
export const ELEMENT_FILES = [
  'workflow-render.js',
  'workflow-render-icons.json',
  'workflow-render-subtitles.json',
  'workflow-render-descriptions.json',
  'inter-400.woff2',
  'inter-500.woff2',
  'inter-600.woff2',
];

rmSync(dist, { recursive: true, force: true });
rmSync(join(pkgDir, 'data'), { recursive: true, force: true });

// 1. code
await build({
  absWorkingDir: pkgDir,
  entryPoints: ['src/cli.ts', 'src/index.ts', 'src/core.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  // dataRoot() and elementDir() resolve relative to the running file: every
  // chunk must sit directly in dist/.
  chunkNames: 'chunk-[hash]',
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  sourcesContent: false,
  external,
  logLevel: 'warning',
});

// 2. declarations for `.` and `./core`, with the workspace libraries inlined
const dtsBin = join(pkgDir, 'node_modules', 'dts-bundle-generator', 'dist', 'bin', 'dts-bundle-generator.js');
for (const entry of ['index', 'core']) {
  execFileSync(
    process.execPath,
    [
      dtsBin,
      '--project', 'tsconfig.json',
      '--no-banner',
      '--export-referenced-types', 'false',
      '--external-inlines', 'workflow-render-core', 'workflow-render-assets',
      '--out-file', `dist/${entry}.d.ts`,
      `src/${entry}.ts`,
    ],
    { cwd: pkgDir, stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

// 3. the browser element, at its stable path
const elementDist = resolve(pkgDir, '../element/dist');
const elementOut = join(dist, 'element');
mkdirSync(elementOut, { recursive: true });
for (const file of ELEMENT_FILES) {
  if (!existsSync(join(elementDist, file))) {
    throw new Error(`packages/element/dist/${file} is missing — build workflow-render-element first`);
  }
  copyFileSync(join(elementDist, file), join(elementOut, file));
}
copyFileSync(join(elementDist, 'workflow-render.d.ts'), join(elementOut, 'workflow-render.d.ts'));

// 4. the data
cpSync(resolve(pkgDir, '../assets/data'), join(pkgDir, 'data'), { recursive: true });

const count = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (n, entry) => n + (entry.isDirectory() ? count(join(dir, entry.name)) : 1),
    0,
  );
process.stdout.write(`workflow-render built: dist (${count(dist)} files), data (${count(join(pkgDir, 'data'))} files)\n`);
