/**
 * What the goldens cannot see.
 *
 * A golden compares the renderer against its own previous output, so it catches
 * a render that *changed* and is blind to one that was never right. Four
 * separate bugs walked past the suite that way: sticky text escaped twice,
 * icons dropped wholesale, tables rendered as nothing, selection styled
 * nowhere. Each produced a stable, reproducible, wrong render, and each golden
 * cheerfully confirmed it matched yesterday's equally wrong one.
 *
 * These assertions name the features instead. The `surface` fixture exists to
 * exercise all of them at once; if it stops covering something, or the renderer
 * stops drawing it, this fails rather than being quietly re-baselined.
 */
import { readFileSync } from 'node:fs';
import { loadIcons, loadSubtitles } from 'workflow-render-assets';
import { beforeAll, describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { renderSVG } from '../src/render.js';
import type { IconEntry, SubtitleSpec } from 'workflow-render-assets';

let svg = '';
let icons: Record<string, IconEntry>;

beforeAll(async () => {
  let subtitles: Record<string, SubtitleSpec>;
  [icons, subtitles] = await Promise.all([loadIcons(), loadSubtitles()]);
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/surface.json', import.meta.url), 'utf8'),
  );
  const { model } = parseInput(source);
  if (!model) throw new Error('surface fixture did not parse');
  svg = renderSVG(layout(model), { icons, subtitles });
});

/** Sticky text is one tspan per word, so match on a word. */
const drew = (word: string): boolean => svg.includes(`>${word}</tspan>`);

describe('the surface fixture covers every icon kind', () => {
  it('draws a vendor SVG', () => {
    expect(svg).toContain('class="wr-icon"');
  });

  it('draws a raster vendor icon, inlined', () => {
    // BambooHR ships a PNG. These were dropped entirely until they were inlined.
    expect(svg).toContain('data:image/');
  });

  it('frames an icon that declares no viewBox of its own', () => {
    // Supabase is 109x113 with no viewBox; without a derived one only its
    // top-left corner showed inside the 40px box.
    expect(svg).toContain('viewBox="0 0 109 113"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('resolves n8n\'s shared node: icons', () => {
    // httpRequest is `icon: node:http-request`, which lives only in n8n's
    // tagged source. 98 node types lost their icon when that was unhandled.
    const entry = icons['n8n-nodes-base.httpRequest'];
    expect(entry?.type).toBe('svg');
  });
});

describe('the surface fixture covers sticky markdown', () => {
  it('renders emphasis and strikethrough as styling, not plain text', () => {
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('line-through');
  });

  it('keeps table cells, which used to vanish without trace', () => {
    for (const cell of ['host', 'port', 'db', '5432']) {
      expect(drew(cell), cell).toBe(true);
    }
  });

  it('accounts for an image rather than dropping it', () => {
    // Remote by default, so a placeholder naming the host.
    expect(svg).toContain('cdn.example.com');
  });

  it('escapes each reserved character exactly once', () => {
    expect(svg).not.toContain('&amp;#39;');
    expect(svg).not.toContain('&amp;amp;');
  });
});

describe('the surface fixture covers connector routing', () => {
  /**
   * Require whitespace before `d=`. A greedy `[^>]*d="` backtracks to the last
   * `d="` in the tag, which is inside `marker-end="url(...)"` -- so every edge
   * came back as that identical string, which reads as "nothing changed" no
   * matter what the geometry did.
   */
  const paths = (): string[] =>
    [...svg.matchAll(/class="wr-edge[^"]*"[^>]*?\sd="([^"]*)"/g)].map((m) => m[1] as string);

  it('curves a connector whose ports line up', () => {
    expect(paths().some((d) => d.includes(' C '))).toBe(true);
  });

  it('squares off the backwards connector and nothing else', () => {
    // The fixture has exactly one backwards edge. Every other connector runs
    // forward, and a forward connector curves however far it drops -- so one
    // orthogonal path, no more.
    expect(paths().filter((d) => d.includes('Q'))).toHaveLength(1);
  });

  it('routes a backwards connector below both nodes', () => {
    // Store -> Collect doubles back; four rounded turns, no cubic.
    const back = paths().find((d) => (d.match(/Q/g) ?? []).length >= 4);
    expect(back).toBeDefined();
    expect(back).not.toMatch(/\bC\b/);
  });
});

describe('the surface fixture covers the selection halo', () => {
  /**
   * The halo is emitted by the renderer but painted by the viewer, which is the
   * only reason an exported SVG does not carry whatever happened to be selected
   * when someone hit Download. Both halves matter, so both are asserted: that
   * the element exists, and that it ships unpainted.
   */
  const halos = (): string[] =>
    [...svg.matchAll(/<(?:path|rect) class="wr-(?:tile|sticky)-halo"[^>]*>/g)].map((m) => m[0]);

  it('gives every node and sticky a halo to paint', () => {
    const tiles = (svg.match(/class="wr-tile"/g) ?? []).length;
    const stickies = (svg.match(/class="wr-sticky-bg/g) ?? []).length;
    expect(halos().length).toBe(tiles + stickies);
  });

  it('ships the halo unpainted, so an export carries no selection state', () => {
    expect(halos().length).toBeGreaterThan(0);
    for (const h of halos()) expect(h).toContain('stroke="none"');
  });

  it('strokes the halo at the measured width', () => {
    for (const h of halos()) expect(h).toContain('stroke-width="6"');
  });
});

describe('the surface fixture covers text and theme', () => {
  it('asks for geometric precision so labels do not shimmer when zooming', () => {
    expect(svg).toContain('text-rendering="geometricPrecision"');
  });

  it('ships one theme, with no second palette riding along', () => {
    expect(svg).not.toContain('wr-theme-dark');
  });
});
