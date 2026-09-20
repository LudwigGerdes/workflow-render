// prepack / postpack for the one published package (packages/cli → `workflow-render`).
//
// pre:  refuse to pack an unbuilt package (dist/ and data/ are build outputs,
//       see packages/cli/scripts/build.mjs), then copy the repo-level LICENSE,
//       README.md and THIRD_PARTY_NOTICES.md beside package.json — npm only
//       packs what is inside the package directory.
// post: remove those copies again (they are gitignored).
//
// Usage, from packages/cli: node ../../scripts/pack-files.mjs pre|post
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = process.cwd();
const phase = process.argv[2];

const COPIED = ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md'];
const BUILT = [
  'dist/cli.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/core.js',
  'dist/core.d.ts',
  'dist/element/workflow-render.js',
  'dist/element/workflow-render.d.ts',
  'dist/element/workflow-render-icons.json',
  'dist/element/workflow-render-subtitles.json',
  'dist/element/workflow-render-descriptions.json',
  'data/fonts/inter-400.ttf',
];

if (phase === 'pre') {
  const missing = BUILT.filter((file) => !existsSync(join(pkgDir, file)));
  if (missing.length > 0) {
    process.stderr.write(`refusing to pack: not built (${missing.join(', ')}). Run \`pnpm build\` first.\n`);
    process.exit(1);
  }
  for (const file of COPIED) copyFileSync(join(root, file), join(pkgDir, file));
} else if (phase === 'post') {
  for (const file of COPIED) rmSync(join(pkgDir, file), { force: true });
} else {
  process.stderr.write('usage: pack-files.mjs pre|post\n');
  process.exit(2);
}
