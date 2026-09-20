import { loadDescriptions } from 'workflow-render-assets';
import { beforeAll, describe, expect, it } from 'vitest';
import { selectDescription, valueFor } from '../../src/inspector/index.js';
import type { TrimmedDescription } from 'workflow-render-assets';

let descriptions: Record<string, TrimmedDescription[]>;
beforeAll(async () => {
  descriptions = await loadDescriptions();
});

const describeNode = (type: string, version: number): TrimmedDescription => {
  const entry = selectDescription(descriptions[type] ?? [], version);
  if (!entry) throw new Error(`no description for ${type}@${version}`);
  return entry;
};

const property = (type: string, version: number, name: string): Record<string, unknown> => {
  const hit = (describeNode(type, version).properties as Array<Record<string, unknown>>).find(
    (p) => p['name'] === name,
  );
  if (!hit) throw new Error(`no property ${name} on ${type}`);
  return hit;
};

describe('selectDescription', () => {
  it('picks the entry whose version range covers the node', () => {
    expect(selectDescription(descriptions['n8n-nodes-base.set'] ?? [], 3.4)?.name).toBe('n8n-nodes-base.set');
    const old = selectDescription(descriptions['n8n-nodes-base.set'] ?? [], 1);
    expect(Array.isArray(old?.version) ? old?.version : [old?.version]).toContain(1);
  });

  it('falls back to the newest entry for an unknown version', () => {
    expect(selectDescription(descriptions['n8n-nodes-base.set'] ?? [], 99)).toBeDefined();
  });

  it('returns undefined when there is nothing to select', () => {
    expect(selectDescription([], 1)).toBeUndefined();
  });
});

describe('valueFor', () => {
  it('reports a set value as text', () => {
    const resolved = valueFor(property('n8n-nodes-base.httpRequest', 4.2, 'url'), {
      url: 'https://api.example.com/users',
    });
    expect(resolved.value).toEqual({ kind: 'text', text: 'https://api.example.com/users' });
    expect(resolved.isDefault).toBe(false);
    expect(resolved.isExpression).toBe(false);
  });

  it('falls back to the property default and says so', () => {
    const resolved = valueFor(property('n8n-nodes-base.httpRequest', 4.2, 'sendQuery'), {});
    expect(resolved.value).toEqual({ kind: 'boolean', on: false });
    expect(resolved.isDefault).toBe(true);
  });

  it('marks an expression and strips the leading =', () => {
    const resolved = valueFor(property('n8n-nodes-base.httpRequest', 4.2, 'url'), {
      url: '={{ $json.endpoint }}',
    });
    expect(resolved.isExpression).toBe(true);
    expect(resolved.value).toEqual({ kind: 'expression', text: '{{ $json.endpoint }}' });
  });

  it('labels an options value from the description', () => {
    const resolved = valueFor(property('n8n-nodes-base.set', 3.4, 'mode'), { mode: 'raw' });
    expect(resolved.optionLabel).toBe('JSON'); // n8n shows the label, not the value
    expect(resolved.value).toEqual({ kind: 'text', text: 'raw' });
  });

  it('keeps an unrecognised options value as raw text', () => {
    const resolved = valueFor(property('n8n-nodes-base.set', 3.4, 'mode'), { mode: 'sideways' });
    expect(resolved.optionLabel).toBeUndefined();
    expect(resolved.value).toEqual({ kind: 'text', text: 'sideways' });
  });

  it('resolves a resourceLocator to its mode label and value', () => {
    const resolved = valueFor(property('n8n-nodes-base.airtable', 2.1, 'base'), {
      base: { __rl: true, mode: 'url', value: 'https://airtable.com/appXYZ' },
    });
    expect(resolved.resourceLocator).toEqual({
      mode: 'url',
      modeLabel: 'By URL',
      value: 'https://airtable.com/appXYZ',
    });
  });

  it('pretty-prints an object value as json', () => {
    const resolved = valueFor(property('n8n-nodes-base.set', 3.4, 'fields'), {
      fields: { values: [{ name: 'a' }] },
    });
    expect(resolved.value.kind).toBe('json');
    expect(resolved.value.kind === 'json' && resolved.value.text).toContain('"values"');
  });

  it('reports an unset value with no default as empty', () => {
    expect(valueFor({ name: 'x', type: 'string' }, {}).value).toEqual({ kind: 'empty' });
  });
});
