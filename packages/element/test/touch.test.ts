/**
 * Touch has no middle button, no space bar and no wheel, so the mouse gestures
 * leave a phone with no way to move the canvas. On touch a one-finger drag pans,
 * two fingers pinch-zoom, and a tap opens a node (a double tap is unreliable:
 * browsers use it for their own zoom).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const fixture = (name: string): Record<string, unknown> => {
  const path = [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ].find(existsSync);
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

const surface = (el: WorkflowRender): Element => el.shadowRoot!.querySelector('.wr-viewport')!;
const viewBox = (el: WorkflowRender): number[] =>
  (el.shadowRoot?.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ').map(Number);

/** happy-dom drops pointer fields from event init, so pin them on. */
const pointer = (type: string, init: { id: number; x: number; y: number; pointerType?: string }): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: init.x, clientY: init.y });
  Object.defineProperty(event, 'pointerId', { value: init.id });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'touch' });
  Object.defineProperty(event, 'button', { value: 0 });
  return event;
};

afterEach(() => document.body.replaceChildren());

describe('touch', () => {
  it('pans with one finger, and draws no selection rectangle', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0] = viewBox(el);
    const target = surface(el);
    target.dispatchEvent(pointer('pointerdown', { id: 1, x: 300, y: 300 }));
    target.dispatchEvent(pointer('pointermove', { id: 1, x: 360, y: 340 }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.wr-selection-box')).toBeNull();
    target.dispatchEvent(pointer('pointerup', { id: 1, x: 360, y: 340 }));
    await el.updateComplete;
    expect(viewBox(el)[0]).toBeLessThan(x0!);
  });

  it('still draws the selection rectangle for a mouse', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const [x0] = viewBox(el);
    const target = surface(el);
    target.dispatchEvent(pointer('pointerdown', { id: 1, x: 300, y: 300, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointermove', { id: 1, x: 360, y: 340, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointerup', { id: 1, x: 360, y: 340, pointerType: 'mouse' }));
    await el.updateComplete;
    expect(viewBox(el)[0]).toBeCloseTo(x0!, 6);
  });

  it('zooms in when two fingers move apart, and out when they come together', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const width = (): number => viewBox(el)[2]!;
    const w0 = width();
    const target = surface(el);
    target.dispatchEvent(pointer('pointerdown', { id: 1, x: 300, y: 300 }));
    target.dispatchEvent(pointer('pointerdown', { id: 2, x: 400, y: 300 }));
    target.dispatchEvent(pointer('pointermove', { id: 2, x: 500, y: 300 })); // 100px apart -> 200px
    await el.updateComplete;
    const zoomedIn = width();
    expect(zoomedIn).toBeLessThan(w0);

    target.dispatchEvent(pointer('pointermove', { id: 2, x: 350, y: 300 })); // 200px -> 50px
    await el.updateComplete;
    expect(width()).toBeGreaterThan(zoomedIn);
    target.dispatchEvent(pointer('pointerup', { id: 2, x: 350, y: 300 }));
    target.dispatchEvent(pointer('pointerup', { id: 1, x: 300, y: 300 }));
  });

  it('opens a node on a tap', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const node = el.shadowRoot!.querySelector('[data-node-name]')!;
    const name = node.getAttribute('data-node-name');
    const opened: unknown[] = [];
    el.addEventListener('wr-inspector-open', (e) => opened.push((e as CustomEvent).detail));

    node.dispatchEvent(pointer('pointerdown', { id: 1, x: 10, y: 10 }));
    node.dispatchEvent(pointer('pointerup', { id: 1, x: 10, y: 10 }));
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    await el.inspectorReady;
    expect(opened).toEqual([{ nodeName: name }]);
  });

  it('only selects a node on a mouse click', async () => {
    const el = await mount({ workflow: fixture('linear') });
    const node = el.shadowRoot!.querySelector('[data-node-name]')!;
    const opened: unknown[] = [];
    el.addEventListener('wr-inspector-open', (e) => opened.push((e as CustomEvent).detail));

    node.dispatchEvent(pointer('pointerdown', { id: 1, x: 10, y: 10, pointerType: 'mouse' }));
    node.dispatchEvent(pointer('pointerup', { id: 1, x: 10, y: 10, pointerType: 'mouse' }));
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(opened).toEqual([]);
    expect(el.selectedNodes).toEqual([node.getAttribute('data-node-name')]);
  });
});
