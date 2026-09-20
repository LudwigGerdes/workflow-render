import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../src/adapters/n8n.js';
import type { CanvasModel } from '../src/types.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const parsed = (name: string): CanvasModel => {
  const { model, errors } = parseInput(fixture(name));
  expect(errors).toEqual([]);
  if (!model) throw new Error('no model');
  return model;
};

describe('design view', () => {
  it('detects a workflow and classifies nodes', () => {
    const model = parsed('linear');
    expect(model.view).toBe('design');
    expect(model.nodes.map((n) => n.name)).toEqual([
      "When clicking 'Execute workflow'",
      'HTTP Request',
      'Extract Emails',
    ]);
    expect(model.nodes.map((n) => n.kind)).toEqual(['trigger', 'regular', 'regular']);
    expect(model.stickies).toHaveLength(1);
    expect(model.stickies[0]).toMatchObject({
      color: 4,
      position: [0, -192],
      width: 304,
      height: 144,
      content: '## Demo\nLinear **flow**',
    });
  });

  it('builds the edge chain', () => {
    const model = parsed('linear');
    expect(model.edges).toEqual([
      { from: "When clicking 'Execute workflow'", fromOutput: 0, to: 'HTTP Request', toInput: 0, kind: 'main' },
      { from: 'HTTP Request', fromOutput: 0, to: 'Extract Emails', toInput: 0, kind: 'main' },
    ]);
  });

  it('keeps node positions and parameters verbatim', () => {
    const model = parsed('linear');
    expect(model.nodes[1]?.position).toEqual([224, 0]);
    expect(model.nodes[1]?.parameters).toMatchObject({ url: 'https://api.example.com/users' });
    expect(model.nodes[1]?.schemaVersion).toBe(4.2);
  });
});

describe('branching workflow', () => {
  const model = (): CanvasModel => parsed('branching');

  it('labels IF outputs true/false', () => {
    const ifEdges = model().edges.filter((e) => e.from === 'Valid?');
    expect(ifEdges.map((e) => e.label)).toEqual(['true', 'false']);
  });

  it('labels Switch outputs with their outputKeys', () => {
    const routeEdges = model().edges.filter((e) => e.from === 'Route');
    expect(routeEdges.map((e) => e.label)).toEqual(['A', 'B', 'C']);
  });

  it('marks ai_* connections and their sources as sub-nodes', () => {
    const m = model();
    const aiEdges = m.edges.filter((e) => e.kind === 'ai');
    expect(aiEdges.map((e) => e.from).sort()).toEqual(['Fetch Record', 'OpenAI Chat Model']);
    expect(aiEdges.every((e) => e.to === 'AI Agent')).toBe(true);
    expect(m.nodes.find((n) => n.name === 'OpenAI Chat Model')?.kind).toBe('sub');
    expect(m.nodes.find((n) => n.name === 'AI Agent')?.kind).toBe('regular');
  });

  it('carries the disabled flag and trigger classification', () => {
    const m = model();
    expect(m.nodes.find((n) => n.name === 'Skip')?.disabled).toBe(true);
    expect(m.nodes.find((n) => n.name === 'Webhook')?.kind).toBe('trigger');
  });

  it('keeps a backwards edge', () => {
    expect(model().edges).toContainEqual(
      expect.objectContaining({ from: 'Route', to: 'Merge', fromOutput: 2, label: 'C' }),
    );
  });
});

describe('execution view', () => {
  it('detects a successful execution', () => {
    const model = parsed('execution-success');
    expect(model.view).toBe('execution');
    expect(model.execution).toEqual({ status: 'success', durationMs: 30, mode: 'trigger' });
    expect(model.nodes.map((n) => n.name)).toEqual(['Schedule Trigger', 'Make Items', 'Extract Emails']);
    expect(model.nodes.every((n) => n.run?.status === 'success')).toBe(true);
    expect(model.edges.map((e) => e.itemCount)).toEqual([1, 2]);
  });

  it('reports the failing node and its error', () => {
    const model = parsed('execution-error');
    expect(model.execution?.status).toBe('error');
    const failed = model.nodes.find((n) => n.name === 'Fail Here');
    expect(failed?.run?.status).toBe('error');
    expect(failed?.run?.error?.message).toBe('boom');
    const upstream = model.nodes.find((n) => n.name === 'Make Items');
    expect(upstream?.run?.status).toBe('success');
    expect(upstream?.run?.itemsOut).toEqual([2]);
    expect(model.edges.find((e) => e.from === 'Make Items')?.itemCount).toBe(2);
  });

  it('marks nodes absent from runData as not run', () => {
    const execution = fixture('execution-error') as { data: { resultData: { runData: Record<string, unknown> } } };
    delete execution.data.resultData.runData['Fail Here'];
    const { model } = parseInput(execution);
    expect(model?.nodes.find((n) => n.name === 'Fail Here')?.run?.status).toBe('none');
  });
});

