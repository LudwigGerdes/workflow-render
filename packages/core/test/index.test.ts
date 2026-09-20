import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESCRIPTIONS_VERSION, renderWorkflow } from '../src/index.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('renderWorkflow', () => {
  it.each(['linear', 'branching', 'execution-success', 'execution-error'])(
    'renders %s end to end',
    (name) => {
      const { svg, model, errors } = renderWorkflow(fixture(name));
      expect(errors).toEqual([]);
      expect(model).toBeDefined();
      expect(svg?.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`data-descriptions-version="${DESCRIPTIONS_VERSION}"`);
    },
  );

  it('reports errors instead of throwing on junk', () => {
    const { svg, errors } = renderWorkflow({ hello: 'world' });
    expect(svg).toBeUndefined();
    expect(errors).toEqual(['not a workflow or execution']);
  });

  it('passes warnings through', () => {
    const workflow = fixture('linear') as { connections: Record<string, unknown> };
    workflow.connections['HTTP Request'] = { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] };
    expect(renderWorkflow(workflow).warnings).toContain('connection to unknown node "Ghost" dropped');
  });
});

