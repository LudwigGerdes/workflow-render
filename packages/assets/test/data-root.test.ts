import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATA_ENV, dataRoot } from '../src/data-root.js';

const committed = resolve(__dirname, '../data');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dataRoot', () => {
  it('is the data directory beside the code when nothing overrides it', () => {
    vi.stubEnv(DATA_ENV, '');
    expect(dataRoot()).toBe(committed);
  });

  it('is the override directory when WORKFLOW_RENDER_DATA is set', () => {
    vi.stubEnv(DATA_ENV, '/somewhere/else');
    expect(dataRoot()).toBe('/somewhere/else');
  });

  it('resolves a relative override against the working directory', () => {
    vi.stubEnv(DATA_ENV, 'my-data');
    expect(dataRoot()).toBe(resolve(process.cwd(), 'my-data'));
  });
});

describe('loaders follow the data root', () => {
  it('reads icons, fonts and meta from the override, and falls back to empty when a bundle is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wr-data-'));
    try {
      mkdirSync(join(dir, '9.9.9'));
      writeFileSync(join(dir, '9.9.9', 'icons.json'), JSON.stringify({ 'x.node': { type: 'monogram', letters: 'X', color: '#000' } }));
      cpSync(join(committed, 'fonts'), join(dir, 'fonts'), { recursive: true });
      vi.stubEnv(DATA_ENV, dir);
      const assets = await import('../src/index.js');
      await expect(assets.loadIcons('9.9.9')).resolves.toHaveProperty(['x.node']);
      await expect(assets.loadSubtitles('9.9.9')).resolves.toEqual({});
      expect(assets.fontFiles().every((file) => file.startsWith(dir))).toBe(true);
      expect((await assets.loadWebFonts()).length).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
