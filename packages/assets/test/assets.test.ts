import { describe, expect, it } from 'vitest';
import { EMULATED_VERSION, loadDescriptions, loadIcons, loadSubtitles } from '../src/index.js';

describe('EMULATED_VERSION', () => {
  it('is the pinned n8n version', () => {
    expect(EMULATED_VERSION).toBe('2.38.1');
  });
});

describe('loadIcons', () => {
  it('resolves the whole node-type catalogue', async () => {
    const icons = await loadIcons();
    expect(Object.keys(icons).length).toBeGreaterThan(400);
  });

  it('gives Airtable a real svg icon', async () => {
    const icons = await loadIcons();
    const entry = icons['n8n-nodes-base.airtable'];
    expect(entry?.type).toBe('svg');
    expect(entry?.type === 'svg' && entry.svg.startsWith('<svg')).toBe(true);
  });

  it('has no entry for an unknown type', async () => {
    const icons = await loadIcons();
    expect(icons['n8n-nodes-base.definitelyNotANode']).toBeUndefined();
  });

  it('sanitises every svg', async () => {
    const icons = await loadIcons();
    for (const [type, entry] of Object.entries(await Promise.resolve(icons))) {
      if (entry.type !== 'svg') continue;
      expect(entry.svg, type).not.toMatch(/<script/i);
      expect(entry.svg, type).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  it('resolves fa: icons to real glyphs with their colour name', async () => {
    // Naming a node here made this test fail on the 2.38.1 bump, when Set
    // gained a real vendor SVG -- an improvement the assertion read as a
    // regression. What matters is that fa:-backed entries resolve to a usable
    // glyph, whichever nodes still use one.
    const icons = await loadIcons();
    const glyphs = Object.values(icons).filter((i) => i.type === 'glyph');
    expect(glyphs.length).toBeGreaterThan(0);
    for (const entry of glyphs) {
      if (entry.type !== 'glyph') continue;
      expect(entry.body).toContain('<path');
      expect(entry.viewBox).toMatch(/^0 0 \d+ \d+$/);
    }
    const tinted = glyphs.find((g) => g.type === 'glyph' && g.colorName);
    expect(tinted).toBeDefined();
  });

  it('still falls back to a monogram when no icon can be resolved', async () => {
    const icons = await loadIcons();
    const monograms = Object.values(icons).filter((i) => i.type === 'monogram');
    expect(monograms.length).toBeGreaterThan(0);
  });

  it('memoises', async () => {
    expect(await loadIcons()).toBe(await loadIcons());
  });
});

describe('loadDescriptions', () => {
  it('keys the Set node by full type with all version ranges', async () => {
    const descriptions = await loadDescriptions();
    const set = descriptions['n8n-nodes-base.set'];
    expect(set).toBeDefined();
    // The Set node's version numbers climb with every n8n release, so assert
    // the shape rather than a number: a versioned entry exists, and the default
    // is the newest version that entry declares.
    const current = set?.find((d) => Array.isArray(d.version) && d.version.length > 1);
    expect(current).toBeDefined();
    const versions = current?.version as number[];
    expect(current?.defaultVersion).toBe(Math.max(...versions));
  });

  it('drops codex and docs prose', async () => {
    const descriptions = await loadDescriptions();
    const raw = JSON.stringify(descriptions['n8n-nodes-base.airtable']);
    expect(raw).not.toContain('"codex"');
    expect(raw).not.toContain('docs.n8n.io');
  });

  it('keeps credential names only', async () => {
    const descriptions = await loadDescriptions();
    const creds = descriptions['n8n-nodes-base.airtable']?.[0]?.credentials;
    expect(creds?.[0]?.name).toBeTruthy();
    expect(JSON.stringify(creds)).not.toContain('displayOptions');
  });
});

describe('raster vendor icons', () => {
  it('inlines them, so the bundle fetches nothing at render time', async () => {
    const icons = await loadIcons();
    const images = Object.values(icons).filter((i) => i.type === 'image');
    expect(images.length).toBeGreaterThan(0);
    for (const entry of images) {
      if (entry.type !== 'image') continue;
      // Self-contained: a remote href would break the offline guarantee.
      expect(entry.href.startsWith('data:image/')).toBe(true);
      expect(entry.href).not.toMatch(/^https?:/);
    }
  });

  it('leaves almost nothing as initials', async () => {
    // n8n declares icons three ways and ships some as raster. Missing any of
    // those routes silently cost 166 node types their icon at one point.
    const icons = await loadIcons();
    const monograms = Object.values(icons).filter((i) => i.type === 'monogram');
    expect(monograms.length).toBeLessThanOrEqual(10);
  });
});

describe('missing data files', () => {
  // The n8n-derived bundles are optional: a checkout without them must still
  // render, with monogram tiles and blank subtitles instead of a crash.
  it('resolves to an empty catalogue when the icons file is absent', async () => {
    await expect(loadIcons('0.0.0-absent')).resolves.toEqual({});
  });

  it('resolves to an empty catalogue when the descriptions file is absent', async () => {
    await expect(loadDescriptions('0.0.0-absent')).resolves.toEqual({});
  });

  it('resolves to an empty catalogue when the subtitles file is absent', async () => {
    await expect(loadSubtitles('0.0.0-absent')).resolves.toEqual({});
  });
});
