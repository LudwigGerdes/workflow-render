/**
 * Custom sticky colours.
 *
 * n8n's sticky `color` carries either a palette index or a `#RRGGBB` string —
 * the same field, discriminated by type. workflow-render read it with `asNumber`, so
 * every hex collapsed to the default yellow silently: a 56-sticky board of 41
 * distinct colours parsed to 44 stickies of colour 1, with no warning.
 *
 * A custom colour is three derived values, not one. The background is the hex
 * verbatim; the border is each channel at 80%; the text flips between dark and
 * light on a WCAG luminance threshold, which is the part that matters most —
 * dark stickies like Slack aubergine need light text or the content is
 * unreadable rather than merely off-palette.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../src/adapters/n8n.js';
import { layout } from '../src/layout.js';
import { renderSVG } from '../src/render.js';

const workflowWith = (color: unknown): Record<string, unknown> => ({
  nodes: [
    {
      name: 'Note',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [0, 0],
      parameters: { content: 'Body text', width: 240, height: 160, color },
    },
  ],
  connections: {},
});

const parse = (color: unknown) => {
  const { model, warnings } = parseInput(workflowWith(color));
  if (!model) throw new Error('no model');
  return { sticky: model.stickies[0]!, warnings };
};

const svgWith = (color: unknown): string => {
  const { model } = parseInput(workflowWith(color));
  if (!model) throw new Error('no model');
  return renderSVG(layout(model)).toLowerCase();
};

describe('the adapter reading a sticky colour', () => {
  it('keeps a palette index as a number', () => {
    expect(parse(3).sticky.color).toBe(3);
  });

  it('keeps a valid six-digit hex instead of discarding it', () => {
    expect(parse('#1DA1F2').sticky.color).toBe('#1DA1F2');
  });

  it('falls back and says so when the colour is unusable', () => {
    // Today this falls back silently, which is how 42 stickies turned yellow
    // with nothing to show for it.
    const { sticky, warnings } = parse('not-a-colour');
    expect(sticky.color).toBe(1);
    expect(warnings.some((w) => /colou?r/i.test(w))).toBe(true);
  });

  it('rejects shorthand hex, as n8n does', () => {
    // n8n validates /^#[0-9A-Fa-f]{6}$/ — #abc is not a sticky colour there.
    expect(parse('#abc').sticky.color).toBe(1);
  });
});

describe('the renderer drawing a custom sticky colour', () => {
  it('paints the background as the hex given', () => {
    expect(svgWith('#1da1f2')).toContain('#1da1f2');
  });

  it('draws the border at 80% of each channel', () => {
    // 0x1d,0xa1,0xf2 -> 29,161,242 -> x0.8 -> 23,129,194 -> #1781c2
    expect(svgWith('#1DA1F2')).toContain('#1781c2');
  });

  /**
   * Scoped to the sticky's own text. Asserting on the whole document passes for
   * free -- the dark text colour is the default token and appears on every node
   * label -- so these two tests proved nothing until they looked here.
   */
  const stickyTextFills = (color: unknown): string[] =>
    [...svgWith(color).matchAll(/<text class="wr-sticky-text"[^>]*fill="([^"]*)"/g)].map(
      (m) => m[1] as string,
    );

  it('switches to light text on a dark sticky', () => {
    // Slack aubergine: low luminance, so dark text would be unreadable.
    const fills = stickyTextFills('#4A154B');
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(['#f5f5f5']));
  });

  it('keeps dark text on a light sticky', () => {
    const fills = stickyTextFills('#FFFACD');
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(['#2b2b2b']));
  });

  it('does not emit a hex as part of a css class name', () => {
    // The bg element carries `wr-sticky-<color>`; a hex would make that
    // `wr-sticky-#1DA1F2`, which is not a valid class.
    expect(svgWith('#1DA1F2')).not.toMatch(/class="[^"]*wr-sticky-#/);
  });

  it('still uses the measured palette for a numeric colour', () => {
    expect(svgWith(3)).toContain('#fcdadd'); // STICKY_COLORS[3].bg
  });
});

describe('the sticky-colors fixture', () => {
  const fixture = (): { svg: string; colors: Array<number | string>; warnings: string[] } => {
    const source = JSON.parse(
      readFileSync(new URL('./fixtures/sticky-colors.json', import.meta.url), 'utf8'),
    );
    const { model, warnings } = parseInput(source);
    if (!model) throw new Error('fixture did not parse');
    return {
      svg: renderSVG(layout(model)).toLowerCase(),
      colors: model.stickies.map((s) => s.color),
      warnings,
    };
  };

  it('keeps every colour it was given', () => {
    // The whole point of the fixture: 14 palette indices and 42 custom hexes
    // used to arrive as 44 stickies of colour 1.
    const { colors } = fixture();
    expect(colors.filter((c) => typeof c === 'number')).toHaveLength(14);
    expect(colors.filter((c) => typeof c === 'string')).toHaveLength(42);
    expect(new Set(colors.filter((c) => typeof c === 'string')).size).toBeGreaterThan(30);
  });

  it('covers all seven palette indices', () => {
    const { colors } = fixture();
    expect(new Set(colors.filter((c) => typeof c === 'number'))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7]),
    );
  });

  it('warns about none of them, because all are usable', () => {
    expect(fixture().warnings.filter((w) => /colou?r/i.test(w))).toEqual([]);
  });

  it('draws both contrast text colours, so the rule is exercised both ways', () => {
    const { svg } = fixture();
    expect(svg).toContain('<text class="wr-sticky-text"');
    expect(svg).toMatch(/class="wr-sticky-text"[^>]*fill="#f5f5f5"/); // on the dark ones
    expect(svg).toMatch(/class="wr-sticky-text"[^>]*fill="#2b2b2b"/); // on the light ones
  });
});
