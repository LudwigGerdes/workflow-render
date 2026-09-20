import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFontData, resetIcons } from '../src/icons.js';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const load = (relative: string): Record<string, unknown> => {
  const path = [resolve(process.cwd(), relative), resolve(process.cwd(), '../..', relative)].find(existsSync);
  if (!path) throw new Error(`not found: ${relative}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

async function mount(props: Partial<WorkflowRender> = {}): Promise<WorkflowRender> {
  const el = document.createElement('workflow-render') as WorkflowRender;
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  await el.ready;
  await el.updateComplete;
  return el;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
});

afterEach(() => {
  document.body.replaceChildren();
  resetIcons();
  resetFontData();
  vi.restoreAllMocks();
});

describe('export buttons', () => {
  it('offers SVG and PNG by default', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json') });
    expect(el.shadowRoot?.querySelector('[data-action="export-svg"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('[data-action="export-png"]')).not.toBeNull();
  });

  it('hides them when exportui is off', async () => {
    const el = await mount({
      workflow: load('packages/core/test/fixtures/linear.json'),
      exportui: 'off',
    });
    expect(el.shadowRoot?.querySelector('[data-action="export-svg"]')).toBeNull();
  });

  it('has none in static mode, which has no controls at all', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json'), static: true });
    expect(el.shadowRoot?.querySelector('[data-action="export-svg"]')).toBeNull();
  });
});

describe('exportSvg()', () => {
  it('returns the same SVG the canvas is showing', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json') });
    const svg = await el.exportSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('data-view="design"');
    expect(svg).toContain('data-descriptions-version=');
  });

  it('embeds the fonts when the sidecar is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('.woff2')
          ? new Response(new Uint8Array([1, 2, 3]), { status: 200 })
          : new Response('nope', { status: 404 }),
      ),
    );
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json') });
    expect(await el.exportSvg()).toContain('@font-face');
  });

  it('still exports when the font sidecar is missing', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json') });
    const svg = await el.exportSvg();
    expect(svg).not.toContain('@font-face');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('exports an execution as an execution', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/execution-error.json') });
    expect(await el.exportSvg()).toContain('data-view="execution"');
  });
});