describe('run detail retained for the inspector', () => {
  it('keeps each run\'s output items, not just a count', () => {
    const model = parsed('execution-success');
    const make = model.nodes.find((n) => n.name === 'Make Items');
    const detail = make?.run?.items;
    expect(detail).toHaveLength(1);
    expect(detail?.[0]?.outputs[0]).toHaveLength(2);
    expect(detail?.[0]?.outputs[0]?.[0]?.json).toMatchObject({ id: 1 });
  });

  it('keeps the failing run\'s error alongside its items', () => {
    const model = parsed('execution-error');
    const failed = model.nodes.find((n) => n.name === 'Fail Here');
    expect(failed?.run?.items?.[0]?.error?.message).toBe('boom');
    const upstream = model.nodes.find((n) => n.name === 'Make Items');
    expect(upstream?.run?.items?.[0]?.outputs[0]).toHaveLength(2);
  });

  it('records how long each run took', () => {
    const model = parsed('execution-success');
    const times = model.nodes.map((n) => n.run?.items?.[0]?.executionTime);
    expect(times.some((t) => typeof t === 'number')).toBe(true);
  });
});

describe('n8n REST payloads', () => {
  it('revives execution data that arrives flatted', () => {
    // n8n stores and serves execution data index-encoded ("flatted"), so a
    // payload pulled straight from /rest/executions/:id has `data` as a string.
    const { model, errors } = parseInput(fixture('execution-api-flatted'));
    expect(errors).toEqual([]);
    expect(model?.view).toBe('execution');
    expect(model?.nodes.map((n) => n.run?.status)).toEqual(['success', 'success', 'success']);
    expect(model?.edges.map((e) => e.itemCount)).toEqual([1, 2]);
  });

  it('renders the same model as the equivalent decoded execution', () => {
    const fromApi = parseInput(fixture('execution-api-flatted')).model;
    const decoded = parseInput(fixture('execution-success')).model;
    expect(fromApi?.nodes.map((n) => [n.name, n.run?.status, n.run?.itemsOut])).toEqual(
      decoded?.nodes.map((n) => [n.name, n.run?.status, n.run?.itemsOut]),
    );
  });

  it('reports unusable flatted data instead of throwing', () => {
    const { model, errors } = parseInput({
      workflowData: { nodes: [], connections: {} },
      data: 'not flatted at all',
    });
    expect(model).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('tolerance', () => {
  it('drops connections to unknown nodes with a warning', () => {
    const workflow = fixture('linear') as { connections: Record<string, unknown> };
    workflow.connections['HTTP Request'] = { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] };
    const { model, warnings } = parseInput(workflow);
    expect(model?.edges).toHaveLength(1);
    expect(warnings).toContain('connection to unknown node "Ghost" dropped');
  });

  it('rejects input that is neither a workflow nor an execution', () => {
    for (const junk of [null, 42, 'nope', {}, { nodes: 'not an array' }, []]) {
      const { model, errors } = parseInput(junk);
      expect(model).toBeUndefined();
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('defaults a sticky with a bad size and warns', () => {
    const workflow = fixture('linear') as { nodes: Array<Record<string, unknown>> };
    const sticky = workflow.nodes[3] as { parameters: Record<string, unknown> };
    sticky.parameters['width'] = 'wide';
    delete sticky.parameters['height'];
    const { model, warnings } = parseInput(workflow);
    expect(model?.stickies[0]).toMatchObject({ width: 240, height: 160 });
    expect(warnings.some((w) => w.includes('sticky'))).toBe(true);
  });

  it('renders an unknown node type as a regular node without throwing', () => {
    const workflow = fixture('linear') as { nodes: Array<Record<string, unknown>> };
    workflow.nodes[1] = { ...workflow.nodes[1], type: 'com.example.mystery', typeVersion: 9 };
    const { model, warnings } = parseInput(workflow);
    expect(model?.nodes[1]?.kind).toBe('regular');
    expect(model?.nodes[1]?.type).toBe('com.example.mystery');
    expect(warnings).toEqual([]);
  });
});
