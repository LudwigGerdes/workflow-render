/**
 * Golden renders.
 *
 * A golden is our own previous output, not a capture of anything else. It
 * catches what a regression actually looks like — a node that moved, an edge
 * that vanished, a path that changed — and it keeps the SVG byte-deterministic,
 * which the element and the CLI both depend on. It claims nothing about
 * resembling any other product.
 *
 * UPDATE_GOLDENS=1 rewrites them. Read the diff before committing: that review
 * is the whole of the approval now.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadIcons, loadSubtitles } from 'workflow-render-assets';
import type { IconEntry, SubtitleSpec } from 'workflow-render-assets';
import { beforeAll, describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { renderSVG } from '../src/render.js';

const FIXTURES = [
  'linear',
  'branching',
  'order-intake',
  'execution-success',
  'execution-error',
  'surface',
  // 56 stickies covering all seven palette indices and 41 custom hex colours,
  // light and dark, which is the only fixture exercising contrast text.
  'sticky-colors',
] as const;

let icons: Record<string, IconEntry>;
let subtitles: Record<string, SubtitleSpec>;
beforeAll(async () => {
  [icons, subtitles] = await Promise.all([loadIcons(), loadSubtitles()]);
});

const render = (fixture: string, theme: 'light' | 'dark' = 'light'): string => {
  const source = JSON.parse(
    readFileSync(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8'),
  );
  const { model } = parseInput(source);
  if (!model) throw new Error(`fixture ${fixture} did not parse`);
  return renderSVG(layout(model), { theme, icons, subtitles });
};

describe.each(FIXTURES)('%s', (fixture) => {
  it('renders identically to its committed golden', () => {
    const path = fileURLToPath(new URL(`./golden/${fixture}.svg`, import.meta.url));
    const svg = render(fixture);

    if (process.env['UPDATE_GOLDENS'] === '1' || !existsSync(path)) {
      writeFileSync(path, svg);
      return;
    }

    expect(svg).toBe(readFileSync(path, 'utf8'));
  });
});

/** Dark renders of a design view, an execution and every sticky preset. */
const DARK_FIXTURES = ['branching', 'execution-success', 'sticky-colors'] as const;

describe.each(DARK_FIXTURES)('%s (dark)', (fixture) => {
  it('renders in the dark palette and matches its committed golden', () => {
    const svg = render(fixture, 'dark');
    expect(svg).toContain('data-theme="dark"');
    // The ground is the first rect and carries the dark canvas colour, not the light one.
    const ground = /<rect[^>]*fill="(#[0-9a-f]{6})"/.exec(svg)?.[1];
    expect(ground).toBe('#171717');
    const path = fileURLToPath(new URL(`./golden/${fixture}-dark.svg`, import.meta.url));
    if (process.env['UPDATE_GOLDENS'] === '1' || !existsSync(path)) {
      writeFileSync(path, svg);
      return;
    }
    expect(svg).toBe(readFileSync(path, 'utf8'));
  });
});

describe('dark icons', () => {
  it('draws currentColor SVG icons in the dark default, and leaves light icons as they were', () => {
    const dark = render('branching', 'dark');
    const webhookIcon = /data-node-name="Webhook"[\s\S]*?<svg[^>]*class="wr-icon"[^>]*>/.exec(dark)?.[0] ?? '';
    expect(webhookIcon).toContain('color="#ffffff"');
    expect(render('branching')).not.toMatch(/class="wr-icon"[^>]*color="/);
  });
});
