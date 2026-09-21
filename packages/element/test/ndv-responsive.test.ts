import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDescriptions } from '../src/descriptions.js';
import { resetIcons } from '../src/icons.js';
import { ndvStyles } from '../src/ndv/styles.js';
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

const open = async (el: WorkflowRender, name: string): Promise<void> => {
  el.shadowRoot?.querySelector(`[data-node-name="${name}"]`)
    ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
  await el.updateComplete;
  await el.inspectorReady;
  await el.updateComplete;
};

const q = (el: WorkflowRender, selector: string): HTMLElement | null =>
  (el.shadowRoot?.querySelector(selector) as HTMLElement | null) ?? null;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('workflow-render-descriptions.json')
        ? new Response(JSON.stringify(load('packages/assets/data/2.38.1/descriptions.json')), { status: 200 })
        : new Response('nope', { status: 404 }),
    ),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  resetIcons();
  resetDescriptions();
});

describe('the inspector in a narrow container', () => {
  it('offers a switch between Input, the node and Output, starting on the node', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/execution-success.json') });
    const first = el.shadowRoot?.querySelector('[data-node-name]')?.getAttribute('data-node-name') ?? '';
    await open(el, first);

    const buttons = [...(el.shadowRoot?.querySelectorAll('.wr-ndv-switch button') ?? [])] as HTMLElement[];
    expect(buttons.map((b) => b.dataset.pane)).toEqual(['input', 'node', 'output']);
    expect(q(el, '.wr-ndv-panes')?.dataset.pane).toBe('node');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('shows the chosen pane and remembers it across a re-render', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/execution-success.json') });
    const first = el.shadowRoot?.querySelector('[data-node-name]')?.getAttribute('data-node-name') ?? '';
    await open(el, first);

    q(el, '.wr-ndv-switch [data-pane="output"]')?.click();
    await el.updateComplete;
    expect(q(el, '.wr-ndv-panes')?.dataset.pane).toBe('output');
    expect(q(el, '.wr-ndv-switch [data-pane="output"]')?.getAttribute('aria-pressed')).toBe('true');

    // Switching the middle column's tab re-renders the panel; the pane must stay.
    q(el, '.wr-ndv-tabs [data-tab="json"]')?.click();
    await el.updateComplete;
    expect(q(el, '.wr-ndv-panes')?.dataset.pane).toBe('output');
  });

  it('has no switch when there are no side panes to switch to', async () => {
    const el = await mount({ workflow: load('packages/core/test/fixtures/linear.json') });
    const first = el.shadowRoot?.querySelector('[data-node-name]')?.getAttribute('data-node-name') ?? '';
    await open(el, first);
    if (q(el, '.wr-ndv-panes') === null) expect(q(el, '.wr-ndv-switch')).toBeNull();
  });
});

describe('the inspector stylesheet', () => {
  it('lays the panes out one at a time below a container width, and only there', () => {
    expect(ndvStyles).toMatch(/\.wr-ndv-backdrop\s*\{[^}]*container-type:\s*inline-size/);
    const narrow = ndvStyles.match(/@container[^{]*\(max-width:\s*\d+px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(narrow).toContain('.wr-ndv-switch');
    expect(narrow).toMatch(/\.wr-ndv-panes\[data-pane='input'\]\s*>\s*\.wr-ndv-pane-input/);
    // A dragged column width is an inline style; it must not survive into the narrow layout.
    expect(narrow).toMatch(/\.wr-ndv-middle\s*\{[^}]*width:\s*auto\s*!important/);
    // Outside the query the switch is not shown, so the wide layout is what it was.
    expect(ndvStyles.replace(narrow, '')).toMatch(/\.wr-ndv-switch\s*\{[^}]*display:\s*none/);
  });
});
