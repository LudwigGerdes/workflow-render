/**
 * The markdown n8n stickies actually contain.
 *
 * The renderer handled headings, bold, inline code, links and lists. Everything
 * else fell through to a plain-text branch, so italics and strikethrough lost
 * their styling, images rendered as their alt text, and tables vanished
 * entirely -- content disappearing with nothing to show it was ever there.
 */
import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout.js';
import { parseInput } from '../src/adapters/n8n.js';
import { renderSVG } from '../src/render.js';
import type { RenderOptions } from '../src/types.js';

const sticky = (content: string, opts: RenderOptions = {}): string => {
  const { model } = parseInput({
    nodes: [
      {
        name: 'Note',
        type: 'n8n-nodes-base.stickyNote',
        typeVersion: 1,
        position: [0, 0],
        parameters: { content, height: 400, width: 600, color: 1 },
      },
    ],
    connections: {},
  });
  if (!model) throw new Error('no model');
  return renderSVG(layout(model), opts);
};

/** Sticky text is split one tspan per word, so match on a word. */
const drew = (svg: string, word: string): boolean => svg.includes(`>${word}</tspan>`);

describe('sticky images', () => {
  it('draws a self-contained data: image without needing permission', () => {
    // Nothing is fetched, so there is nothing to opt into.
    const svg = sticky('![chart](data:image/png;base64,iVBORw0KGgo=)');
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it('draws a relative image, which is the host page own origin', () => {
    const svg = sticky('![diagram](./diagram.png)');
    expect(svg).toContain('<image');
    expect(svg).toContain('./diagram.png');
  });

  it('does not fetch a remote image by default', () => {
    // The viewer is embedded in pages it does not control. Fetching a third
    // party on load tells that host the reader IP and referrer, which the
    // embedder never agreed to.
    const svg = sticky('![photo](https://cdn.example.com/photo.png)');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('https://cdn.example.com/photo.png');
  });

  it('says an image is there rather than dropping it silently', () => {
    const svg = sticky('![photo](https://cdn.example.com/photo.png)');
    expect(drew(svg, 'photo')).toBe(true); // the alt text
    expect(svg).toContain('cdn.example.com'); // and where it points
  });

  it('draws a remote image once the embedder asks for it', () => {
    const svg = sticky('![photo](https://cdn.example.com/photo.png)', { remoteImages: true });
    expect(svg).toContain('<image');
    expect(svg).toContain('https://cdn.example.com/photo.png');
  });

  it('never draws a javascript: or other unsafe source', () => {
    for (const bad of ['javascript:alert(1)', 'vbscript:x']) {
      const svg = sticky(`![x](${bad})`, { remoteImages: true });
      expect(svg).not.toContain(bad);
    }
  });
});

describe('sticky inline styling', () => {
  it('renders emphasis as italic', () => {
    expect(sticky('*emphasised*')).toContain('font-style="italic"');
  });

  it('renders strikethrough as struck-through', () => {
    expect(sticky('~~removed~~')).toContain('line-through');
  });
});

describe('sticky blocks that used to vanish', () => {
  it('keeps the content of a table', () => {
    const svg = sticky('| host | port |\n| --- | --- |\n| db | 5432 |');
    for (const cell of ['host', 'port', 'db', '5432']) {
      expect(drew(svg, cell)).toBe(true);
    }
  });

  it('keeps the content of a blockquote', () => {
    expect(drew(sticky('> remember this'), 'remember')).toBe(true);
  });
});
