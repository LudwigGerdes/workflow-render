import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DESCRIPTIONS_VERSION } from 'workflow-render-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetIcons } from '../src/icons.js';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

// happy-dom serves modules over http, so import.meta.url cannot locate files;
// and vitest's cwd is the workspace root or the package, depending on how it is
// invoked. Try both.
const fixture = (name: string): Record<string, unknown> => {
  const candidates = [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`fixture ${name} not found (looked in ${candidates.join(', ')})`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

/** Mount an <workflow-render>, apply props, and wait for its first render. */
async function mount(props: Partial<WorkflowRender> = {}): Promise<WorkflowRender> {
  const el = document.createElement('workflow-render') as WorkflowRender;
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  await el.ready;
  await el.updateComplete;
  return el;
}

const svgOf = (el: WorkflowRender): SVGSVGElement | null =>
  el.shadowRoot?.querySelector('svg') ?? null;

afterEach(() => {
  document.body.replaceChildren();
  resetIcons();
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders a workflow given as a property', async () => {
    const el = await mount({ workflow: fixture('linear') });
    expect(el.shadowRoot?.querySelectorAll('[data-node-name]')).toHaveLength(3);
    expect(svgOf(el)?.getAttribute('data-view')).toBe('design');
  });

  it('accepts a workflow given as a JSON string attribute', async () => {
    const el = document.createElement('workflow-render') as WorkflowRender;
    el.setAttribute('workflow', JSON.stringify(fixture('linear')));
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelectorAll('[data-node-name]')).toHaveLength(3);
  });

  it('auto-detects an execution and renders its badges', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    expect(svgOf(el)?.getAttribute('data-view')).toBe('execution');
    expect(el.shadowRoot?.querySelectorAll('.wr-badge')?.length).toBeGreaterThan(0);
  });

  it('reflects the emulated n8n version', async () => {
    const el = await mount({ workflow: fixture('linear') });
    expect(el.getAttribute('emulates')).toBe(DESCRIPTIONS_VERSION);
    expect(svgOf(el)?.getAttribute('data-descriptions-version')).toBe(DESCRIPTIONS_VERSION);
  });
});

describe('events', () => {
  it('fires wr-load with the view and warnings', async () => {
    const el = document.createElement('workflow-render') as WorkflowRender;
    const loads: Array<{ view: string; warnings: string[] }> = [];
    el.addEventListener('wr-load', (e) => loads.push((e as CustomEvent).detail));
    el.workflow = fixture('linear');
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    expect(loads).toHaveLength(1);
    expect(loads[0]?.view).toBe('design');
    expect(loads[0]?.warnings).toEqual([]);
  });

  it('surfaces parse warnings on wr-load', async () => {
    const workflow = fixture('linear') as { connections: Record<string, unknown> };
    workflow.connections['HTTP Request'] = { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] };
    const el = document.createElement('workflow-render') as WorkflowRender;
    const warnings: string[][] = [];
    el.addEventListener('wr-load', (e) => warnings.push((e as CustomEvent).detail.warnings));
    el.workflow = workflow;
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    expect(warnings[0]?.[0]).toContain('Ghost');
  });

  it('draws an overlay and redraws when it changes; a bad one is a warning, not a crash', async () => {
    const overlay = { version: 1, source: 'workflow-lint 0.1.2', nodes: { 'HTTP Request': { badges: [{ kind: 'warn', text: 'x' }] } } };
    const el = await mount({ workflow: fixture('linear'), overlay });
    expect(el.shadowRoot?.querySelector('.wr-overlay-badge.wr-overlay-warn')).not.toBeNull();
    expect(el.overlayData?.source).toBe('workflow-lint 0.1.2');

    el.overlay = JSON.stringify({ version: 1, nodes: { 'HTTP Request': { badges: [{ kind: 'error', text: 'y' }] } } });
    await el.updateComplete;
    await el.ready;
    expect(el.shadowRoot?.querySelector('.wr-overlay-badge.wr-overlay-error')).not.toBeNull();

    const warnings: string[][] = [];
    el.addEventListener('wr-load', (e) => warnings.push((e as CustomEvent).detail.warnings));
    el.overlay = { version: 3, nodes: {} };
    await el.updateComplete;
    await el.ready;
    expect(el.shadowRoot?.querySelector('.wr-overlay-badge')).toBeNull();
    expect(warnings.at(-1)?.[0]).toMatch(/overlay\.version/);
    expect(el.overlayData).toBeUndefined();
  });

  it('emits wr-node-click with the node name', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const clicks: string[] = [];
    el.addEventListener('wr-node-click', (e) => clicks.push((e as CustomEvent).detail.nodeName));
    const node = el.shadowRoot?.querySelector('[data-node-name="HTTP Request"]');
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(clicks).toEqual(['HTTP Request']);
  });

  it('emits wr-error and shows an error panel when the input is not a workflow', async () => {
    const el = document.createElement('workflow-render') as WorkflowRender;
    const errors: string[] = [];
    el.addEventListener('wr-error', (e) => errors.push((e as CustomEvent).detail.message));
    el.workflow = { hello: 'world' };
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    await el.updateComplete;
    expect(errors[0]).toContain('not a workflow');
    expect(el.shadowRoot?.querySelector('.wr-error-panel')?.textContent).toContain('not a workflow');
  });
});

