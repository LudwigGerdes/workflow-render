import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { exportSVG, layout, parseInput } from '../src/index.js';
import type { SceneGraph } from '../src/index.js';

const scene = (name: string): SceneGraph => {
  const { model } = parseInput(
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  if (!model) throw new Error('no model');
  return layout(model);
};

const FONTS = [{ weight: 500, woff2Base64: 'd29mZjI=' }];

describe('exportSVG', () => {
  it('is the same SVG the viewer shows', () => {
    const svg = exportSVG(scene('linear'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('data-descriptions-version=');
    expect(svg).toContain('data-view="design"');
  });

  it('embeds supplied fonts as data URIs so the file stands alone', () => {
    const svg = exportSVG(scene('linear'), { fonts: FONTS });
    expect(svg).toContain('@font-face');
    expect(svg).toContain('data:font/woff2;base64,d29mZjI=');
    expect(svg).toContain('font-weight:500');
  });

  it('embeds nothing when no fonts are supplied', () => {
    expect(exportSVG(scene('linear'))).not.toContain('@font-face');
  });

  it('is byte-identical for identical input', () => {
    expect(exportSVG(scene('linear'), { fonts: FONTS })).toBe(exportSVG(scene('linear'), { fonts: FONTS }));
  });

  it('stays well-formed XML with fonts embedded', () => {
    const svg = exportSVG(scene('branching'), { fonts: FONTS });
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(svg)).not.toThrow();
  });

  describe('provenance', () => {
    const provenance = {
      tool: { name: 'workflow-render', version: '9.9.9' },
      inputHash: 'sha256:0123456789abcdef',
      workflow: { id: 'wf_1', name: 'Order "intake" <v2>', versionId: 'ver_42' },
    };

    it('stamps the tool, the input hash and the workflow identity on the root element', () => {
      const svg = exportSVG(scene('linear'), { provenance });
      const root = svg.match(/^<svg\b[^>]*>/)?.[0] ?? '';
      expect(root).toContain('data-tool-name="workflow-render"');
      expect(root).toContain('data-tool-version="9.9.9"');
      expect(root).toContain('data-input-hash="sha256:0123456789abcdef"');
      expect(root).toContain('data-workflow-id="wf_1"');
      expect(root).toContain('data-workflow-name="Order &quot;intake&quot; &lt;v2&gt;"');
      expect(root).toContain('data-workflow-version-id="ver_42"');
      expect(root).toContain('data-descriptions-version=');
      expect(() => new XMLParser({ ignoreAttributes: false }).parse(svg)).not.toThrow();
    });

    it('writes only the fields it was given, and nothing without provenance', () => {
      const partial = exportSVG(scene('linear'), { provenance: { workflow: { versionId: 'ver_42' } } });
      expect(partial).toContain('data-workflow-version-id="ver_42"');
      expect(partial).not.toContain('data-tool-name');
      expect(partial).not.toContain('data-input-hash');
      expect(partial).not.toContain('data-workflow-id');
      expect(exportSVG(scene('linear'))).not.toMatch(/data-(tool|input-hash|workflow)/);
    });

    it('is byte-identical for the same provenance and stays the same SVG otherwise', () => {
      const a = exportSVG(scene('linear'), { fonts: FONTS, provenance });
      expect(a).toBe(exportSVG(scene('linear'), { fonts: FONTS, provenance }));
      expect(a.replace(/^<svg\b[^>]*>/, '')).toBe(exportSVG(scene('linear'), { fonts: FONTS }).replace(/^<svg\b[^>]*>/, ''));
    });
  });

  it('exports the execution view too, badges and all', () => {
    const svg = exportSVG(scene('execution-error'), { theme: 'dark' });
    expect(svg).toContain('data-view="execution"');
    expect(svg).toContain('wr-badge-error');
  });
});
