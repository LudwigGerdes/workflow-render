/**
 * Gesture semantics, taken from how n8n 2.10.0 configures its canvas.
 *
 * n8n runs vue-flow in selection mode by default: the left button draws a
 * selection rectangle and only the middle button drags the pane. Holding space
 * or the platform control key (Meta on macOS, Control elsewhere) switches to
 * panning mode, and that same key is the zoom activation key -- so cmd+wheel
 * zooms while a plain wheel pans. A node is selected on a single click and
 * opened on a double click, which is why the node's double-click handler stops
 * propagation: opening a node must not also zoom the canvas.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const fixture = (name: string): Record<string, unknown> => {
  const candidates = [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error(`fixture ${name} not found`);
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

const surface = (el: WorkflowRender): Element | null | undefined =>
  el.shadowRoot?.querySelector('.wr-viewport');

const viewBox = (el: WorkflowRender): number[] =>
  (el.shadowRoot?.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ').map(Number);

/** happy-dom drops modifier keys and buttons from event init, so pin them on. */
const mouse = (type: string, init: Record<string, unknown> = {}): MouseEvent => {
  const { button, buttons, shiftKey, metaKey, ctrlKey, ...rest } = init;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...rest });
  for (const [key, value] of Object.entries({ button, buttons, shiftKey, metaKey, ctrlKey })) {
    if (value !== undefined) Object.defineProperty(event, key, { value });
  }
  return event;
};

const wheel = (el: WorkflowRender, init: Record<string, unknown>): void => {
  const { ctrlKey, metaKey, ...rest } = init;
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...rest });
  for (const [key, value] of Object.entries({ ctrlKey, metaKey })) {
    if (value !== undefined) Object.defineProperty(event, key, { value });
  }
  surface(el)?.dispatchEvent(event);
};

/** Press the button down, move, release -- the shape of a pane drag. */
const drag = (el: WorkflowRender, button: number, from = { x: 300, y: 300 }, to = { x: 360, y: 340 }): void => {
  const target = surface(el);
  target?.dispatchEvent(mouse('pointerdown', { button, buttons: button === 1 ? 4 : 1, clientX: from.x, clientY: from.y }));
  target?.dispatchEvent(mouse('pointermove', { button, buttons: button === 1 ? 4 : 1, clientX: to.x, clientY: to.y }));
  target?.dispatchEvent(mouse('pointerup', { button, clientX: to.x, clientY: to.y }));
};

const nodeEl = (el: WorkflowRender, name: string): Element | null | undefined =>
  el.shadowRoot?.querySelector(`[data-node-name="${name}"]`);

afterEach(() => document.body.replaceChildren());

describe('selection', () => {
  it('selects a node on a single click instead of opening it', async () => {
    const el = await mount({ workflow: fixture('linear') });
    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('click'));
    await el.updateComplete;

    expect(el.selectedNodes).toEqual(['HTTP Request']);
    expect(el.shadowRoot?.querySelector('.wr-ndv-backdrop')).toBeNull();
  });

  it('replaces the selection on a plain click and extends it on shift', async () => {
    const el = await mount({ workflow: fixture('linear') });
    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('click'));
    await el.updateComplete;
    nodeEl(el, 'Extract Emails')?.dispatchEvent(mouse('click'));
    await el.updateComplete;
    expect(el.selectedNodes).toEqual(['Extract Emails']);

    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('click', { shiftKey: true }));
    await el.updateComplete;
    expect([...el.selectedNodes].sort()).toEqual(['Extract Emails', 'HTTP Request']);
  });

  it('clears the selection when the empty canvas is clicked', async () => {
    const el = await mount({ workflow: fixture('linear') });
    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('click'));
    await el.updateComplete;
    surface(el)?.dispatchEvent(mouse('click'));
    await el.updateComplete;
    expect(el.selectedNodes).toEqual([]);
  });

  it('marks the selected node in the DOM', async () => {
    const el = await mount({ workflow: fixture('linear') });
    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('click'));
    await el.updateComplete;
    expect(nodeEl(el, 'HTTP Request')?.classList.contains('wr-selected')).toBe(true);
  });
});

describe('opening a node', () => {
  it('opens the inspector on a double click, and does not zoom', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);

    nodeEl(el, 'HTTP Request')?.dispatchEvent(mouse('dblclick'));
    await el.updateComplete;
    await el.inspectorReady;
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.wr-ndv-backdrop')).not.toBeNull();
    expect(viewBox(el)[2]).toBeCloseTo(w0!, 6);
  });

  it('still zooms on a double click of the empty canvas', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);
    surface(el)?.dispatchEvent(mouse('dblclick'));
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeCloseTo(w0! / 2, 2);
  });
});

describe('panning', () => {
  it('drags the pane with the middle button', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0] = viewBox(el);
    drag(el, 1);
    await el.updateComplete;
    expect(viewBox(el)[0]).not.toBeCloseTo(x0!, 6);
  });

  it('does not drag the pane with the left button', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0, y0] = viewBox(el);
    drag(el, 0);
    await el.updateComplete;
    expect(viewBox(el)[0]).toBeCloseTo(x0!, 6);
    expect(viewBox(el)[1]).toBeCloseTo(y0!, 6);
  });

  it('drags with the left button while space is held', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0] = viewBox(el);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    drag(el, 0);
    await el.updateComplete;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(viewBox(el)[0]).not.toBeCloseTo(x0!, 6);
  });
});

describe('zoom activation key', () => {
  it('zooms on cmd+wheel, which n8n uses as its zoom activation key', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [, , w0] = viewBox(el);
    wheel(el, { deltaY: -120, metaKey: true });
    await el.updateComplete;
    expect(viewBox(el)[2]).toBeLessThan(w0!);
  });
});