describe('src loading', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('linear.json')) {
          return new Response(JSON.stringify(fixture('linear')), { status: 200 });
        }
        return new Response('nope', { status: 404, statusText: 'Not Found' });
      }),
    );
  });

  it('fetches and renders src', async () => {
    const el = await mount({ src: '/workflows/linear.json' });
    expect(el.shadowRoot?.querySelectorAll('[data-node-name]')).toHaveLength(3);
  });

  it('prefers an inline workflow over src', async () => {
    const el = await mount({ src: '/workflows/missing.json', workflow: fixture('linear') });
    expect(el.shadowRoot?.querySelectorAll('[data-node-name]')).toHaveLength(3);
    expect(el.shadowRoot?.querySelector('.wr-error-panel')).toBeNull();
  });

  it('reports a failed fetch without going blank', async () => {
    const el = document.createElement('workflow-render') as WorkflowRender;
    const errors: string[] = [];
    el.addEventListener('wr-error', (e) => errors.push((e as CustomEvent).detail.message));
    el.src = '/workflows/missing.json';
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    await el.updateComplete;
    const panel = el.shadowRoot?.querySelector('.wr-error-panel');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('404');
    expect(errors[0]).toContain('404');
  });
});

describe('icon sidecar', () => {
  it('embeds real icons when the sidecar is served next to the bundle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('workflow-render-icons.json')) {
          return new Response(
            JSON.stringify({ 'n8n-nodes-base.httpRequest': { type: 'svg', svg: '<svg viewBox="0 0 24 24"><circle r="8"/></svg>' } }),
            { status: 200 },
          );
        }
        return new Response('nope', { status: 404 });
      }),
    );
    const el = await mount({ workflow: fixture('linear') });
    expect(el.shadowRoot?.querySelector('.wr-icon')).not.toBeNull();
  });

  it('falls back to monogram tiles when the sidecar is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const el = await mount({ workflow: fixture('linear') });
    expect(el.shadowRoot?.querySelectorAll('[data-node-name]')).toHaveLength(3);
    expect(el.shadowRoot?.querySelector('.wr-monogram')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.wr-icon')).toBeNull();
  });
});

/** Read the live viewBox as numbers. */
const viewBox = (el: WorkflowRender): number[] =>
  (svgOf(el)?.getAttribute('viewBox') ?? '').split(' ').map(Number);

const wheel = (el: WorkflowRender, init: WheelEventInit): void => {
  const { ctrlKey, metaKey, ...rest } = init;
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...rest });
  // happy-dom silently drops modifier keys from WheelEvent init (deltaX/deltaY
  // survive), so set them on the instance or the test asserts nothing.
  for (const [key, value] of Object.entries({ ctrlKey, metaKey })) {
    if (value !== undefined) Object.defineProperty(event, key, { value });
  }
  el.shadowRoot?.querySelector('.wr-viewport')?.dispatchEvent(event);
};

