/**
 * The shape of the published package: what `exports` promises exists, the
 * element sits at its documented CDN path under its budget, and the layout the
 * path resolvers rely on (flat dist/, data/ beside it) holds.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { packageVersion, parseArgs } from '../src/index.js';
import { elementDir } from '../src/view.js';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgDir, 'dist');
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
  version: string;
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
};

/** Public contract: the landing page and CDN users address these by name. */
const ELEMENT_FILES = [
  'workflow-render.js',
  'workflow-render-icons.json',
  'workflow-render-subtitles.json',
  'workflow-render-descriptions.json',
  'inter-400.woff2',
  'inter-500.woff2',
  'inter-600.woff2',
];

describe('package shape', () => {
  it('has every file its exports map and bin point at', () => {
    const targets = [
      ...Object.values(manifest.bin),
      ...Object.values(manifest.exports).flatMap((entry) => (typeof entry === 'string' ? [entry] : Object.values(entry))),
    ].filter((target) => !target.includes('*'));
    expect(targets.length).toBeGreaterThan(6);
    for (const target of targets) expect(existsSync(join(pkgDir, target)), target).toBe(true);
  });

  it('keeps every code chunk directly in dist/, where the path resolvers expect it', () => {
    const nested = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.js') && file.includes('/') && !file.startsWith('element/'),
    );
    expect(nested).toEqual([]);
  });

  it('stages the data beside dist/, in the shape dataRoot() expects', () => {
    const data = join(pkgDir, 'data');
    expect(existsSync(join(data, 'fonts', 'inter-400.ttf'))).toBe(true);
    expect(existsSync(join(data, 'README.md'))).toBe(true);
    const versions = readdirSync(data, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'fonts');
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      for (const file of ['icons.json', 'descriptions.json', 'subtitles.json', 'glyphs.json', 'font-metrics.json', 'meta.json']) {
        expect(existsSync(join(data, version.name, file)), `${version.name}/${file}`).toBe(true);
      }
    }
  });
});

describe('the shipped element (dist/element, the CDN path)', () => {
  it('is what `view` serves', () => {
    expect(resolve(elementDir())).toBe(join(dist, 'element'));
  });

  it('is byte-identical to the element package build, file names unchanged', () => {
    const source = resolve(pkgDir, '../element/dist');
    for (const file of ELEMENT_FILES) {
      expect(existsSync(join(dist, 'element', file)), file).toBe(true);
      expect(readFileSync(join(dist, 'element', file)).equals(readFileSync(join(source, file))), file).toBe(true);
    }
  });

  it('stays under 300 KB gzip — measured on the file that is published', () => {
    const gzipped = gzipSync(readFileSync(join(dist, 'element', 'workflow-render.js'))).length;
    expect(gzipped, `${(gzipped / 1024).toFixed(1)} KB gzip`).toBeLessThan(300 * 1024);
    // and it is the real bundle, not a stub that would make the budget vacuous
    expect(gzipped).toBeGreaterThan(30 * 1024);
  });
});

describe('--version', () => {
  it('parses as its own command', () => {
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgs(['-v'])).toEqual({ kind: 'version' });
  });

  it('reports the version in package.json', () => {
    expect(packageVersion()).toBe(manifest.version);
  });
});
