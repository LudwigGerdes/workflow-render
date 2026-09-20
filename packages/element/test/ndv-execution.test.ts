import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDescriptions } from '../src/descriptions.js';
import { resetIcons } from '../src/icons.js';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const load = (relative: string): Record<string, unknown> => {
  const path = [resolve(process.cwd(), relative), resolve(process.cwd(), '../..', relative)].find(existsSync);
  if (!path) throw new Error(`not found: ${relative}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

const fixture = (name: string): Record<string, unknown> =>
  load(`packages/core/test/fixtures/${name}.json`);

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

const q = (el: WorkflowRender, selector: string): Element | null => el.shadowRoot?.querySelector(selector) ?? null;

/** Panes open on Schema, as n8n's do, so table assertions select Table first. */
const setMode = async (el: WorkflowRender, side: 'input' | 'output', mode: string): Promise<void> => {
  el.shadowRoot
    ?.querySelector(`.wr-ndv-pane-${side} [data-mode="${mode}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await el.updateComplete;
};
const qa = (el: WorkflowRender, selector: string): Element[] => [...(el.shadowRoot?.querySelectorAll(selector) ?? [])];

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
  vi.restoreAllMocks();
});

describe('three panes', () => {
  it('shows input, parameters and output for an executed node', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    await open(el, 'Extract Emails');
    expect(q(el, '.wr-ndv-pane-input')).not.toBeNull();
    expect(q(el, '.wr-ndv-params')).not.toBeNull();
    expect(q(el, '.wr-ndv-pane-output')).not.toBeNull();
  });

  it('reports each pane\'s item count', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    await open(el, 'Extract Emails');
    expect(q(el, '.wr-ndv-pane-input')?.textContent).toContain('2 items');
    expect(q(el, '.wr-ndv-pane-output')?.textContent).toContain('2 items');
  });

  it('keeps all three columns in the design view, saying there is no data', async () => {
    // The panel has the same shape whatever the payload. A workflow carries no
    // run data, so the side columns say so rather than disappearing -- changing
    // shape between a workflow and an execution reads as two different panels.
    const el = await mount({ workflow: fixture('linear') });
    await open(el, 'HTTP Request');
    expect(q(el, '.wr-ndv-pane-input')).not.toBeNull();
    expect(q(el, '.wr-ndv-pane-output')).not.toBeNull();
    expect(q(el, '.wr-ndv-params')).not.toBeNull();
    expect(q(el, '.wr-ndv-pane-input')?.textContent).toContain('No input data');
    // and nothing offering to run something a snapshot cannot run
    expect(q(el, '.wr-ndv-pane-input')?.textContent).not.toContain('Execute');
  });

  it('has no input pane for a trigger', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    await open(el, 'Schedule Trigger');
    expect(q(el, '.wr-ndv-pane-input')).toBeNull();
    expect(q(el, '.wr-ndv-pane-output')).not.toBeNull();
  });
});

describe('table and json', () => {
  it('gives the table a column per key', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    // Make Items emits {id, email}; Extract Emails is a Set node with no fields
    // configured, so it genuinely emits empty objects -- n8n shows [{},{}] too.
    await open(el, 'Make Items');
    await setMode(el, 'output', 'table');
    const headers = qa(el, '.wr-ndv-pane-output th').map((th) => th.textContent?.trim());
    expect(headers).toEqual(['id', 'email']);
    expect(qa(el, '.wr-ndv-pane-output tbody tr')).toHaveLength(2);
  });

  it('shows an empty table for items with no keys, as n8n does', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    await open(el, 'Extract Emails');
    await setMode(el, 'output', 'table');
    await setMode(el, 'input', 'table');
    expect(qa(el, '.wr-ndv-pane-output th')).toHaveLength(0);
    expect(qa(el, '.wr-ndv-pane-input th').map((th) => th.textContent?.trim())).toEqual(['id', 'email']);
  });

  it('switches that pane to JSON without touching the other', async () => {
    const el = await mount({ workflow: fixture('execution-success') });
    await open(el, 'Extract Emails');
    q(el, '.wr-ndv-pane-output [data-mode="json"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    const json = q(el, '.wr-ndv-pane-output .wr-ndv-json')?.textContent ?? '';
    expect(JSON.parse(json)).toHaveLength(2);
    // the input pane is independent, as in n8n: it stays on its own mode
    expect(q(el, '.wr-ndv-pane-input .wr-ndv-json')).toBeNull();
    expect(q(el, '.wr-ndv-pane-input .wr-ndv-schema')).not.toBeNull();
  });
});

