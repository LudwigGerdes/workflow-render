/**
 * The one place that knows where the data lives.
 *
 * The n8n-derived bundles (`<version>/icons.json`, `descriptions.json`, …) and
 * the Inter faces (`fonts/`) sit in a directory called `data` that is a sibling
 * of the directory holding the running code. That single rule covers both
 * layouts the code runs from:
 *
 *   workspace checkout   packages/assets/{src,dist}/*.js  → packages/assets/data
 *                        packages/cli/dist/*.js           → packages/cli/data   (staged by the cli build)
 *   installed tarball    node_modules/workflow-render/dist/*.js → node_modules/workflow-render/data
 *
 * which is why the published bundle keeps every chunk flat in `dist/`.
 * `WORKFLOW_RENDER_DATA` overrides it: point it at a directory of the same
 * shape to render against another extraction (or none — a missing bundle is a
 * supported state, see `load` in index.ts).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ENV = 'WORKFLOW_RENDER_DATA';

export function dataRoot(): string {
  const override = process.env[DATA_ENV];
  if (override !== undefined && override !== '') return resolve(override);
  return fileURLToPath(new URL('../data', import.meta.url));
}

/** Absolute path of one file under the data root. */
export function dataFile(...segments: string[]): string {
  return resolve(dataRoot(), ...segments);
}