describe('canvas behaviour (measured from n8n 2.10.0)', () => {
  it('pans on a plain wheel instead of zooming', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, y0, w0] = viewBox(el);
    wheel(el, { deltaY: 120 });
    await el.updateComplete;
    const [, y1, w1] = viewBox(el);
    expect(w1).toBeCloseTo(w0!, 6); // scale untouched
    expect(y1).toBeGreaterThan(y0!); // content scrolled
  });

  it('pans horizontally on wheel deltaX', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0, y0] = viewBox(el);
    wheel(el, { deltaX: 120 });
    await el.updateComplete;
    const [x1, y1] = viewBox(el);
    expect(x1).toBeGreaterThan(x0!);
    expect(y1).toBeCloseTo(y0!, 6);
  });

  it('zooms on ctrl+wheel, the trackpad pinch gesture', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);
    wheel(el, { deltaY: -120, ctrlKey: true });
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeLessThan(w0!); // zoomed in
  });

  it('zooms on cmd+wheel: the platform control key is the zoom activation key', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);
    wheel(el, { deltaY: -120, metaKey: true });
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeLessThan(w0!);
  });

  it('zooms in on double-click', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);
    el.shadowRoot?.querySelector('.wr-viewport')?.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
    );
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeCloseTo(w0! / 2, 2);
  });

  it('answers n8n keyboard shortcuts when focused', async () => {
    const el = await mount({ workflow: fixture('linear') });
    el.focus();
    const press = (key: string) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      return el.updateComplete;
    };

    await press('0'); // reset to 100%
    const reset = viewBox(el)[2];
    await press('+'); // zoom in one step of 1.2
    expect(viewBox(el)[2]).toBeCloseTo(reset! / 1.2, 2);
    await press('-');
    expect(viewBox(el)[2]).toBeCloseTo(reset!, 2);

    await press('1'); // zoom to fit
    const fitted = viewBox(el)[2];
    await press('0');
    expect(viewBox(el)[2]).not.toBeCloseTo(fitted!, 2);
  });

  it('does not hijack keystrokes when it is not focused', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const before = viewBox(el)[2];
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeCloseTo(before!, 6);
  });

  it('offers the zoom controls n8n puts on its canvas', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const controls = el.shadowRoot?.querySelectorAll('.wr-controls button');
    expect(controls?.length).toBe(4); // fit, in, out, reset
    const [, , w0] = viewBox(el);
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="zoom-in"]')?.click();
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeCloseTo(w0! / 1.2, 2);
  });

  it('stays inert in static mode', async () => {
    const el = await mount({ workflow: fixture('linear'), static: true });
    const before = viewBox(el).join(' ');
    wheel(el, { deltaY: 120 });
    wheel(el, { deltaY: -120, ctrlKey: true });
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    el.shadowRoot?.querySelector('.wr-viewport')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await el.updateComplete;
    expect(viewBox(el).join(' ')).toBe(before);
    expect(el.shadowRoot?.querySelector('.wr-controls')).toBeNull();
  });
});

describe('interaction', () => {
  it('pans on pointer drag', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const svg = svgOf(el)!;
    const before = svg.getAttribute('viewBox');
    el.dragBy(60, 40);
    await el.updateComplete;
    expect(svgOf(el)!.getAttribute('viewBox')).not.toBe(before);
  });

  it('does not pan when static', async () => {
    const el = await mount({ workflow: fixture('linear'), static: true });
    const before = svgOf(el)!.getAttribute('viewBox');
    el.dragBy(60, 40);
    await el.updateComplete;
    expect(svgOf(el)!.getAttribute('viewBox')).toBe(before);
  });

  it('restores the fitted view', async () => {
    const el = await mount({ workflow: fixture('linear') });
    el.dragBy(120, 80);
    await el.updateComplete;
    const panned = svgOf(el)!.getAttribute('viewBox');
    el.fit();
    await el.updateComplete;
    expect(svgOf(el)!.getAttribute('viewBox')).not.toBe(panned);
  });
});

describe('theming', () => {
  it('has one theme, and ships no CSS for another', async () => {
    // Light only. The renderer used to emit a whole dark palette into every
    // SVG so the element could reskin by swapping a class; that is dead weight
    // in an export, and it contradicted the one-theme decision.
    const el = await mount({ workflow: fixture('linear') });
    const svg = svgOf(el)!;
    expect(svg.outerHTML).not.toContain('wr-theme-dark');
    expect(svg.getAttribute('data-theme')).toBe('light');
    expect(el.shadowRoot?.querySelector('.wr-theme-light')).not.toBeNull();
  });
});