describe('selection rectangle', () => {
  const box = (el: WorkflowRender): Element | null | undefined =>
    el.shadowRoot?.querySelector('.wr-selection-box');

  it('draws a rectangle while the left button drags the empty canvas', async () => {
    const el = await mount({ workflow: fixture('linear') });
    surface(el)?.dispatchEvent(mouse('pointerdown', { button: 0, buttons: 1, clientX: 20, clientY: 20 }));
    surface(el)?.dispatchEvent(mouse('pointermove', { button: 0, buttons: 1, clientX: 300, clientY: 200 }));
    await el.updateComplete;
    expect(box(el)).not.toBeNull();
  });

  it('selects every node the rectangle covers, and puts itself away', async () => {
    const el = await mount({ workflow: fixture('linear') });
    // Across the whole viewport: whatever the fitted view is, this covers it.
    surface(el)?.dispatchEvent(mouse('pointerdown', { button: 0, buttons: 1, clientX: 0, clientY: 0 }));
    surface(el)?.dispatchEvent(mouse('pointermove', { button: 0, buttons: 1, clientX: 800, clientY: 600 }));
    surface(el)?.dispatchEvent(mouse('pointerup', { button: 0, clientX: 800, clientY: 600 }));
    await el.updateComplete;

    expect([...el.selectedNodes].sort()).toEqual(
      ['Extract Emails', 'HTTP Request', "When clicking 'Execute workflow'"].sort(),
    );
    expect(box(el)).toBeNull();
  });

  it('selects nothing when the rectangle covers no node', async () => {
    const el = await mount({ workflow: fixture('linear') });
    surface(el)?.dispatchEvent(mouse('pointerdown', { button: 0, buttons: 1, clientX: 0, clientY: 0 }));
    surface(el)?.dispatchEvent(mouse('pointermove', { button: 0, buttons: 1, clientX: 2, clientY: 2 }));
    surface(el)?.dispatchEvent(mouse('pointerup', { button: 0, clientX: 2, clientY: 2 }));
    await el.updateComplete;
    expect(el.selectedNodes).toEqual([]);
  });

  it('draws no rectangle in panning mode, where the left button pans', async () => {
    const el = await mount({ workflow: fixture('linear') });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    surface(el)?.dispatchEvent(mouse('pointerdown', { button: 0, buttons: 1, clientX: 20, clientY: 20 }));
    surface(el)?.dispatchEvent(mouse('pointermove', { button: 0, buttons: 1, clientX: 300, clientY: 200 }));
    await el.updateComplete;
    expect(box(el)).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  });
});

describe('a press is not yet a drag', () => {
  /** Spy on capture, which is what decides where the click lands. */
  const watchCapture = (el: WorkflowRender): number[] => {
    const vp = surface(el) as Element & Record<string, unknown>;
    const captured: number[] = [];
    vp['setPointerCapture'] = (id: number): void => void captured.push(id);
    vp['releasePointerCapture'] = (): void => {};
    return captured;
  };

  const press = (el: WorkflowRender, type: string, x: number, y: number): void => {
    const e = mouse(type, { button: 0, buttons: 1, clientX: x, clientY: y });
    Object.defineProperty(e, 'pointerId', { value: 7 });
    surface(el)?.dispatchEvent(e);
  };

  it('does not capture the pointer on a plain press', async () => {
    // Capturing on pointerdown retargets the click and dblclick that follow to
    // the viewport, so `closest('[data-node-name]')` finds nothing and a node
    // never sees them. That is why nodes were not clickable with real input,
    // while tests that dispatched click straight at the node all passed.
    const el = await mount({ workflow: fixture('branching') });
    const captured = watchCapture(el);
    press(el, 'pointerdown', 100, 100);
    expect(captured).toEqual([]);
  });

  it('captures once the pointer actually moves, so a drag keeps tracking', async () => {
    const el = await mount({ workflow: fixture('branching') });
    const captured = watchCapture(el);
    press(el, 'pointerdown', 100, 100);
    press(el, 'pointermove', 160, 140);
    expect(captured).toEqual([7]);
  });

  it('draws no marquee for a press that never moved', async () => {
    const el = await mount({ workflow: fixture('branching') });
    watchCapture(el);
    press(el, 'pointerdown', 100, 100);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.wr-selection-box')).toBeNull();
  });
});

describe('the cursor tells the truth about dragging', () => {
  it('shows the grab hand only while a panning key is held', async () => {
    const el = await mount({ workflow: fixture('branching') });
    // Plain left-drag marquee-selects, so a hand here promises the wrong thing.
    expect(surface(el)?.classList.contains('wr-panning')).toBe(false);

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await el.updateComplete;
    expect(surface(el)?.classList.contains('wr-panning')).toBe(true);

    globalThis.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    await el.updateComplete;
    expect(surface(el)?.classList.contains('wr-panning')).toBe(false);
  });
});

describe('a workflow arrives fitted', () => {
  it('fits on load, because zoom="fit" is the default', async () => {
    // The property was declared and never acted on, so a workflow rendered at
    // its own scale and ran off the right of the canvas.
    const el = document.createElement('workflow-render') as WorkflowRender & { fit: () => void };
    let fits = 0;
    el.fit = (): void => void fits++;
    el.workflow = fixture('branching');
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    await el.updateComplete;
    expect(fits).toBeGreaterThan(0);
  });

  it('leaves the view alone when asked not to fit', async () => {
    const el = document.createElement('workflow-render') as WorkflowRender & { fit: () => void };
    let fits = 0;
    el.fit = (): void => void fits++;
    el.zoom = '1';
    el.workflow = fixture('branching');
    document.body.append(el);
    await el.updateComplete;
    await el.ready;
    await el.updateComplete;
    expect(fits).toBe(0);
  });
});
