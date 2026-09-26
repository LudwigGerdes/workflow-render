import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDescriptions } from '../src/descriptions.js';
import { resetIcons } from '../src/icons.js';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const fixture = (name: string): Record<string, unknown> => {
  const candidates = [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`fixture ${name} not found`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

/** The real bundled descriptions, served the way the sidecar would. */
const descriptions = (): unknown => {
  const candidates = [
    resolve(process.cwd(), 'packages/assets/data/2.38.1/descriptions.json'),
    resolve(process.cwd(), '../assets/data/2.38.1/descriptions.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('descriptions not found');
  return JSON.parse(readFileSync(path, 'utf8'));
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

const openNode = async (el: WorkflowRender, name: string): Promise<void> => {
  const node = el.shadowRoot?.querySelector(`[data-node-name="${name}"]`);
  node?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
  await el.updateComplete;
  await el.inspectorReady;
  await el.updateComplete;
};

const panel = (el: WorkflowRender): Element | null => el.shadowRoot?.querySelector('.wr-ndv') ?? null;
const panelText = (el: WorkflowRender): string => panel(el)?.textContent ?? '';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('workflow-render-descriptions.json')) {
        return new Response(JSON.stringify(descriptions()), { status: 200 });
      }
      return new Response('nope', { status: 404 });
    }),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  resetIcons();
  resetDescriptions();
  vi.restoreAllMocks();
});

describe('opening and closing', () => {
  it('opens a panel for the clicked node', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'Extract Emails');
    expect(panel(el)).not.toBeNull();
    expect(panelText(el)).toContain('Extract Emails');
  });

  it('emits wr-inspector-open and wr-inspector-close', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const events: string[] = [];
    el.addEventListener('wr-inspector-open', (e) => events.push(`open:${(e as CustomEvent).detail.nodeName}`));
    el.addEventListener('wr-inspector-close', () => events.push('close'));
    await openNode(el, 'HTTP Request');
    el.closeInspector();
    await el.updateComplete;
    expect(events).toEqual(['open:HTTP Request', 'close']);
  });

  it('closes on Escape', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'HTTP Request');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(panel(el)).toBeNull();
  });

  it('never opens when inspector is off, but still reports the click', async () => {
    const el = await mount({ workflow: fixture('linear'), inspector: 'off' });
    const clicks: string[] = [];
    el.addEventListener('wr-node-click', (e) => clicks.push((e as CustomEvent).detail.nodeName));

    // Selecting and opening are separate gestures, so exercise both: the single
    // click reports the node, the double click would have opened it.
    el.shadowRoot
      ?.querySelector('[data-node-name="HTTP Request"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await openNode(el, 'HTTP Request');

    expect(panel(el)).toBeNull();
    expect(clicks).toEqual(['HTTP Request']);
  });
});

describe('parameters', () => {
  it('reconstructs the form from the description', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'HTTP Request');
    const text = panelText(el);
    expect(text).toContain('URL'); // label from the description
    expect(text).toContain('https://api.example.com/users'); // the set value
  });

  it('marks a value left at its default', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'HTTP Request');
    const defaults = panel(el)?.querySelectorAll('.wr-ndv-field.is-default');
    expect(defaults?.length).toBeGreaterThan(0);
  });

  it('hides what n8n would hide', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'HTTP Request');
    // sendQuery is false, so the queryParameters field must not appear. Assert
    // on the field itself: its label is a substring of "Send Query Parameters",
    // which is a different field and legitimately visible.
    expect(panel(el)?.querySelector('[data-field="queryParameters"]')).toBeNull();
    expect(panel(el)?.querySelector('[data-field="sendQuery"]')).not.toBeNull();
  });

  it('renders an expression in expression styling without evaluating it', async () => {
    const workflow = fixture('linear') as { nodes: Array<Record<string, unknown>> };
    const http = workflow.nodes[1] as { parameters: Record<string, unknown> };
    http.parameters = { ...http.parameters, url: '={{ $json.endpoint }}' };
    const el = await mount({ workflow });
    await openNode(el, 'HTTP Request');
    const expression = panel(el)?.querySelector('.wr-ndv-expression');
    expect(expression?.textContent).toContain('{{ $json.endpoint }}');
  });
});

describe('tabs', () => {
  it('shows settings and the raw JSON', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await openNode(el, 'Extract Emails');

    el.shadowRoot?.querySelector<HTMLElement>('[data-tab="json"]')?.click();
    await el.updateComplete;
    const json = panel(el)?.querySelector('.wr-ndv-json')?.textContent ?? '';
    expect(JSON.parse(json)).toMatchObject({ name: 'Extract Emails' });

    el.shadowRoot?.querySelector<HTMLElement>('[data-tab="settings"]')?.click();
    await el.updateComplete;
    expect(panel(el)?.querySelector('.wr-ndv-settings')).not.toBeNull();
  });
});

describe('stickies and unknown types', () => {
  it('inspects a sticky as rendered markdown', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const sticky = el.shadowRoot?.querySelector('[data-sticky-name]');
    sticky?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    await el.inspectorReady;
    await el.updateComplete;
    expect(panelText(el)).toContain('Demo');
  });

  it('falls back to key/value for a type it has no description for', async () => {
    const workflow = fixture('linear') as { nodes: Array<Record<string, unknown>> };
    workflow.nodes[1] = {
      ...workflow.nodes[1],
      type: 'com.example.mystery',
      parameters: { alpha: 'one', sendQueryParameters: false, options: {} },
    };
    const el = await mount({ workflow });
    await openNode(el, 'HTTP Request');
    // Parameter keys are read as labels, since an unseen type has no display
    // name to offer: a panel of raw keys reads as a dump rather than a node.
    expect(panelText(el)).toContain('Alpha');
    expect(panelText(el)).toContain('Send Query Parameters');
    expect(panelText(el)).toContain('one');
    // and an empty container is not worth a code block
    expect(panelText(el)).not.toContain('{}');
    expect(panel(el)?.querySelector('.wr-ndv-unknown')).not.toBeNull();
  });

  it('still opens when the descriptions sidecar is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const el = await mount({ workflow: fixture('linear') });
    const errors: string[] = [];
    el.addEventListener('wr-error', (e) => errors.push((e as CustomEvent).detail.message));
    await openNode(el, 'HTTP Request');
    expect(panel(el)).not.toBeNull();
    expect(panel(el)?.querySelector('.wr-ndv-unknown')).not.toBeNull();
    expect(errors).toEqual([]); // a missing sidecar is a fallback, not an error
  });
});

describe('overlay attribute', () => {
  it('draws a badge for a flagged node, with the finding text as its tooltip', async () => {
    const overlay = {
      version: 1,
      nodes: { 'HTTP Request': { badges: [{ kind: 'warn', text: 'slow' }] } },
      edges: {},
    };
    const el = await mount({ workflow: fixture('linear'), overlay: JSON.stringify(overlay) });
    expect(el.overlayData).toEqual(overlay);
    const badge = el.shadowRoot?.querySelector('.wr-node[data-node-name="HTTP Request"] .wr-overlay-badge');
    expect(badge?.querySelector('title')?.textContent).toBe('slow');
    expect(el.shadowRoot?.querySelector('.wr-node[data-node-name="Extract Emails"] .wr-overlay-badge')).toBeNull();
  });

  it('ignores an overlay that is not the S6 shape', async () => {
    const el = await mount({ workflow: fixture('linear'), overlay: '{"version":99}' });
    expect(el.overlayData).toBeUndefined();
  });
});
