import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { parseOverlay, edgeKey, worstKind } from '../src/overlay.js';
import { renderSVG } from '../src/render.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const sceneOf = (name: string) => {
  const { model } = parseInput(fixture(name));
  return layout(model!);
};

describe('parseOverlay', () => {
  it('accepts the shape workflow-lint emits, edges optional', () => {
    const { overlay, errors } = parseOverlay({
      version: 1,
      source: 'workflow-lint 0.1.2',
      nodes: { A: { badges: [{ kind: 'warn', text: 'naming/x: rename' }] }, B: { tint: '#ff0000' } },
    });
    expect(errors).toEqual([]);
    expect(overlay?.source).toBe('workflow-lint 0.1.2');
    expect(overlay?.nodes['A']?.badges).toHaveLength(1);
    expect(overlay?.edges).toEqual({});
  });

  it('names every problem with its path and renders nothing from a bad overlay', () => {
    const { overlay, errors } = parseOverlay({
      version: 2,
      nodes: { A: { badges: [{ kind: 'fatal', text: 'x' }], tint: 'red' }, B: 'nope' },
      edges: { 'A B': { tint: 'url(x)' } },
    });
    expect(overlay).toBeUndefined();
    expect(errors.join('\n')).toMatch(/version: expected 1/);
    expect(errors.join('\n')).toMatch(/nodes\["A"\]\.badges\[0\]/);
    expect(errors.join('\n')).toMatch(/nodes\["A"\]\.tint/);
    expect(errors.join('\n')).toMatch(/nodes\["B"\]: expected an object/);
    expect(errors.join('\n')).toMatch(/edges\["A B"\]: the key/);
    expect(errors.join('\n')).toMatch(/edges\["A B"\]\.tint/);
  });

  it('ranks error above warn above info', () => {
    expect(worstKind([{ kind: 'info', text: '' }, { kind: 'error', text: '' }, { kind: 'warn', text: '' }])).toBe('error');
    expect(worstKind([{ kind: 'info', text: '' }, { kind: 'warn', text: '' }])).toBe('warn');
    expect(worstKind([])).toBeUndefined();
  });
});

describe('renderSVG with an overlay', () => {
  const scene = sceneOf('linear');
  const names = scene.nodes.map((n) => n.node.name);
  const first = names[0]!;
  const second = names[1]!;

  it('draws a ring and a badge with the badge texts as a tooltip', () => {
    const { overlay } = parseOverlay({
      version: 1,
      nodes: { [first]: { badges: [{ kind: 'warn', text: 'naming/x: rename it' }, { kind: 'error', text: 'hygiene/y: <secret>' }] } },
    });
    const svg = renderSVG(scene, { overlay });
    expect(svg).toContain('class="wr-overlay-ring wr-overlay-error"');
    expect(svg).toContain('class="wr-overlay-badge wr-overlay-error"');
    expect(svg).toMatch(/<title>hygiene\/y: &lt;secret&gt;\nnaming\/x: rename it<\/title>/);
    expect(svg).toContain('>2</text>');
    expect(svg).not.toContain('data-overlay-source'); // no source given, no attribute
  });

  it('a tint colours the ring without a badge, and the edge it names', () => {
    const { overlay } = parseOverlay({
      version: 1,
      nodes: { [second]: { tint: '#00aa00' } },
      edges: { [edgeKey(first, second)]: { tint: '#ff00ff', label: 'slow' } },
    });
    const svg = renderSVG(scene, { overlay });
    expect(svg).toContain('class="wr-overlay-ring wr-overlay-tint"');
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).not.toContain('wr-overlay-badge');
    expect(svg).toContain('stroke="#ff00ff"');
    expect(svg).toContain('slow');
  });

  it('names its source on the root and is deterministic', () => {
    const { overlay } = parseOverlay({ version: 1, source: 'workflow-lint 0.1.2', nodes: { [first]: { badges: [{ kind: 'info', text: 'i' }] } } });
    const a = renderSVG(scene, { overlay });
    const b = renderSVG(scene, { overlay });
    expect(a).toBe(b);
    expect(a).toContain('data-overlay-source="workflow-lint 0.1.2"');
  });

  it('a node the workflow does not have is ignored, and no overlay leaves the SVG unchanged', () => {
    const { overlay } = parseOverlay({ version: 1, nodes: { Nope: { badges: [{ kind: 'error', text: 'x' }] } } });
    expect(renderSVG(scene, { overlay })).toBe(renderSVG(scene));
  });
});
