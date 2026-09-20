import { loadDescriptions } from 'workflow-render-assets';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFormModel, selectDescription } from '../../src/inspector/index.js';
import type { TrimmedDescription } from 'workflow-render-assets';
import type { CanvasNode } from '../../src/types.js';

let descriptions: Record<string, TrimmedDescription[]>;
beforeAll(async () => {
  descriptions = await loadDescriptions();
});

const node = (over: Partial<CanvasNode> & Pick<CanvasNode, 'type' | 'schemaVersion'>): CanvasNode => ({
  name: 'Node',
  position: [0, 0],
  parameters: {},
  kind: 'regular',
  ...over,
});

const buildFor = (n: CanvasNode) =>
  buildFormModel(n, selectDescription(descriptions[n.type] ?? [], n.schemaVersion));

const names = (model: ReturnType<typeof buildFormModel>): string[] => model.fields.map((f) => f.name);

describe('visibility via n8n displayOptions', () => {
  it('shows the JSON field only in raw mode', () => {
    const raw = buildFor(node({ type: 'n8n-nodes-base.set', schemaVersion: 3.4, parameters: { mode: 'raw' } }));
    expect(names(raw)).toContain('jsonOutput');
    const manual = buildFor(node({ type: 'n8n-nodes-base.set', schemaVersion: 3.4, parameters: { mode: 'manual' } }));
    expect(names(manual)).not.toContain('jsonOutput');
  });

  it('respects @version rules, not just sibling values', () => {
    // `fields` is gated to @version 3-3.2, so manual mode alone is not enough.
    const older = buildFor(node({ type: 'n8n-nodes-base.set', schemaVersion: 3.1, parameters: { mode: 'manual' } }));
    expect(names(older)).toContain('fields');
    const newer = buildFor(node({ type: 'n8n-nodes-base.set', schemaVersion: 3.4, parameters: { mode: 'manual' } }));
    expect(names(newer)).not.toContain('fields');
    // and the inverse rule: hidden below 3.3, shown at 3.4
    expect(names(newer)).toContain('includeOtherFields');
    expect(names(older)).not.toContain('includeOtherFields');
  });

  it('follows a sibling boolean', () => {
    const on = buildFor(
      node({
        type: 'n8n-nodes-base.httpRequest',
        schemaVersion: 4.2,
        parameters: { sendQuery: true, specifyQuery: 'keypair' },
      }),
    );
    expect(names(on)).toContain('queryParameters');
    const off = buildFor(
      node({ type: 'n8n-nodes-base.httpRequest', schemaVersion: 4.2, parameters: { sendQuery: false } }),
    );
    expect(names(off)).not.toContain('queryParameters');
  });

  it('never lists hidden or notice-only plumbing as editable fields', () => {
    const model = buildFor(node({ type: 'n8n-nodes-base.set', schemaVersion: 3.4, parameters: { mode: 'raw' } }));
    expect(model.fields.every((f) => f.kind !== 'hidden')).toBe(true);
  });
});

describe('form model', () => {
  it('skips properties with no label, which n8n renders as chrome not fields', () => {
    // httpRequest's `curlImport` has no displayName; n8n shows it as a button.
    const model = buildFor(node({ type: 'n8n-nodes-base.httpRequest', schemaVersion: 4.2 }));
    expect(model.fields.every((f) => f.label !== '')).toBe(true);
    expect(names(model)).not.toContain('curlImport');
  });

  it('carries a header from the description and the node', () => {
    const model = buildFor(
      node({ name: 'Extract Emails', type: 'n8n-nodes-base.set', schemaVersion: 3.4, disabled: true }),
    );
    expect(model.header).toMatchObject({
      name: 'Extract Emails',
      type: 'n8n-nodes-base.set',
      schemaVersion: 3.4,
      disabled: true,
    });
    expect(model.header.displayName).toBeTruthy();
    expect(model.unknownType).toBe(false);
  });

  it('lists the credentials the node type declares', () => {
    const model = buildFor(node({ type: 'n8n-nodes-base.slack', schemaVersion: 2.2 }));
    expect(model.credentials.map((c) => c.type)).toContain('slackApi');
  });

  it('reads settings off the node, not the description', () => {
    const model = buildFor(
      node({
        type: 'n8n-nodes-base.set',
        schemaVersion: 3.4,
        notes: 'why this exists',
        parameters: {},
      }),
    );
    expect(model.settings.notes).toBe('why this exists');
  });

  it('falls back to a flat key/value dump for an unknown type', () => {
    const model = buildFormModel(
      node({ type: 'com.example.mystery', schemaVersion: 1, parameters: { alpha: 'one', beta: { deep: true } } }),
      undefined,
    );
    expect(model.unknownType).toBe(true);
    expect(names(model).sort()).toEqual(['alpha', 'beta']);
    expect(model.fields.find((f) => f.name === 'beta')?.value.kind).toBe('json');
  });

  it('marks a field left at its default', () => {
    const model = buildFor(node({ type: 'n8n-nodes-base.httpRequest', schemaVersion: 4.2 }));
    const method = model.fields.find((f) => f.name === 'method');
    expect(method?.isDefault).toBe(true);
    expect(method?.optionLabel).toBe('GET');
  });
});

describe('a node type the bundle has never seen', () => {
  const future = (parameters: Record<string, unknown>): FormModel =>
    buildFormModel({
      name: 'Future Node',
      type: 'n8n-nodes-base.inventedLater',
      schemaVersion: 1,
      position: [0, 0],
      parameters,
      kind: 'regular',
    });

  it('reads its parameter names as labels, not as code', () => {
    // Whatever ships next will not be in the bundle, and the panel still has to
    // look like a panel. A raw key is what a dump looks like.
    const model = future({ simpleText: 'a', sendQueryParameters: true, ssl: false });
    const labels = model.fields.map((f) => f.label);
    expect(labels).toContain('Simple Text');
    expect(labels).toContain('Send Query Parameters');
    expect(labels).toContain('SSL'); // an acronym stays an acronym
  });

  it('says a container is empty rather than printing braces', () => {
    const model = future({ options: {}, tags: [] });
    for (const field of model.fields) {
      expect(field.value.kind).not.toBe('json');
    }
  });

  it('still shows a container that has something in it', () => {
    const model = future({ options: { timeout: 10000 } });
    expect(model.fields[0]?.value.kind).toBe('json');
  });
});
