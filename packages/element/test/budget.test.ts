import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// happy-dom serves modules over http, so import.meta.url cannot locate files.
const bundlePath = (): string | undefined =>
  [
    resolve(process.cwd(), 'packages/element/dist/workflow-render.js'),
    resolve(process.cwd(), 'dist/workflow-render.js'),
  ].find((candidate) => existsSync(candidate));

/**
 * The element must stay embeddable: one file, under 300 KB gzipped, icons
 * included. If this fails, the documented fallback is to move icons to a
 * sidecar fetched next to the JS (see README).
 */
describe('bundle budget', () => {
  it('stays under 300 KB gzip', () => {
    const bundle = bundlePath();
    if (!bundle) {
      expect.fail('build the element first: pnpm --filter workflow-render-element build');
    }
    const gzipped = gzipSync(readFileSync(bundle)).length;
    expect(gzipped, `${(gzipped / 1024).toFixed(1)} KB gzip`).toBeLessThan(300 * 1024);
  });
});
