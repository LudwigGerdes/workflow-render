/**
 * Pinned data is not run data.
 *
 * n8n stores `pinData` beside the nodes and shows it in the output pane,
 * counting it on the canvas exactly as it counts real output. A viewer has to
 * carry both halves of that: show the items, and never imply the node ran.
 */
import { describe, expect, it } from 'vitest';
import { parseInput } from '../src/adapters/n8n.js';
import { inputPane, outputPane } from '../src/inspector/data-model.js';
import type { CanvasModel } from '../src/types.js';

const workflow = (pinData?: Record<string, unknown>): Record<string, unknown> => ({
  name: 'pinned',
  nodes: [
    {
      parameters: {}, id: 'a1', name: 'Trigger',
      type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0],
    },
    {
      parameters: {}, id: 'b2', name: 'Edit Fields',
      type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [260, 0],
    },
  ],
  connections: { Trigger: { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }]] } },
  ...(pinData ? { pinData } : {}),
});

const parse = (source: Record<string, unknown>): CanvasModel => {
  const { model } = parseInput(source);
  if (!model) throw new Error('fixture did not parse');
  return model;
};

describe('pinned data', () => {
  it('is read off the workflow and carried as run items', () => {
    const model = parse(workflow({ 'Edit Fields': [{ json: { id: 1 } }, { json: { id: 2 } }] }));
    const node = model.nodes.find((n) => n.name === 'Edit Fields');
    expect(node?.run?.pinned).toBe(true);
    expect(node?.run?.itemsOut).toEqual([2]);
  });

  it('does not claim the node executed', () => {
    // The whole point: status stays 'none', so nothing downstream paints this
    // tile as a success or reports a run that never happened.
    const model = parse(workflow({ 'Edit Fields': [{ json: { id: 1 } }] }));
    expect(model.nodes.find((n) => n.name === 'Edit Fields')?.run?.status).toBe('none');
  });

  it('accepts an entry that is the object itself, not wrapped in json', () => {
    // Data pinned by hand is not always `{ json: ... }`.
    const model = parse(workflow({ 'Edit Fields': [{ id: 7 }] }));
    const pane = outputPane(model, 'Edit Fields');
    expect(pane?.items[0]?.json).toEqual({ id: 7 });
  });

  it('flags the pane so it can say where the data came from', () => {
    const model = parse(workflow({ 'Edit Fields': [{ json: { id: 1 } }] }));
    expect(outputPane(model, 'Edit Fields')?.pinned).toBe(true);
  });

  it('feeds the downstream node the pinned items as its input', () => {
    // Pinning exists precisely so the next node has something to receive.
    const model = parse(workflow({ Trigger: [{ json: { id: 1 } }, { json: { id: 2 } }] }));
    expect(inputPane(model, 'Edit Fields')?.items).toHaveLength(2);
  });

  it('leaves a workflow without pinData completely untouched', () => {
    const model = parse(workflow());
    expect(model.nodes.every((n) => n.run === undefined)).toBe(true);
  });

  it('ignores an empty pin rather than inventing an empty run', () => {
    const model = parse(workflow({ 'Edit Fields': [] }));
    expect(model.nodes.find((n) => n.name === 'Edit Fields')?.run).toBeUndefined();
  });
});
