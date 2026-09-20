import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderToSVG } from '../src/core.js';
import { renderFile } from '../src/index.js';

const fixture = resolve(__dirname, '../../core/test/fixtures/order-intake.json');

describe('renderToSVG (workflow-render/core)', () => {
  it('renders parsed JSON to the same bytes the CLI writes', async () => {
    const json: unknown = JSON.parse(readFileSync(fixture, 'utf8'));
    const { svg, warnings } = await renderToSVG(json);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(warnings).toEqual([]);
    expect(svg).toBe((await renderFile(fixture)).svg);
  });

  it('draws real icons and embeds the fonts by default', async () => {
    const { svg } = await renderToSVG(JSON.parse(readFileSync(fixture, 'utf8')));
    expect(svg).not.toContain('class="wr-monogram"');
    expect(svg).toContain('font/woff2');
  });

  it('leaves the fonts out when asked, and falls back to initials when given no icons', async () => {
    const { svg } = await renderToSVG(JSON.parse(readFileSync(fixture, 'utf8')), { embedFonts: false, icons: {} });
    expect(svg).not.toContain('font/woff2');
    expect(svg).toContain('class="wr-monogram"');
  });

  it('rejects input that is not a workflow', async () => {
    await expect(renderToSVG({ hello: 'world' })).rejects.toThrow();
  });
});
