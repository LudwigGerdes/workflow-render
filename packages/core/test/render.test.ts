import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { loadIcons, loadSubtitles } from 'workflow-render-assets';
import type { IconEntry } from 'workflow-render-assets';
import { ARROW_POINTS, DOT_SPACING, DESCRIPTIONS_VERSION, ICON_SIZE } from '../src/constants.js';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { renderSVG } from '../src/render.js';
import { el, esc, num } from '../src/svg.js';
import type { CanvasModel, RenderOptions } from '../src/types.js';

const model = (name: string): CanvasModel => {
  const { model: m } = parseInput(
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  if (!m) throw new Error('no model');
  return m;
};
const svgOf = (name: string, opts: RenderOptions = {}): string => renderSVG(layout(model(name)), opts);

const SUBTITLES = await loadSubtitles();

/**
 * The real icon set with a genuine glyph entry moved onto a node the fixtures
 * contain. Glyph rendering is the renderer's concern; which node n8n happens to
 * give an fa: icon is not, and pinning to the latter made these tests fail on a
 * version bump that had in fact improved those nodes' icons.
 */
const withGlyphOnIf = async (colorName?: string): Promise<Record<string, IconEntry>> => {
  const icons = await loadIcons();
  const glyph = Object.values(icons).find((i) => i.type === 'glyph');
  if (glyph?.type !== 'glyph') throw new Error('the bundle has no glyph icon to test with');
  return { ...icons, 'n8n-nodes-base.if': { ...glyph, ...(colorName ? { colorName } : {}) } };
};

describe('svg builder', () => {
  it('escapes text and attributes', () => {
    expect(esc('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
    expect(el('text', { 'data-x': '<&">' })).toContain('data-x="&lt;&amp;&quot;&gt;"');
  });

  it('emits attributes in sorted order for determinism', () => {
    expect(el('rect', { y: 2, x: 1, fill: 'red' })).toBe('<rect fill="red" x="1" y="2"/>');
  });

  it('drops undefined and false attributes and nests children', () => {
    expect(el('g', { a: undefined, b: false, c: 'k' }, '<rect/>')).toBe('<g c="k"><rect/></g>');
  });

  it('rounds numbers to two decimals', () => {
    expect(num(1.23456)).toBe('1.23');
    expect(num(3)).toBe('3');
    expect(el('rect', { x: 0.1 + 0.2 })).toBe('<rect x="0.3"/>');
  });
});

describe('document', () => {
  it('stamps the emulated version and view on the root', () => {
    const svg = svgOf('linear');
    expect(svg).toContain(`data-descriptions-version="${DESCRIPTIONS_VERSION}"`);
    expect(svg).toContain('data-view="design"');
    expect(svg).toContain('viewBox="-80 -224 704 419.25"'); // bounds cover the label box and subtitle line
    expect(svgOf('execution-success')).toContain('data-view="execution"');
  });

  it('is well-formed XML', () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    for (const fixture of ['linear', 'branching', 'execution-success', 'execution-error']) {
      expect(() => parser.parse(svgOf(fixture))).not.toThrow();
    }
  });

  it('layers stickies behind edges behind nodes', () => {
    const svg = svgOf('linear');
    expect(svg.indexOf('class="wr-sticky"')).toBeLessThan(svg.indexOf('class="wr-edge'));
    expect(svg.indexOf('class="wr-edge')).toBeLessThan(svg.indexOf('class="wr-node"'));
  });

  it('ships one theme, with no second palette riding along', () => {
    // Every render used to carry a full dark palette so a host could reskin by
    // swapping a class. Light is the only theme, so that was dead weight in
    // every exported SVG.
    const svg = svgOf('linear');
    expect(svg).not.toContain('wr-theme-dark');
    expect(svg).toContain('data-theme="light"');
  });
});

describe('design view', () => {
  it('draws one group per node with its name', () => {
    const svg = svgOf('linear');
    expect(svg.match(/class="wr-node"/g)).toHaveLength(3);
    expect(svg).toContain('data-node-name="HTTP Request"');
    expect(svg.match(/class="wr-edge wr-edge-main"/g)).toHaveLength(2);
  });

  it('renders sticky content as markdown lines', () => {
    const svg = svgOf('linear');
    expect(svg).toContain('Demo');
    expect(svg).toContain('>Linear</tspan>');
    expect(svg).toContain('>flow</tspan>');
    expect(svg).toContain('font-weight="700"');
  });

  it('links only safe url schemes from sticky markdown', () => {
    const m = model('linear');
    m.stickies[0]!.content =
      '[ok](https://example.com/a) [rel](./local.json) [bad](javascript:alert(1)) [data](data:text/html,x)';
    const svg = renderSVG(layout(m));
    expect(svg).toContain('xlink:href="https://example.com/a"');
    expect(svg).toContain('xlink:href="./local.json"');
    expect(svg).not.toContain('javascript:');
    expect(svg).not.toContain('data:text/html');
    expect(svg).toContain('>bad</tspan>'); // still rendered, just not linked
  });

  it('labels branch outputs and dashes ai edges', () => {
    const svg = svgOf('branching');
    for (const label of ['true', 'false', 'A', 'B', 'C']) {
      expect(svg).toContain(`>${label}</text>`);
    }
    expect(svg).toContain('class="wr-edge wr-edge-ai"');
    expect(svg).toContain('class="wr-node wr-disabled"');
    expect(svg).toContain('Skip (Deactivated)'); // measured: n8n renames the node
  });

  it('draws a glyph icon as a coloured glyph, not a lettered box', async () => {
    // Which nodes carry an fa: glyph is n8n's choice and it changes between
    // releases -- 2.38.1 moved Set and IF onto real SVGs -- so put the glyph on
    // a fixture node here rather than depending on that choice.
    const svg = svgOf('branching', { icons: await withGlyphOnIf('green') });
    expect(svg).toContain('class="wr-glyph"');
    // the tint must reach the glyph: its paths paint with currentColor
    expect(svg).toContain('color="#00786f"'); // ICON_COLORS.green, re-measured at 2.38.3
    expect(svg).toContain(`width="${ICON_SIZE}"`);
  });

  it('wraps a long node name inside the measured label box', () => {
    const svg = svgOf('linear');
    // "When clicking 'Execute workflow'" does not fit 192px on one line.
    const lines = svg.match(/class="wr-node-name"/g) ?? [];
    expect(lines.length).toBeGreaterThan(3); // 3 nodes, one of them multi-line
    // wraps where n8n wraps it, per the fitted glyph advance
    expect(svg).toContain(">When clicking 'Execute</text>");
  });

  it('prints the node subtitle n8n shows under the name', () => {
    const svg = svgOf('linear', { subtitles: SUBTITLES });
    expect(svg).toContain('class="wr-node-subtitle"');
    expect(svg).toContain('GET: https://api.example'); // truncated like n8n
    expect(svg).toContain('>manual</text>'); // the Set node's mode
  });

  it('paints the canvas dot grid', () => {
    const svg = svgOf('linear');
    expect(svg).toContain('id="wr-dots"');
    expect(svg).toContain(`patternUnits="userSpaceOnUse" width="${DOT_SPACING}"`);
    expect(svg).toContain('#828282'); // measured dot colour
  });

  it('tips connectors with n8n\'s arrowhead', () => {
    const svg = svgOf('linear');
    expect(svg).toContain('id="wr-arrow-main"');
    expect(svg).toContain('marker-end="url(#wr-arrow-main)"');
    expect(svg).toContain(ARROW_POINTS);
  });

  it('renders every node as an initials tile when no icon catalogue is available', () => {
    // The n8n-derived icon bundle is optional: without it the canvas still
    // renders, each tile carrying the node's initials in the same geometry.
    const svg = svgOf('branching', { icons: {} });
    expect(svg).not.toContain('class="wr-icon"');
    expect(svg).not.toContain('class="wr-glyph"');
    const tiles = svg.match(/class="wr-monogram"/g) ?? [];
    expect(tiles.length).toBe(model('branching').nodes.length);
    expect(svg).toContain(`<g class="wr-monogram"><rect fill="#999" height="${num(ICON_SIZE)}"`);
  });

  it('embeds a real icon when one is supplied and a monogram otherwise', async () => {
    const svg = svgOf('branching', { icons: await withGlyphOnIf() });
    expect(svg).toContain('class="wr-icon"'); // the vendor SVGs
    expect(svg).toContain('class="wr-glyph"'); // and the glyph put on IF
    expect(svg).not.toContain('<script');
  });
});

describe('execution view', () => {
  it('marks every successful node and labels the item counts', () => {
    const svg = svgOf('execution-success');
    expect(svg.match(/class="wr-badge wr-badge-success"/g)).toHaveLength(3);
    expect(svg).toContain('>1 item</text>');
    expect(svg).toContain('>2 items</text>');
    expect(svg).toContain('class="wr-header"');
  });

  it('recolours executed tiles and the connectors that carried data', () => {
    const svg = svgOf('execution-success', { theme: 'light' });
    // measured: successful tiles take the success colour at 2px, and a
    // connector that carried items is drawn in the same colour.
    expect(svg).toContain('stroke="#29a360" stroke-width="2"');
    expect(svg.match(/class="wr-edge wr-edge-main wr-edge-ran"/g)).toHaveLength(2);
  });

  it('says "items total" when the source node ran more than once', () => {
    // measured: n8n labels an edge from a multi-run node "5 items total"
    const svg = svgOf('execution-loop');
    expect(svg).toContain('items total<');
    expect(svgOf('execution-success')).not.toContain('items total<');
  });

  it('marks the failed node and dims nodes that never ran', () => {
    const m = model('execution-error');
    const untouched = m.nodes.find((n) => n.name === 'Make Items');
    if (untouched?.run) untouched.run = { status: 'none', runs: 0, itemsOut: [] };
    const svg = renderSVG(layout(m));
    expect(svg.match(/class="wr-badge wr-badge-error"/g)).toHaveLength(1);
    expect(svg).toContain('wr-not-run');
  });
});

describe('robustness and determinism', () => {
  it('writes item counts in the singular for one item', () => {
    const m = model('execution-success');
    m.edges[0]!.itemCount = 1;
    expect(renderSVG(layout(m))).toContain('>1 item</text>');
  });
});

describe('robustness and determinism', () => {
  it('escapes hostile node names', () => {
    const m = model('linear');
    m.nodes[1]!.name = '<script>&"';
    const svg = renderSVG(layout(m));
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(svg)).not.toThrow();
  });

  it('is byte-identical across repeated renders and separate layouts', () => {
    expect(svgOf('branching')).toBe(svgOf('branching'));
    const m = model('branching');
    expect(renderSVG(layout(m))).toBe(renderSVG(layout(m)));
  });
});

describe('sticky text', () => {
  /** Render a sticky whose content is exactly `content`. */
  const stickySvg = (content: string): string => {
    const { model: m } = parseInput({
      nodes: [
        {
          name: 'Note',
          type: 'n8n-nodes-base.stickyNote',
          typeVersion: 1,
          position: [0, 0],
          parameters: { content, height: 200, width: 400, color: 1 },
        },
      ],
      connections: {},
    });
    if (!m) throw new Error('no model');
    return renderSVG(layout(m), {});
  };

  it('paints an apostrophe as an apostrophe', () => {
    // marked HTML-escapes the text it hands back, so `'` arrives as `&#39;`.
    // Escaping that again for XML turns the ampersand into `&amp;`, and the
    // reader sees the entity itself printed on the sticky.
    // Wrapping puts each word in its own tspan, so assert on the word rather
    // than the phrase.
    const svg = stickySvg("What's included");
    expect(svg).toContain("<tspan>What's</tspan>");
    expect(svg).not.toContain('&amp;#39;');
    expect(svg).not.toContain('&#39;');
  });

  it('still escapes the characters XML actually reserves, exactly once', () => {
    const svg = stickySvg('a & b < c > d');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('&amp;amp;');
    expect(svg).not.toContain('&amp;lt;');
  });

  it('paints a quote as a quote in text content', () => {
    const svg = stickySvg('say "hello"');
    expect(svg).not.toContain('&amp;quot;');
  });
});

describe('canvas ground', () => {
  it('paints dots well beyond the workflow, so panning never runs off the grid', () => {
    // The dots rect used to be the workflow's own bounding box, so panning past
    // the graph showed bare background.
    const svg = svgOf('linear');
    const dots = /<rect class="wr-canvas-dots"[^>]*>/.exec(svg)?.[0] ?? '';
    const num = (attr: string): number => Number(new RegExp(`${attr}="(-?[\\d.]+)"`).exec(dots)?.[1]);
    const bounds = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!;
    const [, bx, by, bw, bh] = bounds.map(Number);
    expect(num('width')).toBeGreaterThan(bw * 3);
    expect(num('height')).toBeGreaterThan(bh * 3);
    expect(num('x')).toBeLessThan(bx);
    expect(num('y')).toBeLessThan(by);
  });
});

describe('icons with no viewBox of their own', () => {
  const boxed = (svg: string): string =>
    renderSVG(layout(model('linear')), {
      icons: { 'n8n-nodes-base.httpRequest': { type: 'svg', svg } },
    });

  it('gives an icon a viewBox built from its width and height', () => {
    // 117 of the bundled vendor SVGs declare width/height and no viewBox.
    // Stripping the dimensions without supplying a viewBox left the artwork at
    // its intrinsic scale inside a 40px box, so only its top-left corner showed
    // -- which is why Supabase looked small and off-centre.
    const svg = boxed('<svg xmlns="http://www.w3.org/2000/svg" width="109" height="113"><rect/></svg>');
    expect(svg).toContain('viewBox="0 0 109 113"');
  });

  it('leaves an icon that already has one alone', () => {
    const svg = boxed('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect/></svg>');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).not.toContain('viewBox="0 0 109 113"');
  });

  it('centres an icon whose artwork is not square', () => {
    const svg = boxed('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4680 1340"><rect/></svg>');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});

describe('text under zoom', () => {
  it('asks for geometric precision, so glyphs do not re-hint as it scales', () => {
    // Without it the browser snaps glyphs to the pixel grid at each new scale
    // and the labels shimmer while zooming.
    expect(svgOf('linear')).toContain('text-rendering="geometricPrecision"');
  });
});

describe('the execution canvas', () => {
  it('keeps the dot grid under a run, the same ground as the design view', () => {
    // This used to lay a diagonal hatch under an execution, on the claim that
    // n8n changes the ground for a run. Checked against a real 2.38.3 on
    // 2026-09-13: the hatch belongs to n8n's read-only *preview* canvas and
    // appears there with no execution at all, so it was never an execution
    // signal. The dot grid is the canvas, whichever view you are in.
    const design = svgOf('linear');
    const run = svgOf('execution-success');
    expect(design).toContain('url(#wr-dots)');
    expect(run).toContain('url(#wr-dots)');
    expect(run).not.toContain('wr-hatch');
  });

  it('prints each node\'s item count under its tile', () => {
    // The counts on the connectors say what moved between nodes; this says what
    // the node itself produced, which is what n8n shows.
    const svg = svgOf('execution-success');
    expect(svg).toContain('class="wr-node-items"');
    expect(svg).toMatch(/class="wr-node-items"[^>]*>[^<]*\d+ items?</);
  });

  it('says nothing under a node that never ran', () => {
    expect(svgOf('linear')).not.toContain('class="wr-node-items"');
  });
});
