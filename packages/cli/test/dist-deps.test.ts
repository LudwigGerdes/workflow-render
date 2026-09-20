/**
 * The published package is a bundle: the workspace libraries are inlined and
 * everything else is `external`. An external that is not in `dependencies`
 * works in the workspace (pnpm hoists it) and fails for anyone who installs the
 * tarball, so check the BUILT files against the DECLARED dependencies.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgDir, 'dist');
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const declared = new Set(Object.keys(manifest.dependencies ?? {}));

// `fs.globSync` is Node 22+; recursive readdir is enough and runs on Node 20.
const filesUnder = (dir: string): string[] => readdirSync(dir, { recursive: true, encoding: 'utf8' });

/** Real module specifiers only: `… from 'x'`, `import 'x'`, `import('x')`, `require('x')`. */
const SPECIFIERS = [
  /^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const bareName = (spec: string): string =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec);

function bareImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found = new Set<string>();
  for (const pattern of SPECIFIERS) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1] ?? '';
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      if (builtinModules.includes(spec)) continue;
      found.add(bareName(spec));
    }
  }
  return [...found];
}

describe('the built package declares what it imports', () => {
  it('is built', () => {
    expect(existsSync(join(dist, 'cli.js')), 'run pnpm build first').toBe(true);
  });

  it('imports no undeclared package from the Node bundle', () => {
    const undeclared = new Set<string>();
    for (const file of filesUnder(dist)) {
      if (!file.endsWith('.js') || file.startsWith('element')) continue;
      for (const name of bareImports(join(dist, file))) if (!declared.has(name)) undeclared.add(name);
    }
    expect([...undeclared].sort()).toEqual([]);
  });

  it('references no undeclared package from the shipped declarations', () => {
    const undeclared = new Set<string>();
    for (const file of filesUnder(dist)) {
      if (!file.endsWith('.d.ts')) continue;
      for (const name of bareImports(join(dist, file))) if (!declared.has(name)) undeclared.add(name);
    }
    expect([...undeclared].sort()).toEqual([]);
  });

  it('inlines the workspace libraries rather than importing them', () => {
    for (const file of filesUnder(dist)) {
      if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue;
      const names = bareImports(join(dist, file));
      expect(names.filter((name) => name.startsWith('workflow-render')), file).toEqual([]);
    }
  });

  it('keeps the native @resvg/resvg-js addon external', () => {
    const importers = filesUnder(dist).filter(
      (file) => file.endsWith('.js') && bareImports(join(dist, file)).includes('@resvg/resvg-js'),
    );
    expect(importers.length).toBeGreaterThan(0);
    expect(filesUnder(dist).filter((file) => file.endsWith('.node'))).toEqual([]);
  });

  it('ships a browser element that imports nothing at all', () => {
    expect(bareImports(join(dist, 'element', 'workflow-render.js'))).toEqual([]);
  });
});
