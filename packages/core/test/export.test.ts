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

  it('exports the execution view too, badges and all', () => {
    const svg = exportSVG(scene('execution-error'), { theme: 'dark' });
    expect(svg).toContain('data-view="execution"');
    expect(svg).toContain('wr-badge-error');
  });
});
