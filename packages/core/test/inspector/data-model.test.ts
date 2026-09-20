import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inputPane, outputPane } from '../../src/inspector/index.js';
import { parseInput } from '../../src/adapters/n8n.js';
import type { CanvasModel } from '../../src/types.js';

const model = (name: string): CanvasModel => {
  const { model: parsed } = parseInput(
    JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  if (!parsed) throw new Error('no model');
  return parsed;
};

describe('outputPane', () => {
  it('gives the items a node emitted, with a table over their keys', () => {
    const pane = outputPane(model('execution-success'), 'Make Items', 0, 0);
    expect(pane?.items).toHaveLength(2);
    expect(pane?.table.columns).toEqual(['id', 'email']); // first-seen order
    expect(pane?.table.rows[0]).toMatchObject({ id: '1', email: 'a@example.com' });
    expect(pane?.runCount).toBe(1);
  });

  it('pretty-prints the same items as JSON', () => {
    const pane = outputPane(model('execution-success'), 'Make Items', 0, 0);
    const parsed = JSON.parse(pane?.jsonText ?? '[]') as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ id: 1 });
  });

  it('carries the error for a run that failed', () => {
    const pane = outputPane(model('execution-error'), 'Fail Here', 0, 0);
    expect(pane?.error?.message).toBe('boom');
    expect(pane?.items).toHaveLength(0);
  });

  it('returns nothing for a node that never ran', () => {
    const m = model('execution-success');
    const node = m.nodes.find((n) => n.name === 'Make Items');
    if (node) node.run = { status: 'none', runs: 0, itemsOut: [] };
    expect(outputPane(m, 'Make Items', 0, 0)).toBeUndefined();
  });
});

describe('inputPane', () => {
  it('shows the upstream node\'s output as this node\'s input', () => {
    const pane = inputPane(model('execution-success'), 'Extract Emails', 0);
    expect(pane?.items).toHaveLength(2);
    expect(pane?.table.columns).toContain('email');
  });

  it('has no input for a trigger', () => {
    expect(inputPane(model('execution-success'), 'Schedule Trigger', 0)).toBeUndefined();
  });
});

describe('a node that ran more than once', () => {
  // A SplitInBatches loop over 5 items in batches of 2: three runs, 2 + 2 + 1.
  it('exposes each run separately', () => {
    const m = model('execution-loop');
    const first = outputPane(m, 'Handle Batch', 0, 0);
    const last = outputPane(m, 'Handle Batch', 2, 0);
    expect(first?.runCount).toBe(3);
    expect(first?.items).toHaveLength(2);
    expect(last?.items).toHaveLength(1);
  });

  it('follows the run through to the input pane', () => {
    const m = model('execution-loop');
    expect(inputPane(m, 'Handle Batch', 0)?.items).toHaveLength(2);
    expect(inputPane(m, 'Handle Batch', 2)?.items).toHaveLength(1);
  });

  it('parses straight from the REST payload, index-encoding and all', () => {
    const m = model('execution-loop');
    expect(m.view).toBe('execution');
    expect(m.nodes.find((n) => n.name === 'Loop Over Items')?.run?.runs).toBe(4);
  });
});

describe('table rules', () => {
  const paneFor = (items: unknown[]) => {
    const m = model('execution-success');
    const node = m.nodes.find((n) => n.name === 'Make Items');
    if (node?.run) node.run.items = [{ outputs: [items.map((json) => ({ json }))] }];
    return outputPane(m, 'Make Items', 0, 0);
  };

  it('stringifies scalars and compacts objects', () => {
    const pane = paneFor([{ n: 3, ok: true, nested: { a: 1 }, nothing: null }]);
    expect(pane?.table.rows[0]).toMatchObject({ n: '3', ok: 'true', nested: '{"a":1}', nothing: '' });
  });

  it('truncates a long value rather than blowing out the column', () => {
    const long = { text: 'x'.repeat(200) };
    const cell = paneFor([long])?.table.rows[0]?.['text'] ?? '';
    expect(cell.length).toBeLessThanOrEqual(81);
    expect(cell.endsWith('…')).toBe(true);
  });

  it('caps the column count and reports how many it dropped', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 20; i += 1) wide[`c${i}`] = i;
    const pane = paneFor([wide]);
    expect(pane?.table.columns).toHaveLength(12);
    expect(pane?.table.truncatedColumns).toBe(8);
  });

  it('describes binary rather than fetching it', () => {
    const m = model('execution-success');
    const node = m.nodes.find((n) => n.name === 'Make Items');
    if (node?.run) {
      node.run.items = [
        { outputs: [[{ json: { id: 1 }, binary: { data: { fileName: 'a.pdf', mimeType: 'application/pdf' } } }]] },
      ];
    }
    const pane = outputPane(m, 'Make Items', 0, 0);
    expect(pane?.table.columns).toContain('binary');
    expect(pane?.table.rows[0]?.['binary']).toContain('a.pdf');
    expect(pane?.table.rows[0]?.['binary']).toContain('application/pdf');
  });
});