describe('run selector', () => {
  it('appears only when a node ran more than once', async () => {
    const single = await mount({ workflow: fixture('execution-success') });
    await open(single, 'Extract Emails');
    expect(q(single, '.wr-ndv-runs')).toBeNull();

    const looped = await mount({ workflow: fixture('execution-loop') });
    await open(looped, 'Handle Batch');
    expect(q(looped, '.wr-ndv-runs')).not.toBeNull();
  });

  it('labels runs the way n8n does', async () => {
    const el = await mount({ workflow: fixture('execution-loop') });
    await open(el, 'Handle Batch');
    const options = qa(el, '.wr-ndv-runs option').map((o) => o.textContent?.trim());
    expect(options).toEqual(['1 of 3 (2 items)', '2 of 3 (2 items)', '3 of 3 (1 item)']);
  });

  it('changes both panes when another run is chosen', async () => {
    const el = await mount({ workflow: fixture('execution-loop') });
    await open(el, 'Handle Batch');
    await setMode(el, 'output', 'table');
    expect(qa(el, '.wr-ndv-pane-output tbody tr')).toHaveLength(2); // run 1

    const select = q(el, '.wr-ndv-runs select') as HTMLSelectElement | null;
    if (select) {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await el.updateComplete;
    expect(qa(el, '.wr-ndv-pane-output tbody tr')).toHaveLength(1); // run 3 has one item
  });
});

describe('failures and empty states', () => {
  it('shows the error for a node that failed', async () => {
    const el = await mount({ workflow: fixture('execution-error') });
    await open(el, 'Fail Here');
    const output = q(el, '.wr-ndv-pane-output');
    expect(output?.textContent).toContain('boom');
    expect(q(el, '.wr-ndv-error')).not.toBeNull();
  });

  it('still shows the failed node\'s input', async () => {
    const el = await mount({ workflow: fixture('execution-error') });
    await open(el, 'Fail Here');
    expect(q(el, '.wr-ndv-pane-input')?.textContent).toContain('2 items');
  });

  it('says so when a node did not execute', async () => {
    const workflow = fixture('execution-error') as {
      data: { resultData: { runData: Record<string, unknown> } };
    };
    delete workflow.data.resultData.runData['Fail Here'];
    const el = await mount({ workflow });
    await open(el, 'Fail Here');
    expect(q(el, '.wr-ndv-pane-output')?.textContent).toContain('Did not execute');
  });
});

/**
 * Pinned data arrives on a plain workflow, never on an execution.
 *
 * The panes were gated on `view === 'execution'`, so a pinned node counted its
 * items on the canvas while the panel insisted there was no data at all --
 * visible immediately in a browser, and invisible to every test here until one
 * asked for it.
 */
describe('pinned data in the panel', () => {
  const pinnedWorkflow = (): Record<string, unknown> => ({
    name: 'pinned',
    nodes: [
      { parameters: {}, id: 'a1', name: 'Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
      { parameters: {}, id: 'b2', name: 'Edit Fields', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [260, 0] },
    ],
    connections: { Trigger: { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }]] } },
    pinData: {
      'Edit Fields': [{ json: { id: 1, email: 'a@example.com' } }, { json: { id: 2, email: 'b@example.com' } }],
    },
  });

  it('shows the pinned items in the output pane', async () => {
    const el = await mount({ workflow: pinnedWorkflow() });
    await open(el, 'Edit Fields');
    const output = q(el, '.wr-ndv-pane-output')?.textContent ?? '';
    expect(output).toContain('2 items');
    expect(output).toContain('email');
  });

  it('says the data was pinned rather than produced', async () => {
    const el = await mount({ workflow: pinnedWorkflow() });
    await open(el, 'Edit Fields');
    expect(q(el, '.wr-ndv-pinned')).not.toBeNull();
  });

  it('leaves a workflow with no pinned data showing the snapshot wording', async () => {
    const el = await mount({ workflow: fixture('linear') });
    await open(el, 'Set');
    expect(q(el, '.wr-ndv-pinned')).toBeNull();
  });
});
